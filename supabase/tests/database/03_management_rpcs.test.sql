begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000040',
    'authenticated', 'authenticated', 'management-a@users.workbench.invalid',
    extensions.crypt('password-a', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000041',
    'authenticated', 'authenticated', 'management-b@users.workbench.invalid',
    extensions.crypt('password-b', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, username, role, is_active, must_change_password)
values
  ('00000000-0000-4000-8000-000000000040', 'management-a', 'member', true, false),
  ('00000000-0000-4000-8000-000000000041', 'management-b', 'member', true, false);

insert into public.teachers (id, user_id, name, department, archived_at)
values
  (
    '40000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000040', 'A active teacher', 'A', null
  ),
  (
    '40000000-0000-4000-8000-000000000042',
    '00000000-0000-4000-8000-000000000040', 'A second teacher', 'A', null
  ),
  (
    '40000000-0000-4000-8000-000000000043',
    '00000000-0000-4000-8000-000000000040', 'A archived teacher', 'A', now()
  ),
  (
    '40000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000041', 'B private teacher', 'B', null
  );

insert into public.teacher_year_summaries (
  id, user_id, teacher_id, year, state
)
values
  (
    '41000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000040',
    '40000000-0000-4000-8000-000000000040', '2026', 'empty'
  ),
  (
    '41000000-0000-4000-8000-000000000042',
    '00000000-0000-4000-8000-000000000040',
    '40000000-0000-4000-8000-000000000042', '2026', 'empty'
  ),
  (
    '41000000-0000-4000-8000-000000000043',
    '00000000-0000-4000-8000-000000000040',
    '40000000-0000-4000-8000-000000000043', '2026', 'empty'
  );

insert into public.students (
  id, user_id, name, program, cohort, contact, notes, archived_at
)
values
  (
    '50000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000040', 'A active student', '', '', '', '', null
  ),
  (
    '50000000-0000-4000-8000-000000000042',
    '00000000-0000-4000-8000-000000000040', 'A archived student', '', '', '', '', now()
  ),
  (
    '50000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000041', 'B private student', '', '', '', '', null
  );

insert into public.ideas (id, user_id, content, tags, pinned, archived_at)
values
  (
    '30000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000040', 'A convertible idea', '{alpha,beta}', false, null
  ),
  (
    '30000000-0000-4000-8000-000000000042',
    '00000000-0000-4000-8000-000000000040', 'A archived idea', '{}', false, now()
  ),
  (
    '30000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000041', 'B private idea', '{}', false, null
  );

insert into public.todos (
  id, user_id, title, description, role, priority, status
)
values
  (
    '10000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000040', 'A old todo', '', 'personal', 'normal', 'open'
  ),
  (
    '10000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000041', 'B sentinel todo', '', 'personal', 'normal', 'open'
  );

insert into public.app_settings (user_id, key, value)
values
  ('00000000-0000-4000-8000-000000000040', 'old-setting', '"A"'::jsonb),
  ('00000000-0000-4000-8000-000000000041', 'sentinel-setting', '"B"'::jsonb);

create temporary table management_rpc_results (
  label text primary key,
  value text
) on commit drop;
grant select, insert, update, delete on management_rpc_results to authenticated;

create temporary table management_snapshots (
  label text primary key,
  value jsonb not null
) on commit drop;
grant select, insert, update, delete on management_snapshots to authenticated;

create function pg_temp.management_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'todos', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.todos x where x.user_id = p_user_id),
    'semesters', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.semesters x where x.user_id = p_user_id),
    'courses', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.courses x where x.user_id = p_user_id),
    'teachers', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.teachers x where x.user_id = p_user_id),
    'teacherYearSummaries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.teacher_year_summaries x where x.user_id = p_user_id),
    'teacherRecords', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.teacher_records x where x.user_id = p_user_id),
    'mentorships', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.mentorships x where x.user_id = p_user_id),
    'researchItems', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.research_items x where x.user_id = p_user_id),
    'learningMethods', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.learning_methods x where x.user_id = p_user_id),
    'ideas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.ideas x where x.user_id = p_user_id),
    'lessonPlans', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.lesson_plans x where x.user_id = p_user_id),
    'students', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.students x where x.user_id = p_user_id),
    'studentRecords', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.student_records x where x.user_id = p_user_id),
    'settings', (select coalesce(jsonb_agg(to_jsonb(x) order by x.key), '[]'::jsonb) from public.app_settings x where x.user_id = p_user_id)
  );
