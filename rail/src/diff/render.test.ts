import { describe, expect, it } from 'vitest';

import { compareSnapshots } from './compare.ts';
import type { DiffLine, Snapshot } from './compare.ts';
import { renderDiff } from './render.ts';

const IR35: DiffLine = {
  id: 'fernverkehr:IR35',
  display_name: 'IR35',
  category: 'IR',
  network_region: 'fernverkehr',
  terminal_a: 'Bern',
  terminal_b: 'Luzern',
};

const S12: DiffLine = {
  id: 's-bahn-zuerich:S12',
  display_name: 'S12',
  category: 'S',
  network_region: 's-bahn-zuerich',
  terminal_a: 'Brugg AG',
  terminal_b: 'Wil SG',
};

const BEFORE: Snapshot = {
  lines: [IR35, S12],
  stops: [
    { line_id: IR35.id, stop_name: 'Bern', didok: '8507000' },
    { line_id: IR35.id, stop_name: 'Luzern', didok: '8505000' },
    { line_id: S12.id, stop_name: 'Brugg AG', didok: '8500309' },
    { line_id: S12.id, stop_name: 'Wil SG', didok: '8506401' },
  ],
};

function render(after: Snapshot): string {
  return renderDiff(compareSnapshots(BEFORE, after), { base: 'HEAD' });
}

describe('renderDiff', () => {
  it('says in one line that nothing changed', () => {
    expect(render(BEFORE)).toBe(
      [
        '# Rail lines — feed diff',
        '',
        '`lines.csv` and `line_stops.csv` as generated, against `HEAD`.',
        '',
        '|  | Committed | Generated | Change |',
        '| --- | --- | --- | --- |',
        '| Lines | 2 | 2 | 0 |',
        '| Line stops | 4 | 4 | 0 |',
        '',
        'No line or stop changed.',
        '',
      ].join('\n'),
    );
  });

  it('names the ref the committed files were read at', () => {
    expect(renderDiff(compareSnapshots(BEFORE, BEFORE), { base: 'v2026' })).toContain(
      'as generated, against `v2026`.',
    );
  });

  it('lists added and removed lines with their terminals', () => {
    const RE33: DiffLine = {
      ...IR35,
      id: 'fernverkehr:RE33',
      display_name: 'RE33',
      category: 'RE',
      terminal_b: 'Olten',
    };
    const markdown = render({
      lines: [RE33, S12],
      stops: BEFORE.stops.filter(stop => stop.line_id !== IR35.id),
    });

    expect(markdown).toContain(
      '## Added lines (1)\n\n| Id | Name | Category | Region | Terminals |\n| --- | --- | --- | --- | --- |\n| `fernverkehr:RE33` | RE33 | `RE` | fernverkehr | Bern – Olten |',
    );
    expect(markdown).toContain('## Removed lines (1)');
    expect(markdown).toContain('| `fernverkehr:IR35` | IR35 | `IR` | fernverkehr | Bern – Luzern |');
    expect(markdown).toContain('| Lines | 2 | 2 | 0 |\n| Line stops | 4 | 2 | −2 |');
  });

  it('lists a renumbered pair once, under its own heading', () => {
    const IR36: DiffLine = { ...IR35, id: 'fernverkehr:IR36', display_name: 'IR36' };
    const markdown = render({ lines: [IR36, S12], stops: BEFORE.stops });

    expect(markdown).toContain('## Likely renumbered (1)');
    expect(markdown).toContain('| `fernverkehr:IR35` IR35 | `fernverkehr:IR36` IR36 | Bern – Luzern |');
    expect(markdown).not.toContain('## Added lines');
    expect(markdown).not.toContain('## Removed lines');
  });

  it('lists names, categories and their shifts', () => {
    const markdown = render({
      lines: [{ ...IR35, display_name: 'InterRegio 35', category: 'RE' }, S12],
      stops: BEFORE.stops,
    });

    expect(markdown).toContain('## Renamed (1)');
    expect(markdown).toContain('| `fernverkehr:IR35` | IR35 | InterRegio 35 |');
    expect(markdown).toContain('## Category changed (1)');
    expect(markdown).toContain('| `fernverkehr:IR35` | `IR` | `RE` |');
    expect(markdown).toContain(
      '## Category shifts (2)\n\n| Category | Committed | Generated | Change |\n| --- | --- | --- | --- |\n| `IR` | 1 | 0 | −1 |\n| `RE` | 0 | 1 | +1 |',
    );
    expect(markdown).not.toContain('## Region shifts');
  });

  it('lists the stations a line gained and lost by name', () => {
    const markdown = render({
      lines: BEFORE.lines,
      stops: [
        ...BEFORE.stops.filter(stop => stop.stop_name !== 'Wil SG'),
        { line_id: S12.id, stop_name: 'Winterthur', didok: '8506000' },
        { line_id: S12.id, stop_name: 'Schaffhausen', didok: '8503424' },
      ],
    });

    expect(markdown).toContain('## Stations changed (1)');
    expect(markdown).toContain('| `s-bahn-zuerich:S12` | S12 | Winterthur, Schaffhausen | Wil SG |');
  });

  it('prints a dash when a line only gained stations', () => {
    const markdown = render({
      lines: BEFORE.lines,
      stops: [...BEFORE.stops, { line_id: S12.id, stop_name: 'Winterthur', didok: '8506000' }],
    });

    expect(markdown).toContain('| `s-bahn-zuerich:S12` | S12 | Winterthur | — |');
  });
});
