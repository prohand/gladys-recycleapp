// -----------------------------------------------------------------------------
// Dashboard widget (SDK v0.14+, Gladys 5.1+): "Waste collections".
//
// The next collections, as the RecycleApp app shows them: one row per waste
// type and day, with its logo and how many days are left, plus where the
// calendar comes from and a button to read it again.
//
// The content is computed for the reader: Gladys passes the `language` of the
// user looking at the dashboard, so the waste types are named in their
// language when RecycleApp has it, whatever the `language` setting. The logos
// are the RecycleApp ones, served through `onWidgetGetImage` (the browser
// never loads a third-party URL).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { daysBetween, fractionName, localDate } from '../recycleapp/calendar.js';
import { describeError, formatDate, shortRelativeDay } from '../messages.js';
import { localize, pick } from '../i18n.js';
import { hasAddress } from '../config.js';

const logger = createLogger({ name: 'widget' });

// Widget key, as declared in the manifest `widgets` field.
export const COLLECTIONS_WIDGET = 'collections';
export const WIDGET_ACTIONS = { REFRESH: 'refresh' };
export const DEFAULT_ROWS = 5;
const MAX_ROWS = 8; // the `list` display of a card-list holds 8 items
const MAX_STATUS_VALUE = 40;

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function rows(settings) {
  const count = Math.round(Number(settings?.count ?? DEFAULT_ROWS));
  return Number.isFinite(count) ? Math.min(MAX_ROWS, Math.max(1, count)) : DEFAULT_ROWS;
}

function dayColor(days) {
  if (days === 0) {
    return WIDGET_COLORS.DANGER;
  }
  return days === 1 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL;
}

function addressLine(address, language) {
  const street = address.streetNames[language] ?? address.streetNames.default;
  const city = address.cityNames[language] ?? address.cityNames.fr;
  return truncate(`${street} ${address.houseNumber}, ${address.zipcode} ${city}`, MAX_STATUS_VALUE);
}

/** The widget content for one reader. */
export function buildWidgetContent(service, config, { settings, language = 'en' } = {}) {
  const { address, fetchedAt, lastError } = service.state(config);
  const today = service.today();
  const components = [];

  if (!address) {
    let text = describeError(lastError ?? { code: 'missing_address' });
    if (!lastError && hasAddress(config)) {
      text = {
        en: 'Reading the calendar…',
        fr: 'Lecture du calendrier…',
        de: 'Kalender wird gelesen…',
        es: 'Leyendo el calendario…',
      };
    }
    components.push({ type: 'text', variant: 'body', text });
    return { ttl_seconds: 60, components };
  }

  const upcoming = service.upcoming(config);
  const next = upcoming[0];
  if (next) {
    const days = daysBetween(today, next.date);
    components.push({
      type: 'value',
      label: {
        en: 'Next collection',
        fr: 'Prochaine collecte',
        de: 'Nächste Abholung',
        es: 'Próxima recogida',
      },
      value: shortRelativeDay(days, language),
      icon: 'trash-2',
      color: dayColor(days),
    });
    components.push({
      type: 'card-list',
      display: 'list',
      items: upcoming.slice(0, rows(settings)).map(({ date, fraction }) => {
        const daysLeft = daysBetween(today, date);
        return {
          title: fractionName(fraction, language),
          subtitle: capitalize(formatDate(date, language)),
          ...(fraction.logo ? { image: fraction.logo.key } : {}),
          badge: { text: shortRelativeDay(daysLeft, language), color: dayColor(daysLeft) },
        };
      }),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'body',
      text: localize((lang) =>
        pick(lang, {
          en: `No collection in the next ${config.days_ahead} days.`,
          fr: `Aucune collecte dans les ${config.days_ahead} prochains jours.`,
          de: `Keine Abholung in den nächsten ${config.days_ahead} Tagen.`,
          es: `Ninguna recogida en los próximos ${config.days_ahead} días.`,
        }),
      ),
    });
  }

  if (lastError) {
    components.push({ type: 'text', variant: 'body', text: describeError(lastError) });
  }

  const readAt = fetchedAt ? localDate(new Date(fetchedAt)) : null;
  components.push({
    type: 'status',
    items: [
      {
        label: { en: 'Address', fr: 'Adresse', de: 'Adresse', es: 'Dirección' },
        icon: 'map-pin',
        value: addressLine(address, language),
        color: WIDGET_COLORS.NEUTRAL,
      },
      {
        label: {
          en: 'Calendar read',
          fr: 'Calendrier lu',
          de: 'Kalender gelesen',
          es: 'Calendario leído',
        },
        icon: 'calendar',
        value: readAt ? capitalize(formatDate(readAt, language, { weekday: 'short' })) : '—',
        color: lastError ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
      },
    ],
  });

  components.push({
    type: 'button',
    label: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  });

  // "Tomorrow" becomes "Today" at midnight: the minute tick nudges the widget
  // when the states change, the TTL is only a safety net.
  return { ttl_seconds: 900, components };
}

export const WIDGETS = {
  [COLLECTIONS_WIDGET]: {
    // `context` is `{ service, config, onCalendarRead, client }`.
    async get(context, { settings, language }) {
      return buildWidgetContent(context.service, context.config, { settings, language });
    },

    async action({ service, config, onCalendarRead }, { actionKey }) {
      logger.info(`onWidgetAction <- ${COLLECTIONS_WIDGET}.${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.REFRESH) {
        // Throwing acks the action as failed: the message reaches the user.
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      try {
        await service.refresh(config);
      } catch (err) {
        return describeError(err);
      }
      await onCalendarRead();
      return {
        en: 'Calendar read again.',
        fr: 'Calendrier relu.',
        de: 'Kalender neu gelesen.',
        es: 'Calendario leído de nuevo.',
      };
    },
  },
};

/** The logo of a waste type, as raw base64, for `onWidgetGetImage`. */
export async function getWidgetImage({ service, client }, imageKey) {
  const path = service.logoPath(imageKey);
  if (!path) {
    throw new Error(`Unknown image: ${imageKey}`);
  }
  return client.getAsset(path);
}

/** Ask the core to re-pull every widget now (rate-limited 1/10 s core-side). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
