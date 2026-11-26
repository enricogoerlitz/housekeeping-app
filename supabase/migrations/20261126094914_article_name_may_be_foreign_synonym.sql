-- Spec 0036, REQ-005 (Entscheidung 2): an article's name may be the synonym of another article
-- („Schinken“ next to Kochschinken with the synonym Schinken); the search puts the exact name
-- first. Still refused: a synonym that is the name or a synonym of another article, and (by the
-- unique constraint) a name that is the name of another article. Only synonyms the row gains are
-- checked, so Kochschinken stays editable with its synonym Schinken once „Schinken“ exists. Only
-- the trigger function changes; the trigger, its columns and the advisory lock stay as in the
-- catalog migration.
create or replace function private.articles_keys_unique()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_added text[] := new.synonym_keys;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('articles:' || new.household_id::text, 0));
  if tg_op = 'UPDATE' then
    v_added := array(select k from pg_catalog.unnest(new.synonym_keys) as k where not (k = any (old.synonym_keys)));
  end if;
  if exists (
    select 1 from public.articles a
    where a.household_id = new.household_id
      and a.id <> new.id
      and (a.name_key = any (v_added) or a.synonym_keys && v_added)
  ) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  return new;
end
$$;
