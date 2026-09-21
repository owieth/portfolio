/**
 * The two numbers the /stats page repeats often enough to be worth a shared
 * rule: a distance and a block time.
 *
 * `de-CH` for the grouping, matching the only other formatted number on the
 * site (`Resultatcharte.tsx`). Naming the locale rather than letting `Intl`
 * pick also settles it between Node and the browser, which need not agree on
 * a default.
 */

const KM = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/** Whole kilometres — a great-circle estimate does not earn a decimal. */
export function formatDistanceKm(km: number): string {
  return `${KM.format(Math.round(km))} km`;
}

/**
 * The two most significant non-zero units, so a total reads `2d 13h` and a
 * flight reads `8h 25m`. Days drop minutes: nobody reading a lifetime of block
 * time cares about the last forty.
 */
export function formatDuration(minutes: number): string {
  if (minutes >= MINUTES_PER_DAY) {
    const days = Math.floor(minutes / MINUTES_PER_DAY);
    const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);

    return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
  }

  if (minutes >= MINUTES_PER_HOUR) {
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;

    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }

  return `${minutes}m`;
}
