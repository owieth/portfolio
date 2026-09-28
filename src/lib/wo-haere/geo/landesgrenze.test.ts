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

});
