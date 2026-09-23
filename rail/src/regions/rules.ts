/**
 * Which network a route belongs to, as a table rather than as code.
 *
 * The table is `data/regions.json`: a `regions` map from slug to name, and an
 * ordered `rules` list, read top to bottom, first match wins — the same shape as
 * the allowlist, so a reviewer reads the order as the decision. A rule is a
 * conjunction of up to four predicates: the route's category, its operator, its
 * line number, and whether it serves any of a handful of anchor stations. The
 * last is what does most of the work. SBB runs S-Bahn lines in most of the
 * country under one `agency_id`, so the operator alone cannot tell the Basel
 * `S1` from the Luzern one; the stations it stops at can.
 *
 * Stations and operators are keyed by the feed's ids and carry a name next to
 * the id. The name is for the reviewer, and the step checks it against the feed
 * rather than trusting it — a Didok number that is off by one digit anchors a
 * rule to the wrong station, and without the name nothing would say so.
 *
 * A rule either files a route under a `region`, or sets `byOperator` to file it
 * under its operator. The second is for lines that are their own network — a
 * funicular, a rack railway, a German regional operator — so that the list of
 * routes no rule placed stays a list of routes someone should look at.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CATEGORIES } from '../allowlist/categories.ts';
import type { Category } from '../allowlist/categories.ts';
import { DATA_DIR } from '../paths.ts';

export const RULES_FILE = join(DATA_DIR, 'regions.json');

export interface StationRef {
  didok: string;
  name: string;
}

export interface AgencyRef {
  id: string;
  name: string;
}

export interface Rule {
  /** A slug from `regions`. Exactly one of this and `byOperator`. */
  region?: string;
  byOperator?: true;
  categories?: Category[];
  agencies?: AgencyRef[];
  /** `route_short_name`s, compared exactly. */
  lines?: string[];
  serves?: StationRef[];
  /** Why the rule exists, for the reviewer. JSON has no comments. */
  note?: string;
}

export interface Rules {
  /** Slug to display name. */
  regions: Record<string, string>;
  rules: Rule[];
}

/** What a rule is matched against: one allowed route and the stations it serves. */
export interface RouteFacts {
  category: Category;
  agencyId: string | null;
  shortName: string | null;
  /** Didok numbers of the stations the route stops at, pass-throughs excluded. */
  stations: ReadonlySet<string>;
}

export interface Match {
  rule: Rule;
  /** One-based, so it reads the same as the rule's position in the file. */
  position: number;
  /** The anchor station that satisfied `serves`, or `null` for a rule without one. */
  via: StationRef | null;
}

/** Lowercase ASCII words joined by single hyphens — what goes into a line id. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RULE_KEYS = new Set([
  'region',
  'byOperator',
  'categories',
  'agencies',
  'lines',
  'serves',
  'note',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function nonEmptyList(
  rule: Record<string, unknown>,
  key: string,
  found: string[],
): unknown[] {
  const value = rule[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length === 0) {
    found.push(`"${key}" must be a non-empty list`);
    return [];
  }

  return value;
}

/**
 * Every problem in one rule, not just the first, so a bad edit is fixed in one
 * pass rather than one rerun per mistake.
 */
function problems(
  rule: Record<string, unknown>,
  regions: Record<string, unknown>,
): string[] {
  const found: string[] = [];

  for (const key of Object.keys(rule)) {
    if (!RULE_KEYS.has(key)) {
      found.push(`has an unknown key "${key}"`);
    }
  }

  if ((rule.region === undefined) === (rule.byOperator === undefined)) {
    found.push('needs exactly one of "region" and "byOperator"');
  } else if (rule.byOperator !== undefined && rule.byOperator !== true) {
    found.push('can only set "byOperator" to true');
  } else if (
    rule.region !== undefined &&
    !(typeof rule.region === 'string' && Object.hasOwn(regions, rule.region))
  ) {
    found.push(
      `names region ${JSON.stringify(rule.region)}, which "regions" does not declare`,
    );
  }

  if (
    rule.categories === undefined &&
    rule.agencies === undefined &&
    rule.lines === undefined &&
    rule.serves === undefined
  ) {
    found.push(
      'matches everything; give it "categories", "agencies", "lines" or "serves"',
    );
  }

  for (const category of nonEmptyList(rule, 'categories', found)) {
    if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES, category)) {
      found.push(
        `names category ${JSON.stringify(category)}, which allowlist/categories.ts does not`,
      );
    }
  }

  for (const line of nonEmptyList(rule, 'lines', found)) {
    if (!isNonEmptyString(line)) {
      found.push(`has a line that is not a string: ${JSON.stringify(line)}`);
    }
  }

  for (const [key, id] of [
    ['agencies', 'id'],
    ['serves', 'didok'],
  ] as const) {
    for (const ref of nonEmptyList(rule, key, found)) {
      if (!isRecord(ref) || !isNonEmptyString(ref[id]) || !isNonEmptyString(ref.name)) {
        found.push(
          `needs "${id}" and "name" on every entry in "${key}", got ${JSON.stringify(ref)}`,
        );
      }
    }
  }

  if (rule.note !== undefined && !isNonEmptyString(rule.note)) {
    found.push('has a "note" that is not text');
  }

  return found;
}

