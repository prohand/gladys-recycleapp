import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig } from '../src/config.js';
import { createRecycleAppClient } from '../src/recycleapp/api.js';
import { createCalendarService, RETRY_AFTER_MS } from '../src/recycleapp/service.js';
import { createFileStore, createMemoryStore } from '../src/store.js';
import {
  ADDRESS_CONFIG,
  COLLECTIONS,
  createClock,
  createFakeRecycleApp,
  FRACTIONS,
} from './helpers/fakeRecycleApp.js';

const HOUR = 60 * 60 * 1000;

function setup({ store = createMemoryStore(), config = ADDRESS_CONFIG } = {}) {
  const fake = createFakeRecycleApp();
  const clock = createClock();
  const client = createRecycleAppClient({ fetch: fake.fetch });
  const service = createCalendarService({ client, store, now: clock.now });
  return { fake, clock, client, store, service, config: normalizeConfig(config) };
}

const apiCalls = (fake, path) => fake.calls.filter((call) => call.path.endsWith(path)).length;

test('refresh resolves the address, then reads the calendar of the window', async () => {
  const { fake, service, config } = setup();
  await service.refresh(config);
  const { address, collections, fetchedAt, lastError } = service.state(config);
  assert.equal(address.zipcodeId, '5000-92094');
  assert.equal(address.streetId, 'geodata.wallonie.be/id/streetname-7753710');
  assert.equal(address.cityNames.fr, 'Namur');
  assert.equal(address.streetNames.fr, 'Rue de Fer');
  assert.equal(fetchedAt, Date.parse('2026-10-21T08:00:00Z'));
  assert.equal(lastError, null);
  assert.equal(collections[0].date, '2026-10-22');
  const read = fake.calls.find((call) => call.path.endsWith('/collections'));
  assert.equal(read.query.fromDate, '2026-10-21');
  assert.equal(read.query.untilDate, '2026-12-20'); // 60 days ahead
  assert.equal(read.query.houseNumber, '12');
  assert.deepEqual(
    service.upcoming(config).map((c) => c.date),
    ['2026-10-22', '2026-10-22', '2026-10-23', '2026-10-28', '2026-10-30', '2026-11-05'],
  );
});

test('the address is resolved once, the calendar re-read every refresh_hours', async () => {
  const { fake, clock, service, config } = setup();
  assert.equal(await service.ensureFresh(config), true);
  assert.equal(await service.ensureFresh(config), false);
  clock.advance(11 * HOUR);
  assert.equal(await service.ensureFresh(config), false);
  clock.advance(1 * HOUR);
  assert.equal(await service.ensureFresh(config), true);
  assert.equal(apiCalls(fake, '/zipcodes'), 1);
  assert.equal(apiCalls(fake, '/streets'), 1);
  assert.equal(apiCalls(fake, '/collections'), 2);
});

test('a new address is resolved and read at once, and forgets the old calendar', async () => {
  const { fake, service, config } = setup();
  await service.ensureFresh(config);
  const leuven = normalizeConfig({ zipcode: '3000', street: 'Bondgenotenlaan', house_number: '1' });
  assert.equal(service.state(leuven).address, null, 'another address is not the stored one');
  assert.deepEqual(service.state(leuven).collections, []);
  assert.equal(await service.ensureFresh(leuven), true);
  assert.equal(service.state(leuven).address.zipcodeId, '3000-24062');
  assert.equal(apiCalls(fake, '/zipcodes'), 2);
});

test('concurrent reads share one request', async () => {
  const { fake, service, config } = setup();
  await Promise.all([
    service.refresh(config),
    service.refresh(config),
    service.ensureFresh(config),
  ]);
  assert.equal(apiCalls(fake, '/collections'), 1);
});

test('a failed read keeps the previous calendar and is retried after 15 minutes', async () => {
  const { fake, clock, service, config } = setup();
  await service.ensureFresh(config);
  clock.advance(12 * HOUR);
  fake.down = true;
  assert.equal(await service.ensureFresh(config), false);
  assert.match(service.state(config).lastError.message, /unreachable/);
  assert.equal(service.state(config).collections.length, 6, 'the old calendar is still served');
  fake.down = false;
  clock.advance(RETRY_AFTER_MS - 1);
  assert.equal(await service.ensureFresh(config), false, 'no retry before 15 minutes');
  clock.advance(1);
  assert.equal(await service.ensureFresh(config), true);
  assert.equal(service.state(config).lastError, null);
});

