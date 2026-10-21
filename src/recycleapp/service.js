// -----------------------------------------------------------------------------
// The calendar of the configured address, kept fresh.
//
// One object owns everything read from RecycleApp: the resolved address, the
// collections, when they were read and the last failure. The rest of the code
// only reads it (`state()`, `upcoming()`...).
//
// - The API is read every `refresh_hours` (12 h by default): a calendar changes
//   a few times a year. A failed read is retried after 15 minutes, and the
//   previous calendar is kept meanwhile: last week's answer still says when
//   the PMC goes out.
// - The address is resolved once (zip code → zipcodeId, street → streetId)
//   and again only when the user changes it.
// - Concurrent callers share the read in flight: the minute tick, a scene
//   action and the "Test the connection" button never hit the API twice.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { addressKey, hasAddress } from '../config.js';
import {
  addDays,
  cityName,
  fractionsOf,
  localDate,
  localTime,
  matchStreet,
  normalizeCollections,
  streetName,
  upcoming,
} from './calendar.js';

const logger = createLogger({ name: 'calendar' });

const HOUR_MS = 60 * 60 * 1000;
export const RETRY_AFTER_MS = 15 * 60 * 1000;
// Suggestions listed when several streets match what the user typed.
const MAX_CANDIDATES = 5;

/** An address RecycleApp cannot resolve: the user has something to fix. */
export class AddressError extends Error {
  constructor(code, details = {}) {
    super(`${code} ${JSON.stringify(details)}`);
    this.name = 'AddressError';
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {{ client: ReturnType<import('./api.js').createRecycleAppClient>, store: { load(): object, save(data: object): void }, now?: () => Date }} options
 */
export function createCalendarService({ client, store, now = () => new Date() }) {
  const saved = store.load();
  // Persisted: the address resolution, the calendar, the waste types ever seen
  // at this address and the days the scene triggers last fired.
  let data = {
    address: saved.address ?? null,
    collections: saved.collections ?? [],
    fetchedAt: saved.fetchedAt ?? null,
    knownFractions: saved.knownFractions ?? [],
    fired: saved.fired ?? {},
  };
  // In memory only: a restart retries at once.
  let lastError = null;
  let lastAttemptAt = null;
  let inFlight = null;

  const persist = () => store.save(data);

  async function resolveAddress(config) {
    const zipcodes = await client.findZipcodes(config.zipcode);
    if (zipcodes.length === 0) {
      throw new AddressError('zipcode_not_found', { zipcode: config.zipcode });
    }
    // A zip code shared by several municipalities: the street tells them apart.
    const candidates = [];
    for (const zipcode of zipcodes) {
      const streets = await client.findStreets(zipcode.id, config.street);
      const street = matchStreet(streets, config.street);
      if (street) {
        return {
          key: addressKey(config),
          zipcodeId: zipcode.id,
          streetId: street.id,
          houseNumber: config.house_number,
          zipcode: config.zipcode,
          streetNames: { ...street.names, default: street.name },
          cityNames: {
            fr: cityName(zipcode, 'fr'),
            nl: cityName(zipcode, 'nl'),
            de: cityName(zipcode, 'de'),
            en: cityName(zipcode, 'en'),
          },
        };
      }
      candidates.push(...streets.map((s) => streetName(s, 'fr')));
    }
    if (candidates.length > 0) {
      throw new AddressError('street_ambiguous', {
        street: config.street,
        candidates: [...new Set(candidates)].slice(0, MAX_CANDIDATES),
      });
    }
    throw new AddressError('street_not_found', {
      street: config.street,
      zipcode: config.zipcode,
    });
  }

  async function read(config) {
    if (!hasAddress(config)) {
      throw new AddressError('missing_address');
    }
    const key = addressKey(config);
    const address = data.address?.key === key ? data.address : await resolveAddress(config);
    const today = localDate(now());
    const items = await client.getCollections({
      zipcodeId: address.zipcodeId,
      streetId: address.streetId,
      houseNumber: address.houseNumber,
      from: today,
      until: addDays(today, config.days_ahead),
    });
    const collections = normalizeCollections(items);
    const sameAddress = data.address?.key === key;
    // Waste types seen at this address stay devices even when they drop out
    // of the window (Christmas trees, bulky waste twice a year).
    const known = new Map(
      (sameAddress ? data.knownFractions : []).map((fraction) => [fraction.id, fraction]),
    );
    for (const fraction of fractionsOf(collections)) {
      known.set(fraction.id, fraction);
    }
    data = {
      ...data,
      address,
      collections,
      fetchedAt: now().getTime(),
      knownFractions: [...known.values()],
      // A new address is a new calendar: the triggers it fired do not count.
      fired: sameAddress ? data.fired : {},
    };
    persist();
    logger.info(
      `Calendar read: ${collections.length} collections until ${addDays(today, config.days_ahead)}`,
    );
  }

  /** True when the stored calendar is the one of this address. */
  const isCurrent = (config) => data.address?.key === addressKey(config);

  /**
   * Read the calendar now, whatever its age. Rejects with the reason when the
   * read fails (the previous calendar is kept).
   */
  function refresh(config) {
    if (!inFlight) {
      lastAttemptAt = now().getTime();
      inFlight = read(config)
        .then(() => {
          lastError = null;
        })
        .catch((err) => {
          lastError = err;
          logger.warn(`Calendar read failed: ${err.message}`);
          throw err;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  /**
   * Read the calendar when it is due: never read, another address, older than
   * `refresh_hours`. After a failure, wait RETRY_AFTER_MS. Never rejects: the
   * failure is in `state().lastError`.
   * @returns {Promise<boolean>} true when a read happened and succeeded
   */
  async function ensureFresh(config) {
    const at = now().getTime();
    const due =
      !isCurrent(config) ||
      data.fetchedAt === null ||
      at - data.fetchedAt >= config.refresh_hours * HOUR_MS;
    if (!due) {
      return false;
    }
    if (lastError && lastAttemptAt !== null && at - lastAttemptAt < RETRY_AFTER_MS) {
      return false;
    }
    try {
      await refresh(config);
      return true;
    } catch {
      return false;
    }
  }

  /** What is known, for the devices, the widget and the messages. */
  function state(config) {
    const current = isCurrent(config);
    return {
      address: current ? data.address : null,
      collections: current ? data.collections : [],
      knownFractions: current ? data.knownFractions : [],
      fetchedAt: current ? data.fetchedAt : null,
      lastError,
    };
  }

  /** Today in Belgium, `YYYY-MM-DD`. */
  const today = () => localDate(now());

  return {
    refresh,
    ensureFresh,
    state,
    today,

    /** The time in Belgium, `HH:MM`. */
    time() {
      return localTime(now());
    },

    /** The collections from today on. */
    upcoming(config) {
      return upcoming(state(config).collections, today());
    },

    /** The day a scene trigger last fired (`YYYY-MM-DD`), if ever. */
    lastFired(trigger) {
      return data.fired[trigger];
    },

    /** Remember that a scene trigger fired on `date`. */
    markFired(trigger, date) {
      data = { ...data, fired: { ...data.fired, [trigger]: date } };
      persist();
    },

    /** The logo path of a widget image key, if the calendar has it. */
    logoPath(key) {
      return data.knownFractions.find((fraction) => fraction.logo?.key === key)?.logo.path;
    },

    /** Forget the failure of a configuration that just changed: retry at once. */
    resetError() {
      lastError = null;
      lastAttemptAt = null;
    },
  };
}
