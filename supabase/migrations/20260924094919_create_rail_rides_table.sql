-- Every ride on a rail line, one row each. The one table in the rail feature
-- that is entered by hand: `rail_lines` and `rail_line_stops` are feed output,
-- rides are what gets measured against them.
--
-- A ride is either a whole line or a stretch between two of its stops. Both
-- come up: a funicular is ridden end to end, an IR often for three stops. Both
-- stops null means the whole line; both set means the stretch between them.
-- Either order is fine, since a line is ridden in both directions and the
-- sequence only fixes how its stops are listed.
--
-- Stops are Didok numbers, not a foreign key into `rail_line_stops`, whose key
-- is (line_id, sequence): once a December refresh adds a stop, a sequence
-- number can name a different station. The cost is that a Didok off the line
-- cannot be rejected here. The check
-- below catches the shape; the read layer skips a ride whose stops are not on
-- its line with a warning, so the coverage never quietly goes wrong.

create table public.rail_rides (
  id         uuid primary key default gen_random_uuid(),
  line_id    text not null references public.rail_lines (id),
  ridden_on  date not null,
  from_didok text check (from_didok ~ '^[0-9]{7}$'),
  to_didok   text check (to_didok ~ '^[0-9]{7}$'),
  created_at timestamptz not null default now(),
  check ((from_didok is null) = (to_didok is null))
);

-- Every read is a line's rides. Postgres does not index a foreign key itself.
create index rail_rides_line_id_idx on public.rail_rides (line_id);

alter table public.rail_rides enable row level security;

create policy "Rail rides are publicly readable"
  on public.rail_rides for select
  to anon, authenticated
  using (true);

-- The same revoke-then-grant as the flights, for the same reasons: a new public
-- table hands anon and authenticated every privilege, truncate ignores RLS, and
-- grants are checked before policies. Writes happen as the service role, which
-- bypasses both.
revoke all on public.rail_rides from anon, authenticated;

grant select on public.rail_rides to anon, authenticated;
