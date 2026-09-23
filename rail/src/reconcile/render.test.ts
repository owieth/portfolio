import { describe, expect, it } from 'vitest';

import { IR35, S12, stop, storedLine, storedStop } from './fixtures.ts';
import { planReconcile } from './plan.ts';
import { renderReconcile } from './render.ts';
import type { Feed, State } from './rows.ts';

const FEED: Feed = { lines: [IR35], stops: [stop(IR35, 1, 'Bern')] };

const SEEDED: State = {
  lines: [storedLine(IR35)],
  stops: [storedStop(stop(IR35, 1, 'Bern'))],
};

describe('renderReconcile', () => {
  it('says nothing is to be written when the feed matches', () => {
    const markdown = renderReconcile(planReconcile(FEED, SEEDED), { applied: false });

    expect(markdown).toContain('# Rail lines — reconcile (dry run)');
    expect(markdown).toContain('Nothing has been written.');
    expect(markdown).toContain('Nothing to write.');
    expect(markdown).not.toContain('## ');
  });

  it('counts each kind of change per table', () => {
    const next: Feed = { lines: [S12], stops: [stop(S12, 1, 'Brugg AG')] };
    const markdown = renderReconcile(planReconcile(next, SEEDED), { applied: true });

    expect(markdown).toContain('# Rail lines — reconcile\n');
    expect(markdown).toContain('The changes below have been written.');
    expect(markdown).toContain('| Lines | 1 | 0 | 1 | 0 | 0 | 0 | 0 |');
    expect(markdown).toContain('| Line stops | 1 | 0 | 1 | 0 | 0 | 0 | 0 |');
  });

  it('lists new and flagged lines for review, and stops per line', () => {
    const next: Feed = { lines: [S12], stops: [stop(S12, 1, 'Brugg AG')] };
    const markdown = renderReconcile(planReconcile(next, SEEDED), { applied: false });

    expect(markdown).toContain('## New lines (1)');
    expect(markdown).toContain(
      '| `s-bahn-zuerich:S12` | S12 | `S` | s-bahn-zuerich | Brugg AG – Wil SG |',
    );
    expect(markdown).toContain('## Flagged missing (1)');
    expect(markdown).toContain('| `fernverkehr:IR35` | IR35 |');
    expect(markdown).toContain('| `fernverkehr:IR35` | 0 | 0 | 1 |');
    expect(markdown).toContain('| `s-bahn-zuerich:S12` | 1 | 0 | 0 |');
  });

  it('shows an edit the feed disagrees with next to the feed’s value', () => {
    const state: State = {
      ...SEEDED,
      lines: [
        storedLine({ ...IR35, operators: ['BLS'] }, { edited_fields: ['operators'] }),
      ],
    };
    const markdown = renderReconcile(planReconcile(FEED, state), { applied: false });

    expect(markdown).toContain('## Skipped because edited (1)');
    expect(markdown).toContain(
      '| `fernverkehr:IR35` | `operators` | ["BLS"] | ["BLS AG","SBB"] |',
    );
  });

  it('names the fields an update writes', () => {
    const next: Feed = {
      ...FEED,
      lines: [{ ...IR35, trips_per_week: 200, seasonal: true }],
    };
    const markdown = renderReconcile(planReconcile(next, SEEDED), { applied: false });

    expect(markdown).toContain(
      '| `fernverkehr:IR35` | IR35 | `seasonal`, `trips_per_week` |',
    );
  });
});
