# Swiss rail lines — data pipeline

The goal is to ride every Swiss train line, which needs a list of the lines. No
one publishes one. The official GTFS feed publishes `route_id`s — one per
operator, per direction, per timetable period, renumbered at every regeneration
— which is a timetable, not an inventory. This directory turns that feed into a
stable list of the things you can actually ride, plus the geometry to draw them.
Everything is rebuilt by one command and the results are committed, so the list
is reviewable and diffable from one December to the next.

The fetch step is implemented, and the feed has been profiled — see
[`RECON.md`](RECON.md). The rest land one by one.

## What counts as a line

A line is a passenger-facing service you can name and ride end to end: the tuple
of **category, line number and network region**, merged across every `route_id`
and every operator that serves it. `IR35` is one line, not one per operator and
not one per direction, even though BLS, SBB and SOB all appear against it in the
feed. The `S10` that SZU, SBB and Thurbo appear against is the opposite case:
the Uetliberg line, a TILO line and a St. Gallen line, three lines in three
regions that share a number and nothing else.

`route_id` is never the identity and never appears in an id, because it changes
with every feed regeneration. Ids are built from the region and the number,
`s-bahn-zuerich:S1`. The region is load-bearing: the 2026 feed has an `S1` in
Basel, Bern, Luzern, St. Gallen and Chur, three of them SBB's, and without it the
merge would fuse five unrelated lines into one.

## Network regions

The feed publishes no network, so the region is derived from where a route
stops. The rules are data, in [`data/regions.json`](data/regions.json): a
`regions` map from slug to display name, and an ordered `rules` list, tried top
to bottom until one matches. A rule is any combination of

- `categories` — the route's category is one of these,
- `agencies` — its operator is one of these, by `agency_id`,
- `lines` — its `route_short_name` is one of these,
- `serves` — it stops at one of these stations, by Didok number,

and files the route under `region`, or, with `"byOperator": true`, under its
operator's slug. A station the train passes without stopping does not count as
served. `note` is free text for the reviewer, since JSON has no comments.

```json
{
  "region": "s-bahn-basel",
  "serves": [{ "didok": "8500010", "name": "Basel SBB" }],
  "note": "Before Aargau, because Basel's S1 runs on to Brugg AG."
}
```

Order is the whole design. Anchors are a network's own hubs, and a station two
networks share is either left out or given to whichever rule comes first, with a
`note` saying why. Long-distance categories share one national region;
funiculars, rack railways, metre-gauge operators and the German networks are
filed under their operator on purpose — each is its own number space.

Adding a region is an edit to the file and nothing else: declare the slug, add a
rule where it belongs in the order, rerun `pnpm build:data`. The names next to
each Didok number and `agency_id` are checked against the feed, so a typo in an
id is reported rather than silently anchoring the wrong station. The run also
reports any rule that matched nothing — a stale rule after a timetable change —
and every route no rule placed. Those fall back to their operator's slug and
are listed, because a route in the wrong region merges into the wrong line.

## Merging routes into lines

Every route that made a stop pattern is filed under a key, and the routes that
share one are one line. The key is its category, line number and region, and
the id is the region and the number: `fernverkehr:IR35`, whichever operator
and direction each of its routes is. The line keeps what it was merged from —
`operators`, `routeIds` and every station any of them serves — but the
`route_id`s are only for the later steps to join on and never reach the id.

The line number is `route_short_name` with the whitespace taken out, so `RE 33`
and `RE33` are one line. Most numbers already say their category, and their ids
leave it out; a bare number gets it in front, because the 2026 feed has an ICE
`3` and a Nightjet `3` in the one national region — `fernverkehr:ICE-3` and
`fernverkehr:NJ-3`. Every rack railway, most funiculars and most TGVs are like
that. A route whose short name is only its category — an SBB
`IC`, a bare `R` — has no number, and no number is not a key: all of SBB's
unnumbered ICs would come out as one line. Those are keyed on their **terminals**
instead, the two ends of the pattern the route runs most, in Didok order so both
directions agree: `fernverkehr:IC:8501008-8503000`. Didok numbers survive a feed
regeneration the way `route_id`s do not. A funicular's BAV number is a number like
any other and keys the line, as `FUN-2350`.

