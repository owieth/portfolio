import { describe, expect, it } from 'vitest';

import { cell, table } from './markdown.ts';

describe('cell', () => {
  it('prints a dash for a value that is not there', () => {
    expect([null, undefined, ''].map(cell)).toEqual(['—', '—', '—']);
  });

  it('groups the thousands of a number', () => {
    expect(cell(830016)).toBe('830,016');
  });

  it('escapes a pipe, which would otherwise split the cell', () => {
    expect(cell('RER Fribourg | Freiburg')).toBe('RER Fribourg \\| Freiburg');
  });
});

describe('table', () => {
  it('writes a header, a rule and one row per row', () => {
    expect(table(['Line', 'Trips'], [['IR35', 1204], ['S12', null]])).toBe(
      ['| Line | Trips |', '| --- | --- |', '| IR35 | 1,204 |', '| S12 | — |'].join('\n'),
    );
  });

  it('says so instead of writing a header over nothing', () => {
    expect(table(['Line'], [])).toBe('_No rows._');
  });
});
