create extension if not exists dblink with schema extensions;

select plan(4);

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
values (
  '20000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000040',
  'Linearization semester', '2026-09-07', '2026-12-31', 18, true
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

delete from auth.users
where id = '00000000-0000-4000-8000-000000000040';

select * from finish();
