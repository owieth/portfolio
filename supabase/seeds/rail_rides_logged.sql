-- Rides logged by hand, one row per train actually taken. Unlike
-- `rail_rides.sql`, nothing here is estimated: each row is a line I rode on
-- that date between those two stops.
--
-- Same shape as the generated seed: ids are the SHA-1 of the ride's own values,
-- the formula of `rideId` in `rail/src/rides/sql.ts`, and the insert ends
-- `on conflict (id) do nothing`, so a second push cannot double the log. The
-- cost is that the same stretch on the same line twice in one day needs one of
-- them entered in Studio.

insert into public.rail_rides (id, line_id, ridden_on, from_didok, to_didok) values
  ('db0f1d28-9f81-5945-b36b-e1c35c88ffb8', 'fernverkehr:IR15', '2026-10-10', '8505000', '8507000'),
  ('079c0851-2e83-5710-b39d-6419ea1a47ea', 'fernverkehr:IC6', '2026-10-10', '8507000', '8500218'),
  ('c3b12030-1683-54fd-b5e5-fc4da4a4acc6', 's-bahn-luzern:RE24', '2026-10-10', '8500218', '8505000'),
  ('fe3a8880-b5b5-5cfc-84ff-308395d9498f', 'fernverkehr:IR15', '2026-10-11', '8505000', '8507000'),
  ('dc6d2f84-f7df-5b0b-a166-a4b2333d62b1', 'fernverkehr:IC6', '2026-10-11', '8507000', '8500218'),
  ('74a69cb3-08a6-526e-b316-b01f105e7287', 's-bahn-luzern:RE24', '2026-10-11', '8500218', '8505000'),
  ('23008ae3-5343-56d0-bade-875838ade1c0', 'fernverkehr:IR15', '2026-10-13', '8505000', '8507000'),
  ('4121df5f-d130-5936-829e-919d8abdf1a0', 's-bahn-bern:S3', '2026-10-13', '8507000', '8504410'),
  ('800caf1d-93e9-5e49-b41e-f93fc708a391', 's-bahn-bern:S8', '2026-10-13', '8504410', '8507000'),
  ('38adb045-7207-5311-958e-7af9b00511ac', 'fernverkehr:EC:8500010-8501609', '2026-10-13', '8507000', '8500218'),
  ('e288b90e-a1f7-5162-8a64-970fd4fd6419', 's-bahn-luzern:RE24', '2026-10-13', '8500218', '8505000')
on conflict (id) do nothing;
