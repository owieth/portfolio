import { describe, expect, it } from 'vitest';

import { parseDiffOptions } from './options.ts';

describe('parseDiffOptions', () => {
  it('compares against HEAD by default', () => {
    expect(parseDiffOptions({})).toEqual({ ok: true, value: { base: 'HEAD' } });
  });

  it('takes any other ref', () => {
    expect(parseDiffOptions({ base: 'origin/main' })).toEqual({
      ok: true,
      value: { base: 'origin/main' },
    });
  });

  it('rejects --base without a value', () => {
    expect(parseDiffOptions({ base: true })).toEqual({
      ok: false,
      error: '--base needs a value',
    });
  });

  it('rejects --base given twice', () => {
    expect(parseDiffOptions({ base: ['HEAD', 'main'] })).toEqual({
      ok: false,
      error: '--base was given more than once',
    });
  });

  it('rejects a ref git would read as an option', () => {
    expect(parseDiffOptions({ base: '--output=x' })).toEqual({
      ok: false,
      error: '--base --output=x is not a git ref',
    });
  });
});
