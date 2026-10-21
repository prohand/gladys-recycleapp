import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fractionIds, summaryIds } from '../src/devices.js';
import {
  checkSceneTriggers,
  isDue,
  nextCollection,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
} from '../src/capabilities/scenes.js';
import { FRACTIONS } from './helpers/fakeRecycleApp.js';
import { setup } from './helpers/setup.js';

// Brussels is UTC+2 until 25 October 2026, UTC+1 after.
const at = (date, time, offset = 2) =>
  new Date(Date.parse(`${date}T${time}:00Z`) - offset * 60 * 60 * 1000);

test('isDue: from the hour, for four hours, the same day', () => {
  assert.equal(isDue('18:59', '19:00'), false);
  assert.equal(isDue('19:00', '19:00'), true);
  assert.equal(isDue('23:00', '19:00'), true);
  assert.equal(isDue('23:01', '19:00'), false);
  assert.equal(isDue('06:00', '07:00'), false);
});

test('the evening before: one summary event, one event per waste type', async () => {
  const { gladys, service, config, clock } = await setup();
  clock.set(at('2026-10-21', '18:59'));
  await checkSceneTriggers(gladys, service, config);
  assert.deepEqual(gladys.fake.sceneEvents, []);

  clock.set(at('2026-10-21', '19:00'));
  await checkSceneTriggers(gladys, service, config);
  const events = gladys.fake.sceneEvents.map(({ key, data }) => ({ key, data }));
  assert.deepEqual(events, [
    {
      key: SCENE_TRIGGERS.COLLECTION_TOMORROW,
      data: { date: '2026-10-22', fractions: 'Papiers-cartons et PMC', count: 2 },
    },
    {
      key: SCENE_TRIGGERS.FRACTION_TOMORROW,
      data: {
        device: fractionIds(gladys, FRACTIONS.paper.id).device,
        fraction: 'Papiers-cartons',
        date: '2026-10-22',
      },
    },
    {
      key: SCENE_TRIGGERS.FRACTION_TOMORROW,
      data: {
        device: fractionIds(gladys, FRACTIONS.pmd.id).device,
        fraction: 'PMC',
        date: '2026-10-22',
      },
    },
  ]);

  // Once a day only.
  clock.set(at('2026-10-21', '19:01'));
  await checkSceneTriggers(gladys, service, config);
  assert.equal(gladys.fake.sceneEvents.length, 3);
});

test('the morning of a collection day', async () => {
  const { gladys, service, config, clock } = await setup();
  clock.set(at('2026-10-22', '07:00'));
  await checkSceneTriggers(gladys, service, config);
  assert.deepEqual(
    gladys.fake.sceneEvents.map(({ key, data }) => ({ key, data })),
    [
      {
        key: SCENE_TRIGGERS.COLLECTION_TODAY,
        data: { date: '2026-10-22', fractions: 'Papiers-cartons et PMC', count: 2 },
      },
    ],
  );
});

test('nothing collected tomorrow: no event, and none later that evening', async () => {
  const { gladys, service, config, clock } = await setup();
  clock.set(at('2026-10-23', '19:00')); // nothing on the 24th
  await checkSceneTriggers(gladys, service, config);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.equal(service.lastFired(SCENE_TRIGGERS.COLLECTION_TOMORROW), '2026-10-23');
});

test('a restart past the hour catches up, but not the next morning', async () => {
  const { gladys, service, config, clock } = await setup();
  clock.set(at('2026-10-21', '21:30'));
  await checkSceneTriggers(gladys, service, config);
  assert.equal(gladys.fake.sceneEvents.length, 3);

  const late = await setup();
  late.clock.set(at('2026-10-21', '23:30'));
  await checkSceneTriggers(late.gladys, late.service, late.config);
  assert.deepEqual(late.gladys.fake.sceneEvents, []);
});

test('no calendar read yet: nothing fired, nothing remembered', async () => {
  const { gladys, service, config, clock, fake } = await setup({ read: false });
  fake.down = true;
  await service.ensureFresh(config);
  clock.set(at('2026-10-21', '19:00'));
  await checkSceneTriggers(gladys, service, config);
  assert.equal(service.lastFired(SCENE_TRIGGERS.COLLECTION_TOMORROW), undefined);
});

test('a refused event is retried at the next tick', async (t) => {
  const { gladys, service, config, clock } = await setup();
  clock.set(at('2026-10-21', '19:00'));
  const publish = t.mock.method(gladys, 'publishSceneEvent', async () => {
    throw new Error('Gladys restarting');
  });
  await checkSceneTriggers(gladys, service, config);
  assert.equal(service.lastFired(SCENE_TRIGGERS.COLLECTION_TOMORROW), undefined);
  publish.mock.restore();
  clock.set(at('2026-10-21', '19:01'));
  await checkSceneTriggers(gladys, service, config);
  assert.equal(gladys.fake.sceneEvents.length, 3);
});

test('next_collection: of any waste type, or of the one chosen', async () => {
  const { context, gladys } = await setup();
  assert.deepEqual(await SCENE_ACTIONS.next_collection(context, {}), {
    found: true,
    date: '2026-10-22',
    days: 1,
    fractions: 'Papiers-cartons et PMC',
  });
  const residual = fractionIds(gladys, FRACTIONS.residual.id).device;
  assert.deepEqual(await SCENE_ACTIONS.next_collection(context, { device: residual }), {
    found: true,
    date: '2026-10-23',
    days: 2,
    fractions: 'Déchets résiduels',
  });
  // The summary device means any waste type.
  const summary = summaryIds(gladys).device;
  assert.equal((await SCENE_ACTIONS.next_collection(context, { device: summary })).days, 1);
});

test('next_collection with nothing planned', async () => {
  const { gladys, service, config, clock } = await setup();
  clock.set('2026-12-01T08:00:00Z');
  assert.deepEqual(nextCollection(gladys, service, config), {
    found: false,
    date: '',
    days: -1,
    fractions: '',
  });
});

test('refresh_calendar reads RecycleApp now and publishes', async () => {
  const { context, fake, calendarReads } = await setup();
  const outputs = await SCENE_ACTIONS.refresh_calendar(context, {});
  assert.deepEqual(outputs, {
    collections: 6,
    next_date: '2026-10-22',
    next_fractions: 'Papiers-cartons et PMC',
  });
  assert.equal(fake.calls.filter((c) => c.path.endsWith('/collections')).length, 2);
  assert.equal(calendarReads(), 1);
  fake.down = true;
  await assert.rejects(SCENE_ACTIONS.refresh_calendar(context, {}), /unreachable/);
});