test('resetError lets a corrected configuration retry at once', async () => {
  const { fake, service, config } = setup();
  fake.down = true;
  await service.ensureFresh(config);
  fake.down = false;
  assert.equal(await service.ensureFresh(config), false);
  service.resetError();
  assert.equal(await service.ensureFresh(config), true);
});

test('address errors say what to fix', async () => {
  const cases = [
    [{ zipcode: '', street: '', house_number: '' }, 'missing_address', {}],
    [{ ...ADDRESS_CONFIG, zipcode: '9999' }, 'zipcode_not_found', { zipcode: '9999' }],
    [
      { ...ADDRESS_CONFIG, street: 'Rue inconnue' },
      'street_not_found',
      { street: 'Rue inconnue', zipcode: '5000' },
    ],
    [
      { ...ADDRESS_CONFIG, street: 'rue' },
      'street_ambiguous',
      {
        street: 'rue',
        candidates: ['Rue de Fer', 'Rue de la Ferme de Ronet', "Ruelle de l'Enfer"],
      },
    ],
  ];
  for (const [raw, code, details] of cases) {
    const { service } = setup();
    const config = normalizeConfig(raw);
    await assert.rejects(service.refresh(config), (err) => {
      assert.equal(err.code, code);
      assert.deepEqual(err.details, details);
      return true;
    });
    assert.equal(service.state(config).lastError.code, code);
  }
});

test('waste types seen at the address stay known when they leave the window', async () => {
  const { fake, clock, service, config } = setup();
  fake.collections = [
    ...COLLECTIONS,
    { type: 'collection', timestamp: '2026-11-10T00:00:00.000Z', fraction: FRACTIONS.trees },
  ];
  await service.refresh(config);
  assert.equal(service.state(config).knownFractions.length, 4);
  fake.collections = COLLECTIONS;
  clock.advance(12 * HOUR);
  await service.ensureFresh(config);
  assert.ok(service.state(config).knownFractions.some((f) => f.id === FRACTIONS.trees.id));
  assert.equal(service.logoPath('logo-5d610b86162c063cc0400125'), FRACTIONS.pmd.logo.regular['3x']);
  assert.equal(service.logoPath('logo-unknown'), undefined);
});

test('the calendar and the fired triggers survive a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recycleapp-'));
  try {
    const first = setup({ store: createFileStore(dir) });
    await first.service.refresh(first.config);
    first.service.markFired('collection_tomorrow', '2026-10-21');
    const saved = JSON.parse(readFileSync(join(dir, 'recycleapp-state.json'), 'utf8'));
    assert.equal(saved.fired.collection_tomorrow, '2026-10-21');

    const second = setup({ store: createFileStore(dir) });
    second.fake.down = true; // RecycleApp down at restart
    assert.equal(second.service.state(second.config).collections.length, 6);
    assert.equal(second.service.lastFired('collection_tomorrow'), '2026-10-21');
    assert.equal(await second.service.ensureFresh(second.config), false, 'still fresh');
    assert.equal(second.fake.calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a new address forgets the triggers fired for the previous one', async () => {
  const { service, config } = setup();
  await service.refresh(config);
  service.markFired('collection_tomorrow', '2026-10-21');
  await service.refresh(normalizeConfig({ ...ADDRESS_CONFIG, house_number: '14' }));
  assert.equal(service.lastFired('collection_tomorrow'), undefined);
});

test('an unwritable or corrupt store is not fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recycleapp-'));
  try {
    // A file where the directory should be: every read and write fails.
    const blocker = join(dir, 'not-a-dir');
    writeFileSync(blocker, '');
    const store = createFileStore(blocker);
    assert.deepEqual(store.load(), {});
    store.save({ a: 1 }); // logs a warning, does not throw

    writeFileSync(join(dir, 'recycleapp-state.json'), '{ corrupt');
    assert.deepEqual(createFileStore(dir).load(), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('today and time are Belgian', () => {
  const { clock, service } = setup();
  clock.set('2026-10-21T22:30:00Z');
  assert.equal(service.today(), '2026-10-22');
  assert.equal(service.time(), '00:30');
});
