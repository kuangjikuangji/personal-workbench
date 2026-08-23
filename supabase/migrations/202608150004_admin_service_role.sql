grant select, insert, update on table public.profiles to service_role;

create function public.admin_deactivate_profile(
  p_actor_id uuid,
  p_target_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_updated public.profiles;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin_deactivate_profile', 202608150004)
  );

  select p.*
  into v_actor
  from public.profiles p
  where p.id = p_actor_id
  for update;

  if not found or v_actor.role <> 'admin' then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if not v_actor.is_active then
    raise exception using errcode = '42501', message = 'account_inactive';
  end if;
  if v_actor.must_change_password then
    raise exception using errcode = '42501', message = 'password_change_required';
  end if;
  if p_actor_id = p_target_id then
    raise exception using errcode = '22023', message = 'self_deactivation';
  end if;

  select p.*
  into v_target
  from public.profiles p
  where p.id = p_target_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'account_not_found';
  end if;

  if v_target.role = 'admin'
    and v_target.is_active
    and (
      select count(*)
      from public.profiles p
      where p.role = 'admin' and p.is_active
    ) <= 1 then
    raise exception using errcode = '23514', message = 'last_admin';
  end if;

  update public.profiles
  set is_active = false
  where id = p_target_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.admin_deactivate_profile(uuid, uuid) from public;
revoke all on function public.admin_deactivate_profile(uuid, uuid)
  from anon, authenticated;
grant execute on function public.admin_deactivate_profile(uuid, uuid)
  to service_role;
