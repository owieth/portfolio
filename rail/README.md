# Swiss rail lines — data pipeline

The goal is to ride every Swiss train line, which needs a list of the lines. No
one publishes one. The official GTFS feed publishes `route_id`s — one per
operator, per direction, per timetable period, renumbered at every regeneration
— which is a timetable, not an inventory. This directory turns that feed into a
stable list of the things you can actually ride, plus the geometry to draw them.
Everything is rebuilt by one command and the results are committed, so the list
is reviewable and diffable from one December to the next.

Nothing here is implemented yet. This is the skeleton and the command; the steps
land one by one.

## What counts as a line

A line is a passenger-facing service you can name and ride end to end: the tuple
of **category, line number and network region**, merged across every `route_id`
and every operator that serves it. `S10` is one line, not one per operator and
not one per direction, even though SZU, SBB and Thurbo all appear against it in
the feed.

`route_id` is never the identity and never appears in an id, because it changes
with every feed regeneration. Ids are built from the region and the number,
`s-bahn-zuerich:S1`. The region is load-bearing: `S1` exists in Zürich, Bern,
Basel, Luzern, St. Gallen and Vaud, and without it the merge would fuse six
unrelated lines into one.

Lines with no public number — most narrow-gauge, rack and funicular services
carry only a category — are named from operator, category and terminals, as in
`RhB R Landquart-Davos Platz`. Those names are flagged in the report for a hand
check.

## What is included and excluded

The principle: on a rail it is in, on a rope it is out. Funiculars run on rails
and count.

- **Included** — `route_type` 100 to 117, which covers IC, IR, RE, R, S-Bahn,
  EC, PE and the rack railways, plus funiculars (1400, `route_desc` `FUN`).
- **Excluded** — buses (2xx and 7xx), trams (900), metro (401), boats (1000),
  aerial lifts and gondolas (1300), lifts (1303), taxis, and `EXT` special-event
  trains.

Both lists are **verified against the feed before they are used**, not assumed.
A `route_type` the pipeline does not recognise is counted and reported rather
than silently dropped, so a new code appearing in a future feed is visible.

## Data sources

- **Timetable — the official Swiss GTFS Static feed.**
  [`timetable-2026-gtfs2020`](https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020)
  and [`timetable-2027-gtfs2020`](https://data.opentransportdata.swiss/en/dataset/timetable-2027-gtfs2020),
  one dataset per timetable year, republished frequently within the year. Two
  things that cost time if you rediscover them: the portal host is
  `data.opentransportdata.swiss` and the bare `opentransportdata.swiss/en/dataset/…`
  **404**s, and the documented CKAN JSON API at `/api/3/action/package_show`
  currently answers **403** to an unauthenticated client, so resolving the
  download URL needs an API key or the dataset page itself.
- **Mirror — [gtfs.geops.ch](https://gtfs.geops.ch/).** geOps converts the
  official publication to GTFS daily and offers `dl/gtfs_complete.zip` plus
  per-mode splits, including `dl/gtfs_train.zip` and `dl/gtfs_funicular.zip`.
  The fallback for when the official portal is down.
- **Geometry — the Overpass API against OpenStreetMap**, `route=train` and
  `route=funicular` relations within Switzerland. GTFS `shapes.txt` is checked
  first; if it covers most lines, OSM becomes the fallback rather than the
  primary source.

## Licensing and attribution

**opentransportdata.swiss.** The [terms of use](https://opentransportdata.swiss/en/terms-of-use/)
require, in clause 5.1, that "the URL opentransportdata.swiss must be cited as
the source for raw data in publications and analyses that make use of ODMCH
data". Clause 5.1.1 exempts databases drawing on many sources — one entry in a
list of sources is enough. Clause 5.2 requires derived data to be updated at the
same frequency as the raw data, which is the licensing reason the refresh is
annual rather than whenever.

**OpenStreetMap.** Geometry derived from OSM is licensed under
[ODbL 1.0](https://www.openstreetmap.org/copyright). Anything rendered from
`lines.geojson` must carry "© OpenStreetMap contributors", and derived geometry
is share-alike. The attribution ships **next to** the geometry output rather
than only here, so a consumer of the file cannot lose it.

## Running it

No second toolchain and no database server — the pipeline is TypeScript on the
repo's existing pnpm setup, with DuckDB embedded through `@duckdb/node-api`.

```sh
pnpm install
pnpm build:data
```

A run writes the five committed artifacts at the top of this directory, and the
download cache under `data/raw/`, which is gitignored. A run never writes to
Supabase.

## Relationship to Supabase

`lines.csv` and `line_stops.csv` seed the `rail_lines` and `rail_line_stops`
tables. **Once seeded, Postgres is the source of truth** — the lines get edited
there or through the UI, and the committed CSVs are a snapshot of what the feed
produced, not live data.

That makes a re-seed destructive, so a refresh reconciles rather than replaces:
it upserts by the stable line id, leaves hand-edited fields alone, and flags a
line that has disappeared from the feed instead of deleting it. Reconciling is a
deliberate second step with a dry-run mode, never part of `pnpm build:data`.

## Refreshing the data

The feed changes at the mid-December timetable switch and line numbers change
with it, so the refresh is annual: bump the year, run `pnpm build:data`, read
`pnpm diff:data` and `REPORT.md`, commit the snapshot, then run the reconcile in
dry-run before applying it.

The full December runbook — what a real line change looks like next to a feed
artefact, and what to check in the diff — is written once `pnpm diff:data`
actually does something.

## Layout

```
rail/
├── README.md         this file
├── src/              the pipeline; src/cli.ts is the entry point
├── data/             committed lookups and seed files, reviewed by hand
└── data/raw/         the feed and Overpass cache, gitignored and disposable
```

The generated artifacts — `lines.csv`, `line_stops.csv`, `lines.json`,
`lines.geojson` and `REPORT.md` — land at the top of this directory and are
committed.

## Later: checking in to the train I am on

[transport.opendata.ch](https://transport.opendata.ch) is the intended source
for a future "check in to the train I am on" feature. It is deliberately not
part of this pipeline: it is a live connections and departures API — unofficial,
backed by search.ch, and it points at opentransportdata.swiss itself for bulk
data — which answers "what is departing from here right now". That is exactly
what a check-in needs and exactly the wrong shape for an offline annual
inventory.

The join between the two worlds is the station identifier, which is why the
pipeline carries the SLOID and the Didok/UIC number through into the artifacts
rather than stopping at station names.
