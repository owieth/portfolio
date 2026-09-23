import { describe, expect, it } from 'vitest';

import { classify, SWISS_COUNTRY } from './switzerland.ts';

/** Zürich HB, Karlsruhe Hbf, and a bus stop in the Vorarlberg, from the 2026 feed. */
const ZUERICH = { didok: '8503000', lat: 47.3781762, lon: 8.54021154 };
const KARLSRUHE = { didok: '8014228', lat: 48.99351443, lon: 8.4021854 };
const DORNBIRN = { didok: '1200422', lat: 47.42018689, lon: 9.73854616 };

describe('classify', () => {
  it('keeps a station whose Didok number starts with the Swiss country code', () => {
    expect(classify(ZUERICH.didok, ZUERICH.lat, ZUERICH.lon)).toEqual({
      swiss: true,
      country: SWISS_COUNTRY,
      inBbox: true,
    });
  });

  it('drops a station with a foreign UIC country code', () => {
    expect(classify(KARLSRUHE.didok, KARLSRUHE.lat, KARLSRUHE.lon)).toEqual({
      swiss: false,
      country: '80',
      inBbox: false,
    });
  });

  /**
   * The box is a rectangle over four borders, so it contains Austrian and German
   * bus stops by construction. Being inside it is not a claim to be Swiss.
   */
  it('drops a foreign station the bounding box happens to contain', () => {
    expect(classify(DORNBIRN.didok, DORNBIRN.lat, DORNBIRN.lon)).toEqual({
      swiss: false,
      country: '12',
      inBbox: true,
    });
  });

  /**
   * The 2026 feed has none of these — this is the case the cross-check exists
   * for. The country code still decides; the position is what gets reported.
   */
  it('keeps a Swiss station that sits outside the box, and says the box disagreed', () => {
    expect(classify('8599999', 40.4168, -3.7038)).toEqual({
      swiss: true,
      country: SWISS_COUNTRY,
      inBbox: false,
    });
  });

  it('reports an unusable coordinate as no answer rather than as a false one', () => {
    expect(classify(ZUERICH.didok, null, null)).toEqual({
      swiss: true,
      country: SWISS_COUNTRY,
      inBbox: null,
    });
  });

  /**
   * Every Didok number in the feed is seven digits. A feed where one is not has
   * no country code to read, and has to arrive as a station this pipeline cannot
   * place rather than as one it quietly calls foreign.
   */
  it('has no country code to report when the Didok number is not seven digits', () => {
    for (const didok of ['85030', '085030000', 'ch:1:sloid:3000', '']) {
      expect(classify(didok, ZUERICH.lat, ZUERICH.lon)).toEqual({
        swiss: false,
        country: null,
        inBbox: true,
      });
    }
  });
});
