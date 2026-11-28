-- Spec 0067 "Housekeeping-Agent", REQ-001, decision 14: the view of the app per person, "Normal"
-- (default) or "KI zuerst" (the agent in the middle of the tab bar). Additive.
--
-- * A column of the person's own row of notification_settings: RLS lets only herself read it
--   (spec 0013, AC-012/013), it is synced with the row (sync_pull takes every column; the
--   updated_at trigger is attached) and no column of the row is writable directly (spec 0053).
-- * Written only through set_app_view, for all her households at once: the view belongs to the
--   person, not to a household. A new membership takes her view (create_notification_settings).
-- * apply_changes is unchanged: notification_settings has no patchable column.

alter table public.notification_settings
  add column app_view text not null default 'normal'
    constraint notification_settings_app_view_valid check (app_view in ('normal', 'ai_first'));

create function private.set_app_view(p_view text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_view is null or p_view not in ('normal', 'ai_first') then
    raise exception 'invalid_view' using errcode = '22023';
  end if;
  update public.notification_settings s
  set app_view = p_view
  where s.member_id = (select auth.uid())
    and s.household_id in (select private.my_household_ids());
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end
$$;

revoke all on function private.set_app_view(text) from public;
grant execute on function private.set_app_view(text) to authenticated;

create function public.set_app_view(view text)
returns void
language sql
set search_path = ''
as $$ select private.set_app_view($1) $$;

revoke all on function public.set_app_view(text) from public;
grant execute on function public.set_app_view(text) to authenticated;

-- After insert of a membership: the row with the defaults, and her view from her other rows.
create or replace function private.create_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (household_id, member_id, app_view)
  values (
    new.household_id,
    new.profile_id,
    coalesce(
      (select s.app_view from public.notification_settings s
       where s.member_id = new.profile_id
       order by s.updated_at desc
       limit 1),
      'normal'))
  on conflict (household_id, member_id) do nothing;
  return null;
end
$$;
