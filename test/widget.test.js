import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildWidgetContent,
  COLLECTIONS_WIDGET,
  getWidgetImage,
  refreshWidgets,
  WIDGET_ACTIONS,
  WIDGETS,
} from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';
import { setup } from './helpers/setup.js';

const HOUR = 60 * 60 * 1000;
const widget = WIDGETS[COLLECTIONS_WIDGET];
const ofType = (content, type) => content.components.filter((c) => c.type === type);

test('the content is rendered exactly as sent, in every language', async () => {
  const { context } = await setup();
  for (const language of LANGUAGES) {
    const content = await widget.get(context, { settings: {}, language, units: 'metric' });
    assert.deepEqual(validateWidgetContent(content), [], language);
  }
});

test('the next collections, named in the reader language', async () => {
  const { service, config } = await setup();
  const content = buildWidgetContent(service, config, { settings: { count: 3 }, language: 'de' });
  const [tile] = ofType(content, 'value');
  assert.equal(tile.value, 'Morgen');
  assert.equal(tile.color, 'warning');
  const [list] = ofType(content, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge.text]),
    [
      ['Papier-Karton', 'Donnerstag, 22. Oktober', 'Morgen'],
      ['PMK', 'Donnerstag, 22. Oktober', 'Morgen'],
      ['Restmüll', 'Freitag, 23. Oktober', '2 Tage'],
    ],
  );
  assert.equal(list.items[0].image, 'logo-5d610b86162c063cc0400123');
  const [status] = ofType(content, 'status');
  assert.equal(status.items[0].value, 'Rue de Fer 12, 5000 Namur');
});

test('the number of rows is bounded', async () => {
  const { service, config } = await setup();
  const rows = (count) =>
    ofType(
      buildWidgetContent(service, config, { settings: { count }, language: 'en' }),
      'card-list',
    )[0].items.length;
  assert.equal(rows(1), 1);
  assert.equal(rows(50), 6); // 8 allowed, 6 collections in the calendar
  assert.equal(rows('abc'), 5);
});

test('empty states and errors stay valid widgets', async () => {
  const missing = await setup({ config: {}, read: false });
  const loading = await setup({ read: false });
  const failing = await setup({ read: false });
  failing.fake.down = true;
  await failing.service.ensureFresh(failing.config);
  const stale = await setup();
  stale.clock.advance(12 * HOUR);
  stale.fake.down = true;
  await stale.service.ensureFresh(stale.config);
  const empty = await setup();
  empty.clock.set('2026-12-01T08:00:00Z');

  for (const [name, { service, config }, expected] of [
    ['missing', missing, /Renseignez le code postal/],
    ['loading', loading, /Lecture du calendrier/],
    ['failing', failing, /Impossible de lire RecycleApp/],
    ['stale', stale, /Impossible de lire RecycleApp/],
    ['empty', empty, /Aucune collecte dans les 60 prochains jours/],
  ]) {
    const content = buildWidgetContent(service, config, { settings: {}, language: 'fr' });
    assert.deepEqual(validateWidgetContent(content), [], name);
    const texts = ofType(content, 'text').map((c) => c.text.fr);
    assert.ok(
      texts.some((text) => expected.test(text)),
      `${name}: ${JSON.stringify(texts)}`,
    );
  }
});

test('the refresh button reads RecycleApp again and answers a toast', async () => {
  const { context, fake, calendarReads } = await setup();
  const toast = await widget.action(context, { actionKey: WIDGET_ACTIONS.REFRESH, params: {} });
  assert.equal(toast.fr, 'Calendrier relu.');
  assert.equal(calendarReads(), 1);
  fake.down = true;
  const failed = await widget.action(context, { actionKey: WIDGET_ACTIONS.REFRESH, params: {} });
  assert.match(failed.en, /could not be read/);
  for (const language of LANGUAGES) {
    assert.ok(toast[language].length <= 200);
  }
  await assert.rejects(widget.action(context, { actionKey: 'nope' }), /Unknown widget action/);
});

test('every button of the content is handled', async () => {
  const { context } = await setup();
  const content = await widget.get(context, { settings: {}, language: 'en' });
  for (const { action } of ofType(content, 'button')) {
    assert.ok(Object.values(WIDGET_ACTIONS).includes(action.key));
  }
});

test('logos are served as valid widget images', async () => {
  const { context } = await setup();
  const image = await getWidgetImage(context, 'logo-5d610b86162c063cc0400125');
  assert.deepEqual(validateWidgetImage(image), []);
  await assert.rejects(getWidgetImage(context, 'logo-unknown'), /Unknown image/);
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});
