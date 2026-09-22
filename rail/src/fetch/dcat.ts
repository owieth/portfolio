/**
 * Resolves the current download URL out of the dataset's DCAT serialisation.
 *
 * The documented CKAN JSON API is not reachable: /api/3/action/package_show
 * answers 403 from nginx to every unauthenticated client, browser User-Agent or
 * not. The DCAT renderings of the same dataset are public — `.jsonld`, `.rdf`,
 * `.xml` and `.ttl` all answer 200 — and `.jsonld` needs no extra parser.
 *
 * Four things the published document actually does, all learned from it rather
 * than from the spec:
 *   - `@graph` is unordered. The first distribution in the live 2026 response
 *     was ten months old, so recency comes from `dct:issued` and nothing else.
 *   - `dcat:byteSize` is absent on 2 of 126 distributions, including the
 *     second-newest, so it can neither be required nor used as the checksum.
 *   - `dct:identifier` spells the date two ways in one series,
 *     `GTFS_FP2026_20260919.zip` and `GTFS_FP2026_2025-06-23.zip`.
 *   - the validity window is under `schema1:startDate`, not `schema:startDate`.
 */

const DCAT = 'http://www.w3.org/ns/dcat#';
const DCT = 'http://purl.org/dc/terms/';

/** `GTFS_FP2026_20260919.zip` and `GTFS_FP2026_2025-06-23.zip` both match. */
const EXTRACT_FILENAME = /^gtfs_fp(\d{4})_(\d{4})-?(\d{2})-?(\d{2})\.zip$/;

interface Literal {
  '@value'?: string;
}

interface Reference {
  '@id'?: string;
}

interface Node {
  '@id'?: string;
  '@type'?: string;
  'dcat:byteSize'?: Literal;
  'dcat:downloadURL'?: Reference;
  'dcat:mediaType'?: string;
  'dct:identifier'?: string;
  'dct:issued'?: Literal;
  'dct:license'?: Reference;
  'dct:modified'?: Literal;
  'schema1:endDate'?: Literal;
  'schema1:startDate'?: Literal;
}

interface CatalogueDocument {
  '@context'?: Record<string, unknown>;
  '@graph'?: Node[];
}

export interface Distribution {
  resourceId: string;
  filename: string;
  downloadUrl: string;
  issued: string;
  modified: string | null;
  declaredBytes: number | null;
  license: string | null;
  /** The identifier's date normalised to YYYYMMDD, for the feed id. */
  feedDate: string;
  /** The timetable year the identifier claims, which the feed id also carries. */
  feedYear: number;
}

export interface Publication {
  datasetUuid: string | null;
  validFrom: string | null;
  validTo: string | null;
  newest: Distribution;
}

/** The trailing path segment of a CKAN resource or dataset URL. */
function uuidFromUrl(url: string | undefined): string | null {
  const match = url?.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/,
  );
  return match ? match[1] : null;
}

function dateOnly(value: string | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function toDistribution(node: Node): Distribution | null {
  const filename = node['dct:identifier'];
  const downloadUrl = node['dcat:downloadURL']?.['@id'];
  const issued = node['dct:issued']?.['@value'];
  const resourceId = uuidFromUrl(node['@id']);

  if (!filename || !downloadUrl || !issued || !resourceId) {
    return null;
  }

  // A series could grow an attachment that is not a timetable extract. Drop it
  // rather than throw, so one stray file never blocks a refresh.
  const parts = filename.toLowerCase().match(EXTRACT_FILENAME);
  if (!parts) {
    return null;
  }

  const declaredBytes = node['dcat:byteSize']?.['@value'];

  return {
    resourceId,
    filename,
    downloadUrl,
    issued,
    modified: node['dct:modified']?.['@value'] ?? null,
    declaredBytes: declaredBytes === undefined ? null : Number(declaredBytes),
    license: node['dct:license']?.['@id'] ?? null,
    feedDate: `${parts[2]}${parts[3]}${parts[4]}`,
    feedYear: Number(parts[1]),
  };
}

export function parseCatalogue(
  document: unknown,
  catalogUrl: string,
): Publication {
  const doc = document as CatalogueDocument;

  // The prefixes below are read as literal keys, which is only correct while the
  // publisher ships this compacted context. Fail loudly rather than silently
  // misread an expanded or re-prefixed document.
  if (doc?.['@context']?.dcat !== DCAT || doc['@context']?.dct !== DCT) {
    throw new Error(
      `${catalogUrl}: unexpected JSON-LD context; the DCAT parser needs revisiting`,
    );
  }

  const graph = doc['@graph'] ?? [];
  const dataset = graph.find(node => node['@type'] === 'dcat:Dataset');
  const period = graph.find(node => node['@type'] === 'dct:PeriodOfTime');

  const extracts = graph
    .filter(node => node['@type'] === 'dcat:Distribution')
    .filter(node => node['dcat:mediaType'] === 'application/zip')
    .map(toDistribution)
    .filter(distribution => distribution !== null);

  if (extracts.length === 0) {
    throw new Error(`${catalogUrl}: no GTFS extract in the catalogue`);
  }

  // Descending by dct:issued, tie-broken on the normalised filename date so the
  // choice stays deterministic if two publications share a timestamp.
  extracts.sort(
    (a, b) =>
      b.issued.localeCompare(a.issued) || b.feedDate.localeCompare(a.feedDate),
  );

  return {
    datasetUuid: uuidFromUrl(dataset?.['@id']),
    validFrom: dateOnly(period?.['schema1:startDate']?.['@value']),
    validTo: dateOnly(period?.['schema1:endDate']?.['@value']),
    newest: extracts[0],
  };
}
