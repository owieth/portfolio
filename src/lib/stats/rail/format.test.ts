import { describe, expect, it } from 'vitest';

import { formatShare } from '@/lib/stats/rail/format';

describe('formatShare', () => {
  it('prints nothing ridden as 0%', () => {
    expect(formatShare(0, 10)).toBe('0%');
  });

  it('floors a share rather than rounding it', () => {
    expect(formatShare(409, 1000)).toBe('40%');
  });

  it('never rounds a share up to 100%', () => {
    expect(formatShare(299, 300)).toBe('99%');
  });

  it('prints every stop as 100%', () => {
    expect(formatShare(3, 3)).toBe('100%');
  });

  it('prints an exact share as that percentage', () => {
    expect(formatShare(29, 100)).toBe('29%');
    expect(formatShare(57, 100)).toBe('57%');
    expect(formatShare(29, 50)).toBe('58%');
  });

  it('prints every exact share up to 300 stops exactly', () => {
    const mismatches: string[] = [];

    for (let stops = 1; stops <= 300; stops++) {
      for (let covered = 0; covered <= stops; covered++) {
        if ((100 * covered) % stops !== 0) continue;

        const printed = formatShare(covered, stops);
        if (printed !== `${(100 * covered) / stops}%`) {
          mismatches.push(`${covered}/${stops} → ${printed}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
