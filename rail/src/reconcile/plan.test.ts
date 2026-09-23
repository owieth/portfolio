import { describe, expect, it } from 'vitest';

import { IR35, S12, stop, storedLine, storedStop } from './fixtures.ts';
import { isEmpty, planReconcile } from './plan.ts';
import type { Feed, State } from './rows.ts';

const FEED: Feed = {
  lines: [IR35, S12],
  stops: [stop(IR35, 1, 'Bern'), stop(IR35, 2, 'Luzern'), stop(S12, 1, 'Brugg AG')],
};

/** The database right after the seed: the same rows, nothing edited. */
function seeded(): State {
  return {
    lines: FEED.lines.map(line => storedLine(line)),
    stops: FEED.stops.map(row => storedStop(row)),
  };
}

describe('planReconcile', () => {
  it('plans nothing against the feed the database was seeded from', () => {
    const plan = planReconcile(FEED, seeded());

    expect(isEmpty(plan)).toBe(true);
    expect(plan.lines.unchanged).toBe(2);
    expect(plan.stops.unchanged).toBe(3);
  });

  it('keeps a hand-edited display_name against the same feed', () => {
    const state = seeded();
    state.lines[0] = storedLine(
      { ...IR35, display_name: 'IR 35 Bern–Luzern' },
      { edited_fields: ['display_name'] },
    );

    const plan = planReconcile(FEED, state);

    expect(plan.lines.updates).toEqual([]);
    expect(plan.lines.skipped).toEqual([
      {
        key: { id: 'fernverkehr:IR35' },
        label: 'fernverkehr:IR35',
        name: 'IR 35 Bern–Luzern',
        field: 'display_name',
        kept: 'IR 35 Bern–Luzern',
        feed: 'IR35',
      },
    ]);
    expect(isEmpty(plan)).toBe(true);
  });

  it('writes the fields the feed changed that nobody edited, and only those', () => {
    const state = seeded();
    state.lines[0] = storedLine(
      { ...IR35, display_name: 'Mine' },
      { edited_fields: ['display_name'] },
    );
    const next: Feed = {
      ...FEED,
      lines: [{ ...IR35, display_name: 'IR35 new', route_ids: ['91-35-j27-1'] }, S12],
    };

    const plan = planReconcile(next, state);

    expect(plan.lines.updates).toEqual([
      {
        key: { id: 'fernverkehr:IR35' },
        label: 'fernverkehr:IR35',
        name: 'Mine',
        set: { route_ids: ['91-35-j27-1'] },
        changes: [{ field: 'route_ids', from: ['91-35-j26-1'], to: ['91-35-j27-1'] }],
      },
    ]);
    expect(plan.lines.skipped.map(skip => skip.field)).toEqual(['display_name']);
  });

  it('compares lists by value, not by identity', () => {
    const state = seeded();
    state.lines[0] = storedLine({ ...IR35, operators: ['BLS AG', 'SBB'] });

    expect(planReconcile(FEED, state).lines.unchanged).toBe(2);
  });

  it('plans the next year’s feed as inserts, updates, flags and skips', () => {
    const state = seeded();
    state.lines[1] = storedLine(
      { ...S12, display_name: 'S12 Wil' },
      {
        edited_fields: ['display_name'],
      },
    );
    const IR36 = { ...IR35, id: 'fernverkehr:IR36', display_name: 'IR36' };
    const next: Feed = {
      lines: [IR36, { ...S12, trips_per_week: 690 }],
      stops: [stop(IR36, 1, 'Bern'), stop(S12, 1, 'Brugg'), stop(S12, 2, 'Baden')],
    };

    const plan = planReconcile(next, state);

    expect(plan.lines.inserts.map(line => line.id)).toEqual(['fernverkehr:IR36']);
    expect(plan.lines.updates.map(update => update.set)).toEqual([
      { trips_per_week: 690 },
    ]);
    expect(plan.lines.flagged).toEqual([
      { key: { id: 'fernverkehr:IR35' }, label: 'fernverkehr:IR35', name: 'IR35' },
    ]);
    expect(plan.lines.skipped.map(skip => skip.label)).toEqual(['s-bahn-zuerich:S12']);

    expect(plan.stops.inserts.map(row => [row.line_id, row.sequence])).toEqual([
      ['fernverkehr:IR36', 1],
      ['s-bahn-zuerich:S12', 2],
    ]);
    expect(plan.stops.updates.map(update => update.label)).toEqual([
      's-bahn-zuerich:S12 #1',
    ]);
    expect(plan.stops.flagged.map(target => target.key)).toEqual([
      { line_id: 'fernverkehr:IR35', sequence: 1 },
      { line_id: 'fernverkehr:IR35', sequence: 2 },
    ]);
  });

  it('flags a line’s stops in sequence order', () => {
    const stops = [2, 10, 9, 1].map(sequence => stop(IR35, sequence, `Stop ${sequence}`));
    const state: State = { lines: [], stops: stops.map(row => storedStop(row)) };

    const plan = planReconcile({ lines: [], stops: [] }, state);

    expect(plan.stops.flagged.map(target => target.key.sequence)).toEqual([1, 2, 9, 10]);
  });

  it('does not flag again a row an earlier reconcile flagged', () => {
    const state = seeded();
    state.lines[0] = storedLine(IR35, { missing_since: '2026-12-16' });
    const next: Feed = { lines: [S12], stops: [stop(S12, 1, 'Brugg AG')] };

    const plan = planReconcile(next, state);

    expect(plan.lines.flagged).toEqual([]);
    expect(plan.lines.stillMissing).toBe(1);
  });

  it('clears the flag on a row that is back, and updates it like any other', () => {
    const state = seeded();
    state.lines[0] = storedLine(
      { ...IR35, trips_per_week: 10 },
      { missing_since: '2026-12-16' },
    );

    const plan = planReconcile(FEED, state);

    expect(plan.lines.restored).toEqual([
      { key: { id: 'fernverkehr:IR35' }, label: 'fernverkehr:IR35', name: 'IR35' },
    ]);
    expect(plan.lines.updates.map(update => update.set)).toEqual([
      { trips_per_week: 196 },
    ]);
    expect(isEmpty(plan)).toBe(false);
  });

  it('refuses a feed with one key twice', () => {
    expect(() => planReconcile({ ...FEED, lines: [IR35, IR35] }, seeded())).toThrow(
      'lines.csv has fernverkehr:IR35 twice',
    );
  });
});
