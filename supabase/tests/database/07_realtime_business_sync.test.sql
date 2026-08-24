begin;

select plan(57);

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
    'public.apply_workbench_change(text,jsonb,timestamp with time zone,jsonb,uuid)'
  ) is not null,
  'the workbench change RPC exists with its stable signature'
);
select is(
  (
    select routine.prosecdef
    from pg_proc routine
    where routine.oid = to_regprocedure(
      'public.apply_workbench_change(text,jsonb,timestamp with time zone,jsonb,uuid)'
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

create temporary table sync_table_fixtures (
  sort_order int primary key,
  table_name text not null unique,
  original_record jsonb not null,
  newer_record jsonb not null,
  marker_column text not null,
  marker_value text not null,
  cross_owner_id uuid
) on commit drop;

insert into sync_table_fixtures (
  sort_order, table_name, original_record, newer_record,
  marker_column, marker_value, cross_owner_id
)
values
  (
    1,
    'semesters',
    '{"id":"71000000-0000-4000-8000-000000000001","name":"initial semester","start_date":"2030-01-01","end_date":"2030-06-30","total_weeks":20,"is_active":false,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000001","name":"updated semester","start_date":"2030-01-01","end_date":"2030-06-30","total_weeks":20,"is_active":false,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'name', 'updated semester', null
  ),
  (
    2,
    'ideas',
    '{"id":"71000000-0000-4000-8000-000000000002","content":"initial idea","tags":[],"pinned":false,"archived_at":null,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000002","content":"updated idea","tags":[],"pinned":false,"archived_at":null,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'content', 'updated idea', null
  ),
  (
    3,
    'teachers',
    '{"id":"71000000-0000-4000-8000-000000000003","name":"initial teacher","department":"","archived_at":null,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000003","name":"updated teacher","department":"","archived_at":null,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'name', 'updated teacher', null
  ),
  (
    4,
    'students',
    '{"id":"71000000-0000-4000-8000-000000000004","name":"initial student","program":"","cohort":"","contact":"","notes":"","archived_at":null,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000004","name":"updated student","program":"","cohort":"","contact":"","notes":"","archived_at":null,"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'name', 'updated student', null
  ),
  (
    5,
    'learning_methods',
    '{"id":"71000000-0000-4000-8000-000000000005","name":"initial method","scenario":"","steps":"","evaluation":"","tags":[],"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000005","name":"updated method","scenario":"","steps":"","evaluation":"","tags":[],"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'name', 'updated method', null
  ),
  (
    6,
    'courses',
    '{"id":"71000000-0000-4000-8000-000000000006","semester_id":"71000000-0000-4000-8000-000000000001","name":"initial course","location":"","teacher":"","weekday":1,"start_time":"09:00:00","end_time":"10:00:00","start_week":1,"end_week":20,"week_rule":{"kind":"every"},"notes":"","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000006","semester_id":"71000000-0000-4000-8000-000000000001","name":"updated course","location":"","teacher":"","weekday":1,"start_time":"09:00:00","end_time":"10:00:00","start_week":1,"end_week":20,"week_rule":{"kind":"every"},"notes":"","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'name', 'updated course', '72000000-0000-4000-8000-000000000006'
  ),
  (
    7,
    'teacher_year_summaries',
    '{"id":"71000000-0000-4000-8000-000000000007","teacher_id":"71000000-0000-4000-8000-000000000003","year":"2030","state":"empty","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000007","teacher_id":"71000000-0000-4000-8000-000000000003","year":"2030","state":"reported","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'state', 'reported', '72000000-0000-4000-8000-000000000007'
  ),
  (
    8,
    'teacher_records',
    '{"id":"71000000-0000-4000-8000-000000000008","teacher_id":"71000000-0000-4000-8000-000000000003","year":"2030","type":"work","date":"2030-01-02","title":"initial record","content":"","status":"pending","notes":"","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000008","teacher_id":"71000000-0000-4000-8000-000000000003","year":"2030","type":"work","date":"2030-01-02","title":"updated record","content":"","status":"pending","notes":"","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'title', 'updated record', '72000000-0000-4000-8000-000000000008'
  ),
  (
    9,
    'mentorships',
    '{"id":"71000000-0000-4000-8000-000000000009","teacher_id":"71000000-0000-4000-8000-000000000003","academic_year":"2030","student_name":"Student","grade":"","major":"","topic":"initial topic","status":"planned","notes":"","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000009","teacher_id":"71000000-0000-4000-8000-000000000003","academic_year":"2030","student_name":"Student","grade":"","major":"","topic":"updated topic","status":"planned","notes":"","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'topic', 'updated topic', '72000000-0000-4000-8000-000000000009'
  ),
  (
    10,
    'research_items',
    '{"id":"71000000-0000-4000-8000-000000000010","title":"initial research","authors":"","source":"","year":2030,"url_or_doi":"","tags":[],"status":"unread","rating":null,"abstract":"","notes":"","source_type":"idea","source_id":"71000000-0000-4000-8000-000000000002","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000010","title":"updated research","authors":"","source":"","year":2030,"url_or_doi":"","tags":[],"status":"unread","rating":null,"abstract":"","notes":"","source_type":"idea","source_id":"71000000-0000-4000-8000-000000000002","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'title', 'updated research', '72000000-0000-4000-8000-000000000010'
  ),
  (
    11,
    'lesson_plans',
    '{"id":"71000000-0000-4000-8000-000000000011","course_id":"71000000-0000-4000-8000-000000000006","chapter":"initial chapter","objectives":"","outline":"","resources":"","activities":"","planned_date":null,"status":"notStarted","source_type":"idea","source_id":"71000000-0000-4000-8000-000000000002","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000011","course_id":"71000000-0000-4000-8000-000000000006","chapter":"updated chapter","objectives":"","outline":"","resources":"","activities":"","planned_date":null,"status":"notStarted","source_type":"idea","source_id":"71000000-0000-4000-8000-000000000002","created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'chapter', 'updated chapter', '72000000-0000-4000-8000-000000000011'
  ),
  (
    12,
    'student_records',
    '{"id":"71000000-0000-4000-8000-000000000012","student_id":"71000000-0000-4000-8000-000000000004","date":"2030-01-02","category":"task","rating":"normal","content":"initial student record","follow_up":"","tags":[],"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    '{"id":"71000000-0000-4000-8000-000000000012","student_id":"71000000-0000-4000-8000-000000000004","date":"2030-01-02","category":"task","rating":"normal","content":"updated student record","follow_up":"","tags":[],"created_at":"2030-01-01T00:00:00Z"}'::jsonb,
    'content', 'updated student record', '72000000-0000-4000-8000-000000000012'
  );

grant select on sync_table_fixtures to authenticated;

create function pg_temp.apply_sync_fixture_stage(
  p_variant text,
  p_client_updated_at timestamptz,
  p_deleted_at jsonb,
  p_expected_applied boolean
)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  fixture record;
  payload jsonb;
  result jsonb;
  mismatches text[] := '{}'::text[];
begin
  for fixture in
    select * from pg_temp.sync_table_fixtures order by sort_order
  loop
    payload := case p_variant
      when 'original' then fixture.original_record
      when 'newer' then fixture.newer_record
      else null
    end;
    if p_deleted_at is not null and jsonb_typeof(p_deleted_at) <> 'null' then
      payload := jsonb_build_object('id', payload -> 'id');
    end if;
    begin
      result := public.apply_workbench_change(
        fixture.table_name,
        payload,
        p_client_updated_at,
        p_deleted_at,
        auth.uid()
      );
      if (result ->> 'applied')::boolean is distinct from p_expected_applied then
        mismatches := array_append(mismatches, fixture.table_name);
      end if;
    exception
      when others then
        mismatches := array_append(
          mismatches,
          fixture.table_name || ':' || sqlstate
        );
    end;
  end loop;
  return mismatches;
end;
$$;

create function pg_temp.visible_sync_rows(p_table text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_count bigint;
begin
  execute format('select count(*) from public.%I', p_table) into row_count;
  return row_count;
end;
$$;

create function pg_temp.fixture_field_value(
  p_table text,
  p_record jsonb,
  p_column text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  field_value text;
begin
  execute format(
    'select to_jsonb(target) ->> $1
     from public.%I target
     where target.id = $2::uuid',
    p_table
  )
  using p_column, p_record ->> 'id'
  into field_value;
  return field_value;
end;
$$;

create function pg_temp.fixture_deleted_at(p_table text, p_record jsonb)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tombstone timestamptz;
begin
  execute format(
    'select deleted_at from public.%I where id = $1::uuid',
    p_table
  )
  using p_record ->> 'id'
  into tombstone;
  return tombstone;
end;
$$;

create function pg_temp.fixture_change_sqlstate(
  p_table text,
  p_record jsonb,
  p_client_updated_at timestamptz,
  p_deleted_at jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.apply_workbench_change(
    p_table, p_record, p_client_updated_at, p_deleted_at, auth.uid()
  );
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

grant execute on function pg_temp.apply_sync_fixture_stage(
  text, timestamptz, jsonb, boolean
) to authenticated;
grant execute on function pg_temp.visible_sync_rows(text) to authenticated;
grant execute on function pg_temp.fixture_field_value(text, jsonb, text)
  to authenticated;
grant execute on function pg_temp.fixture_deleted_at(text, jsonb)
  to authenticated;
grant execute on function pg_temp.fixture_change_sqlstate(
  text, jsonb, timestamptz, jsonb
) to authenticated;

create temporary table receipt_observations (
  stage text primary key,
  received_at timestamptz not null
) on commit drop;
grant select, insert on receipt_observations to authenticated;

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
with inserted as (
  insert into public.app_settings (
    key, value, updated_at, server_updated_at
  )
  values (
    'receipt-clock',
    '{"sequence":1}'::jsonb,
    '2030-01-01 00:01:00+00',
    '2099-01-01 00:00:00+00'
  )
  returning server_updated_at
)
insert into receipt_observations (stage, received_at)
select 'insert', server_updated_at from inserted;
select ok(
  (select received_at from receipt_observations where stage = 'insert')
    < '2099-01-01 00:00:00+00'::timestamptz,
  'a direct insert cannot spoof server_updated_at'
);
with changed as (
  update public.app_settings
  set value = '{"sequence":2}'::jsonb
  where key = 'receipt-clock'
  returning server_updated_at
)
insert into receipt_observations (stage, received_at)
select 'update', server_updated_at from changed;
select ok(
  (select received_at from receipt_observations where stage = 'update')
    > (select received_at from receipt_observations where stage = 'insert'),
  'server receipt time advances across insert and update in one transaction'
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
       null,
       '00000000-0000-4000-8000-000000000071'
     ) $$,
  'the RPC ignores a spoofed user_id rather than targeting user A'
);
select is(
  (select value ->> 'mode' from public.app_settings where key = 'theme'),
  'user-b',
  'a spoofed user_id is replaced with user B identity'
);
select throws_ok(
  $$ select public.apply_workbench_change(
       'app_settings',
       '{"key":"theme","value":{"mode":"stale-user-a-engine"}}'::jsonb,
       '2030-01-01 00:02:30+00',
       null,
       '00000000-0000-4000-8000-000000000070'
     ) $$,
  '42501',
  'expected_user_mismatch',
  'an engine created for user A cannot write after the session changes to user B'
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
      'null'::jsonb,
      '00000000-0000-4000-8000-000000000070'
    ) ->> 'applied'
  )::boolean,
  true,
  'a newer setting update is applied'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"equal-last-arrival"}}'::jsonb,
      '2030-01-01 00:03:00+00',
      null,
      '00000000-0000-4000-8000-000000000070'
    ) ->> 'applied'
  )::boolean,
  true,
  'an equal-timestamp update is accepted as the last server arrival'
);
select is(
  (select value ->> 'mode' from public.app_settings where key = 'theme'),
  'equal-last-arrival',
  'the last server arrival wins when client timestamps are equal'
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
      null,
      '00000000-0000-4000-8000-000000000070'
    ) ->> 'applied'
  )::boolean,
  false,
  'an older setting update is ignored'
);
select is(
  (select value ->> 'mode' from public.app_settings where key = 'theme'),
  'equal-last-arrival',
  'the newer setting value survives an older update'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme","value":{"mode":"older-delete"}}'::jsonb,
      '2030-01-01 00:02:30+00',
      to_jsonb('2030-01-01T00:02:30Z'::text),
      '00000000-0000-4000-8000-000000000070'
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
      null,
      '00000000-0000-4000-8000-000000000070'
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
      '{"key":"theme"}'::jsonb,
      '2030-01-01 00:05:00+00',
      to_jsonb('2030-01-01T00:05:00Z'::text),
      '00000000-0000-4000-8000-000000000070'
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
      '{"key":"theme"}'::jsonb,
      '2030-01-01 00:05:00+00',
      to_jsonb('2030-01-01T00:05:00Z'::text),
      '00000000-0000-4000-8000-000000000070'
    ) ->> 'applied'
  )::boolean,
  true,
  'an equal-timestamp tombstone is accepted as the last server arrival'
);
select is(
  (
    public.apply_workbench_change(
      'app_settings',
      '{"key":"theme"}'::jsonb,
      '2030-01-01 00:05:00+00',
      to_jsonb('2030-01-01T00:05:00Z'::text),
      '00000000-0000-4000-8000-000000000070'
    ) -> 'row' ->> 'key'
  ),
  'theme',
  'an equal-timestamp retry returns the authoritative row'
);
select throws_ok(
  $$ select public.apply_workbench_change(
       'profiles', '{}'::jsonb, '2030-01-01 00:06:00+00', null,
       '00000000-0000-4000-8000-000000000070'
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
      null,
      '00000000-0000-4000-8000-000000000070'
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
      null,
      '00000000-0000-4000-8000-000000000071'
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
select is(
  (
    public.apply_workbench_change(
      'todos',
      '{"id":"70000000-0000-4000-8000-000000000001"}'::jsonb,
      '2030-01-01 00:08:00+00',
      to_jsonb('2030-01-01T00:08:00Z'::text),
      '00000000-0000-4000-8000-000000000070'
    ) ->> 'applied'
  )::boolean,
  true,
  'the exact gateway identity-only todo tombstone payload is applied'
);
select is(
  (select deleted_at from public.todos where id = '70000000-0000-4000-8000-000000000001'),
  '2030-01-01 00:08:00+00'::timestamptz,
  'the identity-only todo tombstone retains the authoritative row'
);

select is(
  pg_temp.apply_sync_fixture_stage(
    'original', '2030-02-01 00:01:00+00', null, true
  ),
  '{}'::text[],
  'user A can create a row through the RPC in every remaining business table'
);
select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.visible_sync_rows(fixture.table_name) <> 1
    order by fixture.sort_order
  ),
  '{}'::text[],
  'user A can read the synchronized row in every remaining business table'
);
select is(
  pg_temp.apply_sync_fixture_stage(
    'newer', '2030-02-01 00:03:00+00', null, true
  ),
  '{}'::text[],
  'a newer same-user update applies in every remaining business table'
);
select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.fixture_field_value(
      fixture.table_name,
      fixture.newer_record,
      fixture.marker_column
    ) is distinct from fixture.marker_value
    order by fixture.sort_order
  ),
  '{}'::text[],
  'every remaining business table stores its newer field value'
);
select is(
  pg_temp.apply_sync_fixture_stage(
    'original', '2030-02-01 00:02:00+00', null, false
  ),
  '{}'::text[],
  'an older update is ignored in every remaining business table'
);
select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.fixture_field_value(
      fixture.table_name,
      fixture.newer_record,
      fixture.marker_column
    ) is distinct from fixture.marker_value
    order by fixture.sort_order
  ),
  '{}'::text[],
  'older updates cannot replace newer field values'
);
select is(
  pg_temp.apply_sync_fixture_stage(
    'newer',
    '2030-02-01 00:02:30+00',
    to_jsonb('2030-02-01T00:02:30Z'::text),
    false
  ),
  '{}'::text[],
  'an older deletion is ignored in every remaining business table'
);
select is(
  pg_temp.apply_sync_fixture_stage(
    'newer', '2030-02-01 00:04:00+00', null, true
  ),
  '{}'::text[],
  'a newer active update applies after an older deletion attempt'
);
select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.fixture_deleted_at(
      fixture.table_name, fixture.newer_record
    ) is not null
    order by fixture.sort_order
  ),
  '{}'::text[],
  'the newer active update leaves every remaining row active'
);
select is(
  pg_temp.apply_sync_fixture_stage(
    'newer',
    '2030-02-01 00:05:00+00',
    to_jsonb('2030-02-01T00:05:00Z'::text),
    true
  ),
  '{}'::text[],
  'a newer deletion applies in every remaining business table'
);
select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.fixture_deleted_at(
      fixture.table_name, fixture.newer_record
    ) is distinct from '2030-02-01 00:05:00+00'::timestamptz
    order by fixture.sort_order
  ),
  '{}'::text[],
  'every remaining business table stores the winning tombstone'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000071', true);

