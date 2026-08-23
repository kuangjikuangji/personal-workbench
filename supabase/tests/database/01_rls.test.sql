begin;

create extension if not exists pgtap with schema extensions;

select plan(98);

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
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'user-a@users.workbench.invalid',
    extensions.crypt('password-a', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'user-b@users.workbench.invalid',
    extensions.crypt('password-b', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (id, username, role, is_active, must_change_password)
values
  ('00000000-0000-4000-8000-000000000001', 'user-a', 'member', true, false),
  ('00000000-0000-4000-8000-000000000002', 'user-b', 'member', true, false);

insert into public.todos (id, user_id, title, description, role, priority, status)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'user-a todo', '', 'personal', 'normal', 'open'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'user-b todo', '', 'personal', 'normal', 'open'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'own delete', '', 'personal', 'normal', 'open');

insert into public.semesters (id, user_id, name, start_date, end_date, total_weeks, is_active)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'A semester', '2026-08-01', '2026-12-31', 20, false),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'B semester', '2026-08-01', '2026-12-31', 20, false);

insert into public.ideas (id, user_id, content, tags, pinned)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'A idea', '{}', false),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'B idea', '{}', false);

insert into public.teachers (id, user_id, name, department)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'A teacher', ''),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'B teacher', '');

insert into public.students (id, user_id, name, program, cohort, contact, notes)
values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'A student', '', '', '', ''),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'B student', '', '', '', '');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'a user can read only their own profile'
);
select is(
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'a user cannot read another profile'
);
select is(
  (select count(*) from public.todos where user_id = '00000000-0000-4000-8000-000000000001'),
  2::bigint,
  'an active initialized user can read their own rows'
);
select is(
  (select count(*) from public.todos where user_id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'a user cannot read another user row'
);

select throws_ok(
  $$ insert into public.todos (user_id, title, description, role, priority, status)
     values ('00000000-0000-4000-8000-000000000002', 'cross-user', '', 'personal', 'normal', 'open') $$,
  '42501'
);
select is(
  (select count(*) from public.todos where user_id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'a rejected cross-user insert creates no visible row'
);
select throws_ok(
  $$ insert into public.todos (title, description, role, priority, status)
     values ('own insert', '', 'personal', 'normal', 'open') $$,
  '42501'
);
select is(
  (select count(*) from public.todos where title = 'own insert' and user_id = '00000000-0000-4000-8000-000000000001'),
  0::bigint,
  'authenticated users cannot bypass the todo save RPC with a direct insert'
);
select throws_ok(
  $$ update public.todos set title = 'cross update'
     where id = '10000000-0000-4000-8000-000000000002' $$,
  '42501'
);
select throws_ok(
  $$ update public.todos set title = 'own update'
     where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501'
);
select throws_ok(
  $$ update public.todos
     set user_id = '00000000-0000-4000-8000-000000000002'
     where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501'
);
select results_eq(
  $$ with removed as (
    delete from public.todos
    where id = '10000000-0000-4000-8000-000000000002'
    returning 1
  ) select count(*) from removed $$,
  array[0::bigint],
  'a user cannot delete another user row'
);
select results_eq(
  $$ with removed as (
    delete from public.todos
    where id = '10000000-0000-4000-8000-000000000003'
    returning 1
  ) select count(*) from removed $$,
  array[1::bigint],
  'a user retains direct delete access to their own todo'
);
select throws_ok(
  $$ update public.profiles set role = 'admin'
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501'
);

select lives_ok(
  $$ insert into public.courses (
       id, user_id, semester_id, name, location, teacher, weekday,
       start_time, end_time, start_week, end_week, week_rule, notes
     ) values (
       '60000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000001',
       'own semester', '', '', 1, '09:00', '10:00', 1, 2,
       '{"kind":"every"}'::jsonb, ''
     ) $$,
  'a user can reference their own semester'
);
select lives_ok(
  $$ insert into public.teacher_year_summaries (user_id, teacher_id, year, state)
     values (
       '00000000-0000-4000-8000-000000000001',
       '40000000-0000-4000-8000-000000000001',
       '2026', 'empty'
     ) $$,
  'a user can reference their own teacher'
);
select lives_ok(
  $$ insert into public.student_records (
       user_id, student_id, date, category, rating, content, follow_up, tags
     ) values (
       '00000000-0000-4000-8000-000000000001',
       '50000000-0000-4000-8000-000000000001',
       '2026-08-15', 'task', 'normal', '', '', '{}'
     ) $$,
  'a user can reference their own student'
);
select lives_ok(
  $$ insert into public.lesson_plans (
       user_id, course_id, chapter, objectives, outline, resources,
       activities, status, source_type, source_id
     ) values (
       '00000000-0000-4000-8000-000000000001',
       '60000000-0000-4000-8000-000000000001',
       '', '', '', '', '', 'notStarted', 'idea',
       '30000000-0000-4000-8000-000000000001'
     ) $$,
  'a user can reference their own course and idea'
);
select lives_ok(
  $$ insert into public.research_items (
       user_id, title, authors, source, url_or_doi, tags, status, abstract,
       notes, source_type, source_id
     ) values (
       '00000000-0000-4000-8000-000000000001',
       'own idea', '', '', '', '{}', 'unread', '', '', 'idea',
       '30000000-0000-4000-8000-000000000001'
     ) $$,
  'a user can reference their own idea'
);

select throws_ok(
  $$ insert into public.courses (
       user_id, semester_id, name, location, teacher, weekday,
       start_time, end_time, start_week, end_week, week_rule, notes
     ) values (
       '00000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000001',
       'missing kind', '', '', 1, '09:00', '10:00', 1, 2, '{}'::jsonb, ''
     ) $$,
  '23514'
);
select throws_ok(
  $$ insert into public.courses (
       user_id, semester_id, name, location, teacher, weekday,
       start_time, end_time, start_week, end_week, week_rule, notes
     ) values (
       '00000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000001',
       'missing weeks', '', '', 1, '09:00', '10:00', 1, 2,
       '{"kind":"explicit"}'::jsonb, ''
     ) $$,
  '23514'
);
select throws_ok(
  $$ insert into public.courses (
       user_id, semester_id, name, location, teacher, weekday,
       start_time, end_time, start_week, end_week, week_rule, notes
     ) values (
       '00000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000001',
       'null kind', '', '', 1, '09:00', '10:00', 1, 2,
       '{"kind":null,"weeks":[]}'::jsonb, ''
     ) $$,
  '23514'
);

select throws_ok(
  $$ insert into public.courses (
       user_id, semester_id, name, location, teacher, weekday,
       start_time, end_time, start_week, end_week, week_rule, notes
     ) values (
       '00000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000002',
       'cross semester', '', '', 1, '09:00', '10:00', 1, 2,
       '{"kind":"every"}'::jsonb, ''
     ) $$,
  '23503'
);
select throws_ok(
  $$ insert into public.research_items (
       user_id, title, authors, source, url_or_doi, tags, status, abstract,
       notes, source_type, source_id
     ) values (
       '00000000-0000-4000-8000-000000000001',
       'cross idea', '', '', '', '{}', 'unread', '', '', 'idea',
       '30000000-0000-4000-8000-000000000002'
     ) $$,
  '23503'
);

reset role;
update public.profiles
set role = 'admin'
where id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select count(*) from public.todos where user_id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'an administrator still cannot read another user business row'
);

reset role;
update public.profiles
set role = 'member', is_active = false
where id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select count(*) from public.todos),
  0::bigint,
  'an inactive user cannot read business rows'
);
select throws_ok(
  $$ insert into public.todos (title, description, role, priority, status)
     values ('inactive insert', '', 'personal', 'normal', 'open') $$,
  '42501'
);
select throws_ok(
  $$ update public.todos set title = 'inactive update'
     where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501'
);
select results_eq(
  $$ with removed as (
    delete from public.todos
    where id = '10000000-0000-4000-8000-000000000001'
    returning 1
  ) select count(*) from removed $$,
  array[0::bigint],
  'an inactive user cannot delete business rows'
);

