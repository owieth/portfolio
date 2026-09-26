import { describe, expect, it } from 'vitest';

import type { Ride } from './plan.ts';
import { renderRides } from './sql.ts';

const RIDES: Ride[] = [
  {
    lineId: 'fernverkehr:IR70',
    riddenOn: '2026-09-24',
    fromDidok: '8505000',
    toDidok: '8502204',
  },
  {
    lineId: 'fernverkehr:IR70',
    riddenOn: '2026-09-24',
    fromDidok: '8502204',
    toDidok: '8505000',
  },
];

const CONTEXT = {
  digest: 'a'.repeat(64),
  through: '2026-09-26',
  days: 1,
  byLine: new Map([['fernverkehr:IR70', 2]]),
};

describe('renderRides', () => {
  it('writes one insert ending on conflict do nothing, so it is safe to run twice', () => {
    const sql = renderRides(RIDES, CONTEXT);

    expect(sql.match(/insert into/g)).toHaveLength(1);
    expect(sql.trimEnd().endsWith('on conflict (id) do nothing;')).toBe(true);
  });

  it('records the export it came from and says the counts are estimates', () => {
    const sql = renderRides(RIDES, CONTEXT);

    expect(sql).toContain(`sha256 ${'a'.repeat(64)}`);
    expect(sql).toContain('1 office days through 2026-09-26');
    expect(sql).toContain('Count on the totals, not on a row.');
    expect(sql).toContain('      2  fernverkehr:IR70');
  });

  it('gives each ride an id derived from its own values', () => {
    const [out] = renderRides(RIDES, CONTEXT).matchAll(/\('([0-9a-f-]{36})'/g);
    const [again] = renderRides(RIDES, CONTEXT).matchAll(/\('([0-9a-f-]{36})'/g);

    expect(out[1]).toBe(again[1]);
    expect(out[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('gives the two directions of one day different ids', () => {
    const ids = [...renderRides(RIDES, CONTEXT).matchAll(/\('([0-9a-f-]{36})'/g)].map(
      match => match[1],
    );

    expect(new Set(ids).size).toBe(2);
  });
});
