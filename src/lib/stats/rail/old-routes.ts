/**
 * Track a ride took before a base tunnel opened, for the map. The geometry is
 * this year's OSM, so an IC2 ridden to Lugano in 2018 would otherwise be drawn
 * through the Ceneri base tunnel it never saw.
 *
 * A route is the old line's stations in running order and a line whose
 * geometry still runs over it. A leg of a ride on or before `until` with both
 * ends among `stops` is cut station by station off `via`, falling back to the
 * usual cut for a station `via` does not reach.
 */
export interface OldRoute {
  name: string;
  /** `YYYY-MM-DD`, the last day trains ran this way: the day before the timetable change. */
  until: string;
  via: string;
  /** Didok numbers, in running order. */
  stops: string[];
}

export const OLD_ROUTES: OldRoute[] = [
  {
    name: 'Monte Ceneri',
    until: '2020-12-12',
    via: 'tilo:S90',
    stops: [
      '8505213', // Bellinzona
      '8505214', // Giubiasco
      '8505216', // Rivera-Bironico
      '8505217', // Mezzovico
      '8505218', // Taverne-Torricella
      '8505219', // Lamone-Cadempino
      '8505300', // Lugano
    ],
  },
  {
    name: 'Gotthard',
    until: '2016-12-10',
    via: 'fernverkehr:IR46',
    stops: [
      '8505004', // Arth-Goldau
      '8505005', // Steinen
      '8505006', // Schwyz
      '8505007', // Brunnen
      '8505111', // Sisikon
      '8505112', // Flüelen
      '8505113', // Altdorf UR
      '8505114', // Erstfeld
      '8505119', // Göschenen
      '8505201', // Airolo
      '8505202', // Ambrì-Piotta
      '8505204', // Faido
      '8505205', // Lavorgo
      '8505207', // Bodio TI
      '8505209', // Biasca
      '8505212', // Castione-Arbedo
      '8505213', // Bellinzona
    ],
  },
];

/** The routes trains still took on `riddenOn`, oldest closure last. */
export const oldRoutesOn = (riddenOn: string, routes = OLD_ROUTES) =>
  routes.filter(({ until }) => riddenOn <= until);

/**
 * The stations of the first route with both ends of a leg, from `from` to
 * `to`, or null when no route has both.
 */
export function oldRouteBetween(
  routes: OldRoute[],
  from: string,
  to: string,
): { via: string; stops: string[] } | null {
  for (const { via, stops } of routes) {
    const start = stops.indexOf(from);
    const end = stops.indexOf(to);

    if (start === -1 || end === -1 || start === end) continue;

    return {
      via,
      stops:
        start < end
          ? stops.slice(start, end + 1)
          : stops.slice(end, start + 1).reverse(),
    };
  }

  return null;
}
