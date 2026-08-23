begin;

select plan(35);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      )
      and column_name = 'deleted_at'
  ),
  14::bigint,
  'every synchronized business table has deleted_at'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      )
      and column_name = 'deleted_at'
      and is_nullable = 'YES'
  ),
  14::bigint,
  'deleted_at is nullable on every synchronized business table'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      )
      and column_name = 'server_updated_at'
  ),
  14::bigint,
  'every synchronized business table has server_updated_at'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      )
      and column_name = 'server_updated_at'
      and is_nullable = 'NO'
      and column_default is not null
  ),
  14::bigint,
  'server_updated_at is required and server-defaulted on every synchronized table'
);
select is(
  (
    select count(*)
    from pg_class table_class
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname = 'public'
      and table_class.relname in (
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      )
      and exists (
        select 1
        from pg_index index_catalog
        where index_catalog.indrelid = table_class.oid
          and pg_get_indexdef(index_catalog.indexrelid)
            like '%(user_id, server_updated_at)%'
      )
  ),
  14::bigint,
  'every synchronized table has a user and server receipt index'
);
select is(
  (
    select count(*)
    from pg_class table_class
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname = 'public'
      and table_class.relname in (
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      )
      and table_class.relreplident = 'f'
  ),
  14::bigint,
  'every synchronized table publishes full old rows'
);
select is(
  (
    select count(*)
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in (
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      )
  ),
  14::bigint,
  'every synchronized table is in the Realtime publication'
);
select ok(
  to_regprocedure(
    'public.apply_workbench_change(text,jsonb,timestamp with time zone,timestamp with time zone)'
  ) is not null,
  'the workbench change RPC exists with its stable signature'
);
select is(
  (
    select routine.prosecdef
    from pg_proc routine
    where routine.oid = to_regprocedure(
      'public.apply_workbench_change(text,jsonb,timestamp with time zone,timestamp with time zone)'
    )
  ),
  false,
  'the workbench change RPC is security invoker'
);

delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000000070',
  '00000000-0000-4000-8000-000000000071'
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
    '00000000-0000-4000-8000-000000000070',
    'authenticated', 'authenticated',
    'realtime-a@users.workbench.invalid',
    extensions.crypt('password-realtime-a', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000071',
    'authenticated', 'authenticated',
    'realtime-b@users.workbench.invalid',
    extensions.crypt('password-realtime-b', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.profiles (id, username, role, is_active, must_change_password)
values
  ('00000000-0000-4000-8000-000000000070', 'realtime-a', 'member', true, false),
  ('00000000-0000-4000-8000-000000000071', 'realtime-b', 'member', true, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000070', true);

select lives_ok(
  $$ insert into public.app_settings (key, value, updated_at)
     values ('theme', '{"mode":"initial"}'::jsonb, '2030-01-01 00:01:00+00') $$,
  'user A can insert their own setting'
);
select is(
  (select count(*) from public.app_settings where key = 'theme'),
  1::bigint,
  'user A can read their own setting'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000071', true);

select is(
  (select count(*) from public.app_settings where key = 'theme'),
  0::bigint,
  'user B cannot read user A setting'
);
select results_eq(
  $$ with changed as (
       update public.app_settings
       set value = '{"mode":"cross-user"}'::jsonb
       where user_id = '00000000-0000-4000-8000-000000000070'
         and key = 'theme'
       returning 1
     ) select count(*) from changed $$,
  array[0::bigint],
  'user B cannot directly mutate user A setting'
);
select lives_ok(
  $$ select public.apply_workbench_change(
       'app_settings',
       '{"user_id":"00000000-0000-4000-8000-000000000070","key":"theme","value":{"mode":"user-b"}}'::jsonb,
       '2030-01-01 00:02:00+00',
       null
     ) $$,
  'the RPC ignores a spoofed user_id rather than targeting user A'
);
select is(
  (select value ->> 'mode' from public.app_settings where key = 'theme'),
  'user-b',
  'a spoofed user_id is replaced with user B identity'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000070', true);

select is(
  (select value ->> 'mode' from public.app_settings where key = 'theme'),
  'initial',
  'user B RPC call does not mutate user A setting'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"newer"}}'::jsonb,
      '2030-01-01 00:03:00+00',
      null
    ) ->> 'applied'
  )::boolean,
  true,
  'a newer setting update is applied'
);
select is(
  (select updated_at from public.app_settings where key = 'theme'),
  '2030-01-01 00:03:00+00'::timestamptz,
  'the timestamp trigger preserves the client updated_at conflict clock'
);
select isnt(
  (select server_updated_at from public.app_settings where key = 'theme'),
  '2030-01-01 00:03:00+00'::timestamptz,
  'server_updated_at records server receipt instead of the client clock'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"older"}}'::jsonb,
      '2030-01-01 00:02:00+00',
      null
    ) ->> 'applied'
  )::boolean,
  false,
  'an older setting update is ignored'
);
select is(
  (select value ->> 'mode' from public.app_settings where key = 'theme'),
  'newer',
  'the newer setting value survives an older update'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"older-delete"}}'::jsonb,
      '2030-01-01 00:02:30+00',
      '2030-01-01 00:02:30+00'
    ) ->> 'applied'
  )::boolean,
  false,
  'a deletion older than the winning update is ignored'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"resurrected"}}'::jsonb,
      '2030-01-01 00:04:00+00',
      null
    ) ->> 'applied'
  )::boolean,
  true,
  'a newer update after an older deletion is applied'
);
select is(
  (select deleted_at from public.app_settings where key = 'theme'),
  null::timestamptz,
  'the newer update leaves the setting active'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"deleted"}}'::jsonb,
      '2030-01-01 00:04:00+00',
      '2030-01-01 00:05:00+00'
    ) ->> 'applied'
  )::boolean,
  true,
  'a newer deletion is applied'
);
select is(
  (select deleted_at from public.app_settings where key = 'theme'),
  '2030-01-01 00:05:00+00'::timestamptz,
  'the newer deletion stores its tombstone timestamp'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"deleted"}}'::jsonb,
      '2030-01-01 00:04:00+00',
      '2030-01-01 00:05:00+00'
    ) ->> 'applied'
  )::boolean,
  false,
  'retrying the winning deletion is idempotent'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"deleted"}}'::jsonb,
      '2030-01-01 00:04:00+00',
      '2030-01-01 00:05:00+00'
    ) -> 'row' ->> 'key'
  ),
  'theme',
  'an ignored retry returns the stored row'
);
select throws_ok(
  $$ select public.apply_workbench_change(
       'profiles', '{}'::jsonb, '2030-01-01 00:06:00+00', null
     ) $$,
  '22023',
  'table_not_allowed',
  'the RPC rejects tables outside the fixed allowlist'
);

