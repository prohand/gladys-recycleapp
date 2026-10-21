import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addressKey,
  DEFAULT_CONFIG,
  hasAddress,
  normalizeConfig,
  normalizeTime,
} from '../src/config.js';

test('an empty config gets every default', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('the address is trimmed, spaces collapsed', () => {
  const config = normalizeConfig({
    zipcode: ' 5000 ',
    street: ' Rue   de  Fer ',
    house_number: 12,
  });
  assert.equal(config.zipcode, '5000');
  assert.equal(config.street, 'Rue de Fer');
  assert.equal(config.house_number, '12');
  assert.ok(hasAddress(config));
  assert.ok(!hasAddress(normalizeConfig({ zipcode: '5000', street: 'Rue de Fer' })));
});

test('the address key ignores case, so a retyped street is the same address', () => {
  const a = normalizeConfig({ zipcode: '5000', street: 'Rue de Fer', house_number: '12A' });
  const b = normalizeConfig({ zipcode: '5000', street: 'rue de fer', house_number: '12a' });
  assert.equal(addressKey(a), addressKey(b));
});

test('times accept the usual spellings, anything else falls back', () => {
  assert.equal(normalizeTime('7:05', 'x'), '07:05');
  assert.equal(normalizeTime('19h30', 'x'), '19:30');
  assert.equal(normalizeTime('06.45', 'x'), '06:45');
  assert.equal(normalizeTime(' 23:59 ', 'x'), '23:59');
  for (const bad of ['24:00', '7', '', null, undefined, 'soon', '12:60']) {
    assert.equal(normalizeTime(bad, '19:00'), '19:00', String(bad));
  }
});

test('numbers are bounded, a wrong language falls back to French', () => {
  const config = normalizeConfig({
    days_ahead: '1000',
    refresh_hours: 0,
    language: 'NL',
  });
  assert.equal(config.days_ahead, 365);
  assert.equal(config.refresh_hours, 1);
  assert.equal(config.language, 'nl');
  assert.equal(normalizeConfig({ language: 'es' }).language, 'fr');
  assert.equal(normalizeConfig({ days_ahead: 'abc' }).days_ahead, 60);
  assert.equal(normalizeConfig({ days_ahead: '' }).days_ahead, 60);
});
