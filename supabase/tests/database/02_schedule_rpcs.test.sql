begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

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
    '00000000-0000-4000-8000-000000000010',
    'authenticated',
    'authenticated',
    'schedule-a@users.workbench.invalid',
    extensions.crypt('password-a', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000011',
    'authenticated',
    'authenticated',
    'schedule-b@users.workbench.invalid',
    extensions.crypt('password-b', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000012',
    'authenticated',
    'authenticated',
    'schedule-locked@users.workbench.invalid',
    extensions.crypt('password-locked', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (id, username, role, is_active, must_change_password)
values
  ('00000000-0000-4000-8000-000000000010', 'schedule-a', 'member', true, false),
  ('00000000-0000-4000-8000-000000000011', 'schedule-b', 'member', true, false),
  ('00000000-0000-4000-8000-000000000012', 'schedule-locked', 'member', true, true);

insert into public.semesters (
  id, user_id, name, start_date, end_date, total_weeks, is_active
)
values
  (
    '20000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000010',
    'A current', '2026-09-03', '2026-10-31', 9, true
  ),
  (
    '20000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000010',
    'A next', '2027-02-22', '2027-06-30', 19, false
  ),
  (
    '20000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    'B current', '2026-09-01', '2026-12-31', 18, true
  ),
  (
    '20000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000012',
    'Locked current', '2026-09-01', '2026-12-31', 18, true
  );

insert into public.courses (
  id, user_id, semester_id, name, location, teacher, weekday,
  start_time, end_time, start_week, end_week, week_rule, notes
)
values
  (
    '60000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    'A odd-week course', '', '', 1, '09:00', '10:30', 1, 5,
    '{"kind":"odd"}'::jsonb, ''
  ),
  (
    '60000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    'B course', '', '', 1, '09:00', '10:30', 1, 18,
    '{"kind":"every"}'::jsonb, ''
  );

insert into public.todos (
  id, user_id, title, description, role, start_at, end_at,
  remind_at, priority, status
)
values
  (
    '10000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000010',
    'A existing todo', '', 'personal',
    '2026-09-14T09:15:00+08:00', '2026-09-14T09:45:00+08:00',
    null, 'normal', 'open'
  ),
  (
    '10000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    'B private todo', '', 'personal',
    '2026-09-14T09:00:00+08:00', '2026-09-14T11:00:00+08:00',
    null, 'normal', 'open'
  );

insert into public.lesson_plans (
  id, user_id, course_id, chapter, objectives, outline, resources,
  activities, planned_date, status, source_type, source_id
)
values (
  '70000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000010',
  '60000000-0000-4000-8000-000000000010',
  'Referenced course', '', '', '', '', null, 'notStarted', null, null
);

create temporary table schedule_rpc_results (
  label text primary key,
  result jsonb not null
) on commit drop;
grant select, insert, update, delete on schedule_rpc_results to authenticated;

select has_function(
  'public',
  'save_todo_with_conflict_check',
  array['jsonb', 'boolean'],
  'save_todo_with_conflict_check has the exact public signature'
);
select has_function(
  'public',
  'import_wechat_todos',
  array['jsonb'],
  'import_wechat_todos has the exact public signature'
);
select has_function(
  'public',
  'set_active_semester',
  array['uuid'],
  'set_active_semester has the exact public signature'
);
select has_function(
  'public',
  'delete_semester',
  array['uuid'],
  'delete_semester has the exact public signature'
);

select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'save_todo_with_conflict_check', 'import_wechat_todos',
        'set_active_semester', 'delete_semester'
      ])
      and p.prosecdef = false
      and p.proconfig = array['search_path=""']
  ),
  4::bigint,
  'schedule RPCs are invoker-rights functions with an empty search path'
);
select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'save_todo_with_conflict_check', 'import_wechat_todos',
        'set_active_semester', 'delete_semester'
      ])
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
  ),
  4::bigint,
  'only authenticated clients receive schedule RPC execution grants'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000010', true);

select lives_ok(
  $$ insert into schedule_rpc_results (label, result)
     select 'blocked', public.save_todo_with_conflict_check(
       '{
         "id":"10000000-0000-4000-8000-000000000020",
         "title":"Blocked overlap",
         "description":"",
         "role":"personal",
         "start_at":"2026-09-14T09:30:00+08:00",
         "end_at":"2026-09-14T10:00:00+08:00",
         "remind_at":null,
         "priority":"normal",
         "status":"open",
         "source_type":null,
         "source_id":null
       }'::jsonb,
       false
     ) $$,
  'an overlapping todo returns a result instead of writing'
);
select is(
  (select jsonb_array_length(result -> 'conflicts') from schedule_rpc_results where label = 'blocked'),
  2,
  'the blocked result contains the own open-todo and active odd-week course conflicts'
);
select set_eq(
  $$ select conflict ->> 'kind'
     from schedule_rpc_results r,
     lateral jsonb_array_elements(r.result -> 'conflicts') conflict
     where r.label = 'blocked' $$,
  array['todo', 'course'],
  'conflict kinds match the existing todo/course schedule semantics'
);
select is(
  (
    select conflict ->> 'start'
    from schedule_rpc_results r,
    lateral jsonb_array_elements(r.result -> 'conflicts') conflict
    where r.label = 'blocked' and conflict ->> 'kind' = 'course'
  ),
  '2026-09-14T09:00:00',
  'course expansion uses teaching-week dates and Shanghai wall-clock time'
);
select is(
  (select count(*) from public.todos where id = '10000000-0000-4000-8000-000000000020'),
  0::bigint,
  'a conflict response with no override writes zero todos'
);

