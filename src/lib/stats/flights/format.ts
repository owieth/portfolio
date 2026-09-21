/**
 * The two numbers the /stats page repeats often enough to be worth a shared
 * rule: a distance and a block time.
 *
 * `de-CH` for the grouping, matching the only other formatted number on the
 * site (`Resultatcharte.tsx`).
 */

const KM = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });

/**
 * The Swiss thousands separator, pinned rather than taken from the formatter.
 *
 * CLDR 48 changed de-CH's group separator from U+2019 to a plain apostrophe,
 * so which one `Intl` answers with is a property of the ICU the runtime
 * happens to ship rather than of the locale:
 *
 *   Node 24.12  ICU 77.1  CLDR 47  ->  36’254
 *   Node 22.23  ICU 78.2  CLDR 48  ->  36'254
 *
 * A server and a browser of different vintages will disagree the same way,
 * and this string is server-rendered and then hydrated, so leaving it to the
 * runtime is a hydration mismatch waiting on the wrong pair of versions.
 *
 * U+2019 because it is the typographically correct Swiss form; flipping this
 * constant is the whole of the change if the plain apostrophe is preferred.
 */
const GROUP_SEPARATOR = '\u2019';

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/** Whole kilometres — a great-circle estimate does not earn a decimal. */
export function formatDistanceKm(km: number): string {
  const grouped = KM.formatToParts(Math.round(km))
    .map(part => (part.type === 'group' ? GROUP_SEPARATOR : part.value))
    .join('');

  return `${grouped} km`;
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
