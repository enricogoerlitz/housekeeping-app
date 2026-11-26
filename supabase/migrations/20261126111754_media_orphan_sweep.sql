-- Spec 0039, REQ-005 (ADR-0016): the nightly sweep of photo files no row refers to any more.
-- Replacing or removing a photo already deletes the old file from the app; this catches the
-- cases where that broke off (offline in that moment, the app closed).
--
-- * private.media_orphans(p_now): object names in household-media of the photo folders
--   (private.media_household_id is not null) created more than one day before p_now that no
--   recipe, activity or restaurant names in photo_path and no snapshot in private.deletions names
--   (its "Rückgängig" can still bring the row back). Oldest first, at most 500 per run.
-- * private.run_media_orphan_sweep(p_now): hands those names in one request to the edge function
--   media-sweep through pg_net, signed with the shared secret like push-send (HMAC over
--   "<timestamp>.<body>", headers x-sweep-timestamp / x-sweep-signature); the function deletes
--   them with the Storage API (a direct delete in storage.objects would leave the file in the
--   storage backend). Target and secret live only in the Vault (media_sweep_url,
--   media_sweep_secret); without them nothing is sent (warning media_sweep_not_configured).
-- * pg_cron job media-orphan-sweep, daily 02:30 UTC (03:30 in Berlin in winter, 04:30 in summer).
-- Nothing here is granted: the private schema is run by pg_cron only.

create function private.media_orphans(p_now timestamptz)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'household-media'
    and private.media_household_id(o.name) is not null
    and o.created_at < p_now - interval '1 day'
    and not exists (select 1 from public.recipes r where r.photo_path = o.name)
    and not exists (select 1 from public.activities a where a.photo_path = o.name)
    and not exists (select 1 from public.restaurants r where r.photo_path = o.name)
    and not exists (
      select 1 from private.deletions d
      where d.household_id = private.media_household_id(o.name)
        and d.snapshot -> d.kind ->> 'photo_path' = o.name)
  order by o.created_at, o.name
  limit 500
$$;

-- The target and the shared secret from the Vault; null when one is missing.
create function private.media_sweep_config(out url text, out secret text)
language sql
stable
set search_path = ''
as $$
  select max(s.decrypted_secret) filter (where s.name = 'media_sweep_url'),
         max(s.decrypted_secret) filter (where s.name = 'media_sweep_secret')
  from vault.decrypted_secrets s
  where s.name in ('media_sweep_url', 'media_sweep_secret')
$$;

-- Queues one signed call to media-sweep with the orphans of p_now; returns how many names it
-- carries. The signature covers v_body::text, the text pg_net sends; the timestamp is the real
-- clock, never p_now.
create function private.run_media_orphan_sweep(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_config record;
  v_names jsonb;
  v_body jsonb;
  v_timestamp text;
begin
  select * into v_config from private.media_sweep_config();
  if v_config.url is null or v_config.secret is null then
    raise warning 'media_sweep_not_configured';
    return 0;
  end if;

  select coalesce(jsonb_agg(n order by n), '[]') into v_names from private.media_orphans(p_now) n;
  if jsonb_array_length(v_names) = 0 then
    return 0;
  end if;

  v_body := jsonb_build_object('names', v_names);
  v_timestamp := extract(epoch from pg_catalog.clock_timestamp())::bigint::text;
  perform net.http_post(
    url := v_config.url,
    body := v_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-timestamp', v_timestamp,
      'x-sweep-signature', encode(extensions.hmac(v_timestamp || '.' || v_body::text, v_config.secret, 'sha256'), 'hex')),
    timeout_milliseconds := 60000);
  return jsonb_array_length(v_names);
end
$$;

revoke all on function private.media_orphans(timestamptz) from public, anon, authenticated;
revoke all on function private.media_sweep_config() from public, anon, authenticated;
revoke all on function private.run_media_orphan_sweep(timestamptz) from public, anon, authenticated;

select cron.schedule('media-orphan-sweep', '30 2 * * *', 'select private.run_media_orphan_sweep()');
