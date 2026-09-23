import { describe, expect, it } from 'vitest';

import { compareSnapshots, isUnchanged, snapshotOf } from './compare.ts';
import type { DiffLine, DiffStop, Snapshot } from './compare.ts';

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

const POLYBAHN: DiffLine = {
  id: 'polybahn:FUN-2350',
  display_name: 'Standseilbahn Polybahn',
  category: 'FUN',
  network_region: 'polybahn',
  terminal_a: 'Zürich Central',
  terminal_b: 'Zürich Polyterrasse ETH',
};

function stop(line: DiffLine, didok: string | null, stop_name = didok ?? ''): DiffStop {
  return { line_id: line.id, stop_name, didok };
}

const STOPS: DiffStop[] = [
  stop(IR35, '8507000', 'Bern'),
  stop(IR35, '8505000', 'Luzern'),
  stop(S12, '8500309', 'Brugg AG'),
  stop(S12, '8506000', 'Winterthur'),
  stop(S12, '8506401', 'Wil SG'),
  stop(POLYBAHN, '8591054', 'Zürich Central'),
  stop(POLYBAHN, '8591316', 'Zürich Polyterrasse ETH'),
];

const BEFORE: Snapshot = { lines: [IR35, S12, POLYBAHN], stops: STOPS };

describe('compareSnapshots', () => {
  it('finds nothing between a snapshot and itself', () => {
    const comparison = compareSnapshots(BEFORE, BEFORE);

    expect(isUnchanged(comparison)).toBe(true);
    expect(comparison.categories).toEqual([]);
    expect(comparison.regions).toEqual([]);
    expect(comparison.lines).toEqual({ before: 3, after: 3 });
    expect(comparison.stops).toEqual({ before: 7, after: 7 });
  });

  it('lists added and removed lines by id', () => {
    const IR36: DiffLine = { ...IR35, id: 'fernverkehr:IR36', display_name: 'IR36', terminal_b: 'Zürich HB' };
    const comparison = compareSnapshots(BEFORE, {
      lines: [IR36, S12, POLYBAHN],
      stops: STOPS.filter(entry => entry.line_id !== IR35.id),
    });

    expect(comparison.added).toEqual([IR36]);
    expect(comparison.removed).toEqual([IR35]);
    expect(comparison.renumbered).toEqual([]);
    expect(isUnchanged(comparison)).toBe(false);
  });

  it('pairs a removed and an added line with the same terminals as renumbered', () => {
    // Terminals the other way round are still the same line.
    const IR36: DiffLine = {
      ...IR35,
      id: 'fernverkehr:IR36',
      display_name: 'IR36',
      terminal_a: 'Luzern',
      terminal_b: 'Bern',
    };
    const comparison = compareSnapshots(BEFORE, { lines: [IR36, S12, POLYBAHN], stops: STOPS });

    expect(comparison.renumbered).toEqual([{ before: IR35, after: IR36 }]);
    expect(comparison.added).toEqual([]);
    expect(comparison.removed).toEqual([]);
  });

  it('does not pair when the terminals leave more than one candidate', () => {
    const IR36: DiffLine = { ...IR35, id: 'fernverkehr:IR36', display_name: 'IR36' };
    const IR37: DiffLine = { ...IR35, id: 'fernverkehr:IR37', display_name: 'IR37' };
    const comparison = compareSnapshots(BEFORE, {
      lines: [IR36, IR37, S12, POLYBAHN],
      stops: STOPS,
    });

    expect(comparison.renumbered).toEqual([]);
    expect(comparison.added).toEqual([IR36, IR37]);
    expect(comparison.removed).toEqual([IR35]);
  });

  it('lists a line that kept its id under a new name as renamed', () => {
    const renamed = { ...POLYBAHN, display_name: 'Polybahn' };
    const comparison = compareSnapshots(BEFORE, { lines: [IR35, S12, renamed], stops: STOPS });

    expect(comparison.renamed).toEqual([
      { id: POLYBAHN.id, before: 'Standseilbahn Polybahn', after: 'Polybahn' },
    ]);
    expect(comparison.added).toEqual([]);
  });

  it('lists a line that kept its id under a new category', () => {
    const recategorised = { ...IR35, category: 'RE' };
    const comparison = compareSnapshots(BEFORE, {
      lines: [recategorised, S12, POLYBAHN],
      stops: STOPS,
    });

    expect(comparison.recategorised).toEqual([{ id: IR35.id, before: 'IR', after: 'RE' }]);
    expect(comparison.categories).toEqual([
      { key: 'IR', before: 1, after: 0 },
      { key: 'RE', before: 0, after: 1 },
    ]);
  });

  it('counts lines per category and per region, listing only the ones that moved', () => {
    const S5: DiffLine = { ...S12, id: 's-bahn-zuerich:S5', display_name: 'S5', terminal_b: 'Pfäffikon SZ' };
    const comparison = compareSnapshots(BEFORE, {
      lines: [S12, S5, POLYBAHN],
      stops: STOPS,
    });

    expect(comparison.categories).toEqual([
      { key: 'IR', before: 1, after: 0 },
      { key: 'S', before: 1, after: 2 },
    ]);
    expect(comparison.regions).toEqual([
      { key: 'fernverkehr', before: 1, after: 0 },
      { key: 's-bahn-zuerich', before: 1, after: 2 },
    ]);
  });

  it('lists the stations a kept line gained and lost, ignoring their order', () => {
    const after: DiffStop[] = [
      stop(IR35, '8505000', 'Luzern'),
      stop(IR35, '8507000', 'Bern'),
      stop(S12, '8500309', 'Brugg AG'),
      stop(S12, '8506401', 'Wil SG'),
      stop(S12, '8503000', 'Zürich HB'),
      ...STOPS.filter(entry => entry.line_id === POLYBAHN.id),
    ];
    const comparison = compareSnapshots(BEFORE, { lines: BEFORE.lines, stops: after });

    expect(comparison.stopChanges).toEqual([
      {
        id: S12.id,
        display_name: 'S12',
        added: [stop(S12, '8503000', 'Zürich HB')],
        removed: [stop(S12, '8506000', 'Winterthur')],
      },
    ]);
  });

  it('tells a seeded stop without a Didok number by its name', () => {
    const before: Snapshot = { lines: [POLYBAHN], stops: [stop(POLYBAHN, null, 'Gelmersee')] };
    const after: Snapshot = { lines: [POLYBAHN], stops: [stop(POLYBAHN, null, 'Handegg')] };

    expect(compareSnapshots(before, after).stopChanges).toEqual([
      {
        id: POLYBAHN.id,
        display_name: POLYBAHN.display_name,
        added: [stop(POLYBAHN, null, 'Handegg')],
        removed: [stop(POLYBAHN, null, 'Gelmersee')],
      },
    ]);
  });

  it('reports every line as added against an empty snapshot', () => {
    const comparison = compareSnapshots({ lines: [], stops: [] }, BEFORE);

    expect(comparison.added.map(line => line.id)).toEqual([IR35.id, POLYBAHN.id, S12.id]);
    expect(comparison.stopChanges).toEqual([]);
  });
});

describe('snapshotOf', () => {
  it('keeps the columns the diff reads', () => {
    const snapshot = snapshotOf(
      [{ ...IR35, operators: 'BLS AG', has_geometry: 'true' }],
      [{ line_id: IR35.id, sequence: '1', stop_name: 'Bern', didok: '8507000', via: 'backbone' }],
    );

    expect(snapshot).toEqual({ lines: [IR35], stops: [stop(IR35, '8507000', 'Bern')] });
  });

  it('reads an empty Didok number as null', () => {
    expect(
      snapshotOf([], [{ line_id: POLYBAHN.id, stop_name: 'Gelmersee', didok: null }]).stops,
    ).toEqual([stop(POLYBAHN, null, 'Gelmersee')]);
  });

  it('rejects a row missing a column it reads', () => {
    expect(() => snapshotOf([{ id: IR35.id }], [])).toThrow('lines.csv row 2 has no display_name');
  });
});
