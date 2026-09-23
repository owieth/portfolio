/**
 * Step eight: fold the feed's routes into the lines you can ride.
 *
 * The feed has a `route_id` per operator, per variant and per direction. The
 * `IR35` is run by BLS, SBB and SOB, and appears once for each of them and
 * again for each way it goes; it is one line to ride. So a line is the group of
 * routes that share a category, a line number and a network region, and the id
 * it gets — `fernverkehr:IR35` — is built from those and nothing else. The
 * `route_id`s are kept on the line, for the steps that still need to join on
 * them, and never go into the id.
 *
 * A route with no line number — an SBB `IC` whose number lives in the train
 * number, every funicular with only a BAV code — cannot be grouped by a number
 * it does not have. It is grouped by its two terminals instead: the ends of the
 * pattern it runs most, by Didok number. `naming.ts` puts a name on top of that.
 *
 * Merging on a key is only as good as the key. Two routes with one number in
 * one region that share no station at all are more likely two lines the region
 * rules failed to tell apart than one line, so they are merged — the id has to
 * mean something — and listed, because the fix is a rule in `data/regions.json`
 * and nobody would know to write it otherwise.
 *
 * Pure: it takes what the regions and patterns steps returned, and opens nothing.
 */

import { createHash } from 'node:crypto';

import { lineNumber } from './allowlist/categories.ts';
import type { Category } from './allowlist/categories.ts';
import {
  compactNumber,
  compare,
  components,
  dominantPattern,
  lineId,
  terminals,
} from './merge/key.ts';
import type { LineKey } from './merge/key.ts';
import type { Pattern } from './patterns.ts';
import type { RegionedRoute } from './regions.ts';

/** How many of the lines with the most operators the log names. */
const SHARED_SHOWN = 5;

export interface Line {
  /** `region:number`, or `region:category:didok-didok` for a line with no number. */
  id: string;
  category: Category;
  /** `null` for a line with no public number, which `naming.ts` names from its terminals. */
  number: string | null;
  region: string;
  /** Didok numbers of the two ends the line is keyed on; `null` when it has a number. */
  terminals: [string, string] | null;
  /** Every operator that runs it, by name. */
  operators: string[];
  /** Every route merged into it. Renumbered by every feed, so never an identity. */
  routeIds: string[];
  /** Didok numbers of every station any of its routes serves. */
  stations: string[];
}

/** One group of routes inside a suspect line that shares no station with the rest. */
export interface SuspectPart {
  routeIds: string[];
  operators: string[];
  /** The ends of the part's busiest pattern, in Didok order. */
  terminals: [string, string];
}

/** A line whose routes fall into groups that share no station with each other. */
export interface Suspect {
  id: string;
  parts: SuspectPart[];
}

export interface Merged {
  /** Ordered by id. */
  lines: Line[];
  /** For the report: merged on the key, and probably more than one line. */
  suspect: Suspect[];
  /** Routes that make no pattern, so have no Swiss stations to ride between. */
  dropped: number;
  /** One hash over every line, to compare two runs by. */
  fingerprint: string;
}

type Log = (message: string) => void;

interface Member {
  route: RegionedRoute;
  patterns: Pattern[];
  stations: Set<string>;
}

