-- What a December refresh needs to know before it writes into the rail tables:
-- which fields have been edited by hand.
--
-- `edited_fields` names the columns a person has changed. The reconcile in
-- rail/src/reconcile.ts writes feed values only into the others, so a corrected
-- name survives every refresh after it. It is filled by the trigger below, not
-- by whoever edits, so an edit in Studio, in SQL or through the UI is recorded
-- the same way and none of them has to remember to. Taking a column back out of
-- the list hands it back to the feed at the next refresh.

alter table public.rail_lines
  add column edited_fields text[] not null default '{}';

alter table public.rail_line_stops
  add column edited_fields text[] not null default '{}';

-- Adds every column an update changed to `edited_fields`, except the key
-- columns named in the trigger's arguments and the bookkeeping columns, which
-- are not feed values.
--
-- The reconcile's own writes are not edits. It runs in one transaction with
-- `set local rail.reconciling = 'on'`, and a setting made with `set local` ends
-- with that transaction, so no later statement inherits it.
create function public.rail_track_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed text[];
begin
  if current_setting('rail.reconciling', true) = 'on' then
    return new;
  end if;

  select coalesce(array_agg(after.key), '{}')
    into changed
    from jsonb_each(to_jsonb(new)) as after
    join jsonb_each(to_jsonb(old)) as before using (key)
   where after.value is distinct from before.value
     and after.key <> all (tg_argv || array['edited_fields', 'missing_since', 'created_at']);

  new.edited_fields := array(
    select distinct field from unnest(new.edited_fields || changed) as field order by field
  );

  return new;
end;
$$;

create trigger rail_lines_track_edits
  before update on public.rail_lines
  for each row execute function public.rail_track_edits('id');

create trigger rail_line_stops_track_edits
  before update on public.rail_line_stops
  for each row execute function public.rail_track_edits('line_id', 'sequence');
