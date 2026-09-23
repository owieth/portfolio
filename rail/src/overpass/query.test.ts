import { describe, expect, it } from 'vitest';

import { buildQuery, queryKey } from './query.ts';

describe('buildQuery', () => {
  it('asks for one route type, inside Switzerland, with geometry inline', () => {
    expect(buildQuery('funicular')).toBe(
      [
        '[out:json][timeout:900];',
        'area["ISO3166-1"="CH"][admin_level=2]->.ch;',
        'relation["type"="route"]["route"="funicular"](area.ch);',
        'out body geom;',
      ].join('\n'),
    );
  });

  it('gives each route type a query of its own', () => {
    expect(buildQuery('train')).toContain('["route"="train"]');
    expect(buildQuery('train')).not.toContain('funicular');
  });
});

describe('queryKey', () => {
  it('is 16 hex characters and a function of the query alone', () => {
    const key = queryKey(buildQuery('train'));

    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(queryKey(buildQuery('train'))).toBe(key);
  });

  // An edited query must never be answered by the cache entry of the old one.
  it('changes with the query', () => {
    expect(queryKey(buildQuery('train'))).not.toBe(queryKey(buildQuery('funicular')));
  });
});
