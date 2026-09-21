import CustomLink from '@/components/Link';
import { P, Section, Table } from '@/components/projects/Prose';
import CountryFlags from '@/components/stats/CountryFlags';
import FlightGlobe from '@/components/stats/FlightGlobe';
import { formatDistanceKm, formatDuration } from '@/lib/stats/flights/format';
import { EARTH_CIRCUMFERENCE_KM } from '@/lib/stats/flights/geo';
import { loadFlights } from '@/lib/stats/flights/query';
import { flightTotals, rankRoutes, toLegs } from '@/lib/stats/flights/stats';
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

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-muted text-sm">{label}</dt>
    <dd className="mt-1 text-2xl font-medium tabular-nums">{value}</dd>
  </div>
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
  const timesAroundTheEarth = totals.distanceKm / EARTH_CIRCUMFERENCE_KM;

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
          rows={routes.map(route => [
            `${route.a.city} · ${route.b.city}`,
            route.flights,
            formatDistanceKm(route.distanceKm),
          ])}
        />
      </Section>

      <Section title="Flight log">
        <Table
          head={['Date', 'Route', 'Flight', 'Aircraft', 'Duration']}
          rows={legs.map(({ flight, from, to }) => [
            formatFlownOn(flight.flownOn),
            `${from.iata} → ${to.iata}`,
            `${flight.airline} ${flight.flightNumber}`,
            flight.aircraft ?? '—',
            formatDuration(flight.durationMinutes),
          ])}
        />
      </Section>
    </Page>
  );
}
