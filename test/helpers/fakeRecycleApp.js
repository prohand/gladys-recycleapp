// -----------------------------------------------------------------------------
// A fake RecycleApp API, served through an injected `fetch`.
//
// It answers like the real one (shapes copied from api.fostplus.be answers,
// trimmed): zip codes, street search, paginated collections and logo assets.
// Tests flip `fake.down` (network error) or `fake.status` (HTTP error) to
// simulate an outage, and read `fake.calls` to see what was asked.
// -----------------------------------------------------------------------------

import { simplify } from '../../src/recycleapp/calendar.js';

const logo = (id, name) => ({
  regular: {
    '1x': `public/${id}-${name}@1x.png`,
    '2x': `public/${id}-${name}@2x.png`,
    '3x': `public/${id}-${name}@3x.png`,
  },
  id,
});

export const FRACTIONS = {
  pmd: {
    id: '5e4e84d1bab65ec126d714cf',
    name: { nl: 'PMD', en: 'PMD', fr: 'PMC', de: 'PMK' },
    color: '#66C3FA',
    logo: logo('5d610b86162c063cc0400125', 'pmd'),
  },
  paper: {
    id: '5e4e84d0bab65e6096d7148a',
    name: {
      nl: 'Papier-karton',
      en: 'Paper-cardboard',
      fr: 'Papiers-cartons',
      de: 'Papier-Karton',
    },
    color: '#FEC91B',
    logo: logo('5d610b86162c063cc0400123', 'paper'),
  },
  residual: {
    id: '5eb3b5cd666f068eaf6f4e01',
    name: { nl: 'Restafval', en: 'Residual waste', fr: 'Déchets résiduels', de: 'Restmüll' },
    color: '#94406C',
    logo: logo('5d610b86162c063cc0400112', 'householdBag'),
  },
  trees: {
    id: '5fe062ee305831dcf24e899e',
    name: { nl: 'Kerstbomen', en: 'Christmas trees', fr: 'Sapins de Noël', de: 'Weihnachtsbäume' },
    color: '#006D62',
  },
};

export const ZIPCODES = [
  {
    city: {
      names: { nl: 'Namen', fr: 'Namur', de: 'Namur', en: 'Namur' },
      name: 'Namur',
      id: '92094',
    },
    code: '5000',
    names: [
      { nl: 'Beez', fr: 'Beez', de: 'Beez', en: 'Beez' },
      { nl: 'Namen', fr: 'Namur', de: 'Namur', en: 'Namur' },
    ],
    id: '5000-92094',
    available: true,
  },
  {
    city: { names: { nl: 'Leuven', fr: 'Louvain', de: 'Löwen', en: 'Leuven' }, name: 'Leuven' },
    code: '3000',
    names: [{ nl: 'Leuven', fr: 'Louvain', de: 'Löwen', en: 'Leuven' }],
    id: '3000-24062',
    available: true,
  },
];

export const STREETS = {
  '5000-92094': [
    {
      id: 'geodata.wallonie.be/id/streetname-7753710',
      name: 'Rue de Fer',
      names: { fr: 'Rue de Fer', nl: 'Rue de Fer', de: 'Rue de Fer', en: 'Rue de Fer' },
    },
    {
      id: 'geodata.wallonie.be/id/streetname-7753711',
      name: 'Rue de la Ferme de Ronet',
      names: { fr: 'Rue de la Ferme de Ronet', nl: 'Rue de la Ferme de Ronet' },
    },
    {
      id: 'geodata.wallonie.be/id/streetname-7753712',
      name: "Ruelle de l'Enfer",
      names: { fr: "Ruelle de l'Enfer", nl: "Ruelle de l'Enfer" },
    },
  ],
  '3000-24062': [
    {
      id: 'https://data.vlaanderen.be/id/straatnaam-34688',
      name: 'Bondgenotenlaan',
      names: { nl: 'Bondgenotenlaan', fr: 'Bondgenotenlaan' },
    },
  ],
};

const collection = (date, fraction, extra = {}) => ({
  type: 'collection',
  timestamp: date.includes('T') ? date : `${date}T00:00:00.000Z`,
  fraction,
  id: `${date}-${fraction.id}`,
  ...extra,
});

