import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from './cli.ts';

/**
 * Only the paths that never reach the network are exercised here: a bad command
 * line has to fail before a step runs, and that is exactly what `main` promises
 * by returning a code instead of exiting.
 */
describe('main', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const REJECTED: [string, string[]][] = [
    ['no command', []],
    ['an unknown command', ['seed']],
    ['a year that predates the published feeds', ['build', '--year', '2019']],
    ['a year that is not a year', ['build', '--year', 'twenty']],
    ['an unknown source', ['build', '--source', 'sbb']],
    // The mirror serves one current feed; a year would imply a selector.
    ['a year against the mirror', ['build', '--source', 'geops', '--year', '2026']],
  ];

  it.each(REJECTED)('returns 1 for %s', async (_label, argv) => {
    await expect(main(argv)).resolves.toBe(1);
  });

  it('prints the usage when the command line is wrong', async () => {
    await main(['seed']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('usage: pnpm build:data'),
    );
  });

  it('runs diff without touching the network', async () => {
    await expect(main(['diff'])).resolves.toBe(0);
  });
});
