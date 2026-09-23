-- Where a December refresh marks the rows the feed has dropped.
--
-- `missing_since` is the day a reconcile first found the row gone from the
-- feed. The row stays, because rides may already reference it; the reconcile in
-- rail/src/reconcile.ts clears the date if the row comes back.

alter table public.rail_lines
  add column missing_since date;

alter table public.rail_line_stops
  add column missing_since date;
