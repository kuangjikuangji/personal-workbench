create extension if not exists dblink with schema extensions;

select plan(12);

delete from auth.users
where id = '00000000-0000-4000-8000-000000000040';

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
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000040',
  'authenticated',
  'authenticated',
  'schedule-linearization@users.workbench.invalid',
  extensions.crypt('password-linearization', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, username, role, is_active, must_change_password)
values (
  '00000000-0000-4000-8000-000000000040',
  'schedule-linearization',
  'member',
  true,
  false
);

insert into public.semesters (
  id, user_id, name, start_date, end_date, total_weeks, is_active
)
values
  (
    '20000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000040',
    'Linearization semester', '2026-09-07', '2026-12-31', 18, true
  ),
  (
    '20000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000040',
    'Lock-order semester', '2027-02-22', '2027-06-30', 19, false
  );

create temporary table schedule_lock_order_results (
  operation text primary key,
  result text,
  error_message text not null
);

do $$
begin
  perform extensions.dblink_connect(
    'schedule_course_writer',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task3_course_writer'
  );
  perform extensions.dblink_connect(
    'schedule_save_rpc',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task3_save_rpc'
  );
  perform extensions.dblink_exec('schedule_course_writer', 'set role authenticated');
  perform extensions.dblink_exec(
    'schedule_course_writer',
    'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000040'''
  );
  perform extensions.dblink_exec('schedule_save_rpc', 'set role authenticated');
  perform extensions.dblink_exec(
    'schedule_save_rpc',
    'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000040'''
  );

  perform pg_advisory_lock(2026081503);
  perform extensions.dblink_send_query(
    'schedule_course_writer',
    $remote$
      do $course_writer$
      begin
        insert into public.courses (
          id, user_id, semester_id, name, location, teacher, weekday,
          start_time, end_time, start_week, end_week, week_rule, notes
        ) values (
          '60000000-0000-4000-8000-000000000040',
          '00000000-0000-4000-8000-000000000040',
          '20000000-0000-4000-8000-000000000040',
          'Concurrent direct course', '', '', 1, '09:00', '10:00', 1, 18,
          '{"kind":"every"}'::jsonb, ''
        );
        perform pg_advisory_xact_lock(2026081503);
      end
      $course_writer$;
    $remote$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when exists (
      select 1
      from pg_stat_activity
      where application_name = 'task3_course_writer'
        and wait_event_type = 'Lock'
        and wait_event = 'advisory'
    );
    if clock_timestamp() >= deadline then
      raise exception 'course writer did not reach the concurrency barrier';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform extensions.dblink_send_query(
    'schedule_save_rpc',
    $query$
      select public.save_todo_with_conflict_check(
        '{
          "id":"10000000-0000-4000-8000-000000000040",
          "title":"Concurrent todo",
          "description":"",
          "role":"personal",
          "start_at":"2026-09-07T09:30:00+08:00",
          "end_at":"2026-09-07T09:45:00+08:00",
          "remind_at":null,
          "priority":"normal",
          "status":"open"
        }'::jsonb,
        false
      )
    $query$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('schedule_save_rpc') = 0
      or exists (
        select 1
        from pg_stat_activity
        where application_name = 'task3_save_rpc'
          and wait_event_type = 'Lock'
          and wait_event = 'advisory'
      );
    if clock_timestamp() >= deadline then
      exit;
    end if;
    perform pg_sleep(0.02);
  end loop;
end;
$$;

select ok(
  extensions.dblink_is_busy('schedule_save_rpc') = 1
    and exists (
      select 1
      from pg_stat_activity
      where application_name = 'task3_save_rpc'
        and wait_event_type = 'Lock'
        and wait_event = 'advisory'
    ),
  'a direct course writer holds the same per-user transaction lock as the save RPC'
);

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  perform pg_advisory_unlock(2026081503);

  loop
    exit when extensions.dblink_is_busy('schedule_course_writer') = 0
      and extensions.dblink_is_busy('schedule_save_rpc') = 0;
    if clock_timestamp() >= deadline then
      raise exception 'linearized schedule operations did not finish after barrier release';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform status
  from extensions.dblink_get_result('schedule_course_writer', false) as result(status text);
end;
$$;

select is(
  (
    select jsonb_array_length(result -> 'conflicts')
    from extensions.dblink_get_result('schedule_save_rpc', false) as response(result jsonb)
  ),
  1,
  'the save RPC observes the course committed ahead of its conflict scan'
);
select is(
  (
    select count(*)
    from public.todos
    where id = '10000000-0000-4000-8000-000000000040'
  ),
  0::bigint,
  'the serialized conflict result prevents an unreported todo insert'
);
select is(
  (
    select count(*)
    from public.courses
    where id = '60000000-0000-4000-8000-000000000040'
  ),
  1::bigint,
  'the valid direct course writer commits before the conflict scan'
);

do $$
begin
  perform extensions.dblink_disconnect('schedule_course_writer');
  perform extensions.dblink_disconnect('schedule_save_rpc');
end;
$$;

create function private.schedule_lock_order_test_barrier()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(tg_argv[0]::bigint);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.schedule_lock_order_test_barrier() from public;

create trigger a_schedule_lock_order_barrier
before update on public.courses
for each row execute function private.schedule_lock_order_test_barrier('2026081504');

do $$
begin
  perform extensions.dblink_connect(
    'schedule_course_update',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task3_course_update_order'
  );
  perform extensions.dblink_connect(
    'schedule_delete_semester',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task3_delete_semester_order'
  );
  perform extensions.dblink_exec('schedule_course_update', 'set deadlock_timeout = ''100ms''');
  perform extensions.dblink_exec('schedule_delete_semester', 'set deadlock_timeout = ''100ms''');
  perform extensions.dblink_exec('schedule_course_update', 'set lock_timeout = ''3s''');
  perform extensions.dblink_exec('schedule_delete_semester', 'set lock_timeout = ''3s''');
  perform extensions.dblink_exec('schedule_course_update', 'set role authenticated');
  perform extensions.dblink_exec(
    'schedule_course_update',
    'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000040'''
  );
  perform extensions.dblink_exec('schedule_delete_semester', 'set role authenticated');
  perform extensions.dblink_exec(
    'schedule_delete_semester',
    'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000040'''
  );

  perform pg_advisory_lock(2026081504);
  perform extensions.dblink_send_query(
    'schedule_course_update',
    $query$
      with changed as (
        update public.courses
        set location = 'Updated before delete'
        where id = '60000000-0000-4000-8000-000000000040'
        returning 1
      )
      select count(*)::text from changed
    $query$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when exists (
      select 1 from pg_stat_activity
      where application_name = 'task3_course_update_order'
        and wait_event_type = 'Lock'
        and wait_event = 'advisory'
    );
    if clock_timestamp() >= deadline then
      raise exception 'course update did not reach its row-level test barrier';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform extensions.dblink_send_query(
    'schedule_delete_semester',
    $query$
      with called as (
        select public.delete_semester('20000000-0000-4000-8000-000000000040')
      )
      select count(*)::text from called
    $query$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('schedule_delete_semester') = 0
      or exists (
        select 1 from pg_stat_activity
        where application_name = 'task3_delete_semester_order'
          and wait_event_type = 'Lock'
      );
    if clock_timestamp() >= deadline then
      raise exception 'delete_semester did not reach its lock-order wait';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform pg_advisory_unlock(2026081504);

  deadline := clock_timestamp() + interval '5 seconds';
  loop
    exit when extensions.dblink_is_busy('schedule_course_update') = 0
      and extensions.dblink_is_busy('schedule_delete_semester') = 0;
    if clock_timestamp() >= deadline then
      raise exception 'course update/delete_semester lock-order scenario timed out';
    end if;
    perform pg_sleep(0.02);
  end loop;
end;
$$;

do $$
declare
  v_result text;
begin
  select result into v_result
  from extensions.dblink_get_result('schedule_course_update', false) as response(result text);
  insert into schedule_lock_order_results (operation, result, error_message)
  values (
    'course_update', v_result,
    extensions.dblink_error_message('schedule_course_update')
  );

  select result into v_result
  from extensions.dblink_get_result('schedule_delete_semester', false) as response(result text);
  insert into schedule_lock_order_results (operation, result, error_message)
  values (
    'delete_semester', v_result,
    extensions.dblink_error_message('schedule_delete_semester')
  );
end;
$$;

select is(
  (select result from schedule_lock_order_results where operation = 'course_update'),
  '1',
  'a direct course update completes without a lock-order deadlock'
);
select is(
  (select result from schedule_lock_order_results where operation = 'delete_semester'),
  '1',
  'delete_semester completes after the earlier direct course update'
);
select is(
  (select count(*) from public.courses where id = '60000000-0000-4000-8000-000000000040'),
  0::bigint,
  'delete_semester removes the course after the serialized direct update'
);
select is(
  (select count(*) from public.semesters where id = '20000000-0000-4000-8000-000000000040'),
  0::bigint,
  'the serialized delete removes the requested semester'
);

do $$
begin
  perform extensions.dblink_disconnect('schedule_course_update');
  perform extensions.dblink_disconnect('schedule_delete_semester');
end;
$$;

drop trigger a_schedule_lock_order_barrier on public.courses;

create trigger a_schedule_lock_order_barrier
before update on public.semesters
for each row execute function private.schedule_lock_order_test_barrier('2026081505');

do $$
begin
  perform extensions.dblink_connect(
    'schedule_semester_update',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task3_semester_update_order'
  );
  perform extensions.dblink_connect(
    'schedule_set_active',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task3_set_active_order'
  );
  perform extensions.dblink_exec('schedule_semester_update', 'set deadlock_timeout = ''100ms''');
  perform extensions.dblink_exec('schedule_set_active', 'set deadlock_timeout = ''100ms''');
  perform extensions.dblink_exec('schedule_semester_update', 'set lock_timeout = ''3s''');
  perform extensions.dblink_exec('schedule_set_active', 'set lock_timeout = ''3s''');
  perform extensions.dblink_exec('schedule_semester_update', 'set role authenticated');
  perform extensions.dblink_exec(
    'schedule_semester_update',
    'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000040'''
  );
  perform extensions.dblink_exec('schedule_set_active', 'set role authenticated');
  perform extensions.dblink_exec(
    'schedule_set_active',
    'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000040'''
  );

  perform pg_advisory_lock(2026081505);
  perform extensions.dblink_send_query(
    'schedule_semester_update',
    $query$
      with changed as (
        update public.semesters
        set name = 'Updated before activation'
        where id = '20000000-0000-4000-8000-000000000041'
        returning 1
      )
      select count(*)::text from changed
    $query$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when exists (
      select 1 from pg_stat_activity
      where application_name = 'task3_semester_update_order'
        and wait_event_type = 'Lock'
        and wait_event = 'advisory'
    );
    if clock_timestamp() >= deadline then
      raise exception 'semester update did not reach its row-level test barrier';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform extensions.dblink_send_query(
    'schedule_set_active',
    $query$
      select (public.set_active_semester(
        '20000000-0000-4000-8000-000000000041'
      )).id::text
    $query$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('schedule_set_active') = 0
      or exists (
        select 1 from pg_stat_activity
        where application_name = 'task3_set_active_order'
          and wait_event_type = 'Lock'
      );
    if clock_timestamp() >= deadline then
      raise exception 'set_active_semester did not reach its lock-order wait';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform pg_advisory_unlock(2026081505);

  deadline := clock_timestamp() + interval '5 seconds';
  loop
    exit when extensions.dblink_is_busy('schedule_semester_update') = 0
      and extensions.dblink_is_busy('schedule_set_active') = 0;
    if clock_timestamp() >= deadline then
      raise exception 'semester update/set_active_semester lock-order scenario timed out';
    end if;
    perform pg_sleep(0.02);
  end loop;
end;
$$;

do $$
declare
  v_result text;
begin
  select result into v_result
  from extensions.dblink_get_result('schedule_semester_update', false) as response(result text);
  insert into schedule_lock_order_results (operation, result, error_message)
  values (
    'semester_update', v_result,
    extensions.dblink_error_message('schedule_semester_update')
  );

  select result into v_result
  from extensions.dblink_get_result('schedule_set_active', false) as response(result text);
  insert into schedule_lock_order_results (operation, result, error_message)
  values (
    'set_active_semester', v_result,
    extensions.dblink_error_message('schedule_set_active')
  );
end;
$$;

select is(
  (select result from schedule_lock_order_results where operation = 'semester_update'),
  '1',
  'a direct semester update completes without a lock-order deadlock'
);
select is(
  (select result from schedule_lock_order_results where operation = 'set_active_semester'),
  '20000000-0000-4000-8000-000000000041',
  'set_active_semester completes after the earlier direct semester update'
);
select is(
  (select name from public.semesters where id = '20000000-0000-4000-8000-000000000041'),
  'Updated before activation',
  'the direct semester update commits before activation'
);
select is(
  (select is_active from public.semesters where id = '20000000-0000-4000-8000-000000000041'),
  true,
  'the requested semester is active after serialized completion'
);

do $$
begin
  perform extensions.dblink_disconnect('schedule_semester_update');
  perform extensions.dblink_disconnect('schedule_set_active');
end;
$$;

drop trigger a_schedule_lock_order_barrier on public.semesters;
drop function private.schedule_lock_order_test_barrier();

delete from auth.users
where id = '00000000-0000-4000-8000-000000000040';

select * from finish();
