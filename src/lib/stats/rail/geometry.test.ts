import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LINES_PATH, loadRailGeometry } from './geometry';

vi.mock('server-only', () => ({}));

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('loadRailGeometry', () => {
  it('reads every line of the committed web geometry', async () => {
    const committed = JSON.parse(readFileSync(LINES_PATH, 'utf8')) as {
      features: { properties: { id: string } }[];
    };
    const geometry = await loadRailGeometry();

    expect([...geometry.keys()]).toEqual(
      committed.features.map(({ properties }) => properties.id),
    );

    for (const parts of geometry.values()) {
      expect(parts.length).toBeGreaterThan(0);
      expect(parts.every((part) => part.length >= 2)).toBe(true);
    }
  });

  it('comes back empty, with a warning, when the file is missing', async () => {
    const geometry = await loadRailGeometry('/nowhere/lines.geojson');

    expect(geometry.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[stats\/rail\] no geometry to cut stretches/),
    );
  });
});