reset role;
update public.profiles
set is_active = true, must_change_password = true
where id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select count(*) from public.todos),
  0::bigint,
  'a user awaiting password change cannot read business rows'
);
select throws_ok(
  $$ insert into public.todos (title, description, role, priority, status)
     values ('must-change insert', '', 'personal', 'normal', 'open') $$,
  '42501'
);
select throws_ok(
  $$ update public.todos set title = 'must-change update'
     where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501'
);
select results_eq(
  $$ with removed as (
    delete from public.todos
    where id = '10000000-0000-4000-8000-000000000001'
    returning 1
  ) select count(*) from removed $$,
  array[0::bigint],
  'a user awaiting password change cannot delete business rows'
);
select throws_ok(
  $$ update public.profiles
     set must_change_password = false
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501'
);

select ok(
  not has_function_privilege('anon', 'public.current_user_can_access()', 'execute'),
  'anon cannot execute current_user_can_access'
);
select ok(
  has_function_privilege('authenticated', 'public.current_user_can_access()', 'execute'),
  'authenticated can execute current_user_can_access'
);
select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'complete_password_change'
  ),
  0::bigint,
  'no client-callable complete_password_change function exists'
);
select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      ])
      and c.relrowsecurity
  ),
  14::bigint,
  'all business tables enable row level security'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      ])
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ),
  56::bigint,
  'every business table has select, insert, update, and delete policies'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'usage')
    and not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where n.nspname = 'private'
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ),
  'private helpers have no default PUBLIC execute path'
);

