-- 26 mocked flights matching real trips: 13 airports, 3700 minutes of block
-- time (2d 13h40m). Real data replaces this via a Flighty CSV import later;
-- the schema is already shaped for it.
--
-- Two shapes here are deliberate, because they are what breaks a naive "every
-- flight is a return trip" assumption in the ranking layer:
--   * an open jaw — out to Boston, back from New York
--   * a connection in both directions — Rhodes via Vienna, there and back

insert into public.flights
  (flown_on, origin, destination, airline, flight_number, aircraft, duration_minutes)
values
  ('2017-07-14', 'ZRH', 'BCN', 'LX', '1954', 'A320',       110),
  ('2017-07-21', 'BCN', 'ZRH', 'LX', '1955', 'A320',       105),
  ('2018-03-09', 'ZRH', 'LHR', 'LX', '338',  'A220-300',   110),
  ('2018-03-12', 'LHR', 'ZRH', 'LX', '339',  'A220-300',   100),
  ('2018-09-28', 'BSL', 'AMS', 'KL', '1982', 'E190',        90),
  ('2018-10-02', 'AMS', 'BSL', 'KL', '1983', 'E190',        85),
  ('2019-05-17', 'ZRH', 'OSL', 'LX', '1268', 'A220-100',   145),
  ('2019-05-24', 'OSL', 'ZRH', 'LX', '1269', 'A220-100',   140),
  ('2019-11-01', 'ZRH', 'LIS', 'LX', '2080', 'A320neo',    170),
  ('2019-11-08', 'LIS', 'ZRH', 'LX', '2081', 'A320neo',    160),
  ('2021-08-13', 'ZRH', 'LHR', 'BA', '711',  'A320',       105),
  ('2021-08-16', 'LHR', 'ZRH', 'BA', '716',  'A320',        95),
  ('2022-04-22', 'ZRH', 'BER', 'LX', '1082', 'A220-300',    85),
  ('2022-04-25', 'BER', 'ZRH', 'LX', '1083', 'A220-300',    90),
  ('2022-09-30', 'ZRH', 'VIE', 'OS', '566',  'A320',        80),
  ('2022-09-30', 'VIE', 'RHO', 'OS', '813',  'A320',       135),
  ('2022-10-09', 'RHO', 'VIE', 'OS', '814',  'A320',       140),
  ('2022-10-09', 'VIE', 'ZRH', 'OS', '561',  'A320',        85),
  ('2023-06-02', 'GVA', 'LHR', 'BA', '731',  'A320neo',    105),
  ('2023-06-06', 'LHR', 'GVA', 'BA', '730',  'A320neo',     95),
  ('2024-02-16', 'ZRH', 'OSL', 'SK', '1478', 'A320neo',    150),
  ('2024-02-23', 'OSL', 'ZRH', 'SK', '1477', 'A320neo',    145),
  ('2025-03-07', 'ZRH', 'LHR', 'LX', '316',  'A220-300',   110),
  ('2025-03-11', 'LHR', 'ZRH', 'LX', '317',  'A220-300',   100),
  ('2026-05-08', 'ZRH', 'BOS', 'LX', '54',   'A330-300',   505),
  ('2026-05-19', 'JFK', 'ZRH', 'LX', '17',   'B777-300ER', 460);
