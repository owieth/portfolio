import { describe, expect, it } from 'vitest';

import { toCsv } from '../emit/csv.ts';
import { parseCsv } from './csv.ts';

describe('parseCsv', () => {
  it('keys each row by the header', () => {
    expect(parseCsv('id,trips\na,1\nb,2\n')).toEqual([
      { id: 'a', trips: '1' },
      { id: 'b', trips: '2' },
    ]);
  });

  it('reads an empty field as null', () => {
    expect(parseCsv('a,b,c\n,x,\n')).toEqual([{ a: null, b: 'x', c: null }]);
  });

  it('unquotes a field and undoubles its quotes', () => {
    expect(
      parseCsv('comma,quote,newline\n"Brig, Bahnhof","Le ""Train""","a\nb"\n'),
    ).toEqual([{ comma: 'Brig, Bahnhof', quote: 'Le "Train"', newline: 'a\nb' }]);
  });

  it('reads a quoted empty field as an empty string, not null', () => {
    expect(parseCsv('a\n""\n')).toEqual([{ a: '' }]);
  });

  it('reads the last row without a trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([{ a: '1', b: '2' }]);
  });

  it('reads \\r\\n line ends as \\n', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('reads nothing from an empty file or a header alone', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b\n')).toEqual([]);
  });

  it('rejects a row with the wrong number of fields', () => {
    expect(() => parseCsv('a,b\n1\n')).toThrow('row 2 has 1 fields where the header has 2');
  });

  it('rejects a quoted field that never closes', () => {
    expect(() => parseCsv('a\n"open\n')).toThrow('ends inside a quoted field');
  });

  it('reads back what toCsv writes', () => {
    const rows = [
      { id: 'fernverkehr:IR35', name: 'Brig, Bahnhof', note: 'Le "Train"', empty: null },
      { id: 's-bahn-zuerich:S12', name: 'Zürich HB', note: 'a\nb', empty: null },
    ];

    expect(parseCsv(toCsv(['id', 'name', 'note', 'empty'], rows))).toEqual(rows);
  });
});
