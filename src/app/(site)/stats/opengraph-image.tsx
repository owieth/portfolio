import { ImageResponse } from 'next/og';

import { flagDataUri } from '@/lib/stats/flights/flag-data';
import { formatDistanceKm, formatDuration } from '@/lib/stats/flights/format';
import { passportMapDataUri } from '@/lib/stats/flights/passport-map';
import {
  chipSvg,
  circularArrowSvg,
  dataUri,
  planePitch,
  securityStripSvg,
} from '@/lib/stats/flights/passport-chrome';
import { mrzLine } from '@/lib/stats/flights/passport-mrz';
import { MAP_SIZE } from '@/lib/stats/flights/projection';
import { loadFlights } from '@/lib/stats/flights/query';
import {
  airportVisits,
  countryVisits,
  flightTotals,
  rankAirlines,
  toLegs,
} from '@/lib/stats/flights/stats';

/**
 * The flight log as a travel document.
 *
 * A segment card, so it replaces the route group's generic one for /stats and
 * nowhere else. `nodejs` rather than the `edge` that card runs on: this one
 * reads the flights, and `loadFlights` pulls in `server-only` and the Supabase
 * client whose own fetch carries the hour of revalidation. No `dynamic` and no
 * `revalidate` export — the route touches no dynamic API, so Next prerenders
 * it at build and inherits that same hour, which is what puts a static PNG in
 * front of the unfurl bots.
 *
 * Every value here is a literal. Satori has no stylesheet, so none of the
 * theme tokens in `globals.css` reach it, and no font is passed either —
 * `ImageResponse` already falls back to Geist Regular, and passing one font
 * would replace the whole default set rather than add to it. There is
 * therefore no bold and no mono: the hierarchy is size, letter-spacing and
 * opacity, which is most of what a bio page has ever used.
 *
 * The `alt=""` on every image is for the linter rather than for a reader:
 * satori composites these into one PNG, and what a screen reader is offered is
 * the `alt` exported below.
 */

export const runtime = 'nodejs';
export const alt = 'Olivier Winkler — the flight log as a passport';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ACCENT = '#71BC92';
const PANEL = '#0B0B0B';

const STRIP_HEIGHT = 40;
const MAP_PANEL_HEIGHT = 334;
const FLAG_SIZE = 30;

/**
 * Roughly the thirds of the strip, which is where a passport breaks its own
 * print for an emblem — snapped to the plane spacing, so each break covers
 * whole glyphs instead of leaving half a wing beside the code.
 */
const STRIP_BREAKS = [8, 23].map(index => index * planePitch(STRIP_HEIGHT));

const Field = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
    <div
      style={{
        display: 'flex',
        // Sized for the unfurl rather than for the card: at the ~30% Slack
        // renders this at, 13px was a grey smudge.
        fontSize: 15,
        letterSpacing: '0.18em',
        color: 'rgba(255,255,255,0.55)',
      }}
    >
      {label}
    </div>
    <div
      style={{
        display: 'flex',
        marginTop: 6,
        fontSize: 40,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </div>
  </div>
);

/**
 * What the card falls back to when there is nothing to put on it.
 *
 * `loadFlights` answers an empty list for an unconfigured deploy, an
 * unreachable database and a genuinely empty log alike — the same three shapes
 * `/stats` collapses into one empty state. A passport reading `0 FLIGHTS` with
 * an MRZ of zeros is a worse share card than the site's generic one, so this
 * is the generic one.
 */
const generic = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'Geist',
    }}
  >
    <div style={{ display: 'flex', fontSize: 64, letterSpacing: '-0.02em' }}>
      Olivier Winkler
    </div>
    <div
      style={{
        display: 'flex',
        marginTop: 20,
        fontSize: 28,
        color: 'rgba(255,255,255,0.6)',
      }}
    >
      Building Software for the Future.
    </div>
    <div
      style={{ display: 'flex', marginTop: 20, fontSize: 22, color: ACCENT }}
    >
      frigg.eco
    </div>
  </div>
);

export default async function Image() {
  const { flights } = await loadFlights();
  const legs = toLegs(flights);

  if (legs.length === 0) return new ImageResponse(generic(), { ...size });

  const totals = flightTotals(legs);
  const airlines = rankAirlines(legs).length;
  // The schema has no home airport, and inventing a constant for one would be
  // a second thing to keep true. The most-visited airport is the same answer
  // for anyone whose log has a base, and it is derived from the data.
  const home = airportVisits(legs)[0].airport.iata;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: 'Geist',
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: size.width,
          height: STRIP_HEIGHT,
        }}
      >
        <img
          alt=""
          src={dataUri(securityStripSvg(size.width, STRIP_HEIGHT))}
          width={size.width}
          height={STRIP_HEIGHT}
        />
        {STRIP_BREAKS.map(left => (
          <div
            key={left}
            style={{
              display: 'flex',
              position: 'absolute',
              top: 0,
              left,
              height: STRIP_HEIGHT,
              alignItems: 'center',
              gap: 10,
              paddingLeft: 16,
              paddingRight: 16,
              // The planes run underneath; this is what interrupts them.
              // Drawing the code into the strip's own SVG would not work:
              // satori rasterises it through resvg, which carries no font.
              backgroundColor: PANEL,
              fontSize: 17,
              letterSpacing: '0.26em',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {home}
            <img
              alt=""
              src={dataUri(circularArrowSvg(19))}
              width={19}
              height={19}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          position: 'relative',
          flexDirection: 'column',
          alignItems: 'center',
          width: size.width,
          height: MAP_PANEL_HEIGHT,
          // The map is drawn a little taller than the panel so the fade has
          // ocean to eat into rather than continents.
          overflow: 'hidden',
        }}
      >
        <img
          alt=""
          src={passportMapDataUri(legs)}
          width={MAP_SIZE.width}
          height={MAP_SIZE.height}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: size.width,
            height: 96,
            // So a route running south does not collide with the flag row.
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0), #000)',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 16,
            left: 0,
            width: size.width,
            justifyContent: 'center',
            gap: 7,
          }}
        >
          {countryVisits(legs).map(({ country }) => (
            <div
              key={country.code}
              style={{
                display: 'flex',
                width: FLAG_SIZE,
                height: FLAG_SIZE,
                borderRadius: FLAG_SIZE / 2,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              <img
                alt=""
                src={flagDataUri(country.code)!}
                width={FLAG_SIZE}
                height={FLAG_SIZE}
                style={{ objectFit: 'cover' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'space-between',
          padding: '24px 56px 22px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 17,
                letterSpacing: '0.34em',
                color: ACCENT,
              }}
            >
              ALL-TIME FLIGHT PASSPORT
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 8,
                fontSize: 30,
                letterSpacing: '0.08em',
              }}
            >
              OLIVIER WINKLER
            </div>
          </div>
          <img alt="" src={dataUri(chipSvg(52, 41))} width={52} height={41} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Field label="FLIGHTS" value={String(totals.flights)} />
          <Field label="DISTANCE" value={formatDistanceKm(totals.distanceKm)} />
          <Field
            label="FLIGHT TIME"
            value={formatDuration(totals.durationMinutes)}
          />
          <Field label="AIRPORTS" value={String(totals.airports)} />
          <Field label="AIRLINES" value={String(airlines)} />
        </div>

        <div
          style={{
            display: 'flex',
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.12)',
            fontSize: 24,
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.62)',
          }}
        >
          {mrzLine(totals, airlines)}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
