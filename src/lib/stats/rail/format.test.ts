import { describe, expect, it } from 'vitest';

import { formatShare } from '@/lib/stats/rail/format';

describe('formatShare', () => {
  it('prints nothing ridden as 0%', () => {
    expect(formatShare(0)).toBe('0%');
  });

  it('floors a share rather than rounding it', () => {
    expect(formatShare(0.409)).toBe('40%');
  });

  it('never rounds a share up to 100%', () => {
    expect(formatShare(299 / 300)).toBe('99%');
  });

  it('prints every stop as 100%', () => {
    expect(formatShare(1)).toBe('100%');
  });
});