select lives_ok(
  $$ insert into schedule_rpc_results (label, result)
     select 'allowed', public.save_todo_with_conflict_check(
       '{
         "id":"10000000-0000-4000-8000-000000000020",
         "title":"Allowed overlap",
         "description":"",
         "role":"personal",
         "start_at":"2026-09-14T09:30:00+08:00",
         "end_at":"2026-09-14T10:00:00+08:00",
         "remind_at":null,
         "priority":"normal",
         "status":"open",
         "source_type":null,
         "source_id":null
       }'::jsonb,
       true
     ) $$,
  'allow_conflicts permits the same candidate to be saved'
);
select is(
  (select count(*) from public.todos where id = '10000000-0000-4000-8000-000000000020'),
  1::bigint,
  'allow_conflicts writes the todo exactly once'
);
select is(
  (select result #>> '{todo,user_id}' from schedule_rpc_results where label = 'allowed'),
  '00000000-0000-4000-8000-000000000010',
  'the saved todo is owned by auth.uid'
);
select is(
  (select jsonb_array_length(result -> 'conflicts') from schedule_rpc_results where label = 'allowed'),
  2,
  'an overridden save still reports the conflicts it overrode'
);

select lives_ok(
  $$ insert into schedule_rpc_results (label, result)
     select 'default-duration', public.save_todo_with_conflict_check(
       '{
         "id":"10000000-0000-4000-8000-000000000021",
         "title":"Default duration",
         "description":"",
         "role":"personal",
         "start_at":"2026-09-14T08:40:00+08:00",
         "end_at":null,
         "remind_at":null,
         "priority":"normal",
         "status":"open"
       }'::jsonb,
       false
     ) $$,
  'a todo without end_at can be conflict checked'
);
select is(
  (select jsonb_array_length(result -> 'conflicts') from schedule_rpc_results where label = 'default-duration'),
  1,
  'a todo without end_at uses the existing 30-minute default duration'
);
select is(
  (select count(*) from public.todos where id = '10000000-0000-4000-8000-000000000021'),
  0::bigint,
  'the default-duration conflict also prevents its write'
);

select throws_ok(
  $$ select public.save_todo_with_conflict_check(
       '{
         "id":"10000000-0000-4000-8000-000000000022",
         "title":"Invalid range",
         "description":"",
         "role":"personal",
         "start_at":"2026-09-14T10:00:00+08:00",
         "end_at":"2026-09-14T10:00:00+08:00",
         "remind_at":null,
         "priority":"normal",
         "status":"open"
       }'::jsonb,
       true
     ) $$,
  '22023'
);
select is(
  (select count(*) from public.todos where id = '10000000-0000-4000-8000-000000000022'),
  0::bigint,
  'end_at not after start_at writes zero todos'
);
select throws_ok(
  $$ select public.save_todo_with_conflict_check(
       '{
         "id":"10000000-0000-4000-8000-000000000011",
         "title":"Cross-user overwrite",
         "description":"",
         "role":"personal",
         "start_at":null,
         "end_at":null,
         "remind_at":null,
         "priority":"normal",
         "status":"open"
       }'::jsonb,
       true
     ) $$,
  '42501'
);