$$;

create temporary table management_backups (
  label text primary key,
  payload jsonb not null
) on commit drop;
grant select on management_backups to authenticated;

insert into management_backups (label, payload)
values
  (
    'invalid-reference',
    '{
      "schemaVersion": 1,
      "exportedAt": "2026-08-15T08:00:00.000Z",
      "tables": {
        "todos": [], "semesters": [], "courses": [], "teachers": [],
        "teacherYearSummaries": [],
        "teacherRecords": [{
          "id":"49000000-0000-4000-8000-000000000049",
          "createdAt":"2026-08-15T08:00:00.000Z",
          "updatedAt":"2026-08-15T08:00:00.000Z",
          "teacherId":"40000000-0000-4000-8000-000000000099",
          "year":"2026", "type":"work", "date":"2026-08-15",
          "title":"orphan", "content":"", "status":"completed", "notes":""
        }],
        "mentorships": [], "researchItems": [], "learningMethods": [],
        "ideas": [], "lessonPlans": [], "students": [],
        "studentRecords": [], "settings": []
      }
    }'::jsonb
  ),
  (
    'valid-complete',
    '{
      "schemaVersion": 1,
      "exportedAt": "2026-08-15T08:00:00.000Z",
      "tables": {
        "todos": [{
          "id":"10000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "title":"restored todo", "description":"", "role":"dean", "startAt":null, "endAt":null, "remindAt":null,
          "priority":"high", "status":"open", "sourceType":"idea", "sourceId":"30000000-0000-4000-8000-000000000049"
        }],
        "semesters": [{
          "id":"20000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "name":"restored semester", "startDate":"2026-09-01", "endDate":"2027-01-15", "totalWeeks":18, "isActive":true
        }],
        "courses": [{
          "id":"60000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "semesterId":"20000000-0000-4000-8000-000000000049", "name":"restored course", "location":"", "teacher":"",
          "weekday":1, "startTime":"09:00", "endTime":"10:00", "startWeek":1, "endWeek":18, "weekRule":{"kind":"every"}, "notes":""
        }],
        "teachers": [{
          "id":"40000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "name":"restored teacher", "department":"A", "archivedAt":null
        }],
        "teacherYearSummaries": [{
          "id":"41000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "teacherId":"40000000-0000-4000-8000-000000000049", "year":"2026", "state":"reported"
        }],
        "teacherRecords": [{
          "id":"42000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "teacherId":"40000000-0000-4000-8000-000000000049", "year":"2026", "type":"work", "date":"2026-08-15",
          "title":"restored teacher record", "content":"", "status":"completed", "notes":""
        }],
        "mentorships": [{
          "id":"43000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "teacherId":"40000000-0000-4000-8000-000000000049", "academicYear":"2026-2027", "studentName":"student",
          "grade":"one", "major":"major", "topic":"topic", "status":"active", "notes":""
        }],
        "researchItems": [{
          "id":"80000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "title":"restored research", "authors":"", "source":"", "year":2026, "urlOrDoi":"", "tags":["alpha"],
          "status":"reading", "rating":4, "abstract":"", "notes":"", "sourceType":"idea", "sourceId":"30000000-0000-4000-8000-000000000049"
        }],
        "learningMethods": [{
          "id":"90000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "name":"restored method", "scenario":"", "steps":"", "evaluation":"", "tags":["alpha"]
        }],
        "ideas": [{
          "id":"30000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "content":"restored idea", "tags":["alpha"], "pinned":true, "archivedAt":null
        }],
        "lessonPlans": [{
          "id":"70000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "courseId":"60000000-0000-4000-8000-000000000049", "chapter":"chapter", "objectives":"", "outline":"", "resources":"",
          "activities":"", "plannedDate":"2026-09-01", "status":"inProgress", "sourceType":"idea", "sourceId":"30000000-0000-4000-8000-000000000049"
        }],
        "students": [{
          "id":"50000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "name":"restored student", "program":"program", "cohort":"cohort", "contact":"", "notes":"", "archivedAt":null
        }],
        "studentRecords": [{
          "id":"51000000-0000-4000-8000-000000000049", "createdAt":"2026-08-15T08:00:00.000Z", "updatedAt":"2026-08-15T08:00:00.000Z",
          "studentId":"50000000-0000-4000-8000-000000000049", "date":"2026-08-15", "category":"research",
          "rating":"positive", "content":"restored student record", "followUp":"", "tags":["alpha"]
        }],
        "settings": [{"key":"theme", "value":"dark", "updatedAt":"2026-08-15T08:00:00.000Z"}]
      }
    }'::jsonb
  );

