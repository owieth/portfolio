import { describe, expect, it } from 'vitest';

import { parseCatalogue } from './dcat.ts';

const CONTEXT = {
  dcat: 'http://www.w3.org/ns/dcat#',
  dct: 'http://purl.org/dc/terms/',
};

const DATASET_UUID = '3d2c18f9-9ef1-463f-a249-5c67604efd74';
const CATALOG_URL = 'https://example.invalid/timetable-2026-gtfs2020.jsonld';

function distribution(
  uuid: string,
  filename: string,
  issued: string,
  extra: Record<string, unknown> = {},
) {
  const url = `https://data.opentransportdata.swiss/dataset/${DATASET_UUID}/resource/${uuid}`;

  return {
    '@id': url,
    '@type': 'dcat:Distribution',
    'dcat:downloadURL': { '@id': `${url}/download/${filename.toLowerCase()}` },
    'dcat:mediaType': 'application/zip',
    'dct:identifier': filename,
    'dct:issued': { '@value': issued },
    'dct:modified': { '@value': issued },
    'dct:license': { '@id': 'http://dcat-ap.ch/vocabulary/licenses/terms_open' },
    'dcat:byteSize': { '@type': 'xsd:decimal', '@value': '256091382' },
    ...extra,
  };
}

// Deliberately in the order the live document uses: oldest first. The published
// @graph is unsorted, and trusting its order picked a ten-month-old extract.
const GRAPH = [
  distribution('11111111-1111-4111-8111-111111111111', 'GTFS_FP2026_2025-11-01.zip', '2025-11-03T11:57:07.642133+01:00'),
  distribution('22222222-2222-4222-8222-222222222222', 'GTFS_FP2026_20260919.zip', '2026-09-21T09:30:44.369891+02:00'),
  // dcat:byteSize is genuinely absent on some distributions in the live series.
  distribution('33333333-3333-4333-8333-333333333333', 'GTFS_FP2026_20260916.zip', '2026-09-17T00:00:00+02:00', { 'dcat:byteSize': undefined }),
  { '@id': 'https://example.invalid/agent', '@type': 'foaf:Agent' },
  { '@type': 'dct:PeriodOfTime', 'schema1:startDate': { '@value': '2025-12-14T00:00:00' }, 'schema1:endDate': { '@value': '2026-12-12T00:00:00' } },
  { '@id': `https://data.opentransportdata.swiss/dataset/${DATASET_UUID}`, '@type': 'dcat:Dataset' },
];

function document(graph: unknown[], context: unknown = CONTEXT) {
  return { '@context': context, '@graph': graph };
}

describe('parseCatalogue', () => {
  it('picks the newest by dct:issued, not by array order', () => {
    const { newest } = parseCatalogue(document(GRAPH), CATALOG_URL);

    expect(newest.filename).toBe('GTFS_FP2026_20260919.zip');
    expect(newest.resourceId).toBe('22222222-2222-4222-8222-222222222222');
    expect(newest.declaredBytes).toBe(256091382);
    expect(newest.license).toBe('http://dcat-ap.ch/vocabulary/licenses/terms_open');
  });

  it('reads the validity window and the dataset uuid', () => {
    const publication = parseCatalogue(document(GRAPH), CATALOG_URL);

    expect(publication.datasetUuid).toBe(DATASET_UUID);
    expect(publication.validFrom).toBe('2025-12-14');
    expect(publication.validTo).toBe('2026-12-12');
  });

  it('tolerates a distribution with no dcat:byteSize', () => {
    const only = [GRAPH[2]];
    const { newest } = parseCatalogue(document(only), CATALOG_URL);

    expect(newest.declaredBytes).toBeNull();
  });

  // The same series spells the date both ways, 99 times one and 27 the other.
  const FILENAMES: [string, string, number][] = [
    ['GTFS_FP2026_20260919.zip', '20260919', 2026],
    ['GTFS_FP2026_2025-06-23.zip', '20250623', 2026],
    ['GTFS_FP2027_20260919.zip', '20260919', 2027],
  ];

  it.each(FILENAMES)('normalises %s to %s', (filename, feedDate, feedYear) => {
    const graph = [distribution('44444444-4444-4444-8444-444444444444', filename, '2026-01-01T00:00:00+01:00')];
    const { newest } = parseCatalogue(document(graph), CATALOG_URL);

    expect(newest.feedDate).toBe(feedDate);
    expect(newest.feedYear).toBe(feedYear);
  });

  it('drops an attachment that is not a timetable extract', () => {
    const graph = [
      distribution('55555555-5555-4555-8555-555555555555', 'ERRATA.zip', '2026-10-01T00:00:00+02:00'),
      GRAPH[1],
    ];

    expect(parseCatalogue(document(graph), CATALOG_URL).newest.filename).toBe(
      'GTFS_FP2026_20260919.zip',
    );
  });

  it('ignores a distribution that is not a zip', () => {
    const graph = [
      distribution('66666666-6666-4666-8666-666666666666', 'GTFS_FP2026_20261001.zip', '2026-10-01T00:00:00+02:00', {
        'dcat:mediaType': 'text/csv',
      }),
      GRAPH[1],
    ];

    expect(parseCatalogue(document(graph), CATALOG_URL).newest.filename).toBe(
      'GTFS_FP2026_20260919.zip',
    );
  });

  it('throws when the series holds no extract', () => {
    expect(() => parseCatalogue(document([GRAPH[3]]), CATALOG_URL)).toThrow(
      /no GTFS extract/,
    );
  });

  // A re-prefixed or expanded document would otherwise read as empty, and an
  // empty series looks exactly like a portal outage.
  it('throws when the JSON-LD context is not the one it was written against', () => {
    expect(() =>
      parseCatalogue(document(GRAPH, { dcat: 'urn:something-else' }), CATALOG_URL),
    ).toThrow(/unexpected JSON-LD context/);
  });
});
