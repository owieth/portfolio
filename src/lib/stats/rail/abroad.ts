import type { Position } from 'geojson';

import { RAIL_MAP_BOX } from '@/lib/stats/rail/bounds';
import ice12 from '@/lib/stats/rail/ice12-track.json';

/**
 * Stations past the border a ride can end at. The feed stops every line at
 * its last Swiss stop, so a ride to Milano could only be logged as far as
 * Brig. A crossing names the line, the Swiss stop it leaves the country from,
 * and the station it went on to, and a ride can then end at that station by
 * its UIC number, which has the seven digits a Didok number has.
 *
 * Only the Swiss stops count towards a line's share. Past the border the ride
 * is drawn and nothing more, as far as the map reaches (see `RAIL_MAP_BOX`).
 */
export interface AbroadStation {
  uic: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Crossing {
  lineId: string;
  /** Didok number of the last Swiss stop before the border. */
  border: string;
  station: AbroadStation;
  /** Track past the border, for a line whose own geometry stops at it. */
  track?: Position[][];
}

const MILANO_CENTRALE: AbroadStation = {
  uic: '8301700',
  name: 'Milano Centrale',
  lat: 45.4864,
  lon: 9.2045,
};

const PARIS_GARE_DE_LYON: AbroadStation = {
  uic: '8768600',
  name: 'Paris Gare de Lyon',
  lat: 48.8443,
  lon: 2.3739,
};

const BERLIN_HBF: AbroadStation = {
  uic: '8011160',
  name: 'Berlin Hbf',
  lat: 52.5251,
  lon: 13.3694,
};

export const CROSSINGS: Crossing[] = [
  { lineId: 'fernverkehr:EC6', border: '8501609', station: MILANO_CENTRALE },
  {
    lineId: 'fernverkehr:TGV-612B',
    border: '8500010',
    station: PARIS_GARE_DE_LYON,
  },
  // No ICE has geometry in `lines.geojson`, so its track north of Basel Bad Bf
  // is the ICE 12's OSM relation, cut at the map's edge (see the JSON file).
  {
    lineId: 'fernverkehr:ICE:8500090-8507492',
    border: '8500090',
    station: BERLIN_HBF,
    track: ice12.parts,
  },
];

/** The crossing on `lineId` to the station with UIC number `uic`, if any. */
export const crossingTo = (lineId: string, uic: string | null) =>
  CROSSINGS.find(
    ({ lineId: id, station }) => id === lineId && station.uic === uic,
  );

/** A ride's stop as the Swiss stops know it: a station abroad is its border. */
export const swissStop = (lineId: string, didok: string) =>
  crossingTo(lineId, didok)?.border ?? didok;

type Box = typeof RAIL_MAP_BOX;

const PRECISION = 1e5;
const round = (value: number) => Math.round(value * PRECISION) / PRECISION;

const inside = ([lon, lat]: Position, box: Box) =>
  lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north;

/** The part of segment `a`–`b` inside `box`, by Liang–Barsky, or null. */
function clipSegment(
  a: Position,
  b: Position,
  box: Box,
): [Position, Position] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let enter = 0;
  let leave = 1;

  for (const [p, q] of [
    [-dx, a[0] - box.west],
    [dx, box.east - a[0]],
    [-dy, a[1] - box.south],
    [dy, box.north - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }

    const t = q / p;

    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
  }

  if (enter > leave) return null;

  const at = (t: number): Position =>
    t === 0 ? a : t === 1 ? b : [round(a[0] + t * dx), round(a[1] + t * dy)];

  return [at(enter), at(leave)];
}

/**
 * The runs of `coordinates` inside `box`, cut where they leave it: a train to
 * Paris is drawn as far as the map's edge and runs off it there.
 */
export function clipToBox(coordinates: Position[][], box: Box = RAIL_MAP_BOX) {
  const runs: Position[][] = [];

  for (const run of coordinates) {
    let current: Position[] = [];

    for (let index = 1; index < run.length; index += 1) {
      const clipped = clipSegment(run[index - 1], run[index], box);

      if (!clipped) continue;

      const [from, to] = clipped;
      const last = current.at(-1);

      if (!last || last[0] !== from[0] || last[1] !== from[1]) {
        if (current.length > 1) runs.push(current);
        current = [from];
      }

      current.push(to);

      if (!inside(run[index], box)) {
        runs.push(current);
        current = [];
      }
    }

    if (current.length > 1) runs.push(current);
  }

  return runs;
}
