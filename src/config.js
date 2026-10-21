// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes the received object, so the rest of the code never deals with
// `undefined`, a number typed as a string or a malformed time.
// -----------------------------------------------------------------------------

// The languages RecycleApp names the waste types in (the country's three
// languages plus English).
export const FRACTION_LANGUAGES = ['fr', 'nl', 'de', 'en'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  zipcode: '',
  street: '',
  house_number: '',
  // Language of the waste type names (device names, scene variables).
  language: 'fr',
  // Local time (Belgium) of the "collection tomorrow" reminder, the evening
  // before, and of the "collection today" trigger, in the morning.
  reminder_time: '19:00',
  morning_time: '07:00',
  // How far ahead the calendar is read, in days.
  days_ahead: 60,
  // Hours between two reads of the RecycleApp API: a calendar changes a few
  // times a year, there is no point asking more often.
  refresh_hours: 12,
};

const TIME = /^([01]?\d|2[0-3])[:hH.]([0-5]\d)$/;

/**
 * `HH:MM` from what the user typed (`7:00`, `19h30`, `07.15`), or the fallback.
 * @param {unknown} value
 * @param {string} fallback
 */
export function normalizeTime(value, fallback) {
  const match = String(value ?? '')
    .trim()
    .match(TIME);
  if (!match) {
    return fallback;
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function boundedInteger(value, fallback, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || value === '' || value === null) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language).toLowerCase();
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    zipcode: String(raw.zipcode ?? '').trim(),
    street: String(raw.street ?? '')
      .trim()
      .replace(/\s+/g, ' '),
    house_number: String(raw.house_number ?? '').trim(),
    language: FRACTION_LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    reminder_time: normalizeTime(raw.reminder_time, DEFAULT_CONFIG.reminder_time),
    morning_time: normalizeTime(raw.morning_time, DEFAULT_CONFIG.morning_time),
    days_ahead: boundedInteger(raw.days_ahead, DEFAULT_CONFIG.days_ahead, 7, 365),
    refresh_hours: boundedInteger(raw.refresh_hours, DEFAULT_CONFIG.refresh_hours, 1, 48),
  };
}

/** True when the three address fields are filled in. */
export function hasAddress(config) {
  return Boolean(config.zipcode && config.street && config.house_number);
}

/** The address as one key: a change of any part means another calendar. */
export function addressKey(config) {
  return [config.zipcode, config.street.toLowerCase(), config.house_number.toLowerCase()].join('|');
}
