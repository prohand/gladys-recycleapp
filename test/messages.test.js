import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, localize, pick } from '../src/i18n.js';
import {
  describeError,
  formatDate,
  fractionDeviceName,
  joinNames,
  relativeDay,
  shortRelativeDay,
} from '../src/messages.js';

test('pick falls back to English, localize writes every language', () => {
  assert.equal(pick('it', { en: 'Hello', fr: 'Bonjour' }), 'Hello');
  assert.deepEqual(Object.keys(localize((language) => language)), LANGUAGES);
});

test('dates are calendar days, never shifted by a time zone', () => {
  assert.equal(formatDate('2026-10-23', 'fr'), 'vendredi 23 octobre');
  assert.equal(formatDate('2026-10-23', 'nl'), 'vrijdag 23 oktober');
  assert.equal(formatDate('2026-10-23', 'de'), 'Freitag, 23. Oktober');
  assert.equal(formatDate('2026-10-23', 'es'), 'viernes, 23 de octubre');
  assert.equal(formatDate('2026-10-23', 'xx'), 'Friday 23 October');
});

test('relative days', () => {
  assert.equal(relativeDay(0, 'fr'), "aujourd'hui");
  assert.equal(relativeDay(1, 'es'), 'mañana');
  assert.equal(relativeDay(3, 'de'), 'in 3 Tagen');
  assert.equal(shortRelativeDay(0, 'en'), 'Today');
  assert.equal(shortRelativeDay(12, 'es'), '12 días');
  for (const language of LANGUAGES) {
    // Tile values hold 12 characters, badges 16.
    assert.ok(shortRelativeDay(365, language).length <= 12, language);
    assert.ok(shortRelativeDay(0, language).length <= 12, language);
  }
});

test('lists and device names', () => {
  assert.equal(joinNames(['PMC', 'Verre', 'Papiers'], 'fr'), 'PMC, Verre et Papiers');
  assert.equal(joinNames(['PMD'], 'nl'), 'PMD');
  assert.equal(fractionDeviceName('PMD', 'nl'), 'Ophaling PMD');
  assert.equal(fractionDeviceName('PMD', 'en'), 'PMD collection');
});

test('every error message exists in every language', () => {
  const errors = [
    { code: 'missing_address' },
    { code: 'zipcode_not_found', details: { zipcode: '9999' } },
    { code: 'street_not_found', details: { street: 'x', zipcode: '5000' } },
    { code: 'street_ambiguous', details: { street: 'rue', candidates: ['A', 'B'] } },
    new Error('RecycleApp HTTP 500'),
    undefined,
  ];
  for (const err of errors) {
    const message = describeError(err);
    for (const language of LANGUAGES) {
      assert.ok(message[language], `${err?.code ?? err?.message}: ${language}`);
      assert.doesNotMatch(message[language], /undefined/);
    }
  }
  assert.match(describeError(errors[3]).de, /A, B/);
});
