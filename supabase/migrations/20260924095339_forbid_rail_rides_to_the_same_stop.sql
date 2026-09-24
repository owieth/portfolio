-- A stretch from a stop to itself covers nothing, so it is a typo rather than a
-- ride. The same rule as `origin <> destination` on the flights. A whole-line
-- ride has both stops null, which the check lets through.

alter table public.rail_rides
  add check (from_didok <> to_didok);
