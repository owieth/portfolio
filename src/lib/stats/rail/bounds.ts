import { CH_BOUNDS } from '@/lib/geo/ch';

/** How far past Switzerland the rail map reaches, in degrees. */
const SLACK = 2;

/**
 * The area the rail map can be panned over, and so how far a ride abroad is
 * drawn. Its own module so `RailMap` can import it without the tracks abroad.
 */
export const RAIL_MAP_BOX = {
  west: CH_BOUNDS.west - SLACK,
  south: CH_BOUNDS.south - SLACK,
  east: CH_BOUNDS.east + SLACK,
  north: CH_BOUNDS.north + SLACK,
} as const;
