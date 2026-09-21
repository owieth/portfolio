import CustomLink from '@/components/Link';
import { P, Section, Table } from '@/components/projects/Prose';
import AirlineChip from '@/components/stats/AirlineChip';
import CountryFlags from '@/components/stats/CountryFlags';
import FlightGlobe from '@/components/stats/FlightGlobe';
import { aircraft as aircraftType } from '@/lib/stats/flights/aircraft';
import { airline } from '@/lib/stats/flights/airlines';
import { formatDistanceKm, formatDuration } from '@/lib/stats/flights/format';
import { EARTH_CIRCUMFERENCE_KM } from '@/lib/stats/flights/geo';
import { loadFlights } from '@/lib/stats/flights/query';
import {
  aircraftUsage,
  flightTotals,
  manufacturerMix,
  rankAirlines,
  rankRoutes,
  toLegs,
} from '@/lib/stats/flights/stats';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stats',
  description:
    'Every flight Olivier Winkler has taken — the totals, the routes he keeps repeating, and the log itself.',
  alternates: {
    canonical: '/stats',
  },
};

/**
 * `flown_on` is a Postgres `date`: no time and no zone. `new Date('2017-07-14')`
 * parses as midnight UTC but formats in the runtime's own zone, which renders
 * the previous day anywhere west of it — and this page is prerendered, so the
 * wrong day would be baked into the HTML by whichever machine ran the build.
 * Hence the explicit `Z` and the explicit `timeZone`.
 *
 * The locale is pinned for the same reason `format.ts` pins `de-CH`: a
 * server-rendered string that hydrates has to be the same string on both sides.
 */
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const formatFlownOn = (flownOn: string) =>
  DATE.format(new Date(`${flownOn}T00:00:00Z`));

const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div>
    <dt className="text-muted text-sm">{label}</dt>
    <dd className="mt-1 text-2xl font-medium tabular-nums">
      {value}
      {hint && <span className="text-muted block text-sm">{hint}</span>}
    </dd>
  </div>
);

/**
 * A log cell that keeps its code and gains its name: `LX 316` stays the thing
 * you scan for, because it is what is on the boarding pass, and `Swiss` sits
 * under it in the body colour the table already uses.
 */
const Named = ({ code, name }: { code: string; name?: string }) => (
  <>
    <span className="text-foreground">{code}</span>
    {name && <span className="mt-0.5 block text-xs">{name}</span>}
  </>
);

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full max-w-3xl">
    <h1 className="text-4xl font-medium text-balance italic sm:text-5xl">
      Stats
    </h1>
    {children}
  </div>
);

export default async function StatsPage() {
  const { flights } = await loadFlights();
  const legs = toLegs(flights);

  // Covers all three failure shapes at once — Supabase unconfigured, the read
  // failed, or the table is empty — because the page renders the same thing for
  // each. A preview deploy without env vars is the everyday case.
  if (legs.length === 0) {
    return (
      <Page>
        <P>No flights logged yet.</P>
        <div className="mt-6">
          <CustomLink link="/">Back home</CustomLink>
        </div>
      </Page>
    );
  }

  const totals = flightTotals(legs);
  const routes = rankRoutes(legs);
  const airlines = rankAirlines(legs);
  const aircraftTypes = aircraftUsage(legs);
  const manufacturers = manufacturerMix(aircraftTypes);
  const timesAroundTheEarth = totals.distanceKm / EARTH_CIRCUMFERENCE_KM;

  // Both can be empty where `legs` is not: `aircraft` is a nullable column, so
  // a log of flights whose type was never recorded has no types to rank, and
  // types the registry has not been told about roll up to no manufacturer.
  const [mostFlown] = aircraftTypes;
  const [leadingManufacturer] = manufacturers;
  // Against the mix's own total rather than `totals.flights`, for that second
  // reason — otherwise the share silently under-reports.
  const typed = manufacturers.reduce((sum, { flights }) => sum + flights, 0);

  return (
    <Page>
      <p className="text-muted mt-4 text-pretty">
        Every flight I have taken, the routes I keep repeating, and how far it
        all adds up to.
      </p>

      <FlightGlobe legs={legs} />
      <CountryFlags legs={legs} />

      <Section title="Totals">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
          <Stat label="Flights" value={String(totals.flights)} />
          <Stat label="Distance" value={formatDistanceKm(totals.distanceKm)} />
          <Stat
            label="Block time"
            value={formatDuration(totals.durationMinutes)}
          />
          <Stat label="Airports" value={String(totals.airports)} />
          <Stat label="Countries" value={String(totals.countries)} />
          <Stat
            label="Around the Earth"
            value={`${timesAroundTheEarth.toFixed(2)}x`}
          />
        </dl>
      </Section>

      <Section title="Top routes">
        <P>
          Both directions count as one route, so a return trip is two flights on
          the same line. An open jaw is not — flying out to Boston and back from
          New York stays two routes, because it was.
        </P>
        <Table
          head={['Route', 'Flights', 'Distance']}
          rows={routes.map(route => ({
            id: `${route.a.iata}-${route.b.iata}`,
            cells: [
              `${route.a.city} · ${route.b.city}`,
              route.flights,
              formatDistanceKm(route.distanceKm),
            ],
          }))}
        />
      </Section>

      <Section title="Top airlines">
        <P>
          The colour is the carrier&rsquo;s own and the code is its IATA one. No
          logos — those are trademarks, and every free set of them either
          carries no licence or disclaims the marks it ships.
        </P>
        <Table
          head={['Airline', 'Flights', 'Distance']}
          rows={airlines.map(({ code, airline, flights, distanceKm }) => ({
            id: code,
            cells: [
              <span key={code} className="flex items-center gap-2">
                <AirlineChip code={code} airline={airline} />
                {airline?.name ?? code}
              </span>,
              flights,
              formatDistanceKm(distanceKm),
            ],
          }))}
        />
      </Section>

      {mostFlown && (
        <Section title="Aircraft">
          <dl>
            <Stat
              label="Most flown"
              value={mostFlown.aircraft?.name ?? mostFlown.key}
              hint={[
                mostFlown.aircraft?.manufacturer,
                `${mostFlown.flights} flights`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          </dl>
          <Table
            head={['Aircraft', 'Flights']}
            rows={aircraftTypes.map(({ key, aircraft, flights }) => ({
              id: key,
              cells: [aircraft?.name ?? key, flights],
            }))}
          />
          {leadingManufacturer && (
            <p className="text-muted text-sm tabular-nums">
              {manufacturers
                .map(
                  ({ manufacturer, flights }) => `${manufacturer} ${flights}`,
                )
                .join(' · ')}
              {' — '}
              {Math.round((leadingManufacturer.flights / typed) * 100)}%{' '}
              {leadingManufacturer.manufacturer}, which is what flying out of
              Zurich looks like.
            </p>
          )}
        </Section>
      )}

      <Section title="Flight log">
        <Table
          head={['Date', 'Route', 'Flight', 'Aircraft', 'Duration']}
          rows={legs.map(({ flight, from, to }) => ({
            id: flight.id,
            cells: [
              formatFlownOn(flight.flownOn),
              `${from.iata} → ${to.iata}`,
              <Named
                key="flight"
                code={`${flight.airline} ${flight.flightNumber}`}
                name={airline(flight.airline)?.name}
              />,
              flight.aircraft ? (
                <Named
                  key="aircraft"
                  code={flight.aircraft}
                  name={aircraftType(flight.aircraft)?.name}
                />
              ) : (
                '—'
              ),
              formatDuration(flight.durationMinutes),
            ],
          }))}
        />
      </Section>
    </Page>
  );
}