insert into management_backups (label, payload)
select 'wrong-version', jsonb_set(payload, '{schemaVersion}', '2'::jsonb)
from management_backups where label = 'valid-complete'
union all
select 'missing-table-array', payload #- '{tables,studentRecords}'
from management_backups where label = 'valid-complete'
union all
select 'invalid-uuid', jsonb_set(payload, '{tables,ideas,0,id}', '"not-a-uuid"'::jsonb)
from management_backups where label = 'valid-complete'
union all
select 'invalid-scalar-type', jsonb_set(payload, '{tables,todos,0,title}', '42'::jsonb)
from management_backups where label = 'valid-complete'
union all
select 'invalid-enum', jsonb_set(payload, '{tables,todos,0,role}', '"owner"'::jsonb)
from management_backups where label = 'valid-complete'
union all
select 'two-active-semesters', jsonb_set(
  payload,
  '{tables,semesters}',
  (payload #> '{tables,semesters}') || '[{
    "id":"20000000-0000-4000-8000-000000000048",
    "createdAt":"2026-08-15T08:00:00.000Z",
    "updatedAt":"2026-08-15T08:00:00.000Z",
    "name":"second active", "startDate":"2026-09-01", "endDate":"2027-01-15",
    "totalWeeks":18, "isActive":true
  }]'::jsonb
)
from management_backups where label = 'valid-complete'
union all
select 'foreign-payload-owner', jsonb_set(
  payload,
  '{tables,todos,0,user_id}',
  '"00000000-0000-4000-8000-000000000041"'::jsonb
)
from management_backups where label = 'valid-complete'
union all
select 'foreign-id-collision', jsonb_set(
  payload,
  '{tables,todos,0,id}',
  '"10000000-0000-4000-8000-000000000041"'::jsonb
)
from management_backups where label = 'valid-complete'
union all
select 'duplicate-ids', jsonb_set(
  payload,
  '{tables,teachers}',
  (payload #> '{tables,teachers}') || jsonb_build_array(payload #> '{tables,teachers,0}')
)
from management_backups where label = 'valid-complete';

select has_function('public', 'fill_missing_teacher_summaries', array['text'], 'fill_missing_teacher_summaries has the exact public signature');
select has_function('public', 'add_teacher_record', array['jsonb'], 'add_teacher_record has the exact public signature');
select has_function('public', 'batch_teacher_records', array['uuid[]', 'jsonb'], 'batch_teacher_records has the exact public signature');
select has_function('public', 'add_student_record', array['jsonb'], 'add_student_record has the exact public signature');
select has_function('public', 'convert_idea', array['uuid', 'text'], 'convert_idea has the exact public signature');
select has_function('public', 'restore_backup_v1', array['jsonb'], 'restore_backup_v1 has the exact public signature');

select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'fill_missing_teacher_summaries', 'add_teacher_record',
        'batch_teacher_records', 'add_student_record', 'convert_idea',
        'restore_backup_v1'
      ])
      and p.prosecdef
      and p.proconfig = array['search_path=""']
  ),
  6::bigint,
  'every management RPC is security definer with an empty search path'
);
select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'fill_missing_teacher_summaries', 'add_teacher_record',
        'batch_teacher_records', 'add_student_record', 'convert_idea',
        'restore_backup_v1'
      ])
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ),
  6::bigint,
  'only authenticated clients receive management RPC execution grants'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000040', true);

select throws_ok(
  $$ select public.add_teacher_record('{"teacher_id":"40000000-0000-4000-8000-000000000041","year":"2026","type":"work","date":"2026-08-15","title":"foreign","content":"","status":"completed","notes":""}'::jsonb) $$,
  '42501',
  null,
  'a foreign teacher id fails closed'
);
select is((select count(*) from public.teacher_records), 0::bigint, 'a rejected foreign teacher record creates no row');

select throws_ok(
  $$ select public.add_student_record('{"student_id":"50000000-0000-4000-8000-000000000041","date":"2026-08-15","category":"task","rating":"normal","content":"foreign","follow_up":"","tags":[]}'::jsonb) $$,
  '42501',
  null,
  'a foreign student id fails closed'
);
select is((select count(*) from public.student_records), 0::bigint, 'a rejected foreign student record creates no row');

