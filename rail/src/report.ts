/**
 * Step seventeen, the last: write `REPORT.md`.
 *
 * The other artifacts are what the pipeline produced. This is what a person
 * reads before committing them: the totals, and every line or station a step
 * set aside for a hand check. The sections are rendered in `report/render.ts`;
 * this step writes the file and says how much there is to review.
 */

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FeedRecord } from './fetch/record.ts';
import { RAIL_DIR } from './paths.ts';
import { renderReport } from './report/render.ts';
import type { ReportFeed, ReportInput } from './report/render.ts';

export const REPORT_MD = 'REPORT.md';

export interface ReportOptions {
  /** Where the file goes. The top of `rail/` unless a test says otherwise. */
  dir?: string;
}

export interface Reported {
  /** Lines named from operator, category and terminals, or seeded by hand. */
  names: number;
  /** The first 16 hex characters of the sha256 of what was written. */
  fingerprint: string;
}

type Log = (message: string) => void;

function plural(value: number, noun: string): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? noun : `${noun}s`}`;
}

/** The part of the feed's provenance the report names itself by. */
export function reportFeed(record: FeedRecord): ReportFeed {
  return {
    id: record.feedId,
    source: record.source,
    page: record.dataset.page,
    filename: record.resource.filename,
    issued: record.resource.issued,
  };
}

export async function writeReport(
  input: ReportInput,
  log: Log,
  { dir = RAIL_DIR }: ReportOptions = {},
): Promise<Reported> {
  const contents = renderReport(input);

  await writeFile(join(dir, REPORT_MD), contents, 'utf8');

  const names = input.lines.filter(line => line.nameSource !== 'number').length;
  const fingerprint = createHash('sha256').update(contents).digest('hex').slice(0, 16);

  log(
    `wrote ${REPORT_MD}: ${plural(input.unmatched.length, 'line')} without a shape, ${plural(input.suspect.length, 'possible duplicate')}, ${plural(names, 'name')} to check, ${plural(input.misplaced.length, 'doubted station')} and ${plural(input.unknownRoutes.length, 'unrecognised route type')} — fingerprint ${fingerprint}`,
  );

  return { names, fingerprint };
}