select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.visible_sync_rows(fixture.table_name) <> 0
    order by fixture.sort_order
  ),
  '{}'::text[],
  'user B cannot read user A rows in any remaining business table'
);
select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.fixture_change_sqlstate(
      fixture.table_name,
      fixture.newer_record,
      '2030-02-01 00:06:00+00',
      null
    ) is distinct from '42501'
    order by fixture.sort_order
  ),
  '{}'::text[],
  'user B cannot mutate user A rows through the RPC'
);
select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where fixture.cross_owner_id is not null
      and pg_temp.fixture_change_sqlstate(
        fixture.table_name,
        fixture.newer_record || jsonb_build_object(
          'id', fixture.cross_owner_id
        ),
        '2030-02-01 00:07:00+00',
        null
      ) is distinct from '23503'
    order by fixture.sort_order
  ),
  '{}'::text[],
  'dependent tables reject user B references to user A parent rows'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000070', true);

select is(
  array(
    select fixture.table_name
    from sync_table_fixtures fixture
    where pg_temp.fixture_deleted_at(
      fixture.table_name, fixture.newer_record
    ) is distinct from '2030-02-01 00:05:00+00'::timestamptz
    order by fixture.sort_order
  ),
  '{}'::text[],
  'cross-user attempts leave every winning tombstone unchanged'
);

select * from finish();

rollback;