select throws_ok(
  $$ select public.convert_idea('30000000-0000-4000-8000-000000000041', 'todo') $$,
  '42501',
  null,
  'a foreign idea id fails closed'
);
select is((select count(*) from public.todos where source_id = '30000000-0000-4000-8000-000000000041'), 0::bigint, 'a rejected foreign idea conversion creates no target');

select throws_ok(
  $$ select public.batch_teacher_records(
       array['40000000-0000-4000-8000-000000000042','40000000-0000-4000-8000-000000000043']::uuid[],
       '{"type":"meeting","date":"2026-08-15","title":"atomic batch","content":"","status":"attended","notes":""}'::jsonb
     ) $$,
  '42501',
  null,
  'an archived teacher aborts the whole batch'
);
select is((select count(*) from public.teacher_records), 0::bigint, 'an archived teacher leaves all batch records unchanged');
select is(
  (select count(*) from public.teacher_year_summaries where year = '2026' and state = 'reported'),
  0::bigint,
  'an archived teacher leaves every summary unchanged when the batch aborts'
);

select lives_ok(
  $$ select public.fill_missing_teacher_summaries('2027') $$,
  'fill-missing creates summaries for active teachers'
);
select is(
  (select count(*) from public.teacher_year_summaries where year = '2027'),
  2::bigint,
  'fill-missing creates exactly one summary per active teacher'
);
select is(
  (select count(*) from public.teacher_year_summaries where year = '2027' and teacher_id = '40000000-0000-4000-8000-000000000043'),
  0::bigint,
  'fill-missing excludes archived teachers'
);
select lives_ok(
  $$ select public.fill_missing_teacher_summaries('2027') $$,
  'fill-missing can be repeated'
);
select is(
  (select count(*) from public.teacher_year_summaries where year = '2027'),
  2::bigint,
  'fill-missing is idempotent'
);

select lives_ok(
  $$ select public.add_teacher_record('{"teacher_id":"40000000-0000-4000-8000-000000000040","year":"2026","type":"work","date":"2026-08-15","title":"own","content":"done","status":"completed","notes":""}'::jsonb) $$,
  'an active own teacher accepts an atomic record'
);
select is(
  (select state from public.teacher_year_summaries where teacher_id = '40000000-0000-4000-8000-000000000040' and year = '2026'),
  'reported',
  'adding a teacher record marks the matching summary reported'
);

select lives_ok(
  $$ select public.batch_teacher_records(
       array['40000000-0000-4000-8000-000000000042','40000000-0000-4000-8000-000000000042']::uuid[],
       '{"type":"material","date":"2026-08-16","title":"deduplicated","content":"","status":"submitted","notes":""}'::jsonb
     ) $$,
  'a valid teacher batch succeeds'
);
select is(
  (select count(*) from public.teacher_records where teacher_id = '40000000-0000-4000-8000-000000000042' and title = 'deduplicated'),
  1::bigint,
  'a batch deduplicates repeated teacher ids'
);
select is(
  (select state from public.teacher_year_summaries where teacher_id = '40000000-0000-4000-8000-000000000042' and year = '2026'),
  'reported',
  'a successful batch marks its teacher summary reported'
);

select throws_ok(
  $$ select public.add_student_record('{"student_id":"50000000-0000-4000-8000-000000000042","date":"2026-08-15","category":"task","rating":"normal","content":"archived","follow_up":"","tags":[]}'::jsonb) $$,
  '42501',
  null,
  'an archived student fails closed'
);
select lives_ok(
  $$ select public.add_student_record('{"student_id":"50000000-0000-4000-8000-000000000040","date":"2026-08-15","category":"research","rating":"positive","content":"own","follow_up":"next","tags":["alpha"]}'::jsonb) $$,
  'an active own student accepts a record'
);
select is((select count(*) from public.student_records), 1::bigint, 'only the valid student record is committed');