with policy_expectations as (
  select table_name, command
  from unnest(array[
    'todos', 'semesters', 'courses', 'teachers',
    'teacher_year_summaries', 'teacher_records', 'mentorships',
    'research_items', 'learning_methods', 'ideas', 'lesson_plans',
    'students', 'student_records', 'app_settings'
  ]) as tables(table_name)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as commands(command)
)
select is(
  (
    select count(*)
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = policy_expectations.table_name
      and p.cmd = policy_expectations.command
      and p.roles = array['authenticated']::name[]
      and case policy_expectations.command
        when 'SELECT' then
          p.qual like '%current_user_can_access()%'
          and p.qual like '%user_id%'
          and p.qual like '%auth.uid()%'
          and p.with_check is null
        when 'INSERT' then
          p.qual is null
          and p.with_check like '%current_user_can_access()%'
          and p.with_check like '%user_id%'
          and p.with_check like '%auth.uid()%'
        when 'UPDATE' then
          p.qual like '%current_user_can_access()%'
          and p.qual like '%user_id%'
          and p.qual like '%auth.uid()%'
          and p.with_check like '%current_user_can_access()%'
          and p.with_check like '%user_id%'
          and p.with_check like '%auth.uid()%'
        when 'DELETE' then
          p.qual like '%current_user_can_access()%'
          and p.qual like '%user_id%'
          and p.qual like '%auth.uid()%'
          and p.with_check is null
      end
  ),
  1::bigint,
  format(
    '%s %s policy is authenticated-only and fail-closed',
    policy_expectations.table_name,
    policy_expectations.command
  )
)
from policy_expectations;

select is(
  (
    select count(*)
    from unnest(array[
        'profiles', 'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      ]) as names(table_name)
    where has_table_privilege(
      'anon',
      format('public.%I', table_name),
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
  ),
  0::bigint,
  'anon has no privileges on profiles or business tables'
);
select is(
  (
    select count(*)
    from unnest(array[
        'profiles', 'todos', 'semesters', 'courses', 'teachers',
        'teacher_year_summaries', 'teacher_records', 'mentorships',
        'research_items', 'learning_methods', 'ideas', 'lesson_plans',
        'students', 'student_records', 'app_settings'
      ]) as names(table_name)
    where has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      'TRUNCATE, REFERENCES, TRIGGER'
    )
      or (table_name = 'profiles' and has_table_privilege(
        'authenticated',
        'public.profiles',
        'INSERT, UPDATE, DELETE'
      ))
      or (table_name = 'todos' and has_table_privilege(
        'authenticated',
        'public.todos',
        'INSERT, UPDATE'
      ))
  ),
  0::bigint,
  'authenticated has no elevated privileges, profile mutation, or direct todo writes'
);

select * from finish();
rollback;
