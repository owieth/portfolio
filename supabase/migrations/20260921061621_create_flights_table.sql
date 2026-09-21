-- Every flight taken, one row each. Rows carry IATA codes and nothing else
-- about the airports: coordinates, names and countries are immutable reference
-- data and live in git (src/lib/stats/flights/airports.ts), not in a second
-- table nobody would ever open Studio to edit.
--
-- The cost of that is a typo'd code can no longer be rejected by a foreign key.
-- The check constraints below catch the shape; the read layer catches the rest
-- by skipping codes missing from the registry with a warning, so the totals
-- never quietly go wrong.

create table public.flights (
  id               uuid primary key default gen_random_uuid(),
  flown_on         date not null,
  origin           text not null check (origin ~ '^[A-Z]{3}$'),
  destination      text not null check (destination ~ '^[A-Z]{3}$'),
  airline          text not null,
  flight_number    text not null,
  aircraft         text,
  -- Scheduled block time, gate to gate — not time in the air. Stored rather
  -- than derived, because block time is not a function of distance.
  duration_minutes integer not null check (duration_minutes > 0),
  created_at       timestamptz not null default now(),
  check (origin <> destination)
);

-- Every read is the flight log, newest first.
create index flights_flown_on_idx on public.flights (flown_on desc);

alter table public.flights enable row level security;

create policy "Flights are publicly readable"
  on public.flights for select
  to anon, authenticated
  using (true);

-- Revoke first, then grant back exactly one privilege. A project created today
-- hands anon and authenticated *all* privileges on new public tables, and
-- `revoke insert, update, delete` would leave truncate, references and trigger
-- behind. Truncate is the one that matters: RLS does not apply to it at all, so
-- with the policy above in place and no write grants, anon can still empty the
-- table. Trigger is worse in kind — it lets a role attach a function that runs
-- under someone else's write.
revoke all on public.flights from anon, authenticated;

-- The grant and the policy, both. Postgres evaluates table grants *before* RLS,
-- so a policy alone is not enough once Supabase moves the automatic grant on
-- new public tables from default to opt-in:
-- https://github.com/orgs/supabase/discussions/45329
-- The two failures also read differently — a missing grant is a permission
-- error, a policy matching nothing is an empty result.
--
-- Writes happen in Studio as the service role, which bypasses both.
grant select on public.flights to anon, authenticated;
