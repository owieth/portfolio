-- Mocked rides, for a local database only. Real rides are entered in Studio.
-- They cannot live in a migration the way the mocked flights do: the lines they
-- reference come from rail.sql, and seeds run after every migration.
--
-- Each row is a shape the coverage layer has to get right:
--   * a whole line — the Vinifuni, end to end
--   * a stretch — IR35 Olten to Zürich HB
--   * an overlapping stretch on the same line — IR35 Aarau to Thalwil
--   * a stretch given in reverse — IR35 Chur to Sargans, against the sequence
--   * a stretch onto a branch — S12 Winterthur to Schaffhausen, off the trunk
--     at the junction

insert into public.rail_rides (line_id, ridden_on, from_didok, to_didok) values
  ('aare-seeland-mobil-ltb:FUN-2016', '2025-06-14', null, null),
  ('fernverkehr:IR35', '2025-09-05', '8500218', '8503000'),
  ('fernverkehr:IR35', '2026-01-17', '8502113', '8503202'),
  ('fernverkehr:IR35', '2026-02-21', '8509000', '8509411'),
  ('s-bahn-zuerich:S12', '2026-04-11', '8506000', '8503424');