select throws_ok(
  $$ select * from public.import_wechat_todos(
       '[
         {
           "id":"10000000-0000-4000-8000-000000000030",
           "title":"Valid first row",
           "description":"",
           "role":"dean",
           "start_at":"2026-09-15T09:00:00+08:00",
           "end_at":"2026-09-15T10:00:00+08:00",
           "remind_at":null,
           "priority":"high",
           "status":"open"
         },
         {
           "id":"10000000-0000-4000-8000-000000000031",
           "title":"Malformed second row",
           "description":"",
           "role":"personal",
           "start_at":"2026-09-15T11:00:00+08:00",
           "end_at":"2026-09-15T10:00:00+08:00",
           "remind_at":null,
           "priority":"normal",
           "status":"open"
         }
       ]'::jsonb
     ) $$,
  '22023'
);
select is(
  (
    select count(*)
    from public.todos
    where id in (
      '10000000-0000-4000-8000-000000000030',
      '10000000-0000-4000-8000-000000000031'
    )
  ),
  0::bigint,
  'one malformed import row rolls back the whole batch'
);
select throws_ok(
  $$ select * from public.import_wechat_todos(
       '[{
         "id":"10000000-0000-4000-8000-000000000032",
         "user_id":"00000000-0000-4000-8000-000000000011",
         "title":"Injected owner",
         "description":"",
         "role":"personal",
         "start_at":null,
         "end_at":null,
         "remind_at":null,
         "priority":"normal",
         "status":"open"
       }]'::jsonb
     ) $$,
  '22023'
);
select is(
  (select count(*) from public.todos where id = '10000000-0000-4000-8000-000000000032'),
  0::bigint,
  'an import payload cannot inject user_id'
);
select lives_ok(
  $$ select * from public.import_wechat_todos(
       '[
         {
           "id":"10000000-0000-4000-8000-000000000033",
           "title":"Imported one",
           "description":"one",
           "role":"head",
           "start_at":null,
           "end_at":null,
           "remind_at":null,
           "priority":"normal",
           "status":"open"
         },
         {
           "id":"10000000-0000-4000-8000-000000000034",
           "title":"Imported two",
           "description":"two",
           "role":"personal",
           "start_at":"2026-09-16T09:00:00+08:00",
           "end_at":"2026-09-16T09:30:00+08:00",
           "remind_at":null,
           "priority":"low",
           "status":"done"
         }
       ]'::jsonb
     ) $$,
  'a valid WeChat batch imports in one function call'
);
select is(
  (
    select count(*)
    from public.todos
    where id in (
      '10000000-0000-4000-8000-000000000033',
      '10000000-0000-4000-8000-000000000034'
    )
      and user_id = '00000000-0000-4000-8000-000000000010'
  ),
  2::bigint,
  'a valid import writes every row with JWT-derived ownership'
);

select lives_ok(
  $$ select public.set_active_semester('20000000-0000-4000-8000-000000000012') $$,
  'a user can switch their active semester'
);
select is(
  (select count(*) from public.semesters where is_active),
  1::bigint,
  'switching leaves exactly one own active semester'
);
select is(
  (select id from public.semesters where is_active),
  '20000000-0000-4000-8000-000000000012'::uuid,
  'the requested own semester becomes active'
);
select throws_ok(
  $$ select public.set_active_semester('20000000-0000-4000-8000-000000000011') $$,
  '42501'
);

select throws_ok(
  $$ select public.delete_semester('20000000-0000-4000-8000-000000000011') $$,
  '42501'
);

reset role;
select is(
  (
    select count(*)
    from public.semesters
    where id = '20000000-0000-4000-8000-000000000011'
      and is_active
  ),
  1::bigint,
  'a rejected cross-user switch/delete leaves the other semester unchanged'
);
select is(
  (select count(*) from public.courses where id = '60000000-0000-4000-8000-000000000011'),
  1::bigint,
  'a rejected cross-user delete leaves the other course unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000010', true);
select lives_ok(
  $$ select public.delete_semester('20000000-0000-4000-8000-000000000010') $$,
  'a user can atomically delete their own semester and its courses'
);
select is(
  (select count(*) from public.semesters where id = '20000000-0000-4000-8000-000000000010'),
  0::bigint,
  'own semester deletion removes the semester'
);
select is(
  (select count(*) from public.courses where semester_id = '20000000-0000-4000-8000-000000000010'),
  0::bigint,
  'own semester deletion removes its courses in the same transaction'
);
select is(
  (
    select count(*)
    from public.lesson_plans
    where id = '70000000-0000-4000-8000-000000000010'
      and course_id is null
  ),
  1::bigint,
  'semester deletion preserves lesson plans and detaches their deleted courses'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000012', true);
select throws_ok(
  $$ select public.save_todo_with_conflict_check(
       '{
         "title":"Locked save",
         "description":"",
         "role":"personal",
         "start_at":null,
         "end_at":null,
         "remind_at":null,
         "priority":"normal",
         "status":"open"
       }'::jsonb,
       false
     ) $$,
  '42501'
);
select throws_ok(
  $$ select * from public.import_wechat_todos('[]'::jsonb) $$,
  '42501'
);
select throws_ok(
  $$ select public.set_active_semester('20000000-0000-4000-8000-000000000013') $$,
  '42501'
);
select throws_ok(
  $$ select public.delete_semester('20000000-0000-4000-8000-000000000013') $$,
  '42501'
);

reset role;
select is(
  (
    select count(*)
    from public.todos
    where user_id = '00000000-0000-4000-8000-000000000011'
      and id = '10000000-0000-4000-8000-000000000011'
      and title = 'B private todo'
  ),
  1::bigint,
  'a rejected cross-user save leaves the other todo unchanged'
);

select * from finish();
rollback;
