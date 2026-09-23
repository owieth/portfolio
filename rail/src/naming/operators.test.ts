import { describe, expect, it } from 'vitest';

import { loadOperators, parseOperators, verifyOperators } from './operators.ts';

const RHB = { id: '72', name: 'Rhätische Bahn', short: 'RhB' };
const POLYBAHN = { id: '165', name: 'Poly-Bahn Zürich', short: 'Polybahn', note: 'why' };

describe('parseOperators', () => {
  it('accepts a well-formed file', () => {
    expect(parseOperators({ operators: [RHB, POLYBAHN] }, 'operators.json')).toEqual([
      RHB,
      POLYBAHN,
    ]);
  });

  it('rejects a file without an operators list', () => {
    expect(() => parseOperators({ operator: [] }, 'operators.json')).toThrow(
      'operators.json must be an object with an "operators" list',
    );
  });

  it('reports every problem at once', () => {
    const json = {
      operators: [
        { id: '72', name: 'Rhätische Bahn' },
        { id: '72', name: 'Rhätische Bahn', short: 'RhB', colour: 'red' },
        'RhB',
      ],
    };

    expect(() => parseOperators(json, 'operators.json')).toThrow(
      [
        'operators.json: operator 1 needs "short" as text',
        'operators.json: operator 2 has an unknown key "colour"',
        'operators.json: operator 2 repeats agency_id 72',
        'operators.json: operator 3 is not an object',
      ].join('\n'),
    );
  });
});

describe('verifyOperators', () => {
  it('has nothing to say when every entry matches the feed', () => {
    expect(
      verifyOperators([RHB], [{ agencyId: '72', operator: 'Rhätische Bahn' }]),
    ).toEqual([]);
  });

  it('reports a name the feed spells differently', () => {
    expect(
      verifyOperators([RHB], [{ agencyId: '72', operator: 'Rhaetische Bahn' }]),
    ).toEqual(['operator 72 is Rhaetische Bahn in the feed, not Rhätische Bahn']);
  });

  it('reports an entry for an operator that runs nothing in the feed', () => {
    expect(verifyOperators([POLYBAHN], [{ agencyId: null, operator: '165' }])).toEqual([
      'operator 165 Poly-Bahn Zürich runs no allowed route in this feed; it may be stale',
    ]);
  });
});

describe('data/operators.json', () => {
  it('parses', async () => {
    await expect(loadOperators()).resolves.toEqual(expect.any(Array));
  });
});
