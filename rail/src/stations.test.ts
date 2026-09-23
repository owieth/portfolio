import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveStations } from './stations.ts';

/**
 * A handwritten feed rather than the real one, which is 256 MB and only exists
 * on a machine that has run `pnpm build:data`. Every row is copied from the 2026
 * feed, quoting and all, so the fixture cannot drift into a shape the parser
 * would never see.
 *
 * One case per branch: a station with platforms under it, the unparented stop
 * that is a station anyway, a foreign station outside the box, a foreign one
 * inside it, a Swiss one in the wrong place, and a Swiss one with no coordinate
 * to check at all.
 */
const STOPS = `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code,original_stop_id,didok
"Parentch:1:sloid:3000","Zürich HB","47.37817620","8.54021154","1","","","ch:1:sloid:3000","8503000"
"ch:1:sloid:3000","Zürich HB","47.37817620","8.54021154","","Parentch:1:sloid:3000","","ch:1:sloid:3000","8503000"
"ch:1:sloid:3000:2:3","Zürich HB","47.37834652","8.53621404","","Parentch:1:sloid:3000","3","ch:1:sloid:3000:2:3","8503000"
"ch:1:sloid:3000:3:4","Zürich HB","47.37840735","8.53625895","","Parentch:1:sloid:3000","4","ch:1:sloid:3000:3:4","8503000"
"ch:1:sloid:258","Bern Münsterplattform","46.94665406","7.45239665","","","","ch:1:sloid:258","8500258"
"Parent8014228","Karlsruhe Hbf","48.99351443","8.40218540","1","","","8014228","8014228"
"8014228_gen:missingSLOID_pf:12","Karlsruhe Hbf","48.99351443","8.40218540","","Parent8014228","12","","8014228"
"Parentch:1:sloid:1200422","Dornbirn, Färbergasse","47.42018689","9.73854616","1","","","ch:1:sloid:1200422","1200422"
"Parentch:1:sloid:99999","Madrid Atocha (mis-placed)","40.41680000","-3.70380000","1","","","ch:1:sloid:99999","8599999"
"Parentch:1:sloid:88888","Ohni Koordinate","","","1","","","ch:1:sloid:88888","8588888"
`;

/** An EC to Milano with none of its Swiss half — the inventory must come out empty. */
const ONLY_FOREIGN = `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code,original_stop_id,didok
"Parent8014228","Karlsruhe Hbf","48.99351443","8.40218540","1","","","8014228","8014228"
"Parent8302589","Venezia Mestre","45.48190300","12.23190108","1","","","8302589","8302589"
`;

/** The reassuring case: one Swiss station, where both tests say the same thing. */
const AGREEING = `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code,original_stop_id,didok
"Parentch:1:sloid:3000","Zürich HB","47.37817620","8.54021154","1","","","ch:1:sloid:3000","8503000"
`;

/** The shape a mirror that does not carry opentransportdata's own columns would have. */
const NO_DIDOK = `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code
"Parentch:1:sloid:3000","Zürich HB","47.37817620","8.54021154","1","",""
`;

let directory: string;
let foreignOnly: string;
let agreeing: string;
let mirror: string;
const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

beforeAll(async () => {
  [directory, foreignOnly, agreeing, mirror] = await Promise.all([
    mkdtemp(join(tmpdir(), 'rail-stations-')),
    mkdtemp(join(tmpdir(), 'rail-stations-foreign-')),
    mkdtemp(join(tmpdir(), 'rail-stations-agreeing-')),
    mkdtemp(join(tmpdir(), 'rail-stations-mirror-')),
  ]);

  await Promise.all([
    writeFile(join(directory, 'stops.txt'), STOPS, 'utf8'),
    writeFile(join(foreignOnly, 'stops.txt'), ONLY_FOREIGN, 'utf8'),
    writeFile(join(agreeing, 'stops.txt'), AGREEING, 'utf8'),
    writeFile(join(mirror, 'stops.txt'), NO_DIDOK, 'utf8'),
  ]);
});

afterAll(async () => {
  await Promise.all(
    [directory, foreignOnly, agreeing, mirror].map(path =>
      rm(path, { force: true, recursive: true }),
    ),
  );
});

