import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FeatureCollection, MultiLineString, Position } from 'geojson';

/**
 * The web geometry, read on the server so `rideStretches` in `./stretch` can
 * cut ridden stretches out of it. The same file `RailMap` has MapLibre fetch,
 * so the map and the stretches drawn over it agree to the point.
 *
 * Read off the disk rather than imported: an import would put a megabyte of
 * coordinates into the server bundle, and the file is already on disk. The
 * hourly revalidation of /stats reads it again in a function, which is why
 * `next.config.js` traces it into the /stats route.
 */
export const LINES_PATH = join(process.cwd(), 'public', 'rail', 'lines.geojson');

/**
 * Line id to the parts of its `MultiLineString`. A result, never an exception,
 * for the reason `RailResult` gives: a missing file only means no stretches,
 * and the rest of the rail section renders as it would without them.
 */
export async function loadRailGeometry(
  path = LINES_PATH,
): Promise<Map<string, Position[][]>> {
  try {
    const collection = JSON.parse(await readFile(path, 'utf8')) as
      FeatureCollection<MultiLineString, { id: string }>;

    return new Map(
      collection.features.map(({ properties, geometry }) => [
        properties.id,
        geometry.coordinates,
      ]),
    );
  } catch (error) {
    console.warn(
      `[stats/rail] no geometry to cut stretches from: ${error instanceof Error ? error.message : String(error)}`,
    );

    return new Map();
  }
}
