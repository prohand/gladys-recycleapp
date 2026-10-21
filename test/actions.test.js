import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/capabilities/actions.js';
import { normalizeConfig } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { ADDRESS_CONFIG } from './helpers/fakeRecycleApp.js';
import { setup } from './helpers/setup.js';

const everyLanguage = (message) => {
  for (const language of LANGUAGES) {
    assert.ok(message[language], `missing ${language}`);
  }
};

test('test_connection reads the calendar and describes it', async () => {
  const { context, calendarReads } = await setup({ read: false });
  const message = await ACTIONS.test_connection(context);
  everyLanguage(message);
  assert.equal(
    message.fr,
    'Rue de Fer 12, 5000 Namur : 6 collectes dans les 60 prochains jours (Déchets résiduels, Papiers-cartons et PMC). Prochaine : jeudi 22 octobre (demain), Papiers-cartons et PMC.',
  );
  assert.match(message.de, /^Rue de Fer 12, 5000 Namur: 6 Abholungen/);
  assert.match(message.es, /mañana/);
  assert.equal(calendarReads(), 1);
});

test('test_connection explains a wrong address instead of failing', async () => {
  const { context } = await setup({ read: false });
  context.config = normalizeConfig({ ...ADDRESS_CONFIG, zipcode: '9999' });
  const message = await ACTIONS.test_connection(context);
  everyLanguage(message);
  assert.equal(message.fr, 'RecycleApp ne connaît pas le code postal 9999.');
});

test('test_connection when nothing is planned', async () => {
  const { context, fake } = await setup({ read: false });
  fake.collections = [];
  const message = await ACTIONS.test_connection(context);
  assert.match(message.en, /lists no collection in the next 60 days/);
});

test('test_connection retries at once after a failure', async () => {
  const { context, fake } = await setup({ read: false });
  fake.down = true;
  assert.match((await ACTIONS.test_connection(context)).en, /could not be read/);
  fake.down = false;
  assert.match((await ACTIONS.test_connection(context)).en, /6 collections/);
});

test('find_street lists the streets, French and Dutch names', async () => {
  const { context, fake } = await setup({ read: false });
  const message = await ACTIONS.find_street(context, { search: 'fer' });
  everyLanguage(message);
  assert.equal(
    message.fr,
    "Rues au 5000 Namur : Rue de Fer, Rue de la Ferme de Ronet, Ruelle de l'Enfer.",
  );
  fake.streets['3000-24062'].push({
    id: 'x',
    name: 'Rue de la Station',
    names: { fr: 'Rue de la Station', nl: 'Stationsstraat' },
  });
  const leuven = await ACTIONS.find_street(context, { zipcode: '3000', search: 'stat' });
  assert.match(leuven.en, /Rue de la Station \/ Stationsstraat/);
});

test('find_street: no zip code, unknown zip code, no match, too many', async () => {
  const { context, fake } = await setup({ read: false, config: {} });
  assert.match((await ACTIONS.find_street(context, { search: 'x' })).en, /Fill in the zip code/);
  assert.match(
    (await ACTIONS.find_street(context, { zipcode: '9999', search: 'x' })).en,
    /does not know the zip code 9999/,
  );
  assert.match(
    (await ACTIONS.find_street(context, { zipcode: '5000', search: 'zzz' })).fr,
    /Aucune rue ne correspond à « zzz » au 5000 Namur/,
  );
  fake.streets['5000-92094'] = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i}`,
    name: `Rue ${i}`,
    names: { fr: `Rue ${i}`, nl: `Rue ${i}` },
  }));
  assert.match(
    (await ACTIONS.find_street(context, { zipcode: '5000', search: 'rue' })).en,
    /and 5 more, refine the search/,
  );
  fake.down = true;
  assert.match(
    (await ACTIONS.find_street(context, { zipcode: '5000', search: 'rue' })).en,
    /could not be read/,
  );
});
