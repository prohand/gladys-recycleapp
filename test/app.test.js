import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { createRecycleAppClient } from '../src/recycleapp/api.js';
import { createMemoryStore } from '../src/store.js';
import { SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { ADDRESS_CONFIG, createClock, createFakeRecycleApp } from './helpers/fakeRecycleApp.js';

const HOUR = 60 * 60 * 1000;

async function start(config = ADDRESS_CONFIG) {
  const fake = createFakeRecycleApp();
  const clock = createClock();
  const gladys = createFakeGladys({ config });
  const app = registerHandlers(gladys, {
    client: createRecycleAppClient({ fetch: fake.fetch }),
    store: createMemoryStore(),
    now: clock.now,
  });
  await gladys.connect();
  return { fake, clock, gladys, app };
}

test('on connection: devices, states, transports and status are published', async (t) => {
  const { gladys } = await start();
  t.after(() => gladys.disconnect());
  assert.equal(gladys.fake.discoveredDevices.length, 4);
  assert.ok(gladys.fake.states.length > 0);
  assert.equal(gladys.fake.transports.length, 4);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.ok(gladys.fake.widgetRefreshes.includes('collections'));
});

test('a quiet minute sends nothing to Gladys', async (t) => {
  const { gladys, app, clock, fake } = await start();
  t.after(() => gladys.disconnect());
  const requests = gladys.fake.requests.length;
  clock.advance(60 * 1000);
  await app.tick();
  assert.equal(gladys.fake.requests.length, requests);
  assert.equal(fake.calls.filter((c) => c.path.endsWith('/collections')).length, 1);
});

test('midnight publishes the new day counts and nudges the widget', async (t) => {
  const { gladys, app, clock } = await start();
  t.after(() => gladys.disconnect());
  const states = gladys.fake.states.length;
  const nudges = gladys.fake.widgetRefreshes.length;
  clock.set('2026-10-21T22:00:00Z'); // midnight in Brussels
  await app.tick();
  assert.ok(gladys.fake.states.length > states);
  assert.equal(gladys.fake.lastState('ext:test-integration:summary:next-collection:days'), 0);
  assert.ok(gladys.fake.widgetRefreshes.length > nudges);
});

test('the tick fires the scene triggers', async (t) => {
  const { gladys, app, clock } = await start();
  t.after(() => gladys.disconnect());
  clock.set('2026-10-21T17:00:00Z'); // 19:00 in Brussels
  await app.tick();
  assert.equal(gladys.fake.sceneEvents[0].key, SCENE_TRIGGERS.COLLECTION_TOMORROW);
});

test('RecycleApp down: status false, degraded badge, the old calendar still served', async (t) => {
  const { gladys, app, clock, fake } = await start();
  t.after(() => gladys.disconnect());
  clock.advance(12 * HOUR);
  fake.down = true;
  await app.tick();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /could not be read/);
  assert.ok(gladys.fake.transports.slice(-4).every((entry) => entry.degraded === true));
  assert.equal(gladys.fake.lastState('ext:test-integration:summary:next-collection:days'), 1);
});

test('no address: a status that says what to fill in, and no device', async (t) => {
  const { gladys, fake } = await start({});
  t.after(() => gladys.disconnect());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Renseignez le code postal/);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(fake.calls.length, 0);
});

test('a configuration update reads the new address at once', async (t) => {
  const { gladys, app, fake } = await start({});
  t.after(() => gladys.disconnect());
  await gladys.fake.configUpdated(ADDRESS_CONFIG);
  assert.equal(app.config.zipcode, '5000');
  assert.equal(gladys.fake.discoveredDevices.length, 4);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(fake.calls.filter((c) => c.path.endsWith('/collections')).length, 1);
});

test('the handlers are wired: scan, actions, scene actions, widget', async (t) => {
  const { gladys } = await start();
  t.after(() => gladys.disconnect());
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices.length, 4);

  const test = await gladys.fake.action('test_connection', {});
  assert.equal(test.success, true);
  assert.match(test.data.message.fr, /Rue de Fer 12, 5000 Namur/);

  const street = await gladys.fake.action('find_street', { search: 'fer' });
  assert.match(street.data.message.en, /Rue de Fer/);

  const next = await gladys.fake.sceneAction('next_collection', {});
  assert.equal(next.data.outputs.date, '2026-10-22');

  const content = await gladys.fake.widgetGet('collections', { settings: {}, language: 'fr' });
  assert.equal(content.success, true);
  const key = content.data.content.components.find((c) => c.type === 'card-list').items[0].image;
  const image = await gladys.fake.widgetGetImage(key);
  assert.equal(image.success, true);

  const toast = await gladys.fake.widgetAction('collections', 'refresh', {}, { settings: {} });
  assert.equal(toast.success, true);
});

test('disconnection stops the timer', async () => {
  const { gladys, app } = await start();
  await gladys.disconnect();
  app.stop(); // idempotent
});