A key is only as good as the region under it. A group whose routes split into
parts that share no station at all — the same `S5` in the same region, running
between two unrelated pairs of stations — is still merged, so the id stays
stable, and listed as a suspect in the run log with each part's routes,
operators and terminals. It is almost always a region rule that is missing, and
the fix is one in `data/regions.json`, not code. The build stops instead if two
categories would still share one id — an `S` route numbered `SN1` next to the
`SN1` — or if a line number has a character that cannot go into an id.

Every sort that reaches an id compares by code unit rather than by locale, and
the log prints a fingerprint over every line, so two runs over the same feed can
be checked for byte-identical ids by reading one line of each.

## Naming lines that have no number

A numbered line is called by its number, `IR35`, with the category in front of a
bare one, `ICE 3`. Lines with no public number — a quarter of the candidate
routes, and every funicular, whose BAV code nobody says out loud — are named
from operator, category and terminals: `RhB R Davos Platz-Landquart`. There is
no field to fall back to instead: `route_long_name` is empty on all 5,170 routes
in the feed and `trip_short_name` is the train number, one per departure. The id
is not touched; a name is what gets corrected by hand once the lines are in
Postgres, and an id that moved with it would orphan what was recorded against
it.

The name is read off one of the patterns the line's routes run, and the choice
is total, so two runs over the same feed name every line the same way:

1. the longest pattern, by stations served — a line is named for where it goes,
   not for the short-turn that runs more often;
2. then the one with the most trips;
3. then the lexically first pair of terminal names, first name first — so when
   Landquart–Davos Platz and Landquart–Klosters Platz tie on both, Davos wins;
4. then the lexically first operator.

The two terminals inside the name are in lexical order too, not running order,
so both directions give one name — which is why it is `Davos Platz-Landquart`
and not the other way round. Every comparison is by code unit, as for the ids.

A funicular is one operator's one line almost everywhere, so it is named for
the operator alone, `Standseilbahn Polybahn`, and gains its terminals only when
two would otherwise share a name — TPN's two in Neuchâtel, the Parsennbahn's two
sections. `ZUG` leaves its category out, since it names none and reads as the
city.

The operator is the short form in [`data/operators.json`](data/operators.json),
keyed by `agency_id` with the feed's name next to it, and checked against the
feed like the region rules: `RhB` for `Rhätische Bahn`, and for a company that
runs one funicular, the funicular's own name — `Polybahn` for
`Poly-Bahn Zürich`. An operator missing from the file is not an error; its
lines carry the feed's full name and the log says to add it.

Every derived name is marked `nameSource: derived`, for the report to list for a
hand check. `review` says when one needs more than a glance: `unknown-operator`
for a full-name fallback, and `duplicate-name` for two lines that came out with
one name — flagged, never silently renamed. The log prints a fingerprint over
every name, the same as the merge step's over every id.

## Funiculars the feed does not have

A funicular with no tariff integration has no obligation to publish a timetable,
and one that does not is still a line to ride. Those are written down by hand in
[`data/funiculars.json`](data/funiculars.json), one entry per line: an id, a
display name, the operator, the category, and the stops in running order with
their coordinates and, where the service-point register has one, the Didok
number. The terminals are the first and last stop rather than a field of their
own. The id is written out, in the same shape as a feed line's, with the
operator's slug as the region, so that it survives a stop being renamed.

The seeded lines join the line set after every step that reads the feed, and
every line comes out marked with where it came from: `source: feed` or
`source: manual`, with `nameSource: manual` and no `route_id`s on the second
kind. The log counts the manual lines separately, and so will the report. A
seeded id the feed already has stops the build. A seeded stop that a feed line
of the same category now serves is logged, so the entry comes out at the next
December refresh rather than riding along as a second copy.

The 2026 file has one entry. The recon found every privately run funicular it
searched for in the feed, so the rest were found by cross-checking the
service-point register's `CABLE_RAILWAY` points against the feed's 53 funicular
routes. The only operator that came back unmatched and open to the public was
KWO Seilbahnen's **Gelmerbahn**, Handegg to Gelmersee. Its stations are in the
register, but the feed has no route between them. The other unmatched points are
Zurich Airport's airside Skymetro and a handful of placeholder entries, and
neither is a line to ride. Linth-Limmern, a power-station funicular, has no
stop in the register at all.

Like every other line, a seeded one goes into `rail_lines` when the tables are
seeded. From then on it is edited in Postgres, and the file is a record of why it
was added.

