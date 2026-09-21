/**
 * The machine-readable strip along the bottom of the passport share card.
 *
 * A real passport's MRZ is two lines of 44 characters in OCR-B, drawn from an
 * alphabet of `A-Z`, `0-9` and `<` as the filler. That length and that filler
 * are the whole visual tell — at the size a Slack unfurl renders this, nobody
 * reads it, they recognise it. So the card carries one line of exactly 44,
 * and the fields inside it are ours rather than ICAO 9303's.
 */

import type { FlightTotals } from '@/lib/stats/flights/types';

/** ICAO 9303's TD3 line length. */
const WIDTH = 44;

const FILLER = '<';

/**
 * Zero-padded, and clamped at zero because the MRZ alphabet has no minus.
 * Values wider than their field are left wide rather than cut: a number that
 * has outgrown its slot should push the line over 44 and lose its tail to the
 * truncation below, which is visible, rather than silently print a wrong
 * total.
 */
const digits = (value: number, width: number): string =>
  String(Math.max(0, Math.round(Number.isFinite(value) ? value : 0))).padStart(
    width,
    '0',
  );

const MINUTES_PER_HOUR = 60;

/**
 * Ungrouped digits, unlike every other number on the site.
 * `formatDistanceKm` separates thousands with U+2019, which is not in the MRZ
 * alphabet — this is the one place the card deliberately disagrees with
 * `format.ts`, and the regex in the test is what holds it to that.
 */
export function mrzLine(totals: FlightTotals, airlines: number): string {
  const fields = [
    `FLT${FILLER}${digits(totals.flights, 4)}`,
    `KM${FILLER}${digits(totals.distanceKm, 7)}`,
    `HRS${FILLER}${digits(totals.durationMinutes / MINUTES_PER_HOUR, 4)}`,
    `APT${FILLER}${digits(totals.airports, 2)}`,
    `AIR${FILLER}${digits(airlines, 2)}`,
  ];

  return fields.join(FILLER).padEnd(WIDTH, FILLER).slice(0, WIDTH);
}
