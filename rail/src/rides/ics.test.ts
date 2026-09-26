import { describe, expect, it } from 'vitest';

import { parseIcs } from './ics.ts';

function calendar(...events: string[]): string {
  return ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');
}

function event(...properties: string[]): string {
  return ['BEGIN:VEVENT', ...properties, 'END:VEVENT'].join('\r\n');
}

describe('parseIcs', () => {
  it('reads the local date, summary and location of a timed event', () => {
    const { events } = parseIcs(
      calendar(
        event(
          'DTSTART;TZID=Europe/Zurich:20260921T063000',
          'SUMMARY:Frigg',
          'LOCATION:Zug\\nSwitzerland',
        ),
      ),
    );

    expect(events).toEqual([
      { date: '2026-09-21', summary: 'Frigg', location: 'Zug\nSwitzerland', recurs: false },
    ]);
  });

  it('unfolds a location split across lines', () => {
    // A folded line is a break plus one space, and the space is not part of the
    // value: read naively, this station arrives as "Sandacker 19, Möriken A G".
    const { events } = parseIcs(
      calendar(
        [
          'BEGIN:VEVENT',
          'DTSTART;TZID=Europe/Zurich:20260921T063000',
          'SUMMARY:Frigg',
          'LOCATION:Sandacker 19\\, Möriken A',
          ' G\\, Switzerland',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );

    expect(events[0].location).toBe('Sandacker 19, Möriken AG, Switzerland');
  });

  it('skips all-day events and cancelled instances, and counts them', () => {
    const { events, skipped } = parseIcs(
      calendar(
        event('DTSTART;VALUE=DATE:20260921', 'SUMMARY:Ferien'),
        event('DTSTART;TZID=Europe/Zurich:20260922T080000', 'SUMMARY:Frigg', 'STATUS:CANCELLED'),
        event('DTSTART;TZID=Europe/Zurich:20260923T080000', 'SUMMARY:Frigg'),
      ),
    );

    expect(events.map(one => one.date)).toEqual(['2026-09-23']);
    expect(skipped).toEqual({ allDay: 1, cancelled: 1 });
  });

  it('flags a recurring event rather than counting it once', () => {
    const { events } = parseIcs(
      calendar(
        event('DTSTART;TZID=Europe/Zurich:20260921T063000', 'SUMMARY:Frigg', 'RRULE:FREQ=WEEKLY'),
        event(
          'DTSTART;TZID=Europe/Zurich:20260928T063000',
          'SUMMARY:Frigg',
          'RECURRENCE-ID;TZID=Europe/Zurich:20260928T063000',
        ),
      ),
    );

    expect(events.map(one => one.recurs)).toEqual([true, true]);
  });

  it('ignores an event with no start, and one with an unparseable one', () => {
    const { events } = parseIcs(
      calendar(event('SUMMARY:No start'), event('DTSTART:whenever', 'SUMMARY:Nonsense')),
    );

    expect(events).toEqual([]);
  });
});
