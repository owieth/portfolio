import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RAIL_DIR } from '../paths.ts';
import { parseReconcileOptions } from './options.ts';

const ENV = { DATABASE_URL: 'postgresql://postgres:secret@localhost:54322/postgres' };

describe('parseReconcileOptions', () => {
  it('is a dry run over the committed CSVs by default', () => {
    expect(parseReconcileOptions({}, ENV)).toEqual({
      ok: true,
      value: { apply: false, dir: RAIL_DIR, databaseUrl: ENV.DATABASE_URL },
    });
  });

  it('applies only when asked to', () => {
    expect(parseReconcileOptions({ apply: true }, ENV)).toMatchObject({
      ok: true,
      value: { apply: true },
    });
  });

  it('rejects --apply with a value', () => {
    expect(parseReconcileOptions({ apply: 'no' }, ENV)).toEqual({
      ok: false,
      error: '--apply takes no value',
    });
  });

  it('reads the CSVs from another directory, relative to where it was run', () => {
    expect(parseReconcileOptions({ dir: '.context/feed-2027' }, ENV)).toMatchObject({
      ok: true,
      value: { dir: resolve('.context/feed-2027') },
    });
  });

  it('rejects --dir without a value', () => {
    expect(parseReconcileOptions({ dir: true }, ENV)).toEqual({
      ok: false,
      error: '--dir needs a value',
    });
  });

  it('needs DATABASE_URL, and a postgres one', () => {
    expect(parseReconcileOptions({}, {})).toMatchObject({
      ok: false,
      error: expect.stringContaining('DATABASE_URL is not set'),
    });
    expect(
      parseReconcileOptions({}, { DATABASE_URL: 'https://example.supabase.co' }),
    ).toEqual({
      ok: false,
      error: 'DATABASE_URL is not a postgresql:// connection string',
    });
  });
});