## What is included and excluded

The principle: on a rail it is in, on a rope it is out. Funiculars run on rails
and count.

The lists are written in `route_desc`, not `route_type`. The recon found that
`route_desc` is the finer of the two and that each of its codes maps to exactly
one `route_type`, so a `route_type` rule cannot express the include list — 102
is IC, EC, ICE and RJX at once, and 117 is `EXT`, which the range 100–117 would
have included and the exclusion below would never have caught.

- **Included** — `IC`, `EC`, `ICE`, `RJX`, `TGV`, `IR`, `PE`, `S`, `SN`, `R`,
  `RE`, `RB`, `NJ`, `CC` and `ZUG` — all within `route_type` 100 to 116 — plus
  funiculars (`FUN`, 1400). 676 of the feed's 5,170 routes.
- **Excluded** — `EXT` special-event trains (117), `TER` (106), buses (`B`,
  `EV`, `EXB`, `BN`, `BP`, `RUB`, `CAR` — 2xx and 7xx), trams (`T`, 900), metro
  (`M`, 401), boats (`BAT`, `FAE`, 1000), aerial lifts and gondolas (`PB`, `GB`,
  `SL`, 1300), lifts (`ASC`, 1303) and taxis (`TX`, 1500).

The foreign categories were the open question the recon left to #468, and the
cut runs between `TER` and the rest. `TER` is 190 routes of SNCF's French
regional network, arriving in the feed wholesale and mostly never touching
Switzerland; `TGV` and `RB` are equally foreign-operated but run Swiss-facing
services you board from a Swiss platform. Geography is not a thing `routes.txt`
knows, so this is the closest the allowlist can get — a later step with
`stops.txt` in hand can be stricter.

`ZUG` is one SNCF route of six trips. The recon read the code as literally
"train", a category carrying no category; it is also the name of a Swiss city,
and the feed settles neither reading. It rides on rails either way, so it is
included and flagged in the log rather than decided by the filter, and its name
leaves the category out and works from operator and terminals alone.

Both lists live in `src/allowlist/categories.ts`, transcribed from `RECON.md` §1
and **verified against the feed before they are used**, not assumed. A
`route_desc` in neither list — or one that has moved to a different
`route_type` — is counted and reported rather than silently dropped, so a new
code appearing in a future feed is visible.

## Service days and the reference week

GTFS says when a service runs twice over: `calendar.txt` as a weekday pattern
between two dates, and `calendar_dates.txt` as single days added to or removed
from it. The Swiss feed leans on the second almost entirely — 83,752 services
against 11 million exceptions — and states "summer only" as a service running
every day of the year with every day outside the season removed again. So
neither file says whether a line runs on a given day, and the pipeline expands
the two into the days each service actually runs, clipped to the feed year that
`feed_info.txt` gives. For the 2026 feed that is 2025-12-14 to 2026-12-12 and
4.6 million service days; the Schynige Platte Bahn comes out running from
13 June to 25 October, and the Brienz Rothorn Bahn from 9 May to 25 October
across its two `route_id`s.

Weekly trip counts are taken over one named week, the **reference week: the
first full Monday-to-Sunday week of September in the year the feed ends in** —
2026-09-07 to 2026-09-13 for the 2026 feed, 2027-09-06 to 2027-09-12 for 2027.
No week is typical by accident. The feed opens on the December switch and runs
straight into the Christmas timetables, spring carries Ascension and Whit
Monday, and a summer-only line has zero trips in every week from November to
May. Early September avoids all of it: the summer lines still run, 1 August is
behind it and the Federal Day of Thanksgiving is the third Sunday, after it, and
most cantonal school holidays are over. It is derived by rule rather than
written down as a date, so it means the same thing every December, and it is
defined once, in `src/calendar/week.ts` — the calendar step returns it, and
nothing downstream picks its own.

## Stop patterns

A line is not one list of stops. It has short-turns, branches, and trains that
skip stations at some hours, and "which segments of this line have I ridden"
only stays answerable if all of them survive until the step that builds the
canonical sequence. So the pipeline records every distinct **stop pattern** each
route runs: the ordered list of stations one of its trips serves.

- **Stations, not platforms.** A stop becomes its `parent_station`, the same
  collapse the stations step makes. Two trips that differ only in the track they
  use are one pattern.
