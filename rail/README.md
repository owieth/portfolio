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
and every operator that serves it. `S10` is one line, not one per operator and
not one per direction, even though SZU, SBB and Thurbo all appear against it in
the feed.

`route_id` is never the identity and never appears in an id, because it changes
with every feed regeneration. Ids are built from the region and the number,
`s-bahn-zuerich:S1`. The region is load-bearing: `S1` exists in Zürich, Bern,
Basel, Luzern, St. Gallen and Vaud, and without it the merge would fuse six
unrelated lines into one.

Lines with no public number — a quarter of the candidate routes, every funicular
among them — are named from operator, category and terminals, as in
`RhB R Landquart-Davos Platz`. There is no field to fall back to instead:
`route_long_name` is empty on all 5,170 routes in the feed and `trip_short_name`
is the train number, one per departure. Those names are flagged in the report
for a hand check.

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
included and flagged in the log rather than decided by the filter — #475 has to
name it whichever it turns out to be.

Both lists live in `src/allowlist/categories.ts`, transcribed from `RECON.md` §1
and **verified against the feed before they are used**, not assumed. A
`route_desc` in neither list — or one that has moved to a different
`route_type` — is counted and reported rather than silently dropped, so a new
code appearing in a future feed is visible.

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
├── gtfs.zip    the archive as published
├── gtfs/       its members, unpacked
└── feed.json   provenance — written last, so its presence means the rest is complete
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
