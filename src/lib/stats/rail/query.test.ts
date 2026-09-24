import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tables } from '@/lib/supabase/database.types';
import { getSupabaseClient } from '@/lib/supabase/server';

import { loadRail } from './query';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseClient: vi.fn() }));

type Table = 'rail_lines' | 'rail_line_stops' | 'rail_rides';

type Response = { data: unknown[] | null; error: { message: string } | null };

/**
 * A stand-in for the `supabase-js` builder, as far as `loadRail` walks it:
 * `from → select → order… → range`. Each table answers a range from its rows,
 * sliced the way PostgREST would, capped at `cap` rows per response the way
 * `max_rows` caps it.
 */
function fakeClient(
  tables: Partial<Record<Table, unknown[] | Error | { message: string }>>,
  cap = 1000,
) {
  const ranges: Record<Table, [number, number][]> = {
    rail_lines: [],
    rail_line_stops: [],
    rail_rides: [],
  };

  const from = (table: Table) => {
    const builder = {
      select: () => builder,
      order: () => builder,
      range: async (start: number, end: number): Promise<Response> => {
        ranges[table].push([start, end]);
        const source = tables[table] ?? [];

        if (source instanceof Error) throw source;
        if (!Array.isArray(source)) return { data: null, error: source };

        return {
          data: source.slice(start, Math.min(end + 1, start + cap)),
          error: null,
        };
      },
    };

    return builder;
  };

  vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

  return ranges;
}

const line: Tables<'rail_lines'> = {
  id: 'fernverkehr:IR35',
  display_name: 'IR35',
  category: 'IR',
  network_region: 'fernverkehr',
  operators: ['BLS AG'],
  terminal_a: 'Bern',
  terminal_b: 'Luzern',
  true_terminal_a: 'Bern',
  true_terminal_b: 'Luzern',
  route_ids: ['91-35-Y-j26-1'],
  seasonal: false,
  trips_per_week: 112,
  has_geometry: true,
  missing_since: null,
  edited_fields: [],
  created_at: '2026-09-23T16:37:03Z',
};

const stop = (sequence: number): Tables<'rail_line_stops'> => ({
  line_id: 'fernverkehr:IR35',
  sequence,
  stop_name: `Stop ${sequence}`,
  sloid: 'ch:1:sloid:7000',
  didok: '8507000',
  lat: 46.94,
  lon: 7.44,
  via: 'backbone',
  junction: null,
  missing_since: null,
  edited_fields: [],
});

const ride: Tables<'rail_rides'> = {
  id: '6f1c2b8e-0000-4000-8000-000000000001',
  line_id: 'fernverkehr:IR35',
  ridden_on: '2026-09-20',
  from_didok: '8507000',
  to_didok: '8505000',
  created_at: '2026-09-24T09:49:19Z',
};

const empty = { lines: [], stops: [], rides: [] };

describe('loadRail', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset();
  });

  it('reports an unset env as unconfigured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    expect(await loadRail()).toEqual({ configured: false, ...empty });
  });

  it('returns empty tables as an empty result', async () => {
    fakeClient({});

    expect(await loadRail()).toEqual({ configured: true, ...empty });
  });

  it('empties every table when one read fails', async () => {
    fakeClient({
      rail_lines: [line],
      rail_line_stops: { message: 'permission denied' },
      rail_rides: [ride],
    });

    expect(await loadRail()).toEqual({
      configured: true,
      error: 'permission denied',
      ...empty,
    });
  });

  it('reports a thrown request as unreachable', async () => {
    fakeClient({ rail_lines: new TypeError('fetch failed') });

    expect(await loadRail()).toEqual({
      configured: true,
      error: 'unreachable',
      ...empty,
    });
  });

  it('renames rows onto the domain types', async () => {
    fakeClient({
      rail_lines: [line],
      rail_line_stops: [stop(1)],
      rail_rides: [ride],
    });

    expect(await loadRail()).toEqual({
      configured: true,
      lines: [
        {
          id: 'fernverkehr:IR35',
          displayName: 'IR35',
          category: 'IR',
          networkRegion: 'fernverkehr',
          operators: ['BLS AG'],
          terminalA: 'Bern',
          terminalB: 'Luzern',
          trueTerminalA: 'Bern',
          trueTerminalB: 'Luzern',
          seasonal: false,
          tripsPerWeek: 112,
          hasGeometry: true,
          missingSince: null,
        },
      ],
      stops: [
        {
          lineId: 'fernverkehr:IR35',
          sequence: 1,
          stopName: 'Stop 1',
          sloid: 'ch:1:sloid:7000',
          didok: '8507000',
          lat: 46.94,
          lon: 7.44,
          via: 'backbone',
          junction: null,
          missingSince: null,
        },
      ],
      rides: [
        {
          id: '6f1c2b8e-0000-4000-8000-000000000001',
          lineId: 'fernverkehr:IR35',
          riddenOn: '2026-09-20',
          fromDidok: '8507000',
          toDidok: '8505000',
        },
      ],
    });
  });

  it('pages past the row limit until every stop is back', async () => {
    const stops = Array.from({ length: 6081 }, (_, i) => stop(i + 1));
    const ranges = fakeClient({ rail_line_stops: stops });

    const result = await loadRail();

    expect(result.stops.map((s) => s.sequence)).toEqual(
      stops.map((s) => s.sequence),
    );
    expect(ranges.rail_line_stops).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
      [5000, 5999],
      [6000, 6999],
      [6081, 7080],
    ]);
  });

  it('skips no rows when the server caps below the page size', async () => {
    const stops = Array.from({ length: 1200 }, (_, i) => stop(i + 1));
    const ranges = fakeClient({ rail_line_stops: stops }, 500);

    const result = await loadRail();

    expect(result.stops).toHaveLength(1200);
    expect(ranges.rail_line_stops.map(([start]) => start)).toEqual([
      0, 500, 1000, 1200,
    ]);
  });
});
