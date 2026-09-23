-- Every Swiss train line there is to ride, and the stops along each. The rows
-- come from the pipeline in rail/: `lines.csv` and `line_stops.csv` are what the
-- timetable feed produced, and supabase/seeds/rail.sql is generated from them.
-- Once seeded, these tables are the source of truth. Lines get edited here, and
-- a December refresh reconciles into them rather than replacing them.
--
-- Two tables where the flights make do with one, because a line's stops are an
-- ordered list of a few dozen stations each and nothing else here is. They are
-- still feed output rather than reference data: they change every December with
-- the lines they belong to.
--
-- Column names are the CSV headers, so the seed and the pipeline cannot disagree
-- about what a column is called. rail/README.md describes each one.

create table public.rail_lines (
  -- `fernverkehr:IR35`: the network region, a colon, then the line number or,
  -- for a line without one, its category and terminals. Stable across feeds,
  -- which a `route_id` is not, so rides can reference it.
  id              text primary key check (id ~ '^[a-z0-9-]+:[A-Za-z0-9._:-]+$'),
  display_name    text not null,
  -- The feed's `route_desc` code. Unchecked: the feed gains categories, and the
  -- pipeline reports a new one rather than dropping it, so a list here would be
  -- a second copy of rail/src/allowlist/categories.ts that only a migration can
  -- update.
  category        text not null,
  network_region  text not null check (network_region ~ '^[a-z0-9-]+$'),
  operators       text[] not null,
  terminal_a      text not null,
  terminal_b      text not null,
  true_terminal_a text not null,
  true_terminal_b text not null,
  -- Empty on a line seeded by hand, which has no timetable behind it.
  route_ids       text[] not null default '{}',
  -- Both null on a line seeded by hand, for the same reason.
  seasonal        boolean,
  trips_per_week  integer check (trips_per_week >= 0),
  has_geometry    boolean not null,
  created_at      timestamptz not null default now(),
  check (id like network_region || ':%')
);

create table public.rail_line_stops (
  line_id   text not null references public.rail_lines (id),
  -- From 1, in canonical order: the trunk, then each branch block.
  sequence  integer not null check (sequence > 0),
  stop_name text not null,
  sloid     text check (sloid ~ '^ch:1:sloid:[0-9]+$'),
  -- Null only for a stop seeded by hand that the service-point register does
  -- not know.
  didok     text check (didok ~ '^[0-9]{7}$'),
  lat       double precision check (lat between -90 and 90),
  lon       double precision check (lon between -180 and 180),
  via       text not null check (via in ('backbone', 'extension', 'detour', 'branch')),
  -- The Didok number of the stop this one was placed against; null on the trunk.
  junction  text check (junction ~ '^[0-9]{7}$'),
  primary key (line_id, sequence)
);

-- The primary key's index leads with line_id, which is every read: a line's
-- stops, in order. No second index needed for the foreign key.

alter table public.rail_lines enable row level security;
alter table public.rail_line_stops enable row level security;

create policy "Rail lines are publicly readable"
  on public.rail_lines for select
  to anon, authenticated
  using (true);

create policy "Rail line stops are publicly readable"
  on public.rail_line_stops for select
  to anon, authenticated
  using (true);

-- The same revoke-then-grant as the flights, for the same reasons: a new public
-- table hands anon and authenticated every privilege, truncate ignores RLS, and
-- grants are checked before policies. Writes happen as the service role, which
-- bypasses both.
revoke all on public.rail_lines from anon, authenticated;
revoke all on public.rail_line_stops from anon, authenticated;

grant select on public.rail_lines to anon, authenticated;
grant select on public.rail_line_stops to anon, authenticated;