interface Group {
  key: LineKey;
  members: Member[];
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${value === 1 ? noun : `${noun}s`}`;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compare);
}

function patternsByRoute(patterns: readonly Pattern[]): Map<string, Pattern[]> {
  const byRoute = new Map<string, Pattern[]>();

  for (const pattern of patterns) {
    byRoute.set(pattern.routeId, [...(byRoute.get(pattern.routeId) ?? []), pattern]);
  }

  return byRoute;
}

/**
 * The ends of the busiest pattern across a set of routes. Only ever called with
 * routes that made a pattern, so there is always one.
 */
function endsOf(members: readonly Member[]): [string, string] {
  const dominant = dominantPattern(members.flatMap(member => member.patterns));

  if (dominant === null) {
    throw new Error('a route without a pattern reached the merge; this is a bug in merge.ts');
  }

  return terminals(dominant);
}

function keyOf(member: Member): LineKey {
  const { route } = member;
  const number = lineNumber(route.shortName, route.category);

  if (number === null) {
    return {
      region: route.region,
      category: route.category,
      number: null,
      terminals: endsOf([member]),
    };
  }

  const compact = compactNumber(number);

  if (compact === null) {
    throw new Error(
      `route ${route.routeId} by ${route.operator} has line number "${number}", which cannot go into a line id; only letters, digits, ".", "_" and "-" can`,
    );
  }

  return { region: route.region, category: route.category, number: compact };
}

/**
 * The group key is the whole of the line key, category included, so that a
 * collision between two categories on one numbered id is found below rather
 * than merged here.
 */
function groupKey(key: LineKey): string {
  return key.number === null
    ? [key.region, key.category, '', ...key.terminals].join('\u0000')
    : [key.region, key.category, key.number].join('\u0000');
}

function toLine(group: Group): Line {
  const { key, members } = group;

  return {
    id: lineId(key),
    category: key.category,
    number: key.number,
    region: key.region,
    terminals: key.number === null ? key.terminals : null,
    operators: sorted(members.map(member => member.route.operator)),
    routeIds: sorted(members.map(member => member.route.routeId)),
    stations: sorted(members.flatMap(member => [...member.stations])),
  };
}

function suspectOf(id: string, members: readonly Member[]): Suspect | null {
  const byRoute = new Map(members.map(member => [member.route.routeId, member]));
  const parts = components(
    new Map(members.map(member => [member.route.routeId, member.stations])),
  );

  if (parts.length < 2) {
    return null;
  }

  return {
    id,
    parts: parts.map(routeIds => {
      const part = routeIds.flatMap(routeId => byRoute.get(routeId) ?? []);

      return {
        routeIds,
        operators: sorted(part.map(member => member.route.operator)),
        terminals: endsOf(part),
      };
    }),
  };
}

/**
 * Every field of every line, in id order, so two runs over the same feed can be
 * compared by reading one line of each log — the same arrangement as the
 * patterns step's fingerprint.
 */
function fingerprintOf(lines: readonly Line[]): string {
  const hash = createHash('sha256');

  for (const line of lines) {
    hash.update(
      [
        line.id,
        line.category,
        line.number ?? '',
        line.region,
        line.terminals?.join('-') ?? '',
        line.operators.join(','),
        line.routeIds.join(','),
        line.stations.join(','),
      ].join('|'),
    );
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

function describePart(part: SuspectPart): string {
  return `${part.routeIds.join(', ')} by ${part.operators.join(', ')}, ${part.terminals.join('–')}`;
}

export function mergeLines(
  routes: readonly RegionedRoute[],
  patterns: readonly Pattern[],
  log: Log,
): Merged {
  const byRoute = patternsByRoute(patterns);
  const groups = new Map<string, Group>();
  let dropped = 0;

  for (const route of routes) {
    const own = byRoute.get(route.routeId);

    if (own === undefined) {
      dropped += 1;
      continue;
    }

    const member: Member = {
      route,
      patterns: own,
      stations: new Set(own.flatMap(pattern => pattern.stations)),
    };
    const key = keyOf(member);
    const name = groupKey(key);
    const group = groups.get(name);

    if (group === undefined) {
      groups.set(name, { key, members: [member] });
      continue;
    }

    group.members.push(member);
  }

  if (groups.size === 0) {
    throw new Error(
      `none of ${count(routes.length)} routes made a stop pattern, so there are no lines to merge them into; the patterns and regions steps no longer describe the same feed`,
    );
  }

  const lines: Line[] = [];
  const suspect: Suspect[] = [];
  const categoriesById = new Map<string, Category[]>();

  for (const group of groups.values()) {
    const line = toLine(group);
    lines.push(line);
    categoriesById.set(line.id, [...(categoriesById.get(line.id) ?? []), line.category]);

    const found = suspectOf(line.id, group.members);

    if (found !== null) {
      suspect.push(found);
    }
  }

  const collisions = [...categoriesById.entries()].filter(([, categories]) => categories.length > 1);

  if (collisions.length > 0) {
    throw new Error(
      `${collisions
        .map(([id, categories]) => `${id} stands for ${categories.sort(compare).join(' and ')}`)
        .join('; ')}; a number that starts with another category's code reads as that category's, so merge/key.ts has to spell those ids differently`,
    );
  }

  lines.sort((a, b) => compare(a.id, b.id));
  suspect.sort((a, b) => compare(a.id, b.id));

  const fingerprint = fingerprintOf(lines);
  const merged = routes.length - dropped;
  const unnumbered = lines.filter(line => line.number === null).length;
  const shared = lines
    .filter(line => line.operators.length > 1)
    .sort((a, b) => b.operators.length - a.operators.length || compare(a.id, b.id));

  log(
    `${count(merged)} routes merged into ${plural(lines.length, 'line')}, ${count(unnumbered)} of them without a number, fingerprint ${fingerprint}`,
  );

  if (shared.length > 0) {
    log(
      `${plural(shared.length, 'line')} run by more than one operator; most: ${shared
        .slice(0, SHARED_SHOWN)
        .map(line => `${line.id} (${line.operators.join(', ')})`)
        .join('; ')}`,
    );
  }

  // Expected, and the patterns step has already said why: a route that reaches
  // one border station and no further has no Swiss segment to be a line of.
  if (dropped > 0) {
    log(`${plural(dropped, 'route')} without a stop pattern left out of the lines`);
  }

  for (const line of suspect) {
    log(
      `line ${line.id} merges ${line.parts.length} groups of routes that share no station — ${line.parts
        .map(describePart)
        .join(' | ')}; if they are different lines, add a rule to data/regions.json`,
    );
  }

  return { lines, suspect, dropped, fingerprint };
}
