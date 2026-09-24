import { describe, expect, it } from 'vitest';

import { mapLines } from '@/lib/stats/rail/map';
import type { RailLine, RailLineProgress } from '@/lib/stats/rail/types';

const line = (
  id: string,
  displayName: string,
  hasGeometry = true,
): RailLine => ({
  id,
  displayName,
  category: 'S',
  networkRegion: 'test',
  operators: ['SBB'],
  terminalA: 'A',
  terminalB: 'B',
  trueTerminalA: 'A',
  trueTerminalB: 'B',
  seasonal: false,
  tripsPerWeek: 100,
  hasGeometry,
  missingSince: null,
});

const progress = (
  railLine: RailLine,
  covered: number,
  stops: number,
): RailLineProgress => ({
  line: railLine,
  stops,
  covered,
  share: stops === 0 ? 0 : covered / stops,
  touched: covered > 0,
  complete: stops > 0 && covered === stops,
});

describe('mapLines', () => {
  it('leaves out lines with no geometry', () => {
    const lines = mapLines([
      progress(line('test:S1', 'S1'), 0, 4),
      progress(line('test:S2', 'S2', false), 2, 4),
    ]);

    expect(lines.map(({ id }) => id)).toEqual(['test:S1']);
  });

  it('names a line by its number and terminals', () => {
    const [s1] = mapLines([progress(line('test:S1', 'S1'), 0, 4)]);

    expect(s1.name).toBe('S1 · A – B');
  });

  it('sorts numbers as numbers, then by id', () => {
    const lines = mapLines([
      progress(line('test:S10', 'S10'), 0, 4),
      progress(line('b:S2', 'S2'), 0, 4),
      progress(line('a:S2', 'S2'), 0, 4),
    ]);

    expect(lines.map(({ id }) => id)).toEqual(['a:S2', 'b:S2', 'test:S10']);
  });

  it('describes a line nobody has ridden', () => {
    const [s1] = mapLines([progress(line('test:S1', 'S1'), 0, 4)]);

    expect(s1).toMatchObject({ touched: false, detail: 'Not ridden yet' });
  });

  it('describes a partly ridden line', () => {
    const [s1] = mapLines([progress(line('test:S1', 'S1'), 4, 10)]);

    expect(s1).toMatchObject({ touched: true, detail: '4 of 10 stops · 40%' });
  });

  it('never rounds a line up to 100%', () => {
    const [s1] = mapLines([progress(line('test:S1', 'S1'), 249, 250)]);

    expect(s1.detail).toBe('249 of 250 stops · 99%');
  });

  it('describes a complete line as 100%', () => {
    const [s1] = mapLines([progress(line('test:S1', 'S1'), 3, 3)]);

    expect(s1.detail).toBe('3 of 3 stops · 100%');
  });

  it('describes a touched line with no stops', () => {
    const [s1] = mapLines([
      { ...progress(line('test:S1', 'S1'), 0, 0), touched: true },
    ]);

    expect(s1.detail).toBe('Ridden');
  });
});
