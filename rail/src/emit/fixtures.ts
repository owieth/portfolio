/**
 * Lines as the termini step hands them on, for the emit tests. Shared between
 * `rows.test.ts` and `emit.test.ts` because a line carries every field of every
 * step before it, and two copies of that would drift.
 */

import { OSM_ATTRIBUTION } from '../overpass/attribution.ts';
import type { Attribution } from '../overpass/attribution.ts';
import type { SequenceStop } from '../sequence/order.ts';
import type { Station } from '../stations.ts';
import type { TerminiLine } from '../termini.ts';

export const ATTRIBUTION: Attribution = {
  ...OSM_ATTRIBUTION,
  osmBase: { train: '2026-09-21T08:00:00Z', funicular: '2026-09-21T08:05:00Z' },
};

export const STATIONS: Station[] = [
  {
    didok: '8500309',
    sloid: 'ch:1:sloid:309',
    name: 'Brugg AG',
    lat: 47.48086045,
    lon: 8.208841,
    stops: 2,
  },
  {
    didok: '8503424',
    sloid: 'ch:1:sloid:3424',
    name: 'Schaffhausen',
    lat: 47.69828386,
    lon: 8.63275598,
    stops: 1,
  },
  {
    didok: '8506000',
    sloid: 'ch:1:sloid:6000',
    name: 'Winterthur',
    lat: 47.50033307,
    lon: 8.7238182,
    stops: 2,
  },
  {
    didok: '8506206',
    sloid: null,
    name: 'Wil SG',
    lat: null,
    lon: null,
    stops: 1,
  },
  {
    didok: '8531013',
    sloid: 'ch:1:sloid:31013',
    name: 'Handegg, Gelmerbahn',
    lat: 46.61,
    lon: 8.3,
    stops: 0,
  },
];

function stop(
  didok: string,
  via: SequenceStop['via'],
  junction: string | null,
): SequenceStop {
  return { didok, via, junction };
}

/** The S12: Brugg AG to Wil SG, with Schaffhausen as a branch block from Winterthur. */
export const S12 = {
  id: 's-bahn-zuerich:S12',
  category: 'S',
  number: 'S12',
  region: 's-bahn-zuerich',
  terminals: null,
  operators: ['Schweizerische Bundesbahnen SBB', 'BLS AG'],
  routeIds: ['91-12-j26-2', '91-12-j26-1'],
  stations: ['8500309', '8503424', '8506000', '8506206'],
  name: 'S12',
  nameSource: 'number',
  review: [],
  source: 'feed',
  sequence: [
    stop('8500309', 'backbone', null),
    stop('8506000', 'backbone', null),
    stop('8506206', 'extension', '8506000'),
    stop('8503424', 'branch', '8506000'),
  ],
  patterns: [],
  serviceDays: 364,
  serviceWeeks: 52,
  seasonal: false,
  tripsPerWeek: 406,
  hasGeometry: true,
  geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [8.20884123, 47.48086049],
        [8.46512678, 47.43817731],
        [8.72381832, 47.50033303],
        [8.72381829, 47.50033298],
        [9.04781204, 47.46350107],
      ],
      [
        [8.72381832, 47.50033303],
        [8.63275601, 47.69828389],
      ],
    ],
  },
  match: { rule: 'ref', confidence: 1, relations: [101, 42] },
  termini: [
    { didok: '8500309', name: 'Brugg AG' },
    { didok: '8506206', name: 'Wil SG' },
  ],
  trueTermini: [
    { didok: '8500309', name: 'Brugg AG' },
    { didok: '8506206', name: 'Wil SG' },
  ],
} satisfies TerminiLine;

export const GELMERBAHN: TerminiLine = {
  id: 'kwo-seilbahnen:FUN:8531013-8531014',
  category: 'FUN',
  number: null,
  region: 'kwo-seilbahnen',
  terminals: ['8531013', '8531014'],
  operators: ['KWO Seilbahnen'],
  routeIds: [],
  stations: ['8531013'],
  name: 'Gelmerbahn',
  nameSource: 'manual',
  review: [],
  source: 'manual',
  stops: [
    { didok: '8531013', name: 'Handegg', lat: 46.613585, lon: 8.308709 },
    { name: 'Gelmersee', lat: 46.614439, lon: 8.320473 },
  ],
  serviceDays: null,
  serviceWeeks: null,
  seasonal: null,
  tripsPerWeek: null,
  hasGeometry: false,
  geometry: null,
  match: null,
  termini: [
    { didok: '8531013', name: 'Handegg' },
    { didok: null, name: 'Gelmersee' },
  ],
  trueTermini: [
    { didok: '8531013', name: 'Handegg' },
    { didok: null, name: 'Gelmersee' },
  ],
};

/** An EC whose Swiss trunk ends at Winterthur, and whose trains run on to Stuttgart. */
export const EC: TerminiLine = {
  ...S12,
  id: 'fernverkehr:EC:8500309-8506000',
  category: 'EC',
  number: null,
  region: 'fernverkehr',
  operators: ['DB Fernverkehr AG'],
  routeIds: ['91-EC-j26-1'],
  stations: ['8500309', '8506000'],
  name: 'EC Brugg AG-Winterthur',
  nameSource: 'derived',
  sequence: [
    stop('8500309', 'backbone', null),
    stop('8506000', 'backbone', null),
  ],
  termini: [
    { didok: '8500309', name: 'Brugg AG' },
    { didok: '8506000', name: 'Winterthur' },
  ],
  trueTermini: [
    { didok: '8500309', name: 'Brugg AG' },
    { didok: '8000096', name: 'Stuttgart Hbf' },
  ],
};