/**
 * Validated by hand rather than with a schema library: the shape is four levels
 * deep at most, and a dependency for it would be the larger change.
 */
export function parseRules(json: unknown, source: string): Rules {
  if (!isRecord(json) || !isRecord(json.regions) || !Array.isArray(json.rules)) {
    throw new Error(
      `${source} must be an object with a "regions" map and a "rules" list`,
    );
  }

  const { regions, rules } = json;
  const errors: string[] = [];
  const used = new Set<string>();

  for (const [slug, name] of Object.entries(regions)) {
    if (!SLUG.test(slug)) {
      errors.push(
        `${source}: region ${JSON.stringify(slug)} is not lowercase-kebab-case ASCII`,
      );
    }

    if (!isNonEmptyString(name)) {
      errors.push(`${source}: region ${slug} needs a display name`);
    }
  }

  rules.forEach((rule: unknown, index) => {
    const label = `${source}: rule ${index + 1}`;

    if (!isRecord(rule)) {
      errors.push(`${label} is not an object`);
      return;
    }

    for (const problem of problems(rule, regions)) {
      errors.push(`${label} ${problem}`);
    }

    if (typeof rule.region === 'string') {
      used.add(rule.region);
    }
  });

  for (const slug of Object.keys(regions)) {
    if (!used.has(slug)) {
      errors.push(
        `${source}: region ${slug} is declared but no rule files anything under it`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return json as unknown as Rules;
}

export async function loadRules(path: string = RULES_FILE): Promise<Rules> {
  const text = await readFile(path, 'utf8');

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }

  return parseRules(json, path);
}

/**
 * The first rule whose every predicate holds, or `null`. `via` is the first
 * anchor in the rule's own order that the route serves, so the explanation the
 * log prints is the same on every run.
 */
export function assign(route: RouteFacts, rules: readonly Rule[]): Match | null {
  for (const [index, rule] of rules.entries()) {
    if (rule.categories !== undefined && !rule.categories.includes(route.category)) {
      continue;
    }

    if (
      rule.agencies !== undefined &&
      !rule.agencies.some(agency => agency.id === route.agencyId)
    ) {
      continue;
    }

    if (
      rule.lines !== undefined &&
      (route.shortName === null || !rule.lines.includes(route.shortName))
    ) {
      continue;
    }

    if (rule.serves === undefined) {
      return { rule, position: index + 1, via: null };
    }

    const via = rule.serves.find(station => route.stations.has(station.didok));

    if (via !== undefined) {
      return { rule, position: index + 1, via };
    }
  }

  return null;
}

/**
 * German umlauts are transliterated rather than stripped, the way the README's
 * `s-bahn-zuerich` spells it: `Zürich` is `zuerich` to anyone who has typed it
 * on a keyboard without one. Every other accent goes through NFD and is dropped.
 */
export function operatorSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

  return slug === '' ? 'unknown-operator' : slug;
}

/** Feed names by id, for checking the names a rule was written with. */
export interface FeedNames {
  stations: ReadonlyMap<string, string>;
  agencies: ReadonlyMap<string, string>;
}

/**
 * A reference the feed cannot back up is not an error: the feed renames a
 * station more often than it renumbers one, and a rule whose anchor has gone is
 * a rule that stops matching, which the unassigned list shows anyway. It is
 * reported so the cause sits next to the symptom.
 */
export function verify(rules: readonly Rule[], feed: FeedNames): string[] {
  const found: string[] = [];

  for (const [index, rule] of rules.entries()) {
    const label = `rule ${index + 1}`;

    for (const station of rule.serves ?? []) {
      const actual = feed.stations.get(station.didok);

      if (actual === undefined) {
        found.push(
          `${label}: station ${station.didok} ${station.name} is not in the feed`,
        );
      } else if (actual !== station.name) {
        found.push(
          `${label}: station ${station.didok} is ${actual} in the feed, not ${station.name}`,
        );
      }
    }

    for (const agency of rule.agencies ?? []) {
      const actual = feed.agencies.get(agency.id);

      if (actual === undefined) {
        found.push(`${label}: agency ${agency.id} ${agency.name} is not in the feed`);
      } else if (actual !== agency.name) {
        found.push(
          `${label}: agency ${agency.id} is ${actual} in the feed, not ${agency.name}`,
        );
      }
    }
  }

  return found;
}
