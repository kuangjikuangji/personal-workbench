create extension if not exists dblink with schema extensions;

select plan(3);

delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000000060',
  '00000000-0000-4000-8000-000000000061'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000060',
    'authenticated', 'authenticated',
    'admin-concurrency-a@users.workbench.invalid',
    extensions.crypt('password-admin-a', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000061',
    'authenticated', 'authenticated',
    'admin-concurrency-b@users.workbench.invalid',
    extensions.crypt('password-admin-b', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.profiles (id, username, role, is_active, must_change_password)
values
  ('00000000-0000-4000-8000-000000000060', 'admin-concurrency-a', 'admin', true, false),
  ('00000000-0000-4000-8000-000000000061', 'admin-concurrency-b', 'admin', true, false);

create function private.admin_deactivation_test_barrier()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(2026081506);
  return new;
end;
$$;

revoke all on function private.admin_deactivation_test_barrier() from public;

create trigger admin_deactivation_test_barrier
before update on public.profiles
for each row execute function private.admin_deactivation_test_barrier();

do $$
begin
  perform extensions.dblink_connect(
    'admin_cross_a',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task5_admin_cross_a'
  );
  perform extensions.dblink_connect(
    'admin_cross_b',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task5_admin_cross_b'
  );
  perform extensions.dblink_exec('admin_cross_a', 'set role service_role');
  perform extensions.dblink_exec('admin_cross_b', 'set role service_role');

  perform pg_catalog.pg_advisory_lock(2026081506);
  perform extensions.dblink_send_query(
    'admin_cross_a',
    $remote$ select (public.admin_deactivate_profile(
         '00000000-0000-4000-8000-000000000060',
         '00000000-0000-4000-8000-000000000061'
       )).id::text $remote$
  );
  perform extensions.dblink_send_query(
    'admin_cross_b',
    $remote$ select (public.admin_deactivate_profile(
         '00000000-0000-4000-8000-000000000061',
         '00000000-0000-4000-8000-000000000060'
       )).id::text $remote$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when (
      select count(*)
      from pg_stat_activity
      where application_name in ('task5_admin_cross_a', 'task5_admin_cross_b')
        and wait_event_type = 'Lock'
        and wait_event = 'advisory'
    ) = 2;
    if clock_timestamp() >= deadline then
      exit;
    end if;
    perform pg_sleep(0.02);
  end loop;
end;
$$;

select is(
  (
    select count(*)
    from pg_stat_activity
    where application_name in ('task5_admin_cross_a', 'task5_admin_cross_b')
      and wait_event_type = 'Lock'
      and wait_event = 'advisory'
  ),
  2::bigint,
  'both cross-deactivation transactions reach the controlled concurrency boundary'
);

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  perform pg_catalog.pg_advisory_unlock(2026081506);
  loop
    exit when extensions.dblink_is_busy('admin_cross_a') = 0
      and extensions.dblink_is_busy('admin_cross_b') = 0;
    if clock_timestamp() >= deadline then
      raise exception 'cross-deactivation RPCs did not finish after barrier release';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform result_id
  from extensions.dblink_get_result('admin_cross_a', false) as result(result_id text);
  perform result_id
  from extensions.dblink_get_result('admin_cross_b', false) as result(result_id text);
end;
$$;

select is(
  (select count(*) from public.profiles where role = 'admin' and is_active),
  1::bigint,
  'concurrent cross-deactivation preserves at least one active administrator'
);
select is(
  (select count(*) from public.profiles where role = 'admin' and not is_active),
  1::bigint,
  'only one concurrent administrator deactivation commits'
);

do $$
begin
  perform extensions.dblink_disconnect('admin_cross_a');
  perform extensions.dblink_disconnect('admin_cross_b');
end;
$$;

drop trigger admin_deactivation_test_barrier on public.profiles;
drop function private.admin_deactivation_test_barrier();

delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000000060',
  '00000000-0000-4000-8000-000000000061'
);

select * from finish();
