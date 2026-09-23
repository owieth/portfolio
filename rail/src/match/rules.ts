/**
 * What a relation's tags say about which line it draws, as pure functions over
 * values.
 *
 * Tags are evidence, never proof. A `ref` of `S1` fits five lines in five
 * regions, an `operator` of `SBB` fits a third of the feed, and OSM spells both
 * the way its mappers do rather than the way the feed does. So each function
 * here answers one narrow question — does this ref name this line, does this
 * operator run it — and the step decides with geometry what the tags only
 * suggest.
 */

import { CATEGORIES } from '../allowlist/categories.ts';
import type { Category } from '../allowlist/categories.ts';
import type { Operator } from '../naming/operators.ts';
import type { RouteType } from '../overpass/query.ts';

/**
 * The rules in the order they are tried, strongest evidence first. A line takes
 * the relations of the first rule that finds any, and never mixes two: a line
 * with a relation named for it does not also collect whatever else happens to
 * end at its terminals.
 */
export const RULES = ['ref', 'operator', 'endpoints'] as const;

export type Rule = (typeof RULES)[number];

/** A line that no longer runs, like the old Stoos funicular. Never a candidate. */
export function isDisused(tags: Readonly<Record<string, string>>): boolean {
  return tags.disused === 'yes';
}

/**
 * `state=alternate` is a diversion and `state=connection` a positioning run,
 * like the ICE 43 onward from Basel. Each carries the ref of a line whose usual
 * path it is not. So one only counts for a line that nothing in regular service
 * draws, which is how the 2026 `S41` from Fribourg to Lausanne is mapped.
 */
export function isAlternate(tags: Readonly<Record<string, string>>): boolean {
  return tags.state !== undefined;
}

/**
 * The OSM route type a line of this category is usually mapped as, which picks
 * its tolerance. Only usually: the Dolderbahn is a funicular in the feed and
 * `route=train` on OSM, so the route type never rules a relation out.
 */
export function routeTypeOf(category: Category): RouteType {
  return category === 'FUN' ? 'funicular' : 'train';
}

function compact(value: string): string {
  return value.replaceAll(/\s+/g, '').toUpperCase();
}

/**
 * The spellings a relation's `ref` may use for the line: the number as the id
 * has it, and with the category in front when the number leaves it out. The
 * feed's ICE `3` is `ICE 3` on OSM; its `IR35` is `IR 35`. A number that is the
 * category and then a code of letters is also the code alone: the feed files
 * the Léman Express as `R` lines numbered `RL1` to `RL7`, and OSM calls them
 * `L1` to `L7`.
 */
export function lineRefs(category: Category, number: string | null): Set<string> {
  if (number === null) {
    return new Set();
  }

  const bare = compact(number);

  if (!bare.startsWith(category)) {
    return new Set([bare, `${category}${bare}`]);
  }

  const code = bare.slice(category.length);

  return new Set(/^[A-Z]/.test(code) ? [bare, code] : [bare]);
}

/** A `ref` split on `;`, which OSM uses for a relation that carries two lines. */
export function relationRefs(ref: string | undefined): Set<string> {
  return new Set(
    (ref ?? '')
      .split(';')
      .map(compact)
      .filter(value => value !== ''),
  );
}

/**
 * Category codes OSM uses that the feed does not, for the category the feed
 * files the same trains under: ÖBB's railjets are `RJ` on OSM and `RJX` in the
 * feed, its EuroNights `EN` on OSM and `NJ` in the feed.
 */
const OSM_CATEGORIES: Readonly<Record<string, Category>> = { RJ: 'RJX', EN: 'NJ' };

/**
 * Every code a ref can open with, longest first, so `ICE 20` reads as an ICE
 * and not as an IC. `ZUG` is left out: it names no category in the feed, and on
 * OSM it prefixes a timetable number, as in the Brienz Rothorn Bahn's `Zug 475`.
 */
const PREFIXES: readonly [string, Category][] = [
  ...(Object.keys(CATEGORIES) as Category[])
    .filter(code => code !== 'ZUG')
    .map((code): [string, Category] => [code, code]),
  ...Object.entries(OSM_CATEGORIES),
].sort(([a], [b]) => b.length - a.length);

function digits(value: string): string {
  return value.replaceAll(/\D/g, '');
}

/**
 * The line a ref names: a category code, alone or followed by a number, like
 * `EC`, `ICE 20` or `RE41`. `null` for a ref that is anything else — `L5`,
 * `Minifunic`, `2570` — which names no line. A number of three digits or more
 * is a timetable field or a train number rather than a line number, like the
 * BOB's `R 312` for its R61 or `EN 40462`, so only its category counts.
 */
function parseRef(ref: string): { category: Category; number: string } | null {
  for (const [code, category] of PREFIXES) {
    const rest = ref.slice(code.length);

    if (ref.startsWith(code) && (rest === '' || /^\d/.test(rest))) {
      const number = digits(rest);
      return { category, number: number.length >= 3 ? '' : number };
    }
  }

  return null;
}

/**
 * Whether a relation's ref is some other line's, when the ref rule has not
 * already found that it is this one's. It is when it names another category,
 * or the same category with another number. The ICE relations from Hamburg end
 * at Basel Bad Bf and Basel SBB like the IC between the two, and are not its
 * shape; the railjet ends at Buchs SG and Zürich HB like the EC.
 *
 * Only the number is compared when both have one and the categories differ,
 * because OSM and the feed do not always file a line under the same one: the
 * MGB's `RE41` is the feed's `R41`, and the Gornergratbahn's `R48` its `CC 48`.
 */
export function namesAnotherLine(
  refs: ReadonlySet<string>,
  category: Category,
  number: string | null,
): boolean {
  const own = number === null ? '' : digits(number);

  return [...refs].some(ref => {
    const named = parseRef(ref);

    if (named === null) {
      return false;
    }

    if (named.category !== category) {
      return named.number === '' || own === '' || named.number !== own;
    }

    return named.number !== '' && own !== '' && named.number !== own;
  });
}

/**
 * Lowercase, accents gone, and every run of anything but a letter or a digit
 * one space: `Matterhorn Gotthard Bahn (fo)` and `matterhorn gotthard bahn fo`
 * are one name.
 */
export function normaliseOperator(name: string): string {
  return name
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The spellings of a line's operators that a relation may use: the feed's name,
 * the short form from `data/operators.json`, and each of those normalised.
 */
export function operatorNames(
  operators: readonly string[],
  table: readonly Operator[],
): string[] {
  const short = new Map(table.map(operator => [operator.name, operator.short]));

  return [
    ...new Set(
      operators.flatMap(name => [name, short.get(name) ?? name].map(normaliseOperator)),
    ),
  ].filter(name => name !== '');
}

/**
 * Whether one of the relation's operators is one of the line's. Equal after
 * normalising, or a whole run of words inside the feed's name, since OSM mostly
 * writes the short form the feed spells out: `SBB` inside `Schweizerische
 * Bundesbahnen SBB`, `bls` inside `BLS AG (bls)`. Never a fragment of a word, so
 * `RB` does not run the `RBS`.
 */
export function operatorMatches(tag: string | undefined, names: readonly string[]): boolean {
  const tagged = (tag ?? '')
    .split(';')
    .map(normaliseOperator)
    .filter(value => value !== '');

  return tagged.some(value =>
    names.some(name => name === value || ` ${name} `.includes(` ${value} `)),
  );
}
