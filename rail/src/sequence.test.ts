import { beforeEach, describe, expect, it } from 'vitest';

import type { Pattern } from './patterns.ts';
import type { FeedLine, ManualLine } from './seed.ts';
import { sequenceLines } from './sequence.ts';

/**
 * Values rather than a feed on disk: the step opens nothing, so its fixture is
 * what the seed and patterns steps would have handed it. The `IR35` is two
 * routes of two operators that run one stop list between them and a branch; the
 * Gelmerbahn is the hand-written line that has no patterns at all.
 */
const [BERN, OLTEN, AARAU, ZUERICH, BASEL] = ['8507000', '8500218', '8502113', '8503000', '8500010'];

function feedLine(id: string, routeIds: string[], stations: string[]): FeedLine {
  return {
    id,
    category: 'IR',
    number: 'IR35',
    region: 'fernverkehr',
    terminals: null,
    operators: ['BLS', 'SBB'],
    routeIds,
    stations: [...stations].sort(),
    name: 'IR35',
    nameSource: 'number',
    review: [],
    source: 'feed',
  };
}

const IR35 = feedLine('fernverkehr:IR35', ['bls', 'sbb'], [BERN, OLTEN, AARAU, ZUERICH, BASEL]);

const GELMERBAHN: ManualLine = {
  id: 'kwo-seilbahnen:FUN:8531013-8531014',
  category: 'FUN',
  number: null,
  region: 'kwo-seilbahnen',
  terminals: ['8531013', '8531014'],
  operators: ['KWO Seilbahnen'],
  routeIds: [],
  stations: ['8531013', '8531014'],
  name: 'Gelmerbahn',
  nameSource: 'manual',
  review: [],
  source: 'manual',
  stops: [
    { didok: '8531014', name: 'Gelmersee', lat: 46.614439, lon: 8.320473 },
    { didok: '8531013', name: 'Handegg', lat: 46.613585, lon: 8.308709 },
  ],
};

const TO_BERN = [ZUERICH, AARAU, OLTEN, BERN];

const PATTERNS: Pattern[] = [
  { routeId: 'bls', hash: 'toBern', stations: TO_BERN, trips: 10, runs: 200 },
  { routeId: 'sbb', hash: 'toBern', stations: TO_BERN, trips: 6, runs: 150 },
  { routeId: 'sbb', hash: 'toZuerich', stations: [...TO_BERN].reverse(), trips: 5, runs: 300 },
  { routeId: 'sbb', hash: 'fromBasel', stations: [BASEL, OLTEN], trips: 5, runs: 40 },
  { routeId: 'elsewhere', hash: 'elsewhere', stations: [BERN, BASEL], trips: 5, runs: 999 },
];

let logged: string[];

const log = (message: string): void => {
  logged.push(message);
};

beforeEach(() => {
  logged = [];
});

describe('sequenceLines', () => {
  it('orders a line from every pattern of every route merged into it', () => {
    const [line] = sequenceLines({ lines: [IR35], patterns: PATTERNS, stations: [] }, log).lines;

    expect(line?.source === 'feed' ? line.sequence : null).toEqual([
      { didok: ZUERICH, via: 'backbone', junction: null },
      { didok: AARAU, via: 'backbone', junction: null },
      { didok: OLTEN, via: 'backbone', junction: null },
      { didok: BERN, via: 'backbone', junction: null },
      { didok: BASEL, via: 'branch', junction: OLTEN },
    ]);
  });

  it('keeps every distinct pattern, pooled across routes, with the way it runs', () => {
    const [line] = sequenceLines({ lines: [IR35], patterns: PATTERNS, stations: [] }, log).lines;

    expect(
      line?.source === 'feed'
        ? line.patterns.map(({ hash, trips, runs, reversed }) => [hash, trips, runs, reversed])
        : null,
    ).toEqual([
      ['toBern', 16, 350, false],
      ['toZuerich', 5, 300, true],
      ['fromBasel', 5, 40, true],
    ]);
  });

  it('passes a hand-written line through untouched', () => {
    const { lines } = sequenceLines({ lines: [IR35, GELMERBAHN], patterns: PATTERNS, stations: [] }, log);

    expect(lines[1]).toBe(GELMERBAHN);
  });

  it('logs the branched lines and a fingerprint that two runs agree on', () => {
    const first = sequenceLines({ lines: [IR35, GELMERBAHN], patterns: PATTERNS, stations: [] }, log);
    const again = sequenceLines({ lines: [IR35, GELMERBAHN], patterns: [...PATTERNS].reverse(), stations: [] }, log);

    expect(again).toEqual(first);
    expect(first.branched).toEqual(['fernverkehr:IR35']);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(logged).toContain(
      `1 feed line put in order, 1 with a branch and 0 with a detour, fingerprint ${first.fingerprint}`,
    );
  });

  it('stops on a feed line with no pattern', () => {
    const orphan = feedLine('fernverkehr:IR99', ['gone'], [BERN, OLTEN]);

    expect(() => sequenceLines({ lines: [orphan], patterns: PATTERNS, stations: [] }, log)).toThrow(
      /line fernverkehr:IR99 reached the sequence step without a pattern/,
    );
  });

  it('stops when the sequence and the line disagree about its stations', () => {
    const short = feedLine('fernverkehr:IR35', ['bls', 'sbb'], [BERN, OLTEN, AARAU]);

    expect(() => sequenceLines({ lines: [short], patterns: PATTERNS, stations: [] }, log)).toThrow(
      /does not hold its stations once each — missing none, extra 8503000, 8500010/,
    );
  });
});
