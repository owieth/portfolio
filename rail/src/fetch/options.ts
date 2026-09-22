/**
 * The flags the fetch step reads, and the rule for which timetable year is in
 * force when none is given.
 *
 * Parsing lives here rather than in `cli.ts` because `cli.ts` deliberately runs
 * `parseArgs` in permissive mode — the step that reads a flag is the step that
 * validates it, so adding a flag to a later step never means editing `main`.
 */

/** The dataset is republished under the same name every timetable year. */
const DATASET_TEMPLATE = (year: number) => `timetable-${year}-gtfs2020`;

/**
 * The first year published in the current CKAN scheme. Earlier timetables exist
 * only as HRDF, which this pipeline does not read.
 */
const FIRST_PUBLISHED_YEAR = 2026;

const SOURCES = ['opentransportdata', 'geops'] as const;

/**
 * Declared for `parseArgs` so that `--year 2027` consumes its value rather than
 * reading as a boolean and leaving 2027 as a positional. The declaration lives
 * with the step that owns the flags; `cli.ts` only spreads it in.
 */
export const FETCH_FLAGS = {
  year: { type: 'string' },
  source: { type: 'string' },
} as const;

export type Source = (typeof SOURCES)[number];

export interface FetchOptions {
  source: Source;
  /** null for geops, which publishes one current feed and has no year selector. */
  year: number | null;
  dataset: string | null;
}

/** `parseArgs` in permissive mode hands back a string, a boolean or an array. */
export type FlagValue = string | boolean | (string | boolean)[] | undefined;

export type ParsedOptions =
  | { ok: true; value: FetchOptions }
  | { ok: false; error: string };

/**
 * The second Sunday of December, which is when the Swiss timetable switches.
 * Confirmed against the publisher's own `dct:temporal`: the 2026 series runs
 * 2025-12-14 to 2026-12-12 and the 2027 series starts 2026-12-13.
 */
export function secondSundayOfDecember(year: number): Date {
  const first = new Date(year, 11, 1);
  const firstSunday = 1 + ((7 - first.getDay()) % 7);
  return new Date(year, 11, firstSunday + 7);
}

/**
 * The timetable year in force on a given day. Derived rather than hardcoded, so
 * the default is still right the morning after the December switch.
 */
export function timetableYearOn(date: Date): number {
  const year = date.getFullYear();
  return date >= secondSundayOfDecember(year) ? year + 1 : year;
}

function isSource(value: string): value is Source {
  return SOURCES.includes(value as Source);
}

/** Rejects a repeated or value-less flag rather than silently coercing it. */
function single(
  name: string,
  value: FlagValue,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: null };
  }

  if (Array.isArray(value)) {
    return { ok: false, error: `--${name} was given more than once` };
  }

  if (typeof value === 'boolean') {
    return { ok: false, error: `--${name} needs a value` };
  }

  return { ok: true, value };
}

export function parseFetchOptions(
  values: Record<string, FlagValue>,
  now: Date = new Date(),
): ParsedOptions {
  const rawSource = single('source', values.source);
  if (!rawSource.ok) {
    return rawSource;
  }

  const source = rawSource.value ?? 'opentransportdata';
  if (!isSource(source)) {
    return {
      ok: false,
      error: `unknown --source ${source}; expected ${SOURCES.join(' or ')}`,
    };
  }

  const rawYear = single('year', values.year);
  if (!rawYear.ok) {
    return rawYear;
  }

  // The mirror serves one current feed under a fixed URL. Accepting --year there
  // would imply a selector that does not exist.
  if (source === 'geops') {
    if (rawYear.value !== null) {
      return {
        ok: false,
        error: '--year does not apply to --source geops; the mirror publishes one current feed',
      };
    }

    return { ok: true, value: { source, year: null, dataset: null } };
  }

  let year: number;

  if (rawYear.value === null) {
    year = timetableYearOn(now);
  } else {
    if (!/^\d{4}$/.test(rawYear.value)) {
      return { ok: false, error: `--year ${rawYear.value} is not a four-digit year` };
    }

    year = Number(rawYear.value);
  }

  // An upper bound of two years out, because the portal publishes the next
  // timetable well before it starts but never more than one season ahead.
  const latest = timetableYearOn(now) + 2;
  if (year < FIRST_PUBLISHED_YEAR || year > latest) {
    return {
      ok: false,
      error: `--year ${year} is outside ${FIRST_PUBLISHED_YEAR}-${latest}`,
    };
  }

  return { ok: true, value: { source, year, dataset: DATASET_TEMPLATE(year) } };
}
