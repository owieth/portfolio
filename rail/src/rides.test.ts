import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CALENDAR_ICS, RIDES_SQL, renderRidesFrom, writeRides } from './rides.ts';

const STOPS = [
  'line_id,sequence,stop_name,sloid,didok,lat,lon,via,junction',
  'fernverkehr:IR70,1,Luzern,,8505000,,,backbone,',
  'fernverkehr:IR70,2,Zug,,8502204,,,backbone,',
  '',
].join('\n');

function ics(...events: string[]): string {
  return ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');
}

function office(date: string, location = 'Zug\\nSwitzerland', ...extra: string[]): string {
  return [
    'BEGIN:VEVENT',
    `DTSTART;TZID=Europe/Zurich:${date}T063000`,
    'SUMMARY:Frigg',
    `LOCATION:${location}`,
    ...extra,
    'END:VEVENT',
  ].join('\r\n');
}

describe('the committed rides seed', () => {
  // Only when the export is at hand: it is gitignored, so CI has no copy.
  it.skipIf(!existsSync(CALENDAR_ICS))(
    'is what the committed export generates',
    async () => {
      const { sql } = await renderRidesFrom();

      // A failure here means the export or the commute table changed without
      // the seed: run pnpm rides:data.
      expect(await readFile(RIDES_SQL, 'utf8')).toBe(sql);
    },
  );
});

describe('renderRidesFrom', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-rides-'));
    path = join(dir, 'calendar.ics');
    await writeFile(join(dir, 'line_stops.csv'), STOPS);
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('turns office days into rides and ignores everything else in the calendar', async () => {
    await writeFile(
      path,
      ics(
        office('20260924'),
        [
          'BEGIN:VEVENT',
          'DTSTART;TZID=Europe/Zurich:20260925T090000',
          'SUMMARY:Coiffeur',
          'LOCATION:Bern\\nSwitzerland',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );

    const rides = await renderRidesFrom({ ics: path, dir, through: '2026-09-26' });

    expect(rides.days).toBe(1);
    expect(rides.rides).toHaveLength(2);
    expect(rides.sql).toContain("'fernverkehr:IR70', '2026-09-24', '8505000', '8502204'");
  });

  it('drops days the export schedules but I have not ridden yet', async () => {
    await writeFile(path, ics(office('20260924'), office('20261218')));

    const rides = await renderRidesFrom({ ics: path, dir, through: '2026-09-26' });

    expect(rides.days).toBe(1);
  });

  it('refuses an office day somewhere it has no route for', async () => {
    await writeFile(path, ics(office('20260924', 'Genève\\nSwitzerland')));

    await expect(renderRidesFrom({ ics: path, dir, through: '2026-09-26' })).rejects.toThrow(
      /no destination for the 2026-09-24 office event at "Genève"/,
    );
  });

  it('refuses a recurring office day rather than counting it once', async () => {
    await writeFile(path, ics(office('20260924', 'Zug\\nSwitzerland', 'RRULE:FREQ=WEEKLY')));

    await expect(renderRidesFrom({ ics: path, dir, through: '2026-09-26' })).rejects.toThrow(
      /recurs/,
    );
  });

  it('refuses a ride whose stop is not on its line', async () => {
    await writeFile(join(dir, 'line_stops.csv'), STOPS.replace('8502204', '8502299'));
    await writeFile(path, ics(office('20260924')));

    await expect(renderRidesFrom({ ics: path, dir, through: '2026-09-26' })).rejects.toThrow(
      /fernverkehr:IR70 does not stop at 8502204/,
    );
  });
});

describe('writeRides', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-rides-'));
    await writeFile(join(dir, 'line_stops.csv'), STOPS);
    await writeFile(join(dir, 'calendar.ics'), ics(office('20260924')));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('writes the seed it rendered', async () => {
    const out = join(dir, 'rail_rides.sql');
    const rides = await writeRides(() => {}, {
      ics: join(dir, 'calendar.ics'),
      dir,
      out,
      through: '2026-09-26',
    });

    expect(await readFile(out, 'utf8')).toBe(rides.sql);
  });
});
