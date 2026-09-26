/**
 * The dated events in a calendar export, reduced to what the rides need.
 *
 * The export is an `.ics` written by Calendar.app, read once to seed the rides
 * and then thrown away. It is the whole personal calendar, so this module is
 * deliberately narrow: it reads four properties and returns a date, a summary
 * and a location. Nothing downstream keeps the summary, and no description or
 * attendee is read at all, because the seed it feeds is committed.
 *
 * Recurrence is reported, not expanded. None of the office events recur — that
 * is a property of this export, 329 of them, one per date, each its own
 * `VEVENT` — so expanding `RRULE` against `EXDATE` and `RECURRENCE-ID` would be
 * dead code. An event that does recur is flagged so the caller can refuse it,
 * rather than being counted once and quietly undercounting the days.
 */

/** A `VEVENT` reduced to the properties this pipeline reads. */
export interface CalendarEvent {
  /** `YYYY-MM-DD`, the local date of `DTSTART`. */
  date: string;
  summary: string;
  location: string;
  /** Carries `RRULE` or `RECURRENCE-ID`: one `VEVENT`, more than one day. */
  recurs: boolean;
}

interface Property {
  params: string;
  value: string;
}

const DATE = /^(\d{4})(\d{2})(\d{2})/;

/**
 * Undo RFC 5545 line folding, where a line break followed by one space or tab
 * continues the line before it. Long `LOCATION` values fold mid-word, so
 * parsing without this cuts a station name in half.
 */
function unfold(text: string): string {
  return text.replaceAll(/\r?\n[ \t]/g, '');
}

/** `\n`, `\,` and `\;` are escapes in a property value; a literal backslash is `\\`. */
function unescape(value: string): string {
  return value.replaceAll(/\\([\\,;nN])/g, (_, char: string) =>
    char === 'n' || char === 'N' ? '\n' : char,
  );
}

/**
 * One property of one event. Matches the name up to the `;` or `:` that ends
 * it, so `DTSTART;TZID=Europe/Zurich` and a bare `DTSTART` both answer to
 * `DTSTART`.
 */
function property(event: string, name: string): Property | undefined {
  const match = new RegExp(`^${name}(;[^:\\n]*)?:(.*)$`, 'm').exec(event);

  return match ? { params: match[1] ?? '', value: match[2] } : undefined;
}

export interface ParseIcsResult {
  events: CalendarEvent[];
  /** Counted rather than returned: all-day events and cancelled instances. */
  skipped: { allDay: number; cancelled: number };
}

/** Every dated, uncancelled, non-all-day event in an export. */
export function parseIcs(text: string): ParseIcsResult {
  const skipped = { allDay: 0, cancelled: 0 };
  const events: CalendarEvent[] = [];

  for (const block of unfold(text).split('BEGIN:VEVENT').slice(1)) {
    const event = block.slice(0, block.indexOf('END:VEVENT'));
    const start = property(event, 'DTSTART');

    if (!start) continue;

    if (start.params.includes('VALUE=DATE')) {
      skipped.allDay += 1;
      continue;
    }

    if (property(event, 'STATUS')?.value.trim() === 'CANCELLED') {
      skipped.cancelled += 1;
      continue;
    }

    const date = DATE.exec(start.value);

    if (!date) continue;

    events.push({
      date: `${date[1]}-${date[2]}-${date[3]}`,
      summary: unescape(property(event, 'SUMMARY')?.value ?? '').trim(),
      location: unescape(property(event, 'LOCATION')?.value ?? '').trim(),
      recurs:
        property(event, 'RRULE') !== undefined ||
        property(event, 'RECURRENCE-ID') !== undefined,
    });
  }

  return { events, skipped };
}