- **Served stops only.** A stop the train passes without serving (pickup and
  drop-off both `1`) is not a place you can ride to, so it is left out.
- **Swiss stations only.** An EC to Milano is its Swiss stops. A trip left with
  fewer than two has nothing to ride and makes no pattern. 113 allowed routes in
  the 2026 feed come out with none, almost all of them TGV, DB Regio and ÖBB
  services that reach a border station and no further. That is the geographic
  cut `routes.txt` could not make.
- **Direction counts.** Brugg to Schaffhausen and Schaffhausen to Brugg are two
  patterns. Merging the two directions is the line's job, not the pattern's.

A pattern's identity is the first 16 hex characters of the sha256 of its station
list, space-joined Didok numbers. That is a function of the stops and nothing
else, so the same stops in the same order hash the same in every feed. The
`trip_id` and `service_id` the patterns are counted from are never stored,
because both are renumbered at every regeneration. The build fails if two lists
ever share a hash, rather than trusting 64 bits.

Each pattern carries two counts: `trips`, the trips that serve exactly that list,
and `runs`, the same trips weighted by the days each one runs in the feed year.
`runs` is the one to rank by. A pattern with forty `trip_id`s that each run on
one Saturday is rarer than a pattern with one `trip_id` that runs every day.

The 2026 feed gives 6,178 patterns over 563 routes. The SBB `S12` shows what they
are for: it runs Brugg AG to Winterthur, and from there either to Schaffhausen or
to Wil SG. From Brugg it has seven patterns ending at one of those three
stations, and 31 in all once the reverse direction and the turnbacks are
counted. The log prints a fingerprint over every pattern and both of its counts,
so two runs over the same feed can be compared by reading one line of each.

## Data sources

