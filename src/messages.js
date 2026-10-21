// -----------------------------------------------------------------------------
// Wording shared by the devices, the actions, the scenes and the widget.
//
// Two sets of languages meet here: the Gladys interface (en, fr, de, es — see
// src/i18n.js) and the RecycleApp names of the waste types (fr, nl, de, en —
// the `language` setting). The helpers below take either: a date or "in 3
// days" is written in the language it sits next to.
// -----------------------------------------------------------------------------

import { localize, pick } from './i18n.js';

const LOCALES = { en: 'en-GB', fr: 'fr-BE', de: 'de-BE', es: 'es-ES', nl: 'nl-BE' };

const locale = (language) => LOCALES[language] ?? LOCALES.en;

/** `vendredi 23 octobre` from `2026-10-23`, in one language. */
export function formatDate(date, language, { weekday = 'long', month = 'long' } = {}) {
  // The date is a calendar day: format it at UTC midnight, in UTC, so no time
  // zone can move it to the day before.
  return new Intl.DateTimeFormat(locale(language), {
    timeZone: 'UTC',
    weekday,
    day: 'numeric',
    month,
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "today", "tomorrow", "in 3 days", in one language. */
export function relativeDay(days, language) {
  if (days === 0) {
    return pick(language, {
      en: 'today',
      fr: "aujourd'hui",
      de: 'heute',
      es: 'hoy',
      nl: 'vandaag',
    });
  }
  if (days === 1) {
    return pick(language, {
      en: 'tomorrow',
      fr: 'demain',
      de: 'morgen',
      es: 'mañana',
      nl: 'morgen',
    });
  }
  return pick(language, {
    en: `in ${days} days`,
    fr: `dans ${days} jours`,
    de: `in ${days} Tagen`,
    es: `dentro de ${days} días`,
    nl: `over ${days} dagen`,
  });
}

/** "Today", "Tomorrow", "3 days": the short form, for widget tiles and badges. */
export function shortRelativeDay(days, language) {
  if (days === 0) {
    return pick(language, {
      en: 'Today',
      fr: "Aujourd'hui",
      de: 'Heute',
      es: 'Hoy',
      nl: 'Vandaag',
    });
  }
  if (days === 1) {
    return pick(language, {
      en: 'Tomorrow',
      fr: 'Demain',
      de: 'Morgen',
      es: 'Mañana',
      nl: 'Morgen',
    });
  }
  return pick(language, {
    en: `${days} days`,
    fr: `${days} jours`,
    de: `${days} Tage`,
    es: `${days} días`,
    nl: `${days} dagen`,
  });
}

/** "PMC, Papiers-cartons et Verre", in one language. */
export function joinNames(names, language) {
  return new Intl.ListFormat(locale(language), { style: 'long', type: 'conjunction' }).format(
    names,
  );
}

/** The text of a waste type with no collection in the window read. */
export function nothingPlanned(language) {
  return pick(language, {
    en: 'No collection planned',
    fr: 'Aucune collecte prévue',
    de: 'Keine Abholung geplant',
    es: 'Ninguna recogida prevista',
    nl: 'Geen ophaling gepland',
  });
}

/** Device name of one waste type, in the language of the waste type names. */
export function fractionDeviceName(name, language) {
  return pick(language, {
    en: `${name} collection`,
    fr: `Collecte ${name}`,
    de: `Abholung ${name}`,
    nl: `Ophaling ${name}`,
  });
}

/** Device name of the "next collection" summary. */
export function summaryDeviceName(language) {
  return pick(language, {
    en: 'Next waste collection',
    fr: 'Prochaine collecte des déchets',
    de: 'Nächste Müllabholung',
    nl: 'Volgende afvalophaling',
  });
}

/**
 * The multi-language message of an error, for the Configuration screen and
 * the action answers. Errors of the service carry a `code` and the values the
 * sentence needs; anything else is a technical failure, shown as is.
 */
export function describeError(err) {
  const { code, details = {} } = err ?? {};
  const reason = err?.message ?? 'unknown error';
  switch (code) {
    case 'missing_address':
      return {
        en: 'Fill in the zip code, the street and the house number in the configuration.',
        fr: 'Renseignez le code postal, la rue et le numéro dans la configuration.',
        de: 'Gib Postleitzahl, Straße und Hausnummer in der Konfiguration ein.',
        es: 'Indique el código postal, la calle y el número en la configuración.',
      };
    case 'zipcode_not_found':
      return {
        en: `RecycleApp does not know the zip code ${details.zipcode}.`,
        fr: `RecycleApp ne connaît pas le code postal ${details.zipcode}.`,
        de: `RecycleApp kennt die Postleitzahl ${details.zipcode} nicht.`,
        es: `RecycleApp no conoce el código postal ${details.zipcode}.`,
      };
    case 'street_not_found':
      return {
        en: `No street "${details.street}" in ${details.zipcode}. Use "Find my street" to get its exact name.`,
        fr: `Aucune rue « ${details.street} » au ${details.zipcode}. Utilisez « Chercher ma rue » pour obtenir son nom exact.`,
        de: `Keine Straße „${details.street}“ in ${details.zipcode}. Nutze „Meine Straße suchen“, um ihren genauen Namen zu finden.`,
        es: `No hay ninguna calle «${details.street}» en ${details.zipcode}. Use «Buscar mi calle» para obtener su nombre exacto.`,
      };
    case 'street_ambiguous':
      return localize((language) => {
        const list = details.candidates.join(', ');
        return pick(language, {
          en: `Several streets match "${details.street}": ${list}. Type the full name.`,
          fr: `Plusieurs rues correspondent à « ${details.street} » : ${list}. Tapez le nom complet.`,
          de: `Mehrere Straßen passen zu „${details.street}“: ${list}. Gib den vollständigen Namen ein.`,
          es: `Varias calles coinciden con «${details.street}»: ${list}. Escriba el nombre completo.`,
        });
      });
    default:
      return {
        en: `RecycleApp could not be read: ${reason}`,
        fr: `Impossible de lire RecycleApp : ${reason}`,
        de: `RecycleApp konnte nicht gelesen werden: ${reason}`,
        es: `No se pudo leer RecycleApp: ${reason}`,
      };
  }
}
