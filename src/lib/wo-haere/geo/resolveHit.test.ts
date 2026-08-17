import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BAERN, distanceKm, himmurichtig } from '@/lib/wo-haere/geo/ch';
import { resolveHit } from '@/lib/wo-haere/geo/resolveHit';

import leer from './__fixtures__/identify-leer.json';
import numeHistorisch from './__fixtures__/identify-nume-historisch.json';
import thun from './__fixtures__/identify-thun.json';
import thunersee from './__fixtures__/identify-thunersee.json';

const THUN = { lat: 46.7578, lon: 7.6281 };

interface Antwort {
  ok?: boolean;
  status?: number;
  body?: unknown;
  /** Simulates the request rejecting outright. */
  chlöpft?: boolean;
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubSwisstopo(antworte: { identify?: Antwort; hoechi?: Antwort }) {
  const antwort = ({ ok = true, status = 200, body = {} }: Antwort) =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
    });

  fetchMock = vi.fn((url: string) => {
    const soll = url.includes('/height')
      ? (antworte.hoechi ?? { body: { height: '560.2' } })
      : (antworte.identify ?? { body: leer });

    return soll.chlöpft ? Promise.reject(new Error('offline')) : antwort(soll);
  });

  vi.stubGlobal('fetch', fetchMock);
}

const identifyUrl = () =>
  new URL(
    fetchMock.mock.calls
      .map(([url]) => url as string)
      .find(url => url.includes('/identify'))!,
  );

beforeEach(() => {
  stubSwisstopo({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveHit', () => {
  it('calls nobody when the point is outside the bounding box', async () => {
    const wurf = await resolveHit({ lat: 48.8566, lon: 2.3522 });

    expect(wurf).toEqual({
      art: 'dernaebe',
      grund: 'usland',
      lat: 48.8566,
      lon: 2.3522,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers the current-year record over the historical ones', async () => {
    stubSwisstopo({ identify: { body: thun } });

    const wurf = await resolveHit(THUN);

    expect(wurf).toMatchObject({
      art: 'preich',
      gmeind: 'Thun',
      kanton: 'BE',
      gdeNr: 942,
      wasser: false,
      hoechi: 560,
    });
  });

  it('measures distance and direction from Bern', async () => {
    stubSwisstopo({ identify: { body: thun } });

    const wurf = await resolveHit(THUN);

    expect(wurf).toMatchObject({
      distanzKm: distanceKm(BAERN, THUN),
      richtig: himmurichtig(BAERN, THUN),
    });
  });

  it('flags a lake that swisstopo returns as a municipality', async () => {
    stubSwisstopo({ identify: { body: thunersee } });

    expect(await resolveHit({ lat: 46.6829, lon: 7.7237 })).toMatchObject({
      art: 'preich',
      gmeind: 'Thunersee',
      wasser: true,
    });
  });

  it('reads zero records as abroad', async () => {
    stubSwisstopo({ identify: { body: leer } });

    expect(await resolveHit(THUN)).toMatchObject({
      art: 'dernaebe',
      grund: 'usland',
    });
  });

  it('reads records with none current as border water', async () => {
    stubSwisstopo({ identify: { body: numeHistorisch } });

    expect(await resolveHit({ lat: 46.4, lon: 6.4 })).toMatchObject({
      art: 'dernaebe',
      grund: 'grenzwasser',
    });
  });

  it('reads a current record without a name as border water too', async () => {
    stubSwisstopo({
      identify: {
        body: { results: [{ attributes: { is_current_jahr: true } }] },
      },
    });

    expect(await resolveHit(THUN)).toMatchObject({
      art: 'dernaebe',
      grund: 'grenzwasser',
    });
  });

  it('throws when identify itself fails, rather than reporting abroad', async () => {
    stubSwisstopo({ identify: { ok: false, status: 500 } });

    await expect(resolveHit(THUN)).rejects.toThrow(
      'swisstopo identify failed with 500',
    );
  });

  it('falls back to a missing canton and gde_nr instead of undefined', async () => {
    stubSwisstopo({
      identify: {
        body: {
          results: [{ attributes: { gemname: 'Thun', is_current_jahr: true } }],
        },
      },
    });

    expect(await resolveHit(THUN)).toMatchObject({ kanton: '', gdeNr: null });
  });

  describe('the mapExtent trap', () => {
    // A bogus extent makes identify return zero results instead of an error,
    // which is indistinguishable from "abroad". These assertions are the only
    // thing standing between a typo here and every Swiss throw reading as usland.
    it('brackets the queried point', async () => {
      stubSwisstopo({ identify: { body: thun } });
      await resolveHit(THUN);

      const [west, south, east, north] = identifyUrl()
        .searchParams.get('mapExtent')!
        .split(',')
        .map(Number);

      expect(west).toBeLessThan(THUN.lon);
      expect(east).toBeGreaterThan(THUN.lon);
      expect(south).toBeLessThan(THUN.lat);
      expect(north).toBeGreaterThan(THUN.lat);
    });

    it('asks in the same reference system it sends coordinates in', async () => {
      stubSwisstopo({ identify: { body: thun } });
      await resolveHit(THUN);

      const params = identifyUrl().searchParams;

      expect(params.get('sr')).toBe('4326');
      expect(params.get('tolerance')).toBe('0');
      expect(params.get('geometry')).toBe(`${THUN.lon},${THUN.lat}`);
      expect(params.get('imageDisplay')).toBe('800,600,96');
    });
  });

  describe('when the height endpoint misbehaves', () => {
    it.each([
      ['answers non-ok', { ok: false, status: 503 }],
      ['answers something unparseable', { body: { height: 'nöd e Zahl' } }],
      ['answers nothing at all', { body: {} }],
      ['rejects outright', { chlöpft: true }],
    ])('still reports the municipality when it %s', async (_name, hoechi) => {
      stubSwisstopo({ identify: { body: thun }, hoechi });

      expect(await resolveHit(THUN)).toMatchObject({
        art: 'preich',
        gmeind: 'Thun',
        hoechi: null,
      });
    });

    it('rounds the height to whole metres', async () => {
      stubSwisstopo({
        identify: { body: thun },
        hoechi: { body: { height: '3465.7' } },
      });

      expect(await resolveHit(THUN)).toMatchObject({ hoechi: 3466 });
    });

    it('queries the height in LV95, not WGS84', async () => {
      stubSwisstopo({ identify: { body: thun } });
      await resolveHit(THUN);

      const url = new URL(
        fetchMock.mock.calls
          .map(([u]) => u as string)
          .find(u => u.includes('/height'))!,
      );

      expect(url.searchParams.get('sr')).toBe('2056');
      expect(Number(url.searchParams.get('easting'))).toBeGreaterThan(
        2_000_000,
      );
      expect(Number(url.searchParams.get('northing'))).toBeGreaterThan(
        1_000_000,
      );
    });
  });
});
