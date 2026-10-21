// -----------------------------------------------------------------------------
// Client of the RecycleApp public API (Fost Plus).
//
// It is the API the recycleapp.be website itself calls: no account and no key,
// only the `x-consumer` header the site sends. Base URL and header were read
// from the site (config/app.settings.json and its main bundle).
//
// The address is resolved in two steps, like on the website: the zip code gives
// a `zipcodeId` (`5000-92094`: code + municipality), the street searched within
// it gives a `streetId` (a URI of the regional street register). Both, with the
// house number, select the collection calendar.
//
// `fetch` is injected so the tests never touch the network.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';

export const API_BASE_URL = 'https://api.fostplus.be/recyclecms/public/v1';
export const ASSETS_BASE_URL = 'https://assets.recycleapp.be';
const CONSUMER = 'recycleapp.be';
const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
// A calendar read over a year is a few hundred entries: more pages than this
// means an answer the integration does not understand, not a busy calendar.
const MAX_PAGES = 10;

/** An error of the RecycleApp API, with the HTTP status when there is one. */
export class RecycleAppError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RecycleAppError';
    this.status = status;
  }
}

/**
 * @param {{ fetch?: typeof fetch, baseUrl?: string, assetsUrl?: string }} [options]
 */
export function createRecycleAppClient({
  fetch: fetchImpl = globalThis.fetch,
  baseUrl = API_BASE_URL,
  assetsUrl = ASSETS_BASE_URL,
} = {}) {
  async function request(method, path, params) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          accept: 'application/json',
          'x-consumer': CONSUMER,
          // The website sends one per request; Fost Plus uses it to trace calls.
          'x-correlation-id': randomUUID(),
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
        // The street search is a POST with an empty body, as on the website.
        body: method === 'POST' ? '{}' : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new RecycleAppError(`RecycleApp unreachable: ${err.message}`);
    }
    if (!response.ok) {
      throw new RecycleAppError(`RecycleApp HTTP ${response.status} on ${path}`, response.status);
    }
    return response.json();
  }

  return {
    /** Zip codes matching `code` (several municipalities can share one). */
    async findZipcodes(code) {
      const body = await request('GET', '/zipcodes', { q: code });
      return (body.items ?? []).filter((item) => item.code === code);
    },

    /** Streets of one zip code matching `query`, in any of the four languages. */
    async findStreets(zipcodeId, query) {
      const body = await request('POST', '/streets', { q: query, zipcodes: zipcodeId });
      return body.items ?? [];
    },

    /**
     * Calendar entries (collections and events) between two dates, all pages.
     * @param {{ zipcodeId: string, streetId: string, houseNumber: string, from: string, until: string }} query
     */
    async getCollections({ zipcodeId, streetId, houseNumber, from, until }) {
      const items = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const body = await request('GET', '/collections', {
          zipcodeId,
          streetId,
          houseNumber,
          fromDate: from,
          untilDate: until,
          size: PAGE_SIZE,
          page,
        });
        items.push(...(body.items ?? []));
        if (!body.pages || page >= body.pages) {
          return items;
        }
      }
      throw new RecycleAppError(`RecycleApp answered more than ${MAX_PAGES} pages`);
    },

    /** One logo of the RecycleApp assets, as raw base64. */
    async getAsset(path) {
      let response;
      try {
        response = await fetchImpl(`${assetsUrl}/${path}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        throw new RecycleAppError(`RecycleApp assets unreachable: ${err.message}`);
      }
      if (!response.ok) {
        throw new RecycleAppError(`RecycleApp assets HTTP ${response.status}`, response.status);
      }
      return Buffer.from(await response.arrayBuffer()).toString('base64');
    },
  };
}
