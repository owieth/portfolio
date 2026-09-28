import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchFeed } from './fetch.ts';
import type { FetchOptions } from './fetch/options.ts';

// Every case fails at the catalogue, before fetchOfficial reads or writes
// anything under rail/data/raw. A case that reaches the download would write
// into the real cache directory.
const OFFICIAL: FetchOptions = {
  source: 'opentransportdata',
  year: 2026,
  dataset: 'timetable-2026-gtfs2020',
};

const silent = () => {};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(answer: () => Promise<Response>) {
  fetchMock = vi.fn(answer);
  vi.stubGlobal('fetch', fetchMock);
}

describe('fetchFeed from the official source', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the 404 wording for a year that does not exist', async () => {
    stubFetch(() => Promise.resolve(new Response('missing', { status: 404 })));

    await expect(fetchFeed(OFFICIAL, silent)).rejects.toThrow(/no such timetable year/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
