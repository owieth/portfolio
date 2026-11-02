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
  ('3f3686de-6231-5fe8-9093-c933db1f912a', 'fernverkehr:IR70', '2026-09-26', '8505000', '8503000'),
  ('22a947a4-7bf1-53c0-8966-f7f1ce98f841', 'fernverkehr:IC5', '2026-09-26', '8503000', '8506302'),
  ('fa137676-38b2-51e8-ba6a-2cfbbaf3aee1', 'fernverkehr:IC5', '2026-09-26', '8506302', '8503000'),
  ('8d1705c8-5085-58d7-9b13-ee19b3229e87', 'fernverkehr:IR70', '2026-09-26', '8503000', '8505000'),
  ('29f58287-51f7-537e-8a46-c37553414ce3', 'fernverkehr:IR70', '2026-09-29', '8505000', '8502204'),
  ('24628fda-ae47-5a45-96ac-2935aa9d5f75', 'fernverkehr:IR70', '2026-09-29', '8502204', '8505000'),
  ('81f3548d-49be-5ba4-8cd0-06cdf4173bcd', 'fernverkehr:IR70', '2026-09-30', '8505000', '8503000'),
  ('75bdfd43-551b-5f22-af99-026a19eeb899', 'fernverkehr:IC8', '2026-09-30', '8503000', '8503016'),
  ('9d1e410a-3e7c-54cc-8c9a-5396b3b2de80', 's-bahn-zuerich:S2', '2026-10-04', '8503016', '8503000'),
  ('d650d636-2a1f-571f-90a6-455954a1240d', 'fernverkehr:IR70', '2026-10-04', '8503000', '8505000'),
  ('0ccc968e-7da8-5dcc-b49b-6377f398940a', 'fernverkehr:IR70', '2026-10-05', '8505000', '8502204'),
  ('ab3f8bcf-4a8b-584c-b82b-f19af787e89d', 'fernverkehr:IR70', '2026-10-05', '8502204', '8505000'),
  ('bf49472b-dd69-56f7-9e8c-8ba56998eb9d', 'fernverkehr:IR70', '2026-10-06', '8505000', '8502204'),
  ('0c1b596e-1dae-5e0a-b997-f13f4ca32778', 'fernverkehr:IR70', '2026-10-06', '8502204', '8505000'),
  ('364cbe84-c816-5644-92c8-b3b0b9f01d69', 'fernverkehr:IR70', '2026-10-07', '8505000', '8502204'),
  ('7f0ed6b7-6e34-578d-9beb-ae5112ccd0ff', 'fernverkehr:IR70', '2026-10-07', '8502204', '8505000'),
  ('fb3d854f-973f-5836-ac70-cff4ea998d1b', 'fernverkehr:IR70', '2026-10-08', '8505000', '8502204'),
  ('5d2a5385-3461-5477-bc44-438693180ae5', 'fernverkehr:IR70', '2026-10-08', '8502204', '8505000'),
  ('db0f1d28-9f81-5945-b36b-e1c35c88ffb8', 'fernverkehr:IR15', '2026-10-10', '8505000', '8507000'),
  ('14b3ee1c-c750-5b51-b6d5-a1c5069c483a', 's-bahn-bern:S9', '2026-10-10', '8507000', '8508055'),
  ('05cbc251-42ad-5173-b88e-82a7b6567d53', 's-bahn-bern:S9', '2026-10-10', '8508055', '8507000'),
  ('079c0851-2e83-5710-b39d-6419ea1a47ea', 'fernverkehr:IC6', '2026-10-10', '8507000', '8500218'),
  ('c3b12030-1683-54fd-b5e5-fc4da4a4acc6', 's-bahn-luzern:RE24', '2026-10-10', '8500218', '8505000'),
  ('fe3a8880-b5b5-5cfc-84ff-308395d9498f', 'fernverkehr:IR15', '2026-10-11', '8505000', '8507000'),
  ('a37514cf-ed9f-5f45-aaa8-98d4e1659d39', 'fernverkehr:IC61', '2026-10-11', '8507000', '8500218'),
  ('74a69cb3-08a6-526e-b316-b01f105e7287', 's-bahn-luzern:RE24', '2026-10-11', '8500218', '8505000'),
  ('23008ae3-5343-56d0-bade-875838ade1c0', 'fernverkehr:IR15', '2026-10-13', '8505000', '8507000'),
  ('4121df5f-d130-5936-829e-919d8abdf1a0', 's-bahn-bern:S3', '2026-10-13', '8507000', '8504410'),
  ('800caf1d-93e9-5e49-b41e-f93fc708a391', 's-bahn-bern:S8', '2026-10-13', '8504410', '8507000'),
  ('38adb045-7207-5311-958e-7af9b00511ac', 'fernverkehr:EC:8500010-8501609', '2026-10-13', '8507000', '8500218'),
  ('e288b90e-a1f7-5162-8a64-970fd4fd6419', 's-bahn-luzern:RE24', '2026-10-13', '8500218', '8505000'),
  ('d0b47d28-5a0a-5b14-93e5-9abb4f879dee', 'fernverkehr:IR70', '2026-10-24', '8505000', '8503000'),
  ('0e9dcf02-2ae4-5cc9-9d31-8d963268b2b8', 's-bahn-zuerich:S15', '2026-10-24', '8503000', '8503125'),
  ('70bea67d-a2bc-5228-877d-bbbcc6b92a38', 's-bahn-zuerich:S15', '2026-10-24', '8503125', '8503000'),
  ('88c6b9d2-94cb-5404-a5b5-419d38b5bc0f', 'fernverkehr:IC1', '2026-10-24', '8503000', '8507000'),
  ('f966dbf8-3c76-5783-bb2b-1f440bfa3cdc', 's-bahn-bern:S9', '2026-10-24', '8507000', '8508055'),
  ('00c36174-5905-519b-b512-5a5ee1e882d8', 's-bahn-bern:S9', '2026-10-24', '8508055', '8507000'),
  ('acdd7399-fb7b-56fe-a09e-de59d9962d3f', 'fernverkehr:IR15', '2026-10-24', '8507000', '8505000')
on conflict (id) do nothing;
