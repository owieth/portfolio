/**
 * Turns a comparison into the Markdown `pnpm diff:data` prints: read each
 * December next to `REPORT.md`, before the snapshot is committed, and short
 * enough to paste into the pull request that commits it.
 *
 * The totals come first, then one section per kind of change, in the order the
 * reconcile in #488 cares about them: lines that are new, lines that are gone,
 * the pairs of the two that are probably one line under a new number, and the
 * lines that kept their id but not their name, category or stations. An empty
 * section is left out, and a diff with nothing in it says so in one line.
 */

import { table } from '../markdown.ts';
import type { Cell } from '../markdown.ts';
import type { Comparison, DiffLine, DiffStop, Renamed, Shift } from './compare.ts';
import { isUnchanged } from './compare.ts';

export interface DiffSides {
  /** The git ref the committed files were read at, `HEAD` unless asked otherwise. */
  base: string;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function signed(value: number): string {
  return value > 0 ? `+${count(value)}` : value < 0 ? `−${count(-value)}` : '0';
}

function code(value: string): string {
  return `\`${value}\``;
}

function terminals(line: DiffLine): string {
  return `${line.terminal_a} – ${line.terminal_b}`;
}

function stations(stops: readonly DiffStop[]): string | null {
  return stops.length === 0 ? null : stops.map(stop => stop.stop_name).join(', ');
}

function section(title: string, items: number, body: string[]): string[] {
  return items === 0 ? [] : [`## ${title} (${count(items)})`, '', ...body];
}

function lineRows(lines: readonly DiffLine[]): Cell[][] {
  return lines.map(line => [
    code(line.id),
    line.display_name,
    code(line.category),
    line.network_region,
    terminals(line),
  ]);
}

const LINE_HEADERS = ['Id', 'Name', 'Category', 'Region', 'Terminals'];

function changeRows(changes: readonly Renamed[], format: (value: string) => string): Cell[][] {
  return changes.map(change => [code(change.id), format(change.before), format(change.after)]);
}

function shiftTable(heading: string, shifts: readonly Shift[], format: (value: string) => string): string {
  return table(
    [heading, 'Committed', 'Generated', 'Change'],
    shifts.map(shift => [
      format(shift.key),
      shift.before,
      shift.after,
      signed(shift.after - shift.before),
    ]),
  );
}

function totals(comparison: Comparison): string {
  const row = (label: string, { before, after }: { before: number; after: number }): Cell[] => [
    label,
    before,
    after,
    signed(after - before),
  ];

  return table(
    ['', 'Committed', 'Generated', 'Change'],
    [row('Lines', comparison.lines), row('Line stops', comparison.stops)],
  );
}

export function renderDiff(comparison: Comparison, { base }: DiffSides): string {
  const head = [
    '# Rail lines — feed diff',
    '',
    `\`lines.csv\` and \`line_stops.csv\` as generated, against ${code(base)}.`,
    '',
    totals(comparison),
  ];

  if (isUnchanged(comparison)) {
    return `${[...head, '', 'No line or stop changed.'].join('\n')}\n`;
  }

  const sections = [
    section('Added lines', comparison.added.length, [
      table(LINE_HEADERS, lineRows(comparison.added)),
    ]),
    section('Removed lines', comparison.removed.length, [
      'The reconcile flags these rather than deleting them, since rides may',
      'already point at them.',
      '',
      table(LINE_HEADERS, lineRows(comparison.removed)),
    ]),
    section('Likely renumbered', comparison.renumbered.length, [
      'A removed line and an added line between the same two terminals, and no',
      'other line between them on either side. Check each pair is one line under a',
      'new number: the reconcile still sees a removal and an insertion.',
      '',
      table(
        ['Committed', 'Generated', 'Terminals'],
        comparison.renumbered.map(({ before, after }) => [
          `${code(before.id)} ${before.display_name}`,
          `${code(after.id)} ${after.display_name}`,
          terminals(after),
        ]),
      ),
    ]),
    section('Renamed', comparison.renamed.length, [
      table(['Id', 'Committed', 'Generated'], changeRows(comparison.renamed, name => name)),
    ]),
    section('Category changed', comparison.recategorised.length, [
      table(['Id', 'Committed', 'Generated'], changeRows(comparison.recategorised, code)),
    ]),
    section('Category shifts', comparison.categories.length, [
      shiftTable('Category', comparison.categories, code),
    ]),
    section('Region shifts', comparison.regions.length, [
      shiftTable('Region', comparison.regions, region => region),
    ]),
    section('Stations changed', comparison.stopChanges.length, [
      'Lines that kept their id but serve other stations. A stop that only moved',
      'within the sequence is not listed.',
      '',
      table(
        ['Id', 'Name', 'Added', 'Removed'],
        comparison.stopChanges.map(change => [
          code(change.id),
          change.display_name,
          stations(change.added),
          stations(change.removed),
        ]),
      ),
    ]),
  ].filter(lines => lines.length > 0);

  return `${[...head, ...sections.flatMap(lines => ['', ...lines])].join('\n')}\n`;
}
