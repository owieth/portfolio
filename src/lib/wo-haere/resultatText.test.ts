import { describe, expect, it } from 'vitest';

import { DERNAEBE } from '@/lib/wo-haere/data/bern';
import type { DernaebeGrund, Wurf } from '@/lib/wo-haere/geo/resolveHit';
import { resultatText } from '@/lib/wo-haere/resultatText';

const preich = (über: Partial<Extract<Wurf, { art: 'preich' }>> = {}) =>
  ({
    art: 'preich',
    lat: 46.948,
    lon: 7.4474,
    gmeind: 'Muri bi Bärn',
    kanton: 'BE',
    gdeNr: 356,
    hoechi: 600,
    wasser: false,
    distanzKm: 50,
    richtig: 'im Oschte',
    ...über,
  }) satisfies Extract<Wurf, { art: 'preich' }>;

const dernaebe = (grund: DernaebeGrund) =>
  ({
    art: 'dernaebe',
    grund,
    lat: 47.6,
    lon: 9.5,
  }) satisfies Extract<Wurf, { art: 'dernaebe' }>;

describe('resultatText', () => {
  it('reads a miss abroad', () => {
    expect(
      resultatText({
        wurf: dernaebe('usland'),
        ziuName: null,
        isPreich: false,
      }),
    ).toBe('Dernäbe! Ds Pfyl isch us der Schwyz gfloge. Das zäut nid — nomau!');
  });

  it('reads a miss in border water', () => {
    expect(
      resultatText({
        wurf: dernaebe('grenzwasser'),
        ziuName: null,
        isPreich: false,
      }),
    ).toBe(`${DERNAEBE.titu} ${DERNAEBE.grenzwasser}`);
  });

  it('reads a miss off the map', () => {
    expect(
      resultatText({
        wurf: dernaebe('nid_uf_der_charte'),
        ziuName: null,
        isPreich: false,
      }),
    ).toBe(`${DERNAEBE.titu} ${DERNAEBE.nid_uf_der_charte}`);
  });

  it('reads a hit on a destination', () => {
    expect(
      resultatText({ wurf: preich(), ziuName: 'Zytglogge', isPreich: true }),
    ).toBe('Preicht! Du gasch uf Zytglogge, Kanton Bärn');
  });

  it('reads a landing in a lake', () => {
    expect(
      resultatText({
        wurf: preich({ wasser: true, gmeind: 'Thunersee' }),
        ziuName: null,
        isPreich: false,
      }),
    ).toBe('Du landisch im Thunersee, Kanton Bärn');
  });

  it('leaves out an empty canton', () => {
    expect(
      resultatText({
        wurf: preich({ kanton: '' }),
        ziuName: null,
        isPreich: false,
      }),
    ).toBe('Du gasch uf Muri bi Bärn');
  });
});
