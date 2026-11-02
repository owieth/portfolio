import { describe, expect, it } from 'vitest';

import {
  OLD_ROUTES,
  oldRouteBetween,
  oldRoutesOn,
  type OldRoute,
} from '@/lib/stats/rail/old-routes';

const ROUTE: OldRoute = {
  name: 'Test',
  until: '2020-12-12',
  via: 'test:S1',
  stops: ['8500001', '8500002', '8500003', '8500004'],
};

describe('oldRoutesOn', () => {
  it('keeps a route up to and including its last day', () => {
    expect(oldRoutesOn('2020-12-12', [ROUTE])).toEqual([ROUTE]);
    expect(oldRoutesOn('2020-12-13', [ROUTE])).toEqual([]);
  });

  it('has the Ceneri and the Gotthard open in 2010, and neither now', () => {
    expect(oldRoutesOn('2010-06-16').map(({ name }) => name)).toEqual([
      'Monte Ceneri',
      'Gotthard',
    ]);
    expect(oldRoutesOn('2026-11-02')).toEqual([]);
    expect(OLD_ROUTES).toHaveLength(2);
  });
});

describe('oldRouteBetween', () => {
  it('lists the stations between two stops, both included', () => {
    expect(oldRouteBetween([ROUTE], '8500001', '8500003')).toEqual({
      via: 'test:S1',
      stops: ['8500001', '8500002', '8500003'],
    });
  });

  it('runs the stations the way the ride went', () => {
    expect(oldRouteBetween([ROUTE], '8500004', '8500002')?.stops).toEqual([
      '8500004',
      '8500003',
      '8500002',
    ]);
  });

  it('is null unless the route has both ends', () => {
    expect(oldRouteBetween([ROUTE], '8500001', '8599999')).toBeNull();
    expect(oldRouteBetween([ROUTE], '8500002', '8500002')).toBeNull();
    expect(oldRouteBetween([], '8500001', '8500002')).toBeNull();
  });
});
