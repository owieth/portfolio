-- The flight log reads newest first, which is `order by flown_on desc`. That
-- is not a total order: `flown_on` is a date, and a connection is two flights
-- on one day. `created_at` is the obvious tiebreaker and does the job for
-- every row added since — but not for the seed, because `now()` is
-- `transaction_timestamp()` and all 26 rows went in on one statement, so they
-- share a created_at to the microsecond.
--
-- Only relative order inside a day matters, and only two days are ambiguous:
--
--   2022-09-30  ZRH -> VIE (OS 566), then VIE -> RHO (OS 813)
--   2022-10-09  RHO -> VIE (OS 814), then VIE -> ZRH (OS 561)
--
-- Nudging the second leg of each connection is enough to fix the order the way
-- the trip actually happened. Flight numbers are unique across the seed.
--
-- A departure timestamp would model this properly rather than leaning on a
-- bookkeeping column, but that is a schema change and a Flighty CSV import
-- brings real times with it. Not worth doing twice.

update public.flights
set created_at = created_at + interval '1 second'
where flight_number in ('813', '561');
