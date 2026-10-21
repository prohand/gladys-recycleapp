// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
//   - test_connection  read the calendar of the configured address now and say
//                      what was found (address, waste types, next collection);
//   - find_street      list the streets RecycleApp knows in a zip code, so the
//                      user types the exact name the API expects.
//
// Both answer a multi-language message shown under the button. A failure is an
// answer too ("RecycleApp does not know the zip code 9999"): the user has
// something to fix, not a stack trace to read.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import {
  cityName,
  daysBetween,
  fractionName,
  fractionsOf,
  groupByDate,
} from '../recycleapp/calendar.js';
import { describeError, formatDate, joinNames, relativeDay } from '../messages.js';

const logger = createLogger({ name: 'actions' });

// Streets listed by "Find my street": enough to spot the right one, short
// enough to read under a button.
const MAX_STREETS = 15;

/** The answer of "Test the connection", once the calendar is read. */
export function describeCalendar(service, config) {
  const { address } = service.state(config);
  const upcoming = service.upcoming(config);
  const today = service.today();
  const [first] = groupByDate(upcoming);
  return localize((language) => {
    const nameLanguage = language === 'es' ? 'en' : language;
    const street = address.streetNames[nameLanguage] ?? address.streetNames.default;
    const city = address.cityNames[nameLanguage] ?? address.cityNames.fr;
    const where = `${street} ${address.houseNumber}, ${address.zipcode} ${city}`;
    if (!first) {
      return pick(language, {
        en: `${where}: RecycleApp lists no collection in the next ${config.days_ahead} days. Check the house number, or whether your municipality publishes its calendar on RecycleApp.`,
        fr: `${where} : RecycleApp n'annonce aucune collecte dans les ${config.days_ahead} prochains jours. Vérifiez le numéro, ou si votre commune publie son calendrier sur RecycleApp.`,
        de: `${where}: RecycleApp kündigt in den nächsten ${config.days_ahead} Tagen keine Abholung an. Prüfe die Hausnummer oder ob deine Gemeinde ihren Kalender bei RecycleApp veröffentlicht.`,
        es: `${where}: RecycleApp no anuncia ninguna recogida en los próximos ${config.days_ahead} días. Compruebe el número, o si su municipio publica su calendario en RecycleApp.`,
      });
    }
    const types = joinNames(
      fractionsOf(upcoming, nameLanguage).map((f) => fractionName(f, nameLanguage)),
      language,
    );
    const nextNames = joinNames(
      first.fractions.map((f) => fractionName(f, nameLanguage)),
      language,
    );
    const when = `${formatDate(first.date, language)} (${relativeDay(daysBetween(today, first.date), language)})`;
    return pick(language, {
      en: `${where}: ${upcoming.length} collections in the next ${config.days_ahead} days (${types}). Next: ${when}, ${nextNames}.`,
      fr: `${where} : ${upcoming.length} collectes dans les ${config.days_ahead} prochains jours (${types}). Prochaine : ${when}, ${nextNames}.`,
      de: `${where}: ${upcoming.length} Abholungen in den nächsten ${config.days_ahead} Tagen (${types}). Nächste: ${when}, ${nextNames}.`,
      es: `${where}: ${upcoming.length} recogidas en los próximos ${config.days_ahead} días (${types}). Próxima: ${when}, ${nextNames}.`,
    });
  });
}

// Handlers keyed by the manifest `actions` keys. `context` is
// `{ service, client, config, onCalendarRead }`.
export const ACTIONS = {
  async test_connection({ service, config, onCalendarRead }) {
    logger.info('Action test_connection');
    service.resetError();
    try {
      await service.refresh(config);
    } catch (err) {
      await onCalendarRead();
      return describeError(err);
    }
    await onCalendarRead();
    return describeCalendar(service, config);
  },

  async find_street({ client, config }, fields) {
    const zipcode = String(fields.zipcode || config.zipcode || '').trim();
    const search = String(fields.search ?? '').trim();
    logger.info(`Action find_street <- ${zipcode} "${search}"`);
    if (!zipcode) {
      return describeError({ code: 'missing_address' });
    }
    let zipcodes;
    try {
      zipcodes = await client.findZipcodes(zipcode);
    } catch (err) {
      return describeError(err);
    }
    if (zipcodes.length === 0) {
      return describeError({ code: 'zipcode_not_found', details: { zipcode } });
    }
    const found = [];
    try {
      for (const zip of zipcodes) {
        for (const street of await client.findStreets(zip.id, search)) {
          found.push({ street, zip });
        }
      }
    } catch (err) {
      return describeError(err);
    }
    return localize((language) => {
      const nameLanguage = language === 'es' ? 'en' : language;
      const city = cityName(zipcodes[0], nameLanguage);
      if (found.length === 0) {
        return pick(language, {
          en: `No street matching "${search}" in ${zipcode} ${city}.`,
          fr: `Aucune rue ne correspond à « ${search} » au ${zipcode} ${city}.`,
          de: `Keine Straße passt zu „${search}“ in ${zipcode} ${city}.`,
          es: `Ninguna calle coincide con «${search}» en ${zipcode} ${city}.`,
        });
      }
      // The French and Dutch names are both accepted: show both when they differ.
      const names = [
        ...new Set(
          found.map(({ street }) => {
            const fr = street.names?.fr ?? street.name;
            const nl = street.names?.nl ?? street.name;
            return fr === nl ? fr : `${fr} / ${nl}`;
          }),
        ),
      ];
      const shown = names.slice(0, MAX_STREETS).join(', ');
      const more = names.length - MAX_STREETS;
      return pick(language, {
        en: `Streets in ${zipcode} ${city}: ${shown}${more > 0 ? ` and ${more} more, refine the search` : ''}.`,
        fr: `Rues au ${zipcode} ${city} : ${shown}${more > 0 ? ` et ${more} autres, affinez la recherche` : ''}.`,
        de: `Straßen in ${zipcode} ${city}: ${shown}${more > 0 ? ` und ${more} weitere, verfeinere die Suche` : ''}.`,
        es: `Calles en ${zipcode} ${city}: ${shown}${more > 0 ? ` y ${more} más, afine la búsqueda` : ''}.`,
      });
    });
  },
};
