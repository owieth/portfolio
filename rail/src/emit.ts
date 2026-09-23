/**
 * Step sixteen: write `lines.csv`, `line_stops.csv`, `lines.json` and
 * `lines.geojson`.
 *
 * These are the artifacts everything after the pipeline reads: #489 seeds
 * `rail_lines` and `rail_line_stops` from the two CSVs, and the December diff
 * compares them against the committed ones. So two runs over the same feed have
 * to write the same bytes, and nothing is written that has not been checked:
 *
 * - Lines are ordered by id and stops by their place in the canonical sequence,
 *   both compared by code unit, and every record is built key by key, so
 *   nothing depends on insertion order, the locale or the clock.
 * - `lines.json` is validated against `lines.schema.json` before anything is
 *   written, and the CSVs are flattened from the very records it holds.
 * - Every stop row has to name a line in `lines.csv`, and every line id has to
 *   be unique, which the schema cannot say.
 * - `lines.geojson` has a feature for exactly the lines `lines.json` marks
 *   `has_geometry`, each keyed by that line's id.
 *
 * All four are built in memory and only then written, so a failed check leaves
 * the committed files as they were rather than one of four rewritten.
 */

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import schema from '../lines.schema.json' with { type: 'json' };
import { toCsv } from './emit/csv.ts';
import { toCollection, toGeoJson } from './emit/geojson.ts';
import {
  LINE_COLUMNS,
  STOP_COLUMNS,
  lineRow,
  stopRows,
  toRecord,
} from './emit/rows.ts';
import type { LineRecord } from './emit/rows.ts';
import { compare } from './merge/key.ts';
import type { Attribution } from './overpass/attribution.ts';
import { RAIL_DIR } from './paths.ts';
import type { Station } from './stations.ts';
import type { TerminiLine } from './termini.ts';

export const LINES_CSV = 'lines.csv';
export const LINE_STOPS_CSV = 'line_stops.csv';
export const LINES_JSON = 'lines.json';
export const LINES_GEOJSON = 'lines.geojson';

export interface EmitInput {
  lines: readonly TerminiLine[];
  /** For every feed stop's name, SLOID and position. */
  stations: readonly Station[];
  /** The OSM licence and timestamps, embedded in `lines.geojson`. */
  attribution: Attribution;
}

export interface EmitOptions {
  /** Where the four files go. The top of `rail/` unless a test says otherwise. */
  dir?: string;
}

export interface Emitted {
  lines: number;
  stops: number;
  /** Lines drawn in `lines.geojson`. */
  features: number;
  /** Per file, the first 16 hex characters of the sha256 of what was written. */
  fingerprints: Record<string, string>;
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function fingerprintOf(contents: string): string {
  return createHash('sha256').update(contents).digest('hex').slice(0, 16);
}

const validate = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
}).compile(schema);

/**
 * Every schema violation, one per line, each with the path to the value. The
 * first ten are enough to see what went wrong, and a broken step would otherwise
 * print thousands.
 */
function assertSchema(document: { lines: LineRecord[] }): void {
  if (validate(document)) {
    return;
  }

  const errors = (validate.errors ?? []).map(
    error => `  ${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
  );

  throw new Error(
    `${LINES_JSON} does not match lines.schema.json, so nothing was written:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n  … and ${count(errors.length - 10)} more` : ''}`,
  );
}

function assertUnique(records: readonly LineRecord[]): void {
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(
        `two lines share the id ${record.id}, so nothing was written`,
      );
    }

    seen.add(record.id);
  }
}

/**
 * The stop rows are flattened from the lines, so an orphan cannot happen today.
 * It is checked anyway, because it is the one promise #489's foreign key relies
 * on and the flattening is exactly the kind of code that gets rewritten.
 */
export function assertReferences(
  lineIds: ReadonlySet<string>,
  stopLineIds: readonly string[],
): void {
  const orphan = stopLineIds.find(id => !lineIds.has(id));

  if (orphan !== undefined) {
    throw new Error(
      `${LINE_STOPS_CSV} has a stop on ${orphan}, which is not a line in ${LINES_CSV}, so nothing was written`,
    );
  }
}

/**
 * Both built from the same lines, so they cannot disagree today; checked for
 * the same reason as the stop rows. A feature the list does not have would draw
 * a line nobody can tick off, and a missing one would leave a line that claims
 * a shape without one on the map.
 */
export function assertGeometry(
  records: readonly LineRecord[],
  featureIds: readonly string[],
): void {
  const ids = new Set(records.map(record => record.id));
  const drawn = new Set(featureIds);
  const stray = featureIds.find(id => !ids.has(id));

  if (stray !== undefined) {
    throw new Error(
      `${LINES_GEOJSON} has a feature for ${stray}, which is not a line in ${LINES_JSON}, so nothing was written`,
    );
  }

  const disagrees = records.find(record => record.has_geometry !== drawn.has(record.id));

  if (disagrees !== undefined) {
    throw new Error(
      `${disagrees.id} has has_geometry ${disagrees.has_geometry} in ${LINES_JSON} but ${disagrees.has_geometry ? 'no' : 'a'} feature in ${LINES_GEOJSON}, so nothing was written`,
    );
  }
}

export interface Artifact {
  name: string;
  contents: string;
}

export interface Artifacts {
  records: LineRecord[];
  features: number;
  /** In the order they are logged. */
  files: Artifact[];
}

/** The four files, checked and serialised, not yet written. */
export function renderArtifacts(input: EmitInput): Artifacts {
  const stations = new Map(
    input.stations.map(station => [station.didok, station]),
  );
  const records = input.lines
    .map(line => toRecord(line, stations))
    .sort((a, b) => compare(a.id, b.id));
  const document = { lines: records };

  assertSchema(document);
  assertUnique(records);

  const lines = records.map(lineRow);
  const stops = records.flatMap(stopRows);

  assertReferences(
    new Set(lines.map(line => line.id)),
    stops.map(stop => stop.line_id),
  );

  const collection = toCollection(input.lines, input.attribution);

  assertGeometry(
    records,
    collection.features.map(feature => feature.properties.id),
  );

  return {
    records,
    features: collection.features.length,
    files: [
      { name: LINES_CSV, contents: toCsv(LINE_COLUMNS, lines) },
      { name: LINE_STOPS_CSV, contents: toCsv(STOP_COLUMNS, stops) },
      { name: LINES_JSON, contents: `${JSON.stringify(document, null, 2)}\n` },
      { name: LINES_GEOJSON, contents: toGeoJson(collection) },
    ],
  };
}

export async function emitArtifacts(
  input: EmitInput,
  log: Log,
  { dir = RAIL_DIR }: EmitOptions = {},
): Promise<Emitted> {
  const { records, features, files } = renderArtifacts(input);

  await Promise.all(
    files.map(file => writeFile(join(dir, file.name), file.contents, 'utf8')),
  );

  const stops = records.reduce((sum, record) => sum + record.stops.length, 0);
  const fingerprints = Object.fromEntries(
    files.map(file => [file.name, fingerprintOf(file.contents)]),
  );

  log(
    `wrote ${count(records.length)} lines, ${count(stops)} line stops and ${count(features)} line shapes, validated against lines.schema.json — fingerprints ${files.map(file => `${file.name} ${fingerprints[file.name]}`).join(', ')}`,
  );

  return { lines: records.length, stops, features, fingerprints };
}
