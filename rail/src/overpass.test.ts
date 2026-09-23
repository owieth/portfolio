import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { fetchOsmRelations } from './overpass.ts';
import type { OverpassDeps } from './overpass.ts';
import { recordPath, responsePath } from './overpass/cache.ts';
import { buildQuery, queryKey } from './overpass/query.ts';

/**
 * A handwritten answer in the shape `out body geom` gives: the relation, its way
 * members with coordinates inline, and its stop nodes with a position. The
 * Polybahn and the Brünig line stand in for the two queries.
 */
const TIMESTAMP = '2026-09-23T08:15:00Z';

const RELATIONS = {
  funicular: {
    type: 'relation',
    id: 2_349_318,
    tags: { type: 'route', route: 'funicular', name: 'Polybahn', ref: '2350' },
    members: [
      { type: 'node', ref: 1, role: 'stop', lat: 47.3763, lon: 8.5442 },
      {
        type: 'way',
        ref: 10,
        role: '',
        geometry: [
          { lat: 47.3763, lon: 8.5442 },
          { lat: 47.3769, lon: 8.5467 },
        ],
      },
      { type: 'node', ref: 2, role: 'stop', lat: 47.3769, lon: 8.5467 },
    ],
  },
  train: {
    type: 'relation',
    id: 1_663_445,
    tags: { type: 'route', route: 'train', ref: 'IR70', network: 'SBB' },
    members: [{ type: 'way', ref: 20, role: '', geometry: [{ lat: 47.05, lon: 8.31 }] }],
  },
} as const;

type Route = keyof typeof RELATIONS;

function body(route: Route, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 0.6,
    osm3s: { timestamp_osm_base: TIMESTAMP },
    elements: [RELATIONS[route]],
    ...extra,
  });
}

function routeOf(init: RequestInit | undefined): Route {
  const query = new URLSearchParams(String(init?.body)).get('data') ?? '';
  return query.includes('"funicular"') ? 'funicular' : 'train';
}

/** Answers every query with its fixture, and counts what reached the network. */
function server(answer: (route: Route) => Response = route => new Response(body(route))) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
    answer(routeOf(init)),
  );
}

describe('fetchOsmRelations', () => {
  let dir: string;
  let log: Mock<(message: string) => void>;
  let sleep: Mock<(ms: number) => Promise<void>>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-overpass-'));
    log = vi.fn();
    sleep = vi.fn(async () => {});
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  function deps(fetch: ReturnType<typeof server>): OverpassDeps {
    return {
      dir,
      fetch: fetch as unknown as typeof globalThis.fetch,
      sleep,
      now: () => new Date('2026-09-23T08:16:12Z'),
    };
  }

  it('asks once per route type and returns both, ordered by id', async () => {
    const fetch = server();
    const result = await fetchOsmRelations(log, deps(fetch));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.requests).toBe(2);
    expect(result.relations.map(relation => [relation.id, relation.route])).toEqual([
      [1_663_445, 'train'],
      [2_349_318, 'funicular'],
    ]);
    expect(result.relations[1].members[1].geometry).toHaveLength(2);
  });

  it('sends the query as a form POST with a user agent', async () => {
    const fetch = server();
    await fetchOsmRelations(log, deps(fetch));

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(init?.method).toBe('POST');
    expect(new URLSearchParams(String(init?.body)).get('data')).toBe(buildQuery('train'));
    expect((init?.headers as Record<string, string>)['user-agent']).toMatch(/portfolio/);
  });

  // The acceptance criterion: a second run makes zero network requests.
  it('makes no request at all on a second run', async () => {
    await fetchOsmRelations(log, deps(server()));

    const second = server();
    const result = await fetchOsmRelations(log, deps(second));

    expect(second).not.toHaveBeenCalled();
    expect(result.requests).toBe(0);
    expect(result.relations).toHaveLength(2);
  });

  it('keeps the query, the OSM timestamp and a checksum next to each response', async () => {
    await fetchOsmRelations(log, deps(server()));

    const key = queryKey(buildQuery('funicular'));
    const record = JSON.parse(await readFile(recordPath(dir, key), 'utf8'));

    expect(record).toMatchObject({
      version: 1,
      key,
      query: buildQuery('funicular'),
      timestampOsmBase: TIMESTAMP,
      bytes: Buffer.byteLength(body('funicular')),
      fetchedAt: '2026-09-23T08:16:12.000Z',
    });
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes the ODbL attribution next to the responses and returns it', async () => {
    const result = await fetchOsmRelations(log, deps(server()));
    const written = JSON.parse(await readFile(join(dir, 'attribution.json'), 'utf8'));

    expect(result.attribution).toEqual(written);
    expect(written).toMatchObject({
      text: '© OpenStreetMap contributors',
      license: 'ODbL-1.0',
      osmBase: { train: TIMESTAMP, funicular: TIMESTAMP },
    });
  });

  it('asks again for a response deleted by hand, and only for that one', async () => {
    await fetchOsmRelations(log, deps(server()));
    await rm(responsePath(dir, queryKey(buildQuery('train'))));

    const second = server();
    await fetchOsmRelations(log, deps(second));

    expect(second).toHaveBeenCalledTimes(1);
    expect(routeOf(second.mock.calls[0][1])).toBe('train');
  });

  it('asks again when a response no longer matches its record', async () => {
    await fetchOsmRelations(log, deps(server()));
    await writeFile(responsePath(dir, queryKey(buildQuery('funicular'))), '{}');

    const second = server();
    await fetchOsmRelations(log, deps(second));

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('backs off on 429, honours Retry-After, and succeeds', async () => {
    let refused = false;
    const fetch = server(route => {
      if (route === 'train' && !refused) {
        refused = true;
        return new Response('rate limited', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '90' },
        });
      }

      return new Response(body(route));
    });

    const result = await fetchOsmRelations(log, deps(fetch));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.requests).toBe(3);
    expect(sleep).toHaveBeenCalledWith(90_000);
  });

  it('retries a request that never got an answer', async () => {
    let dropped = false;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (!dropped) {
        dropped = true;
        throw new TypeError('fetch failed');
      }

      return new Response(body(routeOf(init)));
    });

    await fetchOsmRelations(log, deps(fetch));

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('fails at once on a query Overpass rejects, and caches nothing', async () => {
    const fetch = server(
      () =>
        new Response('<p><strong>Error</strong>: line 3: parse error: bad filter</p>', {
          status: 400,
          statusText: 'Bad Request',
        }),
    );

    await expect(fetchOsmRelations(log, deps(fetch))).rejects.toThrow(
      /400 Bad Request: Error : line 3: parse error: bad filter/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  // Overpass reports a timeout as a 200 with a remark and the partial result.
  it('never caches a response Overpass gave up on part way', async () => {
    let timedOut = false;
    const fetch = server(route => {
      if (route === 'train' && !timedOut) {
        timedOut = true;
        return new Response(
          body(route, {
            remark: 'runtime error: Query timed out in "query" at line 3 after 901 seconds.',
          }),
        );
      }

      return new Response(body(route));
    });

    await fetchOsmRelations(log, deps(fetch));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Query timed out'));

    // And the answer that was cached is the complete one.
    const second = server();
    await fetchOsmRelations(log, deps(second));
    expect(second).not.toHaveBeenCalled();
  });

  it('gives up after the last backoff and leaves no response behind', async () => {
    const fetch = server(
      () => new Response('busy', { status: 504, statusText: 'Gateway Timeout' }),
    );

    await expect(fetchOsmRelations(log, deps(fetch))).rejects.toThrow(/504/);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(await readdir(dir)).toEqual([]);
  });
});
