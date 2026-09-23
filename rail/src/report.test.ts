import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EC, GELMERBAHN, S12, STATIONS } from './emit/fixtures.ts';
import type { FeedRecord } from './fetch/record.ts';
import { REPORT_MD, reportFeed, writeReport } from './report.ts';
import { renderReport } from './report/render.ts';
import type { ReportInput } from './report/render.ts';

const RECORD: FeedRecord = {
  version: 1,
  feedId: 'otd-fp2026-20260919',
  source: 'opentransportdata',
  timetableYear: 2026,
  dataset: {
    id: 'timetable-2026-gtfs2020',
    page: 'https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020',
    catalogUrl: null,
    uuid: null,
    validFrom: '2025-12-14',
    validTo: '2026-12-12',
  },
  resource: {
    id: '9febcd61-0a4b-446c-80a1-1924542f197d',
    filename: 'GTFS_FP2026_20260919.zip',
    issued: '2026-09-21T09:30:44.369891+02:00',
    modified: null,
    declaredBytes: null,
    license: null,
  },
  download: {
    url: 'https://data.opentransportdata.swiss/…/gtfs_fp2026_20260919.zip',
    finalUrl: 'https://example.r2.cloudflarestorage.com/…',
    etag: null,
    lastModified: null,
    contentLength: null,
  },
  archive: { file: 'gtfs.zip', bytes: 256091382, sha256: 'a'.repeat(64) },
  entries: [],
  fetchedAt: '2026-09-22T14:33:55.000Z',
  checkedAt: '2026-09-22T14:33:55.000Z',
};

const INPUT: ReportInput = {
  feed: reportFeed(RECORD),
  osmBase: { train: '2026-09-21T08:00:00Z' },
  lines: [S12, EC, GELMERBAHN],
  regionNames: { 's-bahn-zuerich': 'S-Bahn Zürich (ZVV)' },
  stations: STATIONS,
  unmatched: [
    { id: GELMERBAHN.id, name: GELMERBAHN.name, reason: 'no-candidate', best: null, lostTo: [] },
  ],
  suspect: [],
  inFeed: [],
  misplaced: [],
  unknownRoutes: [],
};

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

const directories: string[] = [];

async function outputDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rail-report-'));
  directories.push(dir);
  return dir;
}

afterEach(async () => {
  logged.length = 0;
  await Promise.all(
    directories.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  );
});

describe('reportFeed', () => {
  it('keeps what the report names itself by and nothing that changes per run', () => {
    expect(reportFeed(RECORD)).toEqual({
      id: 'otd-fp2026-20260919',
      source: 'opentransportdata',
      page: 'https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020',
      filename: 'GTFS_FP2026_20260919.zip',
      issued: '2026-09-21T09:30:44.369891+02:00',
    });
  });
});

describe('writeReport', () => {
  it('writes REPORT.md and nothing else', async () => {
    const dir = await outputDir();

    await writeReport(INPUT, log, { dir });

    expect(await readdir(dir)).toEqual([REPORT_MD]);
    expect(await readFile(join(dir, REPORT_MD), 'utf8')).toBe(renderReport(INPUT));
  });

  it('writes the same bytes twice, with one fingerprint', async () => {
    const [first, second] = await Promise.all([outputDir(), outputDir()]);
    const one = await writeReport(INPUT, log, { dir: first });
    const two = await writeReport(INPUT, log, { dir: second });

    expect(await readFile(join(second, REPORT_MD), 'utf8')).toBe(
      await readFile(join(first, REPORT_MD), 'utf8'),
    );
    expect(two.fingerprint).toBe(one.fingerprint);
    expect(one.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('counts the derived and seeded names, and says how much there is to review', async () => {
    const reported = await writeReport(INPUT, log, { dir: await outputDir() });

    expect(reported.names).toBe(2);
    expect(logged.at(-1)).toMatch(
      /^wrote REPORT\.md: 1 line without a shape, 0 possible duplicates, 2 names to check, 0 doubted stations and 0 unrecognised route types — fingerprint [0-9a-f]{16}$/,
    );
  });
});