select is(
  (
    public.apply_workbench_change(
      'todos',
      '{
        "id":"70000000-0000-4000-8000-000000000001",
        "title":"synchronized todo",
        "description":"",
        "role":"personal",
        "start_at":null,
        "end_at":null,
        "remind_at":null,
        "priority":"normal",
        "status":"open",
        "source_type":null,
        "source_id":null,
        "created_at":"2030-01-01T00:00:00Z"
      }'::jsonb,
      '2030-01-01 00:06:00+00',
      null
    ) ->> 'applied'
  )::boolean,
  true,
  'the generic RPC can insert a todo whose direct writes stay restricted'
);
select is(
  (select title from public.todos where id = '70000000-0000-4000-8000-000000000001'),
  'synchronized todo',
  'user A can read the synchronized todo'
);
select throws_ok(
  $$ update public.todos
     set title = 'direct update'
     where id = '70000000-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table todos',
  'direct todo updates remain denied'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000071', true);

select is(
  (select count(*) from public.todos where id = '70000000-0000-4000-8000-000000000001'),
  0::bigint,
  'user B cannot read user A synchronized todo'
);
select is(
  (
    public.apply_workbench_change(
      'todos',
      '{
        "id":"70000000-0000-4000-8000-000000000001",
        "title":"cross-user overwrite",
        "description":"",
        "role":"personal",
        "start_at":null,
        "end_at":null,
        "remind_at":null,
        "priority":"normal",
        "status":"open",
        "source_type":null,
        "source_id":null,
        "created_at":"2030-01-01T00:00:00Z"
      }'::jsonb,
      '2030-01-01 00:07:00+00',
      null
    ) ->> 'applied'
  )::boolean,
  false,
  'user B cannot mutate user A synchronized todo through the RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000070', true);

select is(
  (select title from public.todos where id = '70000000-0000-4000-8000-000000000001'),
  'synchronized todo',
  'the rejected cross-user RPC leaves user A todo unchanged'
);

select * from finish();

rollback;
