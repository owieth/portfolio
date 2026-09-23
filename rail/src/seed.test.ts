import { beforeEach, describe, expect, it } from 'vitest';

import type { NamedLine } from './naming.ts';
import { seedLines } from './seed.ts';
import type { SeedLine } from './seed/funiculars.ts';

/**
 * Values rather than files: the step opens nothing, so its fixture is two named
 * feed lines either side of the Gelmerbahn by id, and the seed entry itself.
 */
function feedLine(id: string, category: NamedLine['category'], stations: string[]): NamedLine {
  return {
    id,
    category,
    number: null,
    region: id.slice(0, id.indexOf(':')),
    terminals: null,
    operators: ['Operator'],
    routeIds: [`route-${id}`],
    stations,
    name: id,
    nameSource: 'derived',
    review: [],
  };
}

const POLYBAHN = feedLine('poly-bahn-zuerich:FUN-24', 'FUN', ['8503098', '8503099']);
const HASLIBERG = feedLine('zentralbahn:R:8508480-8508485', 'R', ['8508480', '8508485']);

const GELMERBAHN: SeedLine = {
  id: 'kwo-seilbahnen:FUN:8531013-8531014',
  name: 'Gelmerbahn',
  operator: 'KWO Seilbahnen',
  category: 'FUN',
  stops: [
    { didok: '8531014', name: 'Gelmersee', lat: 46.614439, lon: 8.320473 },
    { didok: '8531013', name: 'Handegg', lat: 46.613585, lon: 8.308709 },
  ],
};

let logged: string[];

const log = (message: string): void => {
  logged.push(message);
};

beforeEach(() => {
  logged = [];
});

describe('seedLines', () => {
  it('marks every line with where it came from and counts the manual ones', () => {
    const seeded = seedLines([POLYBAHN, HASLIBERG], [GELMERBAHN], log);

    expect(seeded.manual).toBe(1);
    expect(seeded.lines.map(line => [line.id, line.source])).toEqual([
      ['kwo-seilbahnen:FUN:8531013-8531014', 'manual'],
      ['poly-bahn-zuerich:FUN-24', 'feed'],
      ['zentralbahn:R:8508480-8508485', 'feed'],
    ]);
  });

  it('builds a line from the seed with nothing the feed would have supplied', () => {
    const [line] = seedLines([], [GELMERBAHN], log).lines;

    expect(line).toEqual({
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
      stops: GELMERBAHN.stops,
    });
  });

  it('has no terminals when an end has no Didok number', () => {
    const stops = [GELMERBAHN.stops[0]!, { name: 'Handegg', lat: 46.613585, lon: 8.308709 }];
    const [line] = seedLines([], [{ ...GELMERBAHN, stops }], log).lines;

    expect(line?.terminals).toBeNull();
    expect(line?.stations).toEqual(['8531014']);
  });

  it('refuses a seeded id the feed already has', () => {
    const clash = { ...GELMERBAHN, id: POLYBAHN.id };

    expect(() => seedLines([POLYBAHN], [clash], log)).toThrow(
      'data/funiculars.json seeds poly-bahn-zuerich:FUN-24, which the feed already has; remove it from the seed file',
    );
  });

  it('reports a seeded line the feed now serves under the same category', () => {
    const gained = feedLine('kwo-seilbahnen:FUN-2380', 'FUN', ['8531013', '8531014']);
    const seeded = seedLines([gained], [GELMERBAHN], log);

    expect(seeded.inFeed).toEqual(['kwo-seilbahnen:FUN:8531013-8531014']);
    expect(logged).toContain(
      'seeded line kwo-seilbahnen:FUN:8531013-8531014 stops where a feed line of its category now stops; if the feed has it, remove it from data/funiculars.json',
    );
  });

  it('ignores a shared stop under another category', () => {
    const bus = feedLine('postauto:R:8531013-8531099', 'R', ['8531013', '8531099']);

    expect(seedLines([bus], [GELMERBAHN], log).inFeed).toEqual([]);
  });

  it('gives the same fingerprint on two runs', () => {
    const first = seedLines([POLYBAHN], [GELMERBAHN], log).fingerprint;
    const second = seedLines([POLYBAHN], [GELMERBAHN], log).fingerprint;

    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(second).toBe(first);
  });

  it('logs the count and names the seeded lines', () => {
    const { fingerprint } = seedLines([POLYBAHN], [GELMERBAHN], log);

    expect(logged).toEqual([
      `1 line seeded by hand from data/funiculars.json, fingerprint ${fingerprint}: kwo-seilbahnen:FUN:8531013-8531014 "Gelmerbahn"`,
    ]);
  });
});