describe('resolveStations', () => {
  it('collapses a station and its platforms into one row', async () => {
    const { stations } = await resolveStations(directory, log);
    const zuerich = stations.filter(station => station.name === 'Zürich HB');

    expect(zuerich).toEqual([
      {
        didok: '8503000',
        sloid: 'ch:1:sloid:3000',
        name: 'Zürich HB',
        lat: 47.3781762,
        lon: 8.54021154,
        stops: 3,
      },
    ]);
  });

  /**
   * The 2026 feed has exactly one of these, `ch:1:sloid:258`, and it is a
   * funicular terminus — which is to say the one row a rule about parents would
   * have dropped is the kind of row this pipeline exists to find.
   */
  it('treats a stop with no parent as a station in its own right', async () => {
    const { stations } = await resolveStations(directory, log);

    expect(stations.map(station => station.didok)).toEqual([
      '8500258',
      '8503000',
      '8588888',
      '8599999',
    ]);
    expect(stations[0]).toMatchObject({ didok: '8500258', stops: 0 });
  });

  it('keeps only the Swiss stops of a line that runs abroad', async () => {
    const { stations, foreign } = await resolveStations(directory, log);

    expect(stations.map(station => station.name)).not.toContain('Karlsruhe Hbf');
    expect(foreign).toEqual([
      { country: '12', stations: 1 },
      { country: '80', stations: 1 },
    ]);
  });

  /**
   * `original_stop_id` carries the bare Didok number on a station the feed has
   * no SLOID for. A SLOID of `8014228` would be a worse answer than none.
   */
  it('reads the SLOID only where the feed actually has one', async () => {
    const { stations } = await resolveStations(directory, log);

    expect(stations.map(station => station.sloid)).toEqual([
      'ch:1:sloid:258',
      'ch:1:sloid:3000',
      'ch:1:sloid:88888',
      'ch:1:sloid:99999',
    ]);
  });

  it('lists the stations the country code and the bounding box disagree about', async () => {
    const { misplaced } = await resolveStations(directory, log);

    expect(misplaced).toEqual([
      {
        didok: '8588888',
        name: 'Ohni Koordinate',
        lat: null,
        lon: null,
        reason: 'no usable coordinate to cross-check the country code against',
      },
      {
        didok: '8599999',
        name: 'Madrid Atocha (mis-placed)',
        lat: 40.4168,
        lon: -3.7038,
        reason: 'country code 85 but outside the Switzerland bounding box',
      },
    ]);
  });

  it('keeps a misplaced Swiss station rather than letting the box overrule the code', async () => {
    const { stations } = await resolveStations(directory, log);

    expect(stations.map(station => station.didok)).toContain('8599999');
  });

  it('counts the foreign stations the box contains without calling them Swiss', async () => {
    const { foreignInBbox } = await resolveStations(directory, log);

    expect(foreignInBbox).toBe(1);
  });

  it('counts every feed row it collapsed, stations and platforms alike', async () => {
    const { feedStops } = await resolveStations(directory, log);

    expect(feedStops).toBe(STOPS.trimEnd().split('\n').length - 1);
  });

  it('names each disagreement in the log so the report in #483 has them', async () => {
    logged.length = 0;
    await resolveStations(directory, log);

    expect(logged.find(line => line.includes('8599999'))).toContain(
      'outside the Switzerland bounding box',
    );
    expect(logged.find(line => line.includes('8588888'))).toContain(
      'no usable coordinate',
    );
  });

  it('says so when the country code and the position agree everywhere', async () => {
    logged.length = 0;
    await resolveStations(agreeing, log);

    expect(logged.find(line => line.startsWith('every Swiss station'))).toContain(
      'the country code and the position agree',
    );
  });

  /**
   * A feed that lost its `85`s wholesale would otherwise produce an empty
   * `line_stops.csv` and a clean exit, which is the one failure that looks like
   * success.
   */
  it('fails when no Swiss station survives rather than emitting an empty inventory', async () => {
    await expect(resolveStations(foreignOnly, log)).rejects.toThrow(
      /no Swiss stations survived/,
    );
  });

  it('names the missing column when the feed is not the official one', async () => {
    await expect(resolveStations(mirror, log)).rejects.toThrow(
      /missing original_stop_id, didok/,
    );
  });
});
