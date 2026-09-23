import { describe, expect, it } from 'vitest';

import { loadFunicularSeed, parseFunicularSeed } from './funiculars.ts';

const GELMERBAHN = {
  id: 'kwo-seilbahnen:FUN:8531013-8531014',
  name: 'Gelmerbahn',
  operator: 'KWO Seilbahnen',
  category: 'FUN',
  stops: [
    { didok: '8531013', name: 'Handegg', lat: 46.613585, lon: 8.308709 },
    { didok: '8531014', name: 'Gelmersee', lat: 46.614439, lon: 8.320473 },
  ],
  note: 'why',
};

describe('parseFunicularSeed', () => {
  it('accepts a well-formed file', () => {
    expect(parseFunicularSeed({ funiculars: [GELMERBAHN] }, 'funiculars.json')).toEqual([
      GELMERBAHN,
    ]);
  });

  it('accepts a stop without a Didok number', () => {
    const stops = [GELMERBAHN.stops[0], { name: 'Gelmersee', lat: 46.614439, lon: 8.320473 }];

    expect(
      parseFunicularSeed({ funiculars: [{ ...GELMERBAHN, stops }] }, 'funiculars.json'),
    ).toHaveLength(1);
  });

  it('rejects a file without a funiculars list', () => {
    expect(() => parseFunicularSeed({ funicular: [] }, 'funiculars.json')).toThrow(
      'funiculars.json must be an object with a "funiculars" list',
    );
  });

  it('reports every problem at once', () => {
    const json = {
      funiculars: [
        { ...GELMERBAHN, id: 'Gelmerbahn', category: 'PB', colour: 'red' },
        {
          ...GELMERBAHN,
          operator: '',
          stops: [
            { didok: '8031013', name: 'Handegg', lat: 46.6, lon: 8.3 },
            { name: 'Lyon', lat: 45.76, lon: 4.83 },
            'Gelmersee',
          ],
        },
        { ...GELMERBAHN, stops: [GELMERBAHN.stops[0]] },
        'Gelmerbahn',
      ],
    };

    expect(() => parseFunicularSeed(json, 'funiculars.json')).toThrow(
      [
        'funiculars.json: funicular 1 has an unknown key "colour"',
        'funiculars.json: funicular 1 has id "Gelmerbahn", which is not region:… in a line id\'s characters',
        'funiculars.json: funicular 1 has category "PB", which is not one you can ride',
        'funiculars.json: funicular 2 needs "operator" as text',
        'funiculars.json: funicular 2 stop 1 has "didok" "8031013", which is not a Swiss Didok number',
        'funiculars.json: funicular 2 stop 2 is at 45.76, 4.83, which is not in Switzerland',
        'funiculars.json: funicular 2 stop 3 is not an object',
        'funiculars.json: funicular 3 needs "stops" as a list of at least two',
        'funiculars.json: funicular 3 repeats id kwo-seilbahnen:FUN:8531013-8531014',
        'funiculars.json: funicular 4 is not an object',
      ].join('\n'),
    );
  });
});

describe('loadFunicularSeed', () => {
  it('reads the committed seed file', async () => {
    const seed = await loadFunicularSeed();

    expect(seed.map(line => line.name)).toContain('Gelmerbahn');
  });
});