/**
 * The calendar of the tests, seen from Wednesday 21 October 2026 (see
 * NOW below): PMC and paper tomorrow, residual waste on Friday, a residual
 * collection moved from Tuesday 27 to Wednesday 28 (public holiday), an event
 * that is not a collection, and a date written as the Belgian midnight in UTC.
 */
export const COLLECTIONS = [
  collection('2026-10-20', FRACTIONS.residual), // yesterday: before the window
  collection('2026-10-22', FRACTIONS.pmd),
  collection('2026-10-22', FRACTIONS.paper),
  collection('2026-10-23', FRACTIONS.residual),
  {
    type: 'event',
    timestamp: '2026-10-25T00:00:00.000Z',
    event: {
      title: { fr: 'Repair Café', nl: 'Repair Café', en: 'Repair Café', de: 'Repair Café' },
    },
    fraction: { variations: [] },
    id: 'event-1',
  },
  collection('2026-10-27', FRACTIONS.residual, {
    exception: { replacedBy: { timestamp: '2026-10-28T00:00:00.000Z' } },
  }),
  collection('2026-10-28', FRACTIONS.residual, {
    exception: { replaces: { timestamp: '2026-10-27T00:00:00.000Z' } },
  }),
  // 23:00 UTC on the 29th is midnight on the 30th in Brussels (winter time).
  collection('2026-10-29T23:00:00.000Z', FRACTIONS.pmd),
  collection('2026-11-05', FRACTIONS.paper),
];

/** Wednesday 21 October 2026, 10:00 in Brussels. */
export const NOW = new Date('2026-10-21T08:00:00.000Z');

/** The configuration of the address above. */
export const ADDRESS_CONFIG = { zipcode: '5000', street: 'rue de fer', house_number: '12' };

// A 1×1 transparent PNG, for the logos.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

function json(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

export function createFakeRecycleApp({
  zipcodes = ZIPCODES,
  streets = STREETS,
  collections = COLLECTIONS,
} = {}) {
  const fake = {
    calls: [],
    down: false,
    status: null,
    zipcodes,
    streets,
    collections,
  };

  fake.fetch = async (input, init = {}) => {
    const url = new URL(input);
    fake.calls.push({
      method: init.method ?? 'GET',
      host: url.host,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: init.headers ?? {},
      body: init.body,
    });
    if (fake.down) {
      throw new TypeError('fetch failed');
    }
    if (fake.status) {
      return json(fake.status, { status: fake.status, message: 'Error' });
    }
    const q = url.searchParams;
    if (url.host === 'assets.recycleapp.be') {
      return { ok: true, status: 200, arrayBuffer: async () => PNG };
    }
    if (url.pathname.endsWith('/zipcodes')) {
      const items = fake.zipcodes.filter((z) => z.code.startsWith(q.get('q')));
      return json(200, { items, total: items.length, pages: 1, page: 1, size: 20 });
    }
    if (url.pathname.endsWith('/streets')) {
      const wanted = simplify(q.get('q'));
      const items = (fake.streets[q.get('zipcodes')] ?? []).filter((street) =>
        [street.name, ...Object.values(street.names)].some((name) =>
          simplify(name).includes(wanted),
        ),
      );
      return json(200, { items, total: items.length, pages: 1, page: 1, size: 20 });
    }
    if (url.pathname.endsWith('/collections')) {
      const from = q.get('fromDate');
      const until = q.get('untilDate');
      const size = Number(q.get('size'));
      const page = Number(q.get('page') ?? 1);
      const inRange = fake.collections.filter((item) => {
        const day = item.timestamp.slice(0, 10);
        return day >= from && day <= until;
      });
      const pages = Math.ceil(inRange.length / size);
      const items = inRange.slice((page - 1) * size, page * size);
      return json(200, { items, total: inRange.length, pages, page, size });
    }
    return json(404, { message: 'Not found' });
  };

  return fake;
}

/** A clock the tests move by hand. */
export function createClock(start = NOW) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set(instant) {
      current = new Date(instant);
    },
    advance(ms) {
      current = new Date(current.getTime() + ms);
    },
  };
}
