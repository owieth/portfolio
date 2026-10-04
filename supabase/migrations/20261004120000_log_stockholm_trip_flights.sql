-- The first real flights in the log, beside the mocked seed: out to Stockholm,
-- back from Copenhagen. Another open jaw, so two routes rather than one flown
-- twice.

insert into public.flights
  (flown_on, origin, destination, airline, flight_number, aircraft, duration_minutes)
values
  ('2026-09-30', 'ZRH', 'ARN', 'LX', '1250', 'A320neo', 145),
  ('2026-10-04', 'CPH', 'ZRH', 'LX', '1271', 'A320neo', 110);
