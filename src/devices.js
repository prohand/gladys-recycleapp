// -----------------------------------------------------------------------------
// The devices: one per waste type collected at the address, plus a summary.
//
//   - "PMC collection", "Paper-cardboard collection"... (one per waste type):
//       days       days until the next collection (0 = today, -1 = none planned
//                  in the window read), for scene conditions;
//       next-date  the day, written out ("vendredi 23 octobre").
//   - "Next waste collection" (the summary):
//       days, next-date as above, for the next collection of any type;
//       fractions  what goes out that day ("PMC et Papiers-cartons").
//
// External ids come from RecycleApp: a waste type is keyed by its RecycleApp
// id, which does not change when the municipality renames it. The devices are
// published without `should_poll`: the integration drives its own minute tick
// (index.js), since the reminders must run whether or not the user created the
// devices in Gladys.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { pick } from './i18n.js';
import {
  daysBetween,
  fractionName,
  groupByDate,
  localDate,
  nextDates,
} from './recycleapp/calendar.js';
import {
  formatDate,
  fractionDeviceName,
  joinNames,
  nothingPlanned,
  summaryDeviceName,
} from './messages.js';

const DEVICE_TYPE = { FRACTION: 'fraction', SUMMARY: 'summary' };
const SUMMARY_PLATFORM_ID = 'next-collection';

export const FEATURE = { DAYS: 'days', NEXT_DATE: 'next-date', FRACTIONS: 'fractions' };

/** `days` of a waste type with no collection in the window read. */
export const NONE_PLANNED = -1;
// A year and a day: the longest window the configuration allows, plus one.
const MAX_DAYS = 366;

export const fractionIds = (gladys, fractionId) =>
  gladys.externalIds(DEVICE_TYPE.FRACTION, fractionId);
export const summaryIds = (gladys) => gladys.externalIds(DEVICE_TYPE.SUMMARY, SUMMARY_PLATFORM_ID);

const featureNames = {
  [FEATURE.DAYS]: {
    en: 'Days until the collection',
    fr: 'Jours avant la collecte',
    de: 'Tage bis zur Abholung',
    nl: 'Dagen tot de ophaling',
  },
  [FEATURE.NEXT_DATE]: {
    en: 'Collection day',
    fr: 'Jour de collecte',
    de: 'Abholtag',
    nl: 'Ophaaldag',
  },
  [FEATURE.FRACTIONS]: {
    en: 'Waste collected',
    fr: 'Déchets collectés',
    de: 'Abgeholter Müll',
    nl: 'Opgehaald afval',
  },
};

function daysFeature(ids, language) {
  return {
    name: pick(language, featureNames[FEATURE.DAYS]),
    external_id: ids.feature(FEATURE.DAYS),
    category: DEVICE_FEATURE_CATEGORIES.DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.DAYS,
    min: NONE_PLANNED,
    max: MAX_DAYS,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  };
}

function textFeature(ids, key, language) {
  return {
    name: pick(language, featureNames[key]),
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    // Gladys stores min/max as NOT NULL, text features included.
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  };
}

/**
 * The discovery payload: the summary, then one device per waste type ever
 * seen at the address. Empty until the address is resolved.
 */
export function buildDevices(gladys, service, config) {
  const { address, knownFractions } = service.state(config);
  if (!address) {
    return [];
  }
  const language = config.language;
  const summary = summaryIds(gladys);
  return [
    {
      name: summaryDeviceName(language),
      external_id: summary.device,
      model: 'RecycleApp',
      features: [
        daysFeature(summary, language),
        textFeature(summary, FEATURE.NEXT_DATE, language),
        textFeature(summary, FEATURE.FRACTIONS, language),
      ],
    },
    ...[...knownFractions]
      .sort((a, b) => fractionName(a, language).localeCompare(fractionName(b, language)))
      .map((fraction) => {
        const ids = fractionIds(gladys, fraction.id);
        return {
          name: fractionDeviceName(fractionName(fraction, language), language),
          external_id: ids.device,
          model: 'RecycleApp',
          features: [daysFeature(ids, language), textFeature(ids, FEATURE.NEXT_DATE, language)],
        };
      }),
  ];
}

/**
 * Every state of every device, for today. Published through
 * `publishChangedStates`: only what changed reaches Gladys, which is a few
 * values at midnight and nothing the rest of the day.
 */
export function buildStates(gladys, service, config) {
  const { address, knownFractions } = service.state(config);
  if (!address) {
    return [];
  }
  const language = config.language;
  const today = service.today();
  const upcoming = service.upcoming(config);
  const next = nextDates(upcoming, today);
  const states = [];

  const push = (ids, date, extra = []) => {
    states.push(
      {
        device_feature_external_id: ids.feature(FEATURE.DAYS),
        state: date ? daysBetween(today, date) : NONE_PLANNED,
      },
      {
        device_feature_external_id: ids.feature(FEATURE.NEXT_DATE),
        text: date ? formatDate(date, language) : nothingPlanned(language),
      },
      ...extra,
    );
  };

  const [firstDay] = groupByDate(upcoming);
  const summary = summaryIds(gladys);
  push(summary, firstDay?.date, [
    {
      device_feature_external_id: summary.feature(FEATURE.FRACTIONS),
      text: firstDay
        ? joinNames(
            firstDay.fractions.map((fraction) => fractionName(fraction, language)),
            language,
          )
        : nothingPlanned(language),
    },
  ]);
  for (const fraction of knownFractions) {
    push(fractionIds(gladys, fraction.id), next.get(fraction.id));
  }
  return states;
}

/**
 * The transport badge of every device: `cloud` when the last read worked,
 * `cloud` + degraded when RecycleApp failed but an older calendar is still
 * served, `unreachable` when there is nothing to serve.
 */
export function buildTransportEntries(gladys, service, config) {
  const { lastError, fetchedAt } = service.state(config);
  let entry = { transport: DEVICE_TRANSPORTS.CLOUD };
  if (lastError && fetchedAt === null) {
    entry = { transport: DEVICE_TRANSPORTS.UNREACHABLE };
  } else if (lastError) {
    const day = localDate(new Date(fetchedAt));
    entry = {
      transport: DEVICE_TRANSPORTS.CLOUD,
      degraded: true,
      message: {
        en: `RecycleApp does not answer: calendar read on ${formatDate(day, 'en')}.`,
        fr: `RecycleApp ne répond pas : calendrier lu le ${formatDate(day, 'fr')}.`,
        de: `RecycleApp antwortet nicht: Kalender gelesen am ${formatDate(day, 'de')}.`,
        es: `RecycleApp no responde: calendario leído el ${formatDate(day, 'es')}.`,
      },
    };
  }
  return buildDevices(gladys, service, config).map((device) => ({
    external_id: device.external_id,
    ...entry,
  }));
}

/**
 * The waste type of a device external_id (a `"source": "devices"` field), or
 * undefined for the summary and anything else.
 */
export function fractionOfDevice(gladys, service, config, externalId) {
  return service
    .state(config)
    .knownFractions.find((fraction) => fractionIds(gladys, fraction.id).device === externalId);
}