select lives_ok(
  $$ insert into management_rpc_results(label, value)
     select 'todo-first', public.convert_idea('30000000-0000-4000-8000-000000000040', 'todo') ->> 'id' $$,
  'an active own idea converts to a todo'
);
select lives_ok(
  $$ insert into management_rpc_results(label, value)
     select 'todo-second', public.convert_idea('30000000-0000-4000-8000-000000000040', 'todo') ->> 'id' $$,
  'the same idea can be converted to the same target repeatedly'
);
select is(
  (select value from management_rpc_results where label = 'todo-second'),
  (select value from management_rpc_results where label = 'todo-first'),
  'repeated idea conversion returns the existing target'
);
select is(
  (select count(*) from public.todos where source_type = 'idea' and source_id = '30000000-0000-4000-8000-000000000040'),
  1::bigint,
  'repeated idea conversion never duplicates a target'
);
select lives_ok(
  $$ select public.convert_idea('30000000-0000-4000-8000-000000000040', 'research') $$,
  'an idea converts to a research item'
);
select lives_ok(
  $$ select public.convert_idea('30000000-0000-4000-8000-000000000040', 'lesson') $$,
  'an idea converts to a lesson plan'
);
select is(
  (select count(*) from public.research_items where source_id = '30000000-0000-4000-8000-000000000040'),
  1::bigint,
  'research conversion creates one linked target'
);
select is(
  (select count(*) from public.lesson_plans where source_id = '30000000-0000-4000-8000-000000000040'),
  1::bigint,
  'lesson conversion creates one linked target'
);
select throws_ok(
  $$ select public.convert_idea('30000000-0000-4000-8000-000000000042', 'todo') $$,
  '42501',
  null,
  'an archived idea fails closed'
);
select throws_ok(
  $$ select public.convert_idea('30000000-0000-4000-8000-000000000040', 'unknown') $$,
  '22023',
  null,
  'an unknown idea conversion target is rejected'
);

insert into management_snapshots (label, value)
select 'own-before-invalid', pg_temp.management_snapshot('00000000-0000-4000-8000-000000000040');
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'wrong-version')) $$,
  '22023',
  null,
  'restore rejects an unsupported schema version before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'missing-table-array')) $$,
  '22023',
  null,
  'restore requires all fourteen table arrays before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'invalid-uuid')) $$,
  '22023',
  null,
  'restore rejects an invalid entity id before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'invalid-scalar-type')) $$,
  '22023',
  null,
  'restore rejects an invalid scalar JSON type before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'invalid-enum')) $$,
  '22023',
  null,
  'restore rejects an invalid enum before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'two-active-semesters')) $$,
  '22023',
  null,
  'restore rejects more than one active semester before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'foreign-payload-owner')) $$,
  '42501',
  null,
  'restore rejects a foreign ownership field before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'foreign-id-collision')) $$,
  '42501',
  null,
  'restore rejects an id owned by another user before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'duplicate-ids')) $$,
  '22023',
  null,
  'restore rejects duplicate ids before replacement'
);
select throws_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'invalid-reference')) $$,
  '22023',
  null,
  'an invalid backup reference is rejected before replacement'
);
insert into management_snapshots (label, value)
select 'own-after-invalid', pg_temp.management_snapshot('00000000-0000-4000-8000-000000000040');
select is(
  (select value from management_snapshots where label = 'own-after-invalid'),
  (select value from management_snapshots where label = 'own-before-invalid'),
  'an invalid backup leaves every current caller row untouched'
);

reset role;
insert into management_snapshots (label, value)
select 'other-before-valid', pg_temp.management_snapshot('00000000-0000-4000-8000-000000000041');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000040', true);

select lives_ok(
  $$ select public.restore_backup_v1((select payload from management_backups where label = 'valid-complete')) $$,
  'a valid complete backup restores atomically'
);
select is(
  (select title from public.todos where id = '10000000-0000-4000-8000-000000000049'),
  'restored todo',
  'valid restore replaces caller-owned old rows with backup rows'
);
select is(
  (
    select count(*)
    from (
      select id from public.todos union all select id from public.semesters
      union all select id from public.courses union all select id from public.teachers
      union all select id from public.teacher_year_summaries union all select id from public.teacher_records
      union all select id from public.mentorships union all select id from public.research_items
      union all select id from public.learning_methods union all select id from public.ideas
      union all select id from public.lesson_plans union all select id from public.students
      union all select id from public.student_records
    ) restored_entities
  ),
  13::bigint,
  'valid restore reinserts one caller-owned entity in every id-backed backup table'
);
select is((select count(*) from public.app_settings where key = 'theme'), 1::bigint, 'valid restore replaces caller settings');
select is((select count(*) from public.app_settings where key = 'old-setting'), 0::bigint, 'valid restore removes caller settings absent from the backup');

reset role;
insert into management_snapshots (label, value)
select 'other-after-valid', pg_temp.management_snapshot('00000000-0000-4000-8000-000000000041');
select is(
  (select value from management_snapshots where label = 'other-after-valid'),
  (select value from management_snapshots where label = 'other-before-valid'),
  'valid restore preserves every row belonging to another user'
);

select * from finish();
rollback;
