/**
 * The footer clock: the time and the date in Zurich, formatted by `Intl` so
 * no timezone library has to ship to the browser.
 */

const TIME_ZONE = 'Europe/Zurich';

/**
 * `hourCycle: 'h23'` rather than `hour12: false`: with the latter, some
 * browser versions have printed `24:00:05` just after midnight.
 */
const TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Assembled from parts, because `format()` puts a comma after the day
 * (`Saturday, September 26, 2026`) where the clock has always shown none.
 */
const DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: '2-digit',
  year: 'numeric',
});

/** `00:00:05` */
export function formatZurichTime(ms: number): string {
  return TIME.format(ms);
}

/** `Saturday, September 26 2026` */
export function formatZurichDate(ms: number): string {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of DATE.formatToParts(ms)) parts[type] = value;
  return `${parts.weekday}, ${parts.month} ${parts.day} ${parts.year}`;
}