- **Timetable — the official Swiss GTFS Static feed.**
  [`timetable-2026-gtfs2020`](https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020)
  and [`timetable-2027-gtfs2020`](https://data.opentransportdata.swiss/en/dataset/timetable-2027-gtfs2020),
  one dataset per timetable year, republished every few days within the year.
  The current download URL is resolved at runtime, because it changes with every
  regeneration.
- **Mirror — [gtfs.geops.ch](https://gtfs.geops.ch/).** geOps converts the
  official publication to GTFS daily and offers `dl/gtfs_complete.zip` plus
  per-mode splits, including `dl/gtfs_train.zip` and `dl/gtfs_funicular.zip`.
  It is **opt-in through `--source geops`, never an automatic fallback**: geOps
  re-derives the feed with its own ids, so a silent switch would rewrite the
  committed artifacts and the December diff would show a wall of changes that
  look like timetable changes and are not.
- **Geometry — the Overpass API against OpenStreetMap**, `route=train` and
  `route=funicular` relations within Switzerland. **The only source there is.**
  Neither the official feed nor the geOps mirror ships a `shapes.txt` — checked,
  not assumed — so OSM is the primary geometry source with nothing behind it.
  The BAV's `ch.bav.schienennetz` layer has the geometry but is keyed on a BAV
  line number the GTFS feed does not publish, which is a join nobody can make
  today.

### What the portal actually does

Everything below cost time to find out and none of it is in the documentation.

- The portal host is `data.opentransportdata.swiss`. The bare
  `opentransportdata.swiss/en/dataset/…` **404**s.
- The documented CKAN JSON API is unusable: `/api/3/action/package_show` answers
  **403** from nginx to every unauthenticated client, browser `User-Agent` or
  not — the whole `/api/` path is blocked. **The DCAT serialisations of the same
  dataset are public**, though: `…/en/dataset/<id>.jsonld`, `.rdf`, `.xml` and
  `.ttl` all answer 200, and `.jsonld` needs no extra parser. That is what the
  pipeline reads. It **308**s to `/dataset_series/<id>.jsonld` — these are
  DCAT-AP dataset *series* — so the redirect has to be followed.
- Inside the catalogue: `@graph` is unordered and the first distribution in the
  live 2026 response was ten months old; `dct:identifier` spells the date two
  ways in one series (`GTFS_FP2026_20260919.zip` and `GTFS_FP2026_2025-06-23.zip`);
  `dcat:byteSize` is absent on some distributions; and `dct:license` differs
  between distributions of the same dataset. Recency therefore comes from
  `dct:issued` and nothing else.
- The download URL **302**s to a Cloudflare R2 presigned URL with
  `X-Amz-Expires=60`, and **`HEAD` against it answers 403** because the signature
  is method-scoped — the usual HEAD-for-the-ETag cache probe is impossible. A
  ranged GET works, and Node's `fetch` does forward `If-None-Match` across that
  cross-origin redirect. The pipeline needs neither: the CKAN resource uuid is
  immutable per publication, which is a stronger check than an ETag and costs no
  request.
- `dct:temporal` gives the timetable period: 2026 runs 2025-12-14 to 2026-12-12,
  2027 starts 2026-12-13. Both start on the **second Sunday of December**, which
  is the rule `--year` defaults on.
- The mirror is the opposite shape. `gtfs_complete.zip` is one mutable, undated
  URL rebuilt daily, so ETag and Last-Modified are its only version signal — but
  `HEAD` works there and a conditional GET answers 304 as it should.

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
pnpm build:data --year 2027     # the next timetable, once the portal publishes it
pnpm build:data --source geops  # when the official portal is down
pnpm recon:data                 # regenerate RECON.md from the feed
```

A run writes the five committed artifacts at the top of this directory, and the
download cache under `data/raw/`, which is gitignored. A run never writes to
Supabase.

### Caching

Each feed lands in its own directory, named for the publication it came from:

```
data/raw/otd-fp2026-20260919/
├── gtfs.zip      the archive as published
├── gtfs/         its members, unpacked
├── rail.duckdb   the ingested stop times, service days and stop patterns, written by the build
└── feed.json     provenance — written last, so its presence means the rest is complete
```

A second run resolves the catalogue, recognises the publication it already has,
and downloads nothing. `feed.json` records the resolved URL, the CKAN resource
uuid, the publication timestamp, the sha256 of the archive and when it was
fetched — enough to say exactly which feed an artifact was built from, which is
the question that matters when a line disappears between two Decembers. It also
separates `fetchedAt` from `checkedAt`, so a cache hit does not make the record
claim the bytes are newer than they are.

Budget about 256 MB per archive and several gigabytes unpacked — `stop_times.txt`
alone is over 3 GB. Older feeds are reported after a download but never deleted
automatically; `rm -rf data/raw/<feed-id>` when you are done with one, which also
forces the next run to fetch it again.

`rail.duckdb` is the same kind of thing: a cache, never reviewed, always safe to
delete. It holds `stop_times.txt` narrowed to the five columns a line is made of
— trip, sequence, stop, and the two flags that mark a stop the train passes
without serving — sorted into trip order, so the four later steps that walk a
trip's stops query a table instead of re-parsing gigabytes of CSV apiece. A run
that finds it still answers for the CSV on disk leaves it alone; `--force`
rebuilds it.

It also holds `service_days`, the calendar expanded into one row per service per
day it runs, and `patterns`, every distinct stop list each route runs — see
above. Both are rebuilt on every run: they take about ten seconds and two, which
is not worth a cache check.

The ingest pins DuckDB's buffer pool to 2 GB and gives it somewhere to spill, so
what it costs is a property of the feed rather than of the machine — the default
is 80% of whatever RAM the machine has, which would make the same run mean
something different on every laptop. The 2026 feed turns 3.0 GB of
`stop_times.txt` into 432 MB of table in about 7 seconds, at a peak of 3 GB
resident: the buffer pool is the 2 GB of it, and the CSV reader and Node account
for the rest. The run log prints the wall time and the peak it actually reached,
so a feed that outgrows this is visible rather than mysterious.

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
├── RECON.md          what the feed was found to contain, before modelling
├── src/              the pipeline; src/cli.ts is the entry point
├── data/             committed lookups and seed files, reviewed by hand
└── data/raw/         the feed and Overpass cache, gitignored and disposable
```

The generated artifacts — `lines.csv`, `line_stops.csv`, `lines.json`,
`lines.geojson` and `REPORT.md` — land at the top of this directory and are
committed.

`RECON.md` sits next to them but is not one of them. `pnpm build:data` does not
write it and nothing downstream reads it: it is what the feed was found to
contain before any of this was modelled, regenerated on demand by
`pnpm recon:data` and committed so the answers stay next to the code that trusts
them. It names the publication it describes and reads nothing from the clock, so
rerunning it against the same feed produces the same bytes.

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
