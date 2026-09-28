import { describe, expect, it } from 'vitest';

import { isInSchwyz } from '@/lib/wo-haere/geo/landesgrenze';

describe('isInSchwyz', () => {
  it.each([
    ['Bern', 46.948, 7.4474],
    ['Zürichsee', 47.27, 8.62],
    ['Genf', 46.2044, 6.1432],
    ['Basel', 47.5596, 7.5886],
  ])('puts %s inside', (_, lat, lon) => {
    expect(isInSchwyz({ lat, lon })).toBe(true);
  });

  it.each([
    ['Vaduz', 47.141, 9.5209],
    ['Evian', 46.4, 6.59],
    ['Paris', 48.8566, 2.3522],
  ])('puts %s outside', (_, lat, lon) => {
    expect(isInSchwyz({ lat, lon })).toBe(false);
  });

  it.each([
    ['Büsingen', 47.696, 8.69],
    ['Campione', 45.969, 8.971],
  ])('puts the %s enclave outside', (_, lat, lon) => {
    expect(isInSchwyz({ lat, lon })).toBe(false);
  });
});
