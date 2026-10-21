// -----------------------------------------------------------------------------
// Scene triggers and scene actions (SDK v0.14+, Gladys 5.1+).
//
// Triggers — something happened, fired by the minute tick (index.js):
//   - collection_tomorrow  the evening before a collection, at `reminder_time`:
//                          once, with every waste type of the day;
//   - fraction_tomorrow    the same evening, once per waste type: the scene
//                          picks the waste type it cares about (yellow lamp
//                          for the PMC...);
//   - collection_today     the morning of a collection, at `morning_time`.
//
// Each fires once a day, remembered in /data, so a restart does not send the
// reminder again. A restart past the hour still fires it, up to CATCH_UP_MIN
// later: a reminder at 21:00 still helps, one at 03:00 does not.
//
// Actions — operations a scene author places in a scene:
//   - refresh_calendar  read RecycleApp now (after a holiday announcement...);
//   - next_collection   the next collection, of one waste type or of any, as
//                       outputs the following actions read and gate on.
//
// Never fire a trigger as a consequence of an action: a scene bound to it
// would loop through the integration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { fractionIds, fractionOfDevice, NONE_PLANNED } from '../devices.js';
import { addDays, daysBetween, fractionName, groupByDate } from '../recycleapp/calendar.js';
import { joinNames } from '../messages.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = {
  COLLECTION_TOMORROW: 'collection_tomorrow',
  FRACTION_TOMORROW: 'fraction_tomorrow',
  COLLECTION_TODAY: 'collection_today',
};

// How long after its hour a missed trigger still fires, in minutes.
export const CATCH_UP_MIN = 4 * 60;

const minutes = (time) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

/** True when `time` is at `at` or in the CATCH_UP_MIN after it, the same day. */
export function isDue(time, at) {
  const elapsed = minutes(time) - minutes(at);
  return elapsed >= 0 && elapsed <= CATCH_UP_MIN;
}

const namesOf = (fractions, language) =>
  joinNames(
    fractions.map((fraction) => fractionName(fraction, language)),
    language,
  );

async function fireDay(gladys, service, config, { trigger, at, date, perFraction }) {
  const today = service.today();
  if (service.lastFired(trigger) === today || !isDue(service.time(), at)) {
    return false;
  }
  // No calendar read yet: nothing to say, and nothing to remember either —
  // the read may still succeed before the catch-up window closes.
  if (service.state(config).fetchedAt === null) {
    return false;
  }
  const fractions = service
    .upcoming(config)
    .filter((collection) => collection.date === date)
    .map((collection) => collection.fraction);
  if (fractions.length > 0) {
    logger.info(`Scene trigger ${trigger}: ${namesOf(fractions, config.language)} on ${date}`);
    await gladys.publishSceneEvent(trigger, {
      date,
      fractions: namesOf(fractions, config.language),
      count: fractions.length,
    });
    if (perFraction) {
      const results = await Promise.allSettled(
        fractions.map((fraction) =>
          gladys.publishSceneEvent(SCENE_TRIGGERS.FRACTION_TOMORROW, {
            device: fractionIds(gladys, fraction.id).device,
            fraction: fractionName(fraction, config.language),
            date,
          }),
        ),
      );
      for (const result of results.filter((r) => r.status === 'rejected')) {
        logger.warn(`Scene trigger ${SCENE_TRIGGERS.FRACTION_TOMORROW} failed`, result.reason);
      }
    }
  }
  // Remembered only once the main event is accepted: a failed publication
  // (Gladys restarting) is retried at the next tick.
  service.markFired(trigger, today);
  return fractions.length > 0;
}

/**
 * Fire the triggers that are due. Called every minute; a failure is logged
 * and retried at the next tick.
 */
export async function checkSceneTriggers(gladys, service, config) {
  const today = service.today();
  const jobs = [
    {
      trigger: SCENE_TRIGGERS.COLLECTION_TOMORROW,
      at: config.reminder_time,
      date: addDays(today, 1),
      perFraction: true,
    },
    { trigger: SCENE_TRIGGERS.COLLECTION_TODAY, at: config.morning_time, date: today },
  ];
  for (const job of jobs) {
    try {
      await fireDay(gladys, service, config, job);
    } catch (err) {
      logger.warn(`Scene trigger ${job.trigger} failed, retried at the next tick`, err);
    }
  }
}

/** Every trigger the integration fires: each must be declared in the manifest. */
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

/**
 * The next collection, of one waste type or of any: the outputs of
 * `next_collection` and of `refresh_calendar`.
 */
export function nextCollection(gladys, service, config, deviceExternalId) {
  const fraction = deviceExternalId
    ? fractionOfDevice(gladys, service, config, deviceExternalId)
    : undefined;
  const upcoming = service
    .upcoming(config)
    .filter((collection) => !fraction || collection.fraction.id === fraction.id);
  const [day] = groupByDate(upcoming);
  if (!day) {
    return { found: false, date: '', days: NONE_PLANNED, fractions: '' };
  }
  return {
    found: true,
    date: day.date,
    days: daysBetween(service.today(), day.date),
    fractions: namesOf(day.fractions, config.language),
  };
}

// Handlers keyed by the manifest `scene_actions` keys. `context` is
// `{ gladys, service, config, onCalendarRead }`, `fields` the RESOLVED values.
export const SCENE_ACTIONS = {
  async refresh_calendar({ gladys, service, config, onCalendarRead }) {
    logger.info('Scene action refresh_calendar');
    // Throwing fails this action only: the scene logs it and continues.
    await service.refresh(config);
    await onCalendarRead();
    return {
      collections: service.upcoming(config).length,
      ...pickOutputs(nextCollection(gladys, service, config)),
    };
  },

  async next_collection({ gladys, service, config }, fields) {
    // A device that is not a waste type (the summary) means any waste type.
    return nextCollection(gladys, service, config, fields.device || undefined);
  },
};

function pickOutputs({ date, fractions }) {
  return { next_date: date, next_fractions: fractions };
}
