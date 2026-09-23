/**
 * What counts as a rideable line, as a table rather than as a rule.
 *
 * The recon settled the question the README had guessed at: `route_desc` is the
 * category vocabulary and `route_type` is not. 34 codes, each on exactly one
 * `route_type`, and several types split into codes that matter — 102 is IC, EC,
 * ICE and RJX at once, and 117 is `EXT`, which a "100 to 117" range would have
 * included and no later exclusion would ever have caught.
 *
 * Both registries below are transcribed from `RECON.md` §1 and together cover
 * every code in it. A code in neither is not a bug to fix here: the feed gains
 * categories, and `classify` returns `unknown` so the step can count and report
 * it rather than drop it. That is the difference between finding out in December
 * and finding out never.
 *
 * The `routeType` on each entry is corroboration, not decoration. If a future
 * feed moves `S` off 109 the vocabulary has changed underneath the pipeline, and
 * a mismatch is worth surfacing rather than trusting the code alone.
 */

export interface CategoryFacts {
  /** The `route_type` this code sits on in the feed. Exactly one, per the recon. */
  routeType: number;
  label: string;
}

/**
 * The categories you can ride. Keys are the feed's own codes, because they are
 * the vocabulary printed on the timetable and on the side of the train — a
 * reader of `lines.csv` recognises `IR` where they would have to decode a slug.
 */
export const CATEGORIES = {
  ZUG: { routeType: 100, label: 'Unspecified' },
  TGV: { routeType: 101, label: 'TGV' },
  IC: { routeType: 102, label: 'InterCity' },
  EC: { routeType: 102, label: 'EuroCity' },
  ICE: { routeType: 102, label: 'InterCityExpress' },
  RJX: { routeType: 102, label: 'Railjet Express' },
  IR: { routeType: 103, label: 'InterRegio' },
  NJ: { routeType: 105, label: 'Nightjet' },
  R: { routeType: 106, label: 'Regio' },
  RE: { routeType: 106, label: 'RegioExpress' },
  RB: { routeType: 106, label: 'Regionalbahn' },
  PE: { routeType: 107, label: 'Panorama Express' },
  S: { routeType: 109, label: 'S-Bahn' },
  SN: { routeType: 109, label: 'S-Bahn night service' },
  CC: { routeType: 116, label: 'Rack railway' },
  FUN: { routeType: 1400, label: 'Funicular' },
} as const satisfies Record<string, CategoryFacts>;

export type Category = keyof typeof CATEGORIES;

export interface ExcludedFacts {
  routeType: number;
  /** Why it is out, in the words the log and `REPORT.md` print. */
  reason: string;
}

/**
 * Everything else in the feed, with the reason it is out. Named rather than
 * implied by absence, so the excluded tally reads as a decision and a code that
 * nobody has classified yet cannot hide among codes that were.
 *
 * `TER` is the one judgement call here. 190 routes on SNCF's French regional
 * network arrive in the feed wholesale, most of them never touching Switzerland;
 * `TGV` and `RB` are equally foreign-operated but run Swiss-facing services you
 * board from a Swiss platform, so they stay in. #468 decided this; the recon
 * deliberately left it open.
 */
export const EXCLUDED = {
  CAR: { routeType: 202, reason: 'coach' },
  M: { routeType: 401, reason: 'metro' },
  B: { routeType: 700, reason: 'bus' },
  EV: { routeType: 700, reason: 'rail replacement bus' },
  EXB: { routeType: 702, reason: 'special-event bus' },
  BN: { routeType: 705, reason: 'night bus' },
  BP: { routeType: 710, reason: 'sightseeing bus' },
  RUB: { routeType: 715, reason: 'on-demand bus' },
  T: { routeType: 900, reason: 'tram' },
  TER: { routeType: 106, reason: 'French regional network' },
  EXT: { routeType: 117, reason: 'special-event train' },
  BAT: { routeType: 1000, reason: 'boat' },
  FAE: { routeType: 1000, reason: 'ferry' },
  GB: { routeType: 1300, reason: 'gondola' },
  SL: { routeType: 1300, reason: 'chairlift' },
  PB: { routeType: 1300, reason: 'aerial cable car' },
  ASC: { routeType: 1303, reason: 'lift' },
  TX: { routeType: 1500, reason: 'taxi' },
} as const satisfies Record<string, ExcludedFacts>;

export type ExcludedCode = keyof typeof EXCLUDED;

export type Classification =
  | { kind: 'included'; category: Category }
  | { kind: 'excluded'; reason: string }
  | { kind: 'unknown'; reason: string };

/**
 * Three answers rather than two. `unknown` is the whole point of this function:
 * a filter that returned a boolean would delete a category nobody has seen yet
 * as quietly as it deletes a bus.
 *
 * `Object.hasOwn` rather than an index, so a `route_desc` of `toString` or
 * `constructor` — the feed is operator-supplied text — resolves to nothing
 * instead of to a function on the prototype.
 */
export function classify(routeDesc: string | null, routeType: string): Classification {
  const code = routeDesc?.trim().toUpperCase() ?? '';

  if (code === '') {
    return { kind: 'unknown', reason: `no route_desc on route_type ${routeType}` };
  }

  const type = Number.parseInt(routeType, 10);

  if (Object.hasOwn(CATEGORIES, code)) {
    const facts = CATEGORIES[code as Category];

    return facts.routeType === type
      ? { kind: 'included', category: code as Category }
      : {
          kind: 'unknown',
          reason: `${code} is route_type ${facts.routeType} in the feed this was written against, not ${routeType}`,
        };
  }

  if (Object.hasOwn(EXCLUDED, code)) {
    return { kind: 'excluded', reason: EXCLUDED[code as ExcludedCode].reason };
  }

  return { kind: 'unknown', reason: `${code} is not in the category vocabulary` };
}
