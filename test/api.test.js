import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecycleAppClient, RecycleAppError } from '../src/recycleapp/api.js';
import { createFakeRecycleApp } from './helpers/fakeRecycleApp.js';

test('every request carries the consumer header and a correlation id', async () => {
  const fake = createFakeRecycleApp();
  const client = createRecycleAppClient({ fetch: fake.fetch });
  await client.findZipcodes('5000');
  const [call] = fake.calls;
  assert.equal(call.host, 'api.fostplus.be');
  assert.equal(call.path, '/recyclecms/public/v1/zipcodes');
  assert.equal(call.headers['x-consumer'], 'recycleapp.be');
  assert.match(call.headers['x-correlation-id'], /^[0-9a-f-]{36}$/);
});

test('findZipcodes keeps the exact code only', async () => {
  const fake = createFakeRecycleApp();
  fake.zipcodes = [...fake.zipcodes, { ...fake.zipcodes[0], code: '50001', id: '50001-x' }];
  const client = createRecycleAppClient({ fetch: fake.fetch });
  assert.deepEqual(
    (await client.findZipcodes('5000')).map((z) => z.id),
    ['5000-92094'],
  );
});

test('the street search is a POST with an empty JSON body, like the website', async () => {
  const fake = createFakeRecycleApp();
  const client = createRecycleAppClient({ fetch: fake.fetch });
  const streets = await client.findStreets('5000-92094', 'fer');
  assert.equal(streets.length, 3);
  const call = fake.calls.at(-1);
  assert.equal(call.method, 'POST');
  assert.equal(call.body, '{}');
  assert.equal(call.headers['content-type'], 'application/json');
  assert.deepEqual(call.query, { q: 'fer', zipcodes: '5000-92094' });
});

test('getCollections reads every page', async () => {
  const fake = createFakeRecycleApp();
  fake.collections = Array.from({ length: 230 }, (_, i) => ({
    type: 'collection',
    timestamp: '2026-11-01T00:00:00.000Z',
    fraction: { id: `f${i}`, name: { fr: `F${i}` } },
  }));
  const client = createRecycleAppClient({ fetch: fake.fetch });
  const items = await client.getCollections({
    zipcodeId: '5000-92094',
    streetId: 'geodata.wallonie.be/id/streetname-7753710',
    houseNumber: '12',
    from: '2026-10-21',
    until: '2026-12-20',
  });
  assert.equal(items.length, 230);
  const calls = fake.calls.filter((call) => call.path.endsWith('/collections'));
  assert.deepEqual(
    calls.map((call) => call.query.page),
    ['1', '2', '3'],
  );
  assert.deepEqual(calls[0].query, {
    zipcodeId: '5000-92094',
    streetId: 'geodata.wallonie.be/id/streetname-7753710',
    houseNumber: '12',
    fromDate: '2026-10-21',
    untilDate: '2026-12-20',
    size: '100',
    page: '1',
  });
});

test('an endless pagination is refused instead of looping', async () => {
  const client = createRecycleAppClient({
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ items: [], pages: 99 }) }),
  });
  await assert.rejects(
    client.getCollections({
      zipcodeId: 'z',
      streetId: 's',
      houseNumber: '1',
      from: 'a',
      until: 'b',
    }),
    /more than 10 pages/,
  );
});

test('HTTP and network failures become RecycleAppError', async () => {
  const fake = createFakeRecycleApp();
  const client = createRecycleAppClient({ fetch: fake.fetch });
  fake.status = 503;
  await assert.rejects(client.findZipcodes('5000'), (err) => {
    assert.ok(err instanceof RecycleAppError);
    assert.equal(err.status, 503);
    return true;
  });
  fake.status = null;
  fake.down = true;
  await assert.rejects(client.findZipcodes('5000'), /RecycleApp unreachable: fetch failed/);
  await assert.rejects(client.getAsset('public/x.png'), /assets unreachable/);
});

test('getAsset answers raw base64 from the assets host', async () => {
  const fake = createFakeRecycleApp();
  const client = createRecycleAppClient({ fetch: fake.fetch });
  const base64 = await client.getAsset('public/logo@3x.png');
  assert.ok(Buffer.from(base64, 'base64').subarray(1, 4).toString() === 'PNG');
  assert.equal(fake.calls.at(-1).host, 'assets.recycleapp.be');
  assert.equal(fake.calls.at(-1).path, '/public/logo@3x.png');
  fake.status = 404;
  await assert.rejects(client.getAsset('public/missing.png'), /assets HTTP 404/);
});
