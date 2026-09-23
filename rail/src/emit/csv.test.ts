import { describe, expect, it } from 'vitest';

import { list, toCsv } from './csv.ts';

describe('toCsv', () => {
  it('writes a header, one line per row and a newline after the last', () => {
    expect(
      toCsv(
        ['id', 'trips'],
        [
          { id: 'a', trips: 1 },
          { id: 'b', trips: 2 },
        ],
      ),
    ).toBe('id,trips\na,1\nb,2\n');
  });

  it('quotes only a field that has to be quoted, and doubles its quotes', () => {
    const csv = toCsv(
      ['plain', 'comma', 'quote', 'newline'],
      [
        {
          plain: 'Zürich HB',
          comma: 'Brig, Bahnhof',
          quote: 'Le "Train"',
          newline: 'a\nb',
        },
      ],
    );

    expect(csv).toBe(
      'plain,comma,quote,newline\nZürich HB,"Brig, Bahnhof","Le ""Train""","a\nb"\n',
    );
  });

  it('writes null as an empty field and booleans as words', () => {
    expect(toCsv(['a', 'b', 'c'], [{ a: null, b: true, c: false }])).toBe(
      'a,b,c\n,true,false\n',
    );
  });

  it('keeps the columns in header order, not in the row’s key order', () => {
    expect(toCsv(['b', 'a'], [{ a: 1, b: 2 }])).toBe('b,a\n2,1\n');
  });

  it('writes numbers the way JSON does', () => {
    expect(toCsv(['lat'], [{ lat: 46.614439 }, { lat: 47 }])).toBe(
      'lat\n46.614439\n47\n',
    );
  });
});

describe('list', () => {
  it('joins values with a semicolon', () => {
    expect(
      list(['BLS AG', 'Schweizerische Bundesbahnen SBB'], 'operators'),
    ).toBe('BLS AG;Schweizerische Bundesbahnen SBB');
  });

  it('refuses a value that holds the separator', () => {
    expect(() => list(['a;b'], 'operators')).toThrow(
      /operators value "a;b" contains ";"/,
    );
  });
});
