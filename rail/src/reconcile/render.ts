/**
 * Turns a reconcile plan into the Markdown `pnpm reconcile:data` prints: read
 * in December next to the output of `pnpm diff:data`, whose added, changed and
 * removed lines should be this plan's inserts, updates and flagged lines.
 *
 * The totals come first, one row per table, then the lines to review: the new
 * ones, the ones flagged as gone, the ones back from being gone, and every
 * hand edit the feed now disagrees with. Stops are summarised per line rather
 * than listed one by one, since a line that changed pattern moves dozens of
 * them. An empty section is left out.
 */

import { table } from '../markdown.ts';
import type { Cell } from '../markdown.ts';
import { compare } from '../merge/key.ts';
import type { Plan, Skipped, TablePlan, Target } from './plan.ts';
import { isEmpty } from './plan.ts';
import type { FeedLine } from './rows.ts';

export interface RenderOptions {
  applied: boolean;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function code(value: string): string {
  return `\`${value}\``;
}

function value(cell: unknown): string {
  return typeof cell === 'string' ? cell : JSON.stringify(cell);
}

function section(title: string, items: number, body: string[]): string[] {
  return items === 0 ? [] : [`## ${title} (${count(items)})`, '', ...body];
}

function totals({ lines, stops }: Plan): string {
  const row = (label: string, plan: TablePlan<unknown>): Cell[] => [
    label,
    plan.inserts.length,
    plan.updates.length,
    plan.flagged.length,
    plan.restored.length,
    plan.skipped.length,
    plan.stillMissing,
    plan.unchanged,
  ];

  return table(
    [
      '',
      'Inserted',
      'Updated',
      'Flagged missing',
      'Restored',
      'Skipped, edited',
      'Still missing',
      'Unchanged',
    ],
    [row('Lines', lines), row('Line stops', stops)],
  );
}

function targets(rows: readonly Target[]): string {
  return table(
    ['Id', 'Name'],
    rows.map(row => [code(row.label), row.name]),
  );
}

function newLines(lines: readonly FeedLine[]): string {
  return table(
    ['Id', 'Name', 'Category', 'Region', 'Terminals'],
    lines.map(line => [
      code(line.id),
      line.display_name,
      code(line.category),
      line.network_region,
      `${line.terminal_a} – ${line.terminal_b}`,
    ]),
  );
}

function skippedRows(skipped: readonly Skipped[]): string {
  return table(
    ['Row', 'Field', 'Kept', 'Feed'],
    skipped.map(skip => [
      code(skip.label),
      code(skip.field),
      value(skip.kept),
      value(skip.feed),
    ]),
  );
}

/** How many of a line's stops each kind of change touches, one row per line. */
function stopsByLine({ stops }: Plan): Cell[][] {
  const lines = new Map<string, [number, number, number]>();
  const add = (lineId: string, column: 0 | 1 | 2) => {
    const counts = lines.get(lineId) ?? [0, 0, 0];
    counts[column] += 1;
    lines.set(lineId, counts);
  };

  stops.inserts.forEach(stop => add(stop.line_id, 0));
  stops.updates.forEach(update => add(String(update.key.line_id), 1));
  stops.flagged.forEach(target => add(String(target.key.line_id), 2));

  return [...lines]
    .sort(([a], [b]) => compare(a, b))
    .map(([lineId, counts]) => [code(lineId), ...counts]);
}

export function renderReconcile(plan: Plan, { applied }: RenderOptions): string {
  const head = [
    `# Rail lines — reconcile${applied ? '' : ' (dry run)'}`,
    '',
    '`lines.csv` and `line_stops.csv` against `rail_lines` and `rail_line_stops`.',
    applied
      ? 'The changes below have been written.'
      : 'Nothing has been written. Run `pnpm reconcile:data --apply` to write it.',
    '',
    totals(plan),
  ];

  const changedStops = stopsByLine(plan);
  const skipped = [...plan.lines.skipped, ...plan.stops.skipped];

  const sections = [
    section('New lines', plan.lines.inserts.length, [
      'Check each one is a line and not a renumbered one: an edit made on its old',
      'id does not carry over.',
      '',
      newLines(plan.lines.inserts),
    ]),
    section('Flagged missing', plan.lines.flagged.length, [
      'Gone from the feed. They stay in the table with `missing_since` set, since',
      'rides may already point at them.',
      '',
      targets(plan.lines.flagged),
    ]),
    section('Restored', plan.lines.restored.length, [
      'Back in the feed after an earlier reconcile flagged them.',
      '',
      targets(plan.lines.restored),
    ]),
    section('Updated lines', plan.lines.updates.length, [
      table(
        ['Id', 'Name', 'Fields'],
        plan.lines.updates.map(update => [
          code(update.label),
          update.name,
          update.changes.map(change => code(change.field)).join(', '),
        ]),
      ),
    ]),
    section('Stops by line', changedStops.length, [
      table(['Line', 'Inserted', 'Updated', 'Flagged missing'], changedStops),
    ]),
    section('Skipped because edited', skipped.length, [
      'Fields edited by hand that the feed now says otherwise. The edit stays;',
      'remove the field from `edited_fields` to hand it back to the feed.',
      '',
      skippedRows(skipped),
    ]),
  ].filter(lines => lines.length > 0);

  const body = isEmpty(plan) ? ['', 'Nothing to write.'] : [];

  return `${[...head, ...body, ...sections.flatMap(lines => ['', ...lines])].join('\n')}\n`;
}
