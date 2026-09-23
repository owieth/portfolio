/**
 * Step zero: find out what the feed contains before anything models it.
 *
 * Several claims in `README.md` — which `route_type`s count, that `route_desc`
 * carries a category vocabulary, that `route_short_name` holds the line number,
 * that every Standseilbahn is 1400, that `shapes.txt` might cover most lines —
 * were assumptions, and every step from the allowlist onwards is built on them.
 * This reads them off the feed and writes down every place the feed disagrees.
 *
 * Separate from `build` rather than a step inside it: it is a one-off answering
 * questions that only get asked once, its output is a snapshot rather than a
 * regenerated artifact, and nothing downstream consumes it. `RECON.md` is
 * committed so the answers are reviewable next to the code that trusts them.
 */

import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { openGtfs } from './db.ts';
import { fetchFeed } from './fetch.ts';
import type { FetchOptions } from './fetch/options.ts';
import { RAIL_DIR } from './paths.ts';
import { probeMirror } from './recon/mirror.ts';
import {
  CATEGORIES,
  CATEGORY_ONLY_SAMPLES,
  COMBINATIONS,
  FUNICULARS,
  LINE_NUMBER_BY_AGENCY,
  MISTYPED_FUNICULARS,
  VARIANT_EXCEPTIONS,
  VARIANT_RULE,
  operatorSearch,
} from './recon/queries.ts';
import type {
  AgencyRow,
  CategoryRow,
  CombinationRow,
  LiftRow,
  OperatorRow,
  SampleRow,
  VariantRow,
} from './recon/queries.ts';
import { render } from './recon/render.ts';
import type { Findings, OperatorProbe } from './recon/render.ts';

export const REPORT_FILE = 'RECON.md';

const MIRROR_URL = 'https://gtfs.geops.ch/dl/gtfs_complete.zip';

/**
 * Funiculars whose operator is a private company rather than a cantonal or
 * municipal one, and which therefore have no obligation to publish a timetable
 * at all. The Polybahn is the one the issue names; the rest are here to tell a
 * "the Polybahn is special" answer apart from a "private operators are missing"
 * one, which are two very different problems for #476.
 *
 * Matched on the operator name rather than a line number because a funicular
 * that is absent from the feed has no line number to match on.
 */
const PRIVATE_FUNICULARS = [
  'Poly',
  'Dolderbahn',
  'Gurtenbahn',
  'Marzili',
  'Giessbach',
  'Harderbahn',
  'Niesenbahn',
  'Reichenbachfall',
  'Mühlegg',
  'Stoos',
];

type Log = (message: string) => void;

export async function recon(options: FetchOptions, log: Log): Promise<string> {
  const feed = await fetchFeed(options, log);
  const path = join(RAIL_DIR, REPORT_FILE);

  log(`profiling ${feed.id}`);

  // The mirror probe is network and the queries are CPU and disk, so they overlap
  // for free. The probe cannot throw, so there is nothing to lose to a race here.
  const mirror = probeMirror(MIRROR_URL);

  const db = await openGtfs(feed.gtfsDir, ['agency', 'routes', 'trips']);

  try {
    // Sequential on purpose: every one of these scans trips.txt, and running them
    // together would multiply peak memory to finish no sooner.
    const categories = await db.query<CategoryRow>(CATEGORIES);
    log(`${categories.length} (route_type, route_desc) combinations in the feed`);

    const combinations = await db.query<CombinationRow>(COMBINATIONS);
    const samples = await db.query<SampleRow>(CATEGORY_ONLY_SAMPLES);
    const agencies = await db.query<AgencyRow>(LINE_NUMBER_BY_AGENCY);
    const funiculars = await db.query<LiftRow>(FUNICULARS);
    const mistyped = await db.query<LiftRow>(MISTYPED_FUNICULARS);
    const variants = await db.query<VariantRow>(VARIANT_RULE);
    const exceptions = await db.query<SampleRow>(VARIANT_EXCEPTIONS);

    log(`${funiculars.length} funicular routes, ${agencies.length} operators in the candidate set`);

    const operators: OperatorProbe[] = [];

    for (const needle of PRIVATE_FUNICULARS) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const matches = await db.query<OperatorRow>(operatorSearch(needle));
      operators.push({ needle, matches });
    }

    const findings: Findings = {
      feed: {
        id: feed.id,
        source: feed.record.source,
        page: feed.record.dataset.page,
        filename: feed.record.resource.filename,
        issued: feed.record.resource.issued,
        sha256: feed.record.archive.sha256,
        bytes: feed.record.archive.bytes,
        members: feed.record.entries.map(entry => entry.name).sort(),
      },
      categories,
      combinations,
      samples,
      agencies,
      funiculars,
      mistyped,
      variants,
      exceptions,
      operators,
      mirror: await mirror,
    };

    await writeFile(path, render(findings), 'utf8');
    log(`wrote ${relative(RAIL_DIR, path)}`);

    return path;
  } finally {
    db.close();
  }
}
