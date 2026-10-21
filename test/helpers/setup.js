// A calendar service on the fake API and a hand-driven clock, plus the
// context the capability handlers receive.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../../src/config.js';
import { createRecycleAppClient } from '../../src/recycleapp/api.js';
import { createCalendarService } from '../../src/recycleapp/service.js';
import { createMemoryStore } from '../../src/store.js';
import { ADDRESS_CONFIG, createClock, createFakeRecycleApp } from './fakeRecycleApp.js';

export async function setup({ config = ADDRESS_CONFIG, read = true } = {}) {
  const fake = createFakeRecycleApp();
  const clock = createClock();
  const client = createRecycleAppClient({ fetch: fake.fetch });
  const service = createCalendarService({ client, store: createMemoryStore(), now: clock.now });
  const gladys = createFakeGladys();
  const normalized = normalizeConfig(config);
  if (read) {
    await service.refresh(normalized);
  }
  let calendarReads = 0;
  const context = {
    gladys,
    service,
    client,
    config: normalized,
    onCalendarRead: async () => {
      calendarReads += 1;
    },
  };
  return {
    fake,
    clock,
    client,
    service,
    gladys,
    config: normalized,
    context,
    calendarReads: () => calendarReads,
  };
}
