create extension if not exists dblink with schema extensions;

select plan(3);

delete from auth.users
where id = '00000000-0000-4000-8000-000000000003';

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
  '00000000-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'concurrency@users.workbench.invalid',
  extensions.crypt('password-c', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.semesters (
  id, user_id, name, start_date, end_date, total_weeks, is_active
)
values (
  '20000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000003',
  'Concurrent semester', '2026-08-01', '2026-12-31', 20, false
);

do $$
begin
  perform extensions.dblink_connect(
    'course_insert',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task2_course_insert'
  );
  perform extensions.dblink_connect(
    'semester_update',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres application_name=task2_semester_update'
  );
  perform pg_advisory_lock(2026081502);
  perform extensions.dblink_send_query(
    'course_insert',
    $remote$
      do $insert$
      begin
        insert into public.courses (
          id, user_id, semester_id, name, location, teacher, weekday,
          start_time, end_time, start_week, end_week, week_rule, notes
        ) values (
          '60000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000003',
          '20000000-0000-4000-8000-000000000003',
          'Concurrent course', '', '', 1, '09:00', '10:00', 1, 20,
          '{"kind":"every"}'::jsonb, ''
        );
        perform pg_advisory_xact_lock(2026081502);
      end
      $insert$;
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
      where application_name = 'task2_course_insert'
        and wait_event_type = 'Lock'
        and wait_event = 'advisory'
    );
    if clock_timestamp() >= deadline then
      raise exception 'course insert did not reach the concurrency barrier';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform extensions.dblink_send_query(
    'semester_update',
    $query$ update public.semesters
       set total_weeks = 10
       where id = '20000000-0000-4000-8000-000000000003' $query$
  );
end;
$$;

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('semester_update') = 0
      or exists (
        select 1
        from pg_stat_activity
        where application_name = 'task2_semester_update'
          and wait_event_type = 'Lock'
      );
    if clock_timestamp() >= deadline then
      exit;
    end if;
    perform pg_sleep(0.02);
  end loop;
end;
$$;

select ok(
  extensions.dblink_is_busy('semester_update') = 1
    and exists (
      select 1
      from pg_stat_activity
      where application_name = 'task2_semester_update'
        and wait_event_type = 'Lock'
    ),
  'course insert locks its parent semester against a concurrent week shrink'
);

do $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  perform pg_advisory_unlock(2026081502);

  loop
    exit when extensions.dblink_is_busy('course_insert') = 0
      and extensions.dblink_is_busy('semester_update') = 0;
    if clock_timestamp() >= deadline then
      raise exception 'concurrent operations did not finish after barrier release';
    end if;
    perform pg_sleep(0.02);
  end loop;

  perform status
  from extensions.dblink_get_result('course_insert', false) as result(status text);
  perform status
  from extensions.dblink_get_result('semester_update', false) as result(status text);
end;
$$;

select is(
  (
    select total_weeks
    from public.semesters
    where id = '20000000-0000-4000-8000-000000000003'
  ),
  20,
  'the rejected concurrent shrink leaves semester weeks unchanged'
);
select is(
  (
    select count(*)
    from public.courses
    where id = '60000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'the valid concurrent course insert commits'
);

do $$
begin
  perform extensions.dblink_disconnect('course_insert');
  perform extensions.dblink_disconnect('semester_update');
end;
$$;

delete from auth.users
where id = '00000000-0000-4000-8000-000000000003';

select * from finish();
