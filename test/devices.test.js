import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import {
  buildDevices,
  buildStates,
  buildTransportEntries,
  fractionIds,
  fractionOfDevice,
  NONE_PLANNED,
  summaryIds,
} from '../src/devices.js';
import { ADDRESS_CONFIG, COLLECTIONS, FRACTIONS } from './helpers/fakeRecycleApp.js';
import { setup } from './helpers/setup.js';

const HOUR = 60 * 60 * 1000;

const stateOf = (states, id) => states.find((s) => s.device_feature_external_id === id);

test('one device per waste type plus the summary, accepted by Gladys', async () => {
  const { gladys, service, config } = await setup();
  const devices = buildDevices(gladys, service, config);
  assert.deepEqual(
    devices.map((d) => d.name),
    [
      'Prochaine collecte des déchets',
      'Collecte Déchets résiduels',
      'Collecte Papiers-cartons',
      'Collecte PMC',
    ],
  );
  // The fake Gladys refuses what the host API refuses (category, type, unit).
  await gladys.publishDiscoveredDevices(devices);
  assert.equal(gladys.fake.discoveredDevices.length, 4);
  for (const device of devices) {
    assert.equal(device.should_poll, undefined, 'driven by the integration tick, not polled');
    for (const feature of device.features) {
      assert.equal(feature.read_only, true);
      assert.ok(feature.min !== undefined && feature.max !== undefined, 'min/max are NOT NULL');
    }
  }
});

test('external ids are the RecycleApp ids of the waste types', async () => {
  const { gladys, service, config } = await setup();
  const ids = buildDevices(gladys, service, config).map((d) => d.external_id);
  assert.ok(ids.includes(`ext:test-integration:fraction:${FRACTIONS.pmd.id}`));
  assert.ok(ids.includes('ext:test-integration:summary:next-collection'));
});

test('device names follow the language setting', async () => {
  const { gladys, service } = await setup();
  const config = normalizeConfig({ ...ADDRESS_CONFIG, language: 'nl' });
  assert.deepEqual(
    buildDevices(gladys, service, config).map((d) => d.name),
    ['Volgende afvalophaling', 'Ophaling Papier-karton', 'Ophaling PMD', 'Ophaling Restafval'],
  );
});

test('no address resolved: no device, no state', async () => {
  const { gladys, service, config } = await setup({ read: false });
  assert.deepEqual(buildDevices(gladys, service, config), []);
  assert.deepEqual(buildStates(gladys, service, config), []);
  assert.deepEqual(buildTransportEntries(gladys, service, config), []);
});

test('states: days left and the day written out, accepted by Gladys', async () => {
  const { gladys, service, config } = await setup();
  const states = buildStates(gladys, service, config);
  const summary = summaryIds(gladys);
  assert.equal(stateOf(states, summary.feature('days')).state, 1);
  assert.equal(stateOf(states, summary.feature('next-date')).text, 'jeudi 22 octobre');
  assert.equal(stateOf(states, summary.feature('fractions')).text, 'Papiers-cartons et PMC');
  const residual = fractionIds(gladys, FRACTIONS.residual.id);
  assert.equal(stateOf(states, residual.feature('days')).state, 2);
  assert.equal(stateOf(states, residual.feature('next-date')).text, 'vendredi 23 octobre');
  await gladys.publishStates(states);
  assert.equal(gladys.fake.states.length, states.length);
});

test('at midnight, tomorrow becomes today', async () => {
  const { gladys, service, config, clock } = await setup();
  clock.set('2026-10-21T22:00:00Z'); // 00:00 on the 22nd in Brussels
  const states = buildStates(gladys, service, config);
  assert.equal(stateOf(states, summaryIds(gladys).feature('days')).state, 0);
  clock.advance(24 * HOUR);
  const next = buildStates(gladys, service, config);
  assert.equal(stateOf(next, fractionIds(gladys, FRACTIONS.pmd.id).feature('days')).state, 7);
});

test('a waste type with no collection in the window says so', async () => {
  const { gladys, service, config, fake, clock } = await setup();
  fake.collections = [
    ...COLLECTIONS,
    { type: 'collection', timestamp: '2026-10-24T00:00:00.000Z', fraction: FRACTIONS.trees },
  ];
  clock.advance(12 * HOUR);
  await service.refresh(config);
  clock.set('2026-10-25T08:00:00Z'); // the trees went out yesterday
  const trees = fractionIds(gladys, FRACTIONS.trees.id);
  const states = buildStates(gladys, service, config);
  assert.equal(stateOf(states, trees.feature('days')).state, NONE_PLANNED);
  assert.equal(stateOf(states, trees.feature('next-date')).text, 'Aucune collecte prévue');
});

test('transport badge: cloud, degraded on a stale calendar', async () => {
  const { gladys, service, config, fake, clock } = await setup();
  const entries = buildTransportEntries(gladys, service, config);
  assert.equal(entries.length, 4);
  assert.ok(entries.every((e) => e.transport === 'cloud' && !e.degraded));

  clock.advance(12 * HOUR);
  fake.down = true;
  await service.ensureFresh(config);
  const [degraded] = buildTransportEntries(gladys, service, config);
  assert.equal(degraded.transport, 'cloud');
  assert.equal(degraded.degraded, true);
  assert.match(degraded.message.fr, /calendrier lu le mercredi 21 octobre/);
  await gladys.publishTransports(buildTransportEntries(gladys, service, config));
});

test('fractionOfDevice maps a device back to its waste type', async () => {
  const { gladys, service, config } = await setup();
  const pmd = fractionIds(gladys, FRACTIONS.pmd.id).device;
  assert.equal(fractionOfDevice(gladys, service, config, pmd).id, FRACTIONS.pmd.id);
  assert.equal(fractionOfDevice(gladys, service, config, summaryIds(gladys).device), undefined);
});
