import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  cityName,
  daysBetween,
  fractionName,
  fractionsOf,
  groupByDate,
  localDate,
  localTime,
  matchStreet,
  nextDates,
  normalizeCollections,
  simplify,
  upcoming,
} from '../src/recycleapp/calendar.js';
import { COLLECTIONS, FRACTIONS, STREETS, ZIPCODES } from './helpers/fakeRecycleApp.js';

test('dates and times are Belgian, whatever the host time zone', () => {
  // 23:30 UTC in summer is already the next day in Brussels (UTC+2).
  assert.equal(localDate(new Date('2026-07-14T23:30:00Z')), '2026-07-15');
  assert.equal(localTime(new Date('2026-07-14T23:30:00Z')), '01:30');
  // Winter time: UTC+1.
  assert.equal(localDate(new Date('2026-12-31T22:59:00Z')), '2026-12-31');
  assert.equal(localTime(new Date('2026-12-31T22:59:00Z')), '23:59');
});

test('day arithmetic crosses months, years and DST changes', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // DST ends on the 25th
  assert.equal(daysBetween('2026-10-21', '2026-10-23'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-10-23', '2026-10-21'), -2);
});

test('street names match without case, accents or punctuation', () => {
  assert.equal(simplify("Ruelle de l'Enfer"), 'ruelle de l enfer');
  assert.equal(simplify('  RUE  de Fér '), 'rue de fer');
});

test('matchStreet takes an exact name in any language, else the only result', () => {
  const streets = STREETS['5000-92094'];
  assert.equal(matchStreet(streets, 'rue de fer').name, 'Rue de Fer');
  assert.equal(matchStreet(streets, 'RUELLE DE L’ENFER').name, "Ruelle de l'Enfer");
  // Several results, none exact: better ask than pick the wrong calendar.
  assert.equal(matchStreet(streets, 'rue'), undefined);
  assert.equal(matchStreet([streets[1]], 'ferme').name, 'Rue de la Ferme de Ronet');
  assert.equal(matchStreet([], 'rue'), undefined);
});

test('the city is the municipality, not the first locality of the zip code', () => {
  assert.equal(cityName(ZIPCODES[0], 'fr'), 'Namur');
  assert.equal(cityName(ZIPCODES[0], 'nl'), 'Namen');
  assert.equal(cityName(ZIPCODES[1], 'de'), 'Löwen');
});

test('fraction names fall back to English, then French, then Dutch', () => {
  const fraction = { names: FRACTIONS.pmd.name };
  assert.equal(fractionName(fraction, 'fr'), 'PMC');
  assert.equal(fractionName(fraction, 'es'), 'PMD');
  assert.equal(fractionName({ names: { nl: 'GFT' } }, 'fr'), 'GFT');
  assert.equal(fractionName({ names: {} }, 'fr'), '?');
});

test('normalizeCollections drops events and moved collections, reads dates in Belgium', () => {
  const collections = normalizeCollections(COLLECTIONS);
  assert.deepEqual(
    collections.map(({ date, fraction }) => `${date} ${fractionName(fraction, 'fr')}`),
    [
      '2026-10-20 Déchets résiduels',
      '2026-10-22 Papiers-cartons',
      '2026-10-22 PMC',
      '2026-10-23 Déchets résiduels',
      '2026-10-28 Déchets résiduels', // moved from the 27th
      '2026-10-30 PMC', // 23:00 UTC on the 29th
      '2026-11-05 Papiers-cartons',
    ],
  );
});

test('normalizeCollections keeps what the widget needs and tolerates junk', () => {
  const [first] = normalizeCollections([
    COLLECTIONS[1],
    COLLECTIONS[1], // duplicated entry
    { type: 'collection', timestamp: 'not a date', fraction: FRACTIONS.pmd },
    { type: 'collection', timestamp: '2026-10-22T00:00:00Z' }, // no fraction
    null,
  ]);
  assert.deepEqual(first, {
    date: '2026-10-22',
    fraction: {
      id: FRACTIONS.pmd.id,
      names: FRACTIONS.pmd.name,
      color: '#66C3FA',
      logo: { key: 'logo-5d610b86162c063cc0400125', path: FRACTIONS.pmd.logo.regular['3x'] },
    },
  });
  assert.equal(normalizeCollections([COLLECTIONS[1], COLLECTIONS[1]]).length, 1);
  assert.deepEqual(normalizeCollections(undefined), []);
});

test('a logo id that is not a valid image key is hashed into one', () => {
  const [collection] = normalizeCollections([
    {
      type: 'collection',
      timestamp: '2026-10-22T00:00:00Z',
      fraction: { ...FRACTIONS.pmd, logo: { regular: { '1x': 'public/a.png' }, id: 'Not_Valid!' } },
    },
  ]);
  assert.match(collection.fraction.logo.key, /^logo-[a-f0-9]{24}$/);
});

test('upcoming, groupByDate, fractionsOf and nextDates', () => {
  const collections = normalizeCollections(COLLECTIONS);
  const ahead = upcoming(collections, '2026-10-21');
  assert.equal(ahead[0].date, '2026-10-22');
  const days = groupByDate(ahead);
  assert.deepEqual(
    days.map((day) => [day.date, day.fractions.length]),
    [
      ['2026-10-22', 2],
      ['2026-10-23', 1],
      ['2026-10-28', 1],
      ['2026-10-30', 1],
      ['2026-11-05', 1],
    ],
  );
  assert.deepEqual(
    fractionsOf(ahead, 'en').map((f) => fractionName(f, 'en')),
    ['Paper-cardboard', 'PMD', 'Residual waste'],
  );
  const next = nextDates(collections, '2026-10-23');
  assert.equal(next.get(FRACTIONS.residual.id), '2026-10-23');
  assert.equal(next.get(FRACTIONS.pmd.id), '2026-10-30');
  assert.equal(next.get(FRACTIONS.trees.id), undefined);
});
