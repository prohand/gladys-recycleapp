// -----------------------------------------------------------------------------
// The collection calendar, as pure functions: no network, no clock of its own.
//
// RecycleApp is Belgian, and so are its dates: a collection is a calendar day
// in Belgium, whatever the time zone of the Gladys host. Every "today",
// "tomorrow" or "in 3 days" is therefore computed in Europe/Brussels, and dates
// travel as `YYYY-MM-DD` strings, which compare and sort as text.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export const BELGIAN_TIME_ZONE = 'Europe/Brussels';
const DAY_MS = 24 * 60 * 60 * 1000;

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BELGIAN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: BELGIAN_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `YYYY-MM-DD` of an instant, in Belgium. */
export function localDate(instant) {
  return dateFormat.format(instant);
}

/** `HH:MM` of an instant, in Belgium. */
export function localTime(instant) {
  return timeFormat.format(instant);
}

/** The date `days` days after `date` (both `YYYY-MM-DD`). */
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`), negative when `to` is earlier. */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Lower case, no accents, no punctuation: "Rue de l'Église" matches "rue de l eglise". */
export function simplify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The street the user meant among the search results: an exact name in any
 * language first, then the only result, else nothing (several streets match
 * and none exactly: better ask than pick the wrong calendar).
 */
export function matchStreet(streets, query) {
  const wanted = simplify(query);
  const names = (street) => [street.name, ...Object.values(street.names ?? {})].map(simplify);
  const exact = streets.find((street) => names(street).includes(wanted));
  if (exact) {
    return exact;
  }
  return streets.length === 1 ? streets[0] : undefined;
}

/** The name of a street in one language, for the messages. */
export function streetName(street, language) {
  return street.names?.[language] ?? street.name ?? street.names?.fr ?? '';
}

/**
 * The name of the municipality of a zip code in one language, for the
 * messages. `zipcode.names` lists the localities sharing the code (Beez,
 * Namur...): the municipality is `zipcode.city`.
 */
export function cityName(zipcode, language) {
  const names = zipcode.city?.names ?? zipcode.names?.[0] ?? {};
  return names[language] ?? zipcode.city?.name ?? names.fr ?? '';
}

/**
 * The name of a waste type in one language. RecycleApp names them in French,
 * Dutch, German and English; some municipalities only fill in one of them.
 */
export function fractionName(fraction, language) {
  const names = fraction.names ?? {};
  return names[language] ?? names.en ?? names.fr ?? names.nl ?? Object.values(names)[0] ?? '?';
}

// Widget image keys: `^[a-z0-9][a-z0-9-]{0,63}$`, stable for a given logo
// (the core caches an image one hour by key).
function logoKey(logo, path) {
  const id = String(logo?.id ?? '').toLowerCase();
  if (/^[a-z0-9]{1,40}$/.test(id)) {
    return `logo-${id}`;
  }
  return `logo-${createHash('sha256').update(path).digest('hex').slice(0, 24)}`;
}

function normalizeFraction(raw) {
  const logo = raw.logo?.regular ?? {};
  const logoPath = logo['3x'] ?? logo['2x'] ?? logo['1x'];
  return {
    id: String(raw.id),
    names: { ...raw.name },
    color: typeof raw.color === 'string' ? raw.color : undefined,
    logo: logoPath ? { key: logoKey(raw.logo, logoPath), path: logoPath } : undefined,
  };
}

/**
 * The collections of a RecycleApp answer, one per date and waste type, sorted.
 *
 * - `event` entries (repair cafés, information days) are not collections;
 * - a collection moved to another day (public holiday) comes twice: the
 *   original carries `exception.replacedBy` and is dropped, the replacement
 *   (`exception.replaces`) is kept;
 * - the timestamp is the Belgian midnight of the day, written in UTC
 *   (`T00:00:00.000Z`, or `T22:00:00.000Z` the day before): read in Belgium.
 *
 * @returns {{ date: string, fraction: { id: string, names: object, color?: string, logo?: { key: string, path: string } } }[]}
 */
export function normalizeCollections(items) {
  const byKey = new Map();
  for (const item of items ?? []) {
    if (item?.type !== 'collection' || !item.fraction?.id || !item.timestamp) {
      continue;
    }
    if (item.exception?.replacedBy || item.exception?.isDeleted === true) {
      continue;
    }
    const instant = new Date(item.timestamp);
    if (Number.isNaN(instant.getTime())) {
      continue;
    }
    const collection = { date: localDate(instant), fraction: normalizeFraction(item.fraction) };
    byKey.set(`${collection.date}|${collection.fraction.id}`, collection);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      fractionName(a.fraction, 'fr').localeCompare(fractionName(b.fraction, 'fr')),
  );
}

/** The collections from `today` on. */
export function upcoming(collections, today) {
  return collections.filter((collection) => collection.date >= today);
}

/** The collections grouped by date: `[{ date, fractions: [...] }]`, in date order. */
export function groupByDate(collections) {
  const days = [];
  for (const { date, fraction } of collections) {
    const last = days.at(-1);
    if (last?.date === date) {
      last.fractions.push(fraction);
    } else {
      days.push({ date, fractions: [fraction] });
    }
  }
  return days;
}

/** The waste types of a calendar, each once, sorted by name. */
export function fractionsOf(collections, language = 'fr') {
  const byId = new Map(collections.map(({ fraction }) => [fraction.id, fraction]));
  return [...byId.values()].sort((a, b) =>
    fractionName(a, language).localeCompare(fractionName(b, language)),
  );
}

/** The next collection of each waste type, from `today` on: `Map<fractionId, date>`. */
export function nextDates(collections, today) {
  const next = new Map();
  for (const { date, fraction } of upcoming(collections, today)) {
    if (!next.has(fraction.id)) {
      next.set(fraction.id, date);
    }
  }
  return next;
}
