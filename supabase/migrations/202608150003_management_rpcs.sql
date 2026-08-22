create function private.management_json_types(
  p_value jsonb,
  p_text_keys text[],
  p_number_keys text[],
  p_boolean_keys text[],
  p_array_keys text[],
  p_nullable_text_keys text[]
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' then
    return false;
  end if;

  foreach v_key in array p_text_keys loop
    if not p_value ? v_key or jsonb_typeof(p_value -> v_key) is distinct from 'string' then
      return false;
    end if;
  end loop;
  foreach v_key in array p_number_keys loop
    if not p_value ? v_key or jsonb_typeof(p_value -> v_key) is distinct from 'number' then
      return false;
    end if;
  end loop;
  foreach v_key in array p_boolean_keys loop
    if not p_value ? v_key or jsonb_typeof(p_value -> v_key) is distinct from 'boolean' then
      return false;
    end if;
  end loop;
  foreach v_key in array p_array_keys loop
    if not p_value ? v_key or jsonb_typeof(p_value -> v_key) is distinct from 'array' then
      return false;
    end if;
  end loop;
  foreach v_key in array p_nullable_text_keys loop
    if not p_value ? v_key or jsonb_typeof(p_value -> v_key) not in ('string', 'null') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function private.management_json_types(
  jsonb, text[], text[], text[], text[], text[]
) from public;

create function private.management_string_array(p_value jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result text[];
begin
  if jsonb_typeof(p_value) is distinct from 'array'
    or exists (
      select 1
      from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) is distinct from 'string'
    ) then
    raise exception using errcode = '22023', message = 'malformed_record';
  end if;
  select coalesce(array_agg(item #>> '{}'), '{}'::text[])
  into v_result
  from jsonb_array_elements(p_value) item;
  return v_result;
end;
$$;

revoke all on function private.management_string_array(jsonb) from public;

create function private.management_valid_uuid(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform p_value::uuid;
  return true;
exception when others then
  return false;
end;
$$;

create function private.management_valid_date(p_value text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date date;
begin
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  v_date := p_value::date;
  return to_char(v_date, 'YYYY-MM-DD') = p_value;
exception when others then
  return false;
end;
$$;

create function private.management_valid_timestamp(p_value text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timestamp timestamptz;
begin
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?([zZ]|[+-][0-9]{2}:[0-9]{2})?$' then
    return false;
  end if;
  v_timestamp := p_value::timestamptz;
  return pg_catalog.isfinite(v_timestamp);
exception when others then
  return false;
end;
$$;

revoke all on function private.management_valid_uuid(text) from public;
revoke all on function private.management_valid_date(text) from public;
revoke all on function private.management_valid_timestamp(text) from public;

create function public.fill_missing_teacher_summaries(p_year text)
returns setof public.teacher_year_summaries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_year is null or p_year !~ '^[0-9]{4}$' then
    raise exception using errcode = '22023', message = 'malformed_year';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150003)
  );
  perform 1
  from public.teachers t
  where t.user_id = v_user_id and t.archived_at is null
  for update;

  return query
  insert into public.teacher_year_summaries (
    user_id, teacher_id, year, state
  )
  select v_user_id, t.id, p_year, 'empty'
  from public.teachers t
  where t.user_id = v_user_id and t.archived_at is null
  on conflict (user_id, teacher_id, year) do nothing
  returning *;
end;
$$;

create function public.add_teacher_record(p_record jsonb)
returns public.teacher_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_teacher_id uuid;
  v_saved public.teacher_records;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_record ?| array['user_id', 'userId'] then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if not private.management_json_types(
    p_record,
    array['teacher_id', 'year', 'type', 'date', 'title', 'content', 'status', 'notes'],
    '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[]
  )
    or not private.management_valid_uuid(p_record ->> 'teacher_id')
    or p_record ->> 'year' !~ '^[0-9]{4}$'
    or not private.management_valid_date(p_record ->> 'date')
    or p_record ->> 'type' not in ('work', 'meeting', 'material', 'publicService')
    or p_record ->> 'status' not in (
      'pending', 'attended', 'absent', 'leave', 'submitted', 'completed'
    ) then
    raise exception using errcode = '22023', message = 'malformed_teacher_record';
  end if;

  v_teacher_id := (p_record ->> 'teacher_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150003)
  );
  perform 1
  from public.teachers t
  where t.user_id = v_user_id
    and t.id = v_teacher_id
    and t.archived_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  insert into public.teacher_records (
    user_id, teacher_id, year, type, date, title, content, status, notes
  )
  values (
    v_user_id, v_teacher_id, p_record ->> 'year', p_record ->> 'type',
    (p_record ->> 'date')::date, p_record ->> 'title',
    p_record ->> 'content', p_record ->> 'status', p_record ->> 'notes'
  )
  returning * into v_saved;

  insert into public.teacher_year_summaries (
    user_id, teacher_id, year, state
  )
  values (v_user_id, v_teacher_id, p_record ->> 'year', 'reported')
  on conflict (user_id, teacher_id, year)
  do update set state = 'reported';

  return v_saved;
end;
$$;

create function public.batch_teacher_records(
  p_teacher_ids uuid[],
  p_record jsonb
)
returns setof public.teacher_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_teacher_ids uuid[];
  v_teacher_id uuid;
  v_year text;
  v_saved public.teacher_records;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_record ?| array['user_id', 'userId', 'teacher_id', 'teacherId'] then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_teacher_ids is null
    or array_position(p_teacher_ids, null) is not null
    or not private.management_json_types(
      p_record,
      array['type', 'date', 'title', 'content', 'status', 'notes'],
      '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[]
    )
    or not private.management_valid_date(p_record ->> 'date')
    or p_record ->> 'type' not in ('work', 'meeting', 'material', 'publicService')
    or p_record ->> 'status' not in (
      'pending', 'attended', 'absent', 'leave', 'submitted', 'completed'
    )
    or (
      p_record ? 'year'
      and (
        jsonb_typeof(p_record -> 'year') is distinct from 'string'
        or p_record ->> 'year' <> left(p_record ->> 'date', 4)
      )
    ) then
    raise exception using errcode = '22023', message = 'malformed_teacher_record_batch';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_teacher_ids
  from (select distinct unnest(p_teacher_ids) as id) unique_ids;
  v_year := left(p_record ->> 'date', 4);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150003)
  );
  perform 1
  from public.teachers t
  where t.user_id = v_user_id and t.id = any(v_teacher_ids)
  for update;
  if (
    select count(*)
    from public.teachers t
    where t.user_id = v_user_id
      and t.id = any(v_teacher_ids)
      and t.archived_at is null
  ) <> cardinality(v_teacher_ids) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  foreach v_teacher_id in array v_teacher_ids loop
    insert into public.teacher_records (
      user_id, teacher_id, year, type, date, title, content, status, notes
    )
    values (
      v_user_id, v_teacher_id, v_year, p_record ->> 'type',
      (p_record ->> 'date')::date, p_record ->> 'title',
      p_record ->> 'content', p_record ->> 'status', p_record ->> 'notes'
    )
    returning * into v_saved;

    insert into public.teacher_year_summaries (
      user_id, teacher_id, year, state
    )
    values (v_user_id, v_teacher_id, v_year, 'reported')
    on conflict (user_id, teacher_id, year)
    do update set state = 'reported';

    return next v_saved;
  end loop;
  return;
end;
$$;

create function public.add_student_record(p_record jsonb)
returns public.student_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_student_id uuid;
  v_saved public.student_records;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_record ?| array['user_id', 'userId'] then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if not private.management_json_types(
    p_record,
    array['student_id', 'date', 'category', 'rating', 'content', 'follow_up'],
    '{}'::text[], '{}'::text[], array['tags'], '{}'::text[]
  )
    or not private.management_valid_uuid(p_record ->> 'student_id')
    or not private.management_valid_date(p_record ->> 'date')
    or p_record ->> 'category' not in ('task', 'attendance', 'research', 'service', 'other')
    or p_record ->> 'rating' not in ('positive', 'normal', 'attention') then
    raise exception using errcode = '22023', message = 'malformed_student_record';
  end if;

  v_student_id := (p_record ->> 'student_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150003)
  );
  perform 1
  from public.students s
  where s.user_id = v_user_id
    and s.id = v_student_id
    and s.archived_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  insert into public.student_records (
    user_id, student_id, date, category, rating, content, follow_up, tags
  )
  values (
    v_user_id, v_student_id, (p_record ->> 'date')::date,
    p_record ->> 'category', p_record ->> 'rating', p_record ->> 'content',
    p_record ->> 'follow_up', private.management_string_array(p_record -> 'tags')
  )
  returning * into v_saved;
  return v_saved;
end;
$$;

create function public.convert_idea(p_idea_id uuid, p_target text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_idea public.ideas;
  v_result jsonb;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_target is null or p_target not in ('todo', 'research', 'lesson') then
    raise exception using errcode = '22023', message = 'invalid_idea_target';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150003)
  );
  select i.*
  into v_idea
  from public.ideas i
  where i.user_id = v_user_id
    and i.id = p_idea_id
    and i.archived_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  if p_target = 'todo' then
    select to_jsonb(t)
    into v_result
    from public.todos t
    where t.user_id = v_user_id
      and t.source_type = 'idea'
      and t.source_id = p_idea_id
    order by t.created_at, t.id
    limit 1;
    if v_result is null then
      v_result := public.save_todo_with_conflict_check(
        jsonb_build_object(
          'title', v_idea.content,
          'description', '',
          'role', 'personal',
          'start_at', null,
          'end_at', null,
          'remind_at', null,
          'priority', 'normal',
          'status', 'open',
          'source_type', 'idea',
          'source_id', v_idea.id::text
        ),
        true
      ) #> '{todo}';
    end if;
  elsif p_target = 'research' then
    select to_jsonb(r)
    into v_result
    from public.research_items r
    where r.user_id = v_user_id
      and r.source_type = 'idea'
      and r.source_id = p_idea_id
    order by r.created_at, r.id
    limit 1;
    if v_result is null then
      insert into public.research_items (
        user_id, title, authors, source, year, url_or_doi, tags, status,
        rating, abstract, notes, source_type, source_id
      )
      values (
        v_user_id, v_idea.content, '', '', null, '', v_idea.tags, 'unread',
        null, '', '', 'idea', v_idea.id
      )
      returning to_jsonb(research_items.*) into v_result;
    end if;
  else
    select to_jsonb(lp)
    into v_result
    from public.lesson_plans lp
    where lp.user_id = v_user_id
      and lp.source_type = 'idea'
      and lp.source_id = p_idea_id
    order by lp.created_at, lp.id
    limit 1;
    if v_result is null then
      insert into public.lesson_plans (
        user_id, course_id, chapter, objectives, outline, resources,
        activities, planned_date, status, source_type, source_id
      )
      values (
        v_user_id, null, '', '', v_idea.content, '', '', null,
        'notStarted', 'idea', v_idea.id
      )
      returning to_jsonb(lesson_plans.*) into v_result;
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.fill_missing_teacher_summaries(text)
  from public, anon, authenticated;
revoke all on function public.add_teacher_record(jsonb)
  from public, anon, authenticated;
revoke all on function public.batch_teacher_records(uuid[], jsonb)
  from public, anon, authenticated;
revoke all on function public.add_student_record(jsonb)
  from public, anon, authenticated;
revoke all on function public.convert_idea(uuid, text)
  from public, anon, authenticated;

grant execute on function public.fill_missing_teacher_summaries(text)
  to authenticated;
grant execute on function public.add_teacher_record(jsonb)
  to authenticated;
grant execute on function public.batch_teacher_records(uuid[], jsonb)
  to authenticated;
grant execute on function public.add_student_record(jsonb)
  to authenticated;
grant execute on function public.convert_idea(uuid, text)
  to authenticated;

create function public.restore_backup_v1(p_backup jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_names constant text[] := array[
    'todos', 'semesters', 'courses', 'teachers', 'teacherYearSummaries',
    'teacherRecords', 'mentorships', 'researchItems', 'learningMethods',
    'ideas', 'lessonPlans', 'students', 'studentRecords', 'settings'
  ];
  v_id_tables constant text[] := array[
    'todos', 'semesters', 'courses', 'teachers',
    'teacher_year_summaries', 'teacher_records', 'mentorships',
    'research_items', 'learning_methods', 'ideas', 'lesson_plans',
    'students', 'student_records'
  ];
  v_table_name text;
  v_item jsonb;
  v_found boolean;
  v_number numeric;
  v_stage_name text;
  v_stage_sql text;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150003)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150002)
  );

  begin
    if jsonb_typeof(p_backup) is distinct from 'object'
      or jsonb_typeof(p_backup -> 'schemaVersion') is distinct from 'number'
      or p_backup -> 'schemaVersion' <> '1'::jsonb
      or jsonb_typeof(p_backup -> 'exportedAt') is distinct from 'string'
      or not private.management_valid_timestamp(p_backup ->> 'exportedAt')
      or jsonb_typeof(p_backup -> 'tables') is distinct from 'object'
      or (
        select count(*)
        from jsonb_object_keys(p_backup -> 'tables') key
      ) <> 14
      or exists (
        select 1
        from jsonb_object_keys(p_backup -> 'tables') key
        where key <> all(v_table_names)
      ) then
      raise exception using errcode = '22023', message = 'malformed_backup';
    end if;

    foreach v_table_name in array v_table_names loop
      if jsonb_typeof(p_backup -> 'tables' -> v_table_name) is distinct from 'array' then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      for v_item in
        select value from jsonb_array_elements(p_backup -> 'tables' -> v_table_name)
      loop
        if jsonb_typeof(v_item) is distinct from 'object' then
          raise exception using errcode = '22023', message = 'malformed_backup';
        end if;
        if v_item ? 'user_id' and (
          jsonb_typeof(v_item -> 'user_id') is distinct from 'string'
          or v_item ->> 'user_id' <> v_user_id::text
        ) then
          raise exception using errcode = '42501', message = 'not_allowed';
        end if;
        if v_item ? 'userId' and (
          jsonb_typeof(v_item -> 'userId') is distinct from 'string'
          or v_item ->> 'userId' <> v_user_id::text
        ) then
          raise exception using errcode = '42501', message = 'not_allowed';
        end if;

        if v_table_name <> 'settings' then
          if not private.management_json_types(
            v_item, array['id', 'createdAt', 'updatedAt'],
            '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[]
          )
            or not private.management_valid_uuid(v_item ->> 'id')
            or not private.management_valid_timestamp(v_item ->> 'createdAt')
            or not private.management_valid_timestamp(v_item ->> 'updatedAt') then
            raise exception using errcode = '22023', message = 'malformed_backup';
          end if;
        elsif not private.management_json_types(
          v_item, array['key', 'updatedAt'],
          '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[]
        )
          or not v_item ? 'value'
          or not private.management_valid_timestamp(v_item ->> 'updatedAt') then
          raise exception using errcode = '22023', message = 'malformed_backup';
        end if;
      end loop;
    end loop;

    create temporary table if not exists restore_v1_todos
      (like public.todos including defaults) on commit drop;
    create temporary table if not exists restore_v1_semesters
      (like public.semesters including defaults) on commit drop;
    create temporary table if not exists restore_v1_courses
      (like public.courses including defaults) on commit drop;
    create temporary table if not exists restore_v1_teachers
      (like public.teachers including defaults) on commit drop;
    create temporary table if not exists restore_v1_teacher_year_summaries
      (like public.teacher_year_summaries including defaults) on commit drop;
    create temporary table if not exists restore_v1_teacher_records
      (like public.teacher_records including defaults) on commit drop;
    create temporary table if not exists restore_v1_mentorships
      (like public.mentorships including defaults) on commit drop;
    create temporary table if not exists restore_v1_research_items
      (like public.research_items including defaults) on commit drop;
    create temporary table if not exists restore_v1_learning_methods
      (like public.learning_methods including defaults) on commit drop;
    create temporary table if not exists restore_v1_ideas
      (like public.ideas including defaults) on commit drop;
    create temporary table if not exists restore_v1_lesson_plans
      (like public.lesson_plans including defaults) on commit drop;
    create temporary table if not exists restore_v1_students
      (like public.students including defaults) on commit drop;
    create temporary table if not exists restore_v1_student_records
      (like public.student_records including defaults) on commit drop;
    create temporary table if not exists restore_v1_app_settings
      (like public.app_settings including defaults) on commit drop;

    v_stage_sql := 'truncate table
      pg_temp.restore_v1_todos,
      pg_temp.restore_v1_semesters,
      pg_temp.restore_v1_courses,
      pg_temp.restore_v1_teachers,
      pg_temp.restore_v1_teacher_year_summaries,
      pg_temp.restore_v1_teacher_records,
      pg_temp.restore_v1_mentorships,
      pg_temp.restore_v1_research_items,
      pg_temp.restore_v1_learning_methods,
      pg_temp.restore_v1_ideas,
      pg_temp.restore_v1_lesson_plans,
      pg_temp.restore_v1_students,
      pg_temp.restore_v1_student_records,
      pg_temp.restore_v1_app_settings'
      || pg_catalog.substring(v_user_id::text, 1, 0);
    execute v_stage_sql;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,todos}') loop
      if not private.management_json_types(
        v_item,
        array['title', 'description', 'role', 'priority', 'status'],
        '{}'::text[], '{}'::text[], '{}'::text[],
        array['startAt', 'endAt', 'remindAt', 'sourceType', 'sourceId']
      )
        or v_item ->> 'role' not in ('dean', 'head', 'personal')
        or v_item ->> 'priority' not in ('low', 'normal', 'high')
        or v_item ->> 'status' not in ('open', 'done')
        or (v_item ->> 'sourceType') is not null and v_item ->> 'sourceType' <> 'idea'
        or jsonb_typeof(v_item -> 'sourceId') = 'string'
          and not private.management_valid_uuid(v_item ->> 'sourceId')
        or jsonb_typeof(v_item -> 'startAt') = 'string'
          and not private.management_valid_timestamp(v_item ->> 'startAt')
        or jsonb_typeof(v_item -> 'endAt') = 'string'
          and not private.management_valid_timestamp(v_item ->> 'endAt')
        or jsonb_typeof(v_item -> 'remindAt') = 'string'
          and not private.management_valid_timestamp(v_item ->> 'remindAt') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_todos');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, title, description, role, start_at, end_at, remind_at,
        priority, status, source_type, source_id, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, $1 ->> 'title',
        $1 ->> 'description', $1 ->> 'role',
        ($1 ->> 'startAt')::timestamptz,
        ($1 ->> 'endAt')::timestamptz,
        ($1 ->> 'remindAt')::timestamptz,
        $1 ->> 'priority', $1 ->> 'status',
        $1 ->> 'sourceType', ($1 ->> 'sourceId')::uuid,
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,semesters}') loop
      if not private.management_json_types(
        v_item, array['name', 'startDate', 'endDate'], array['totalWeeks'],
        array['isActive'], '{}'::text[], '{}'::text[]
      )
        or not private.management_valid_date(v_item ->> 'startDate')
        or not private.management_valid_date(v_item ->> 'endDate') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_number := (v_item ->> 'totalWeeks')::numeric;
      if v_number <> trunc(v_number) or v_number not between 1 and 60 then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_semesters');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, name, start_date, end_date, total_weeks, is_active,
        created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, $1 ->> 'name',
        ($1 ->> 'startDate')::date, ($1 ->> 'endDate')::date,
        $3::int, ($1 ->> 'isActive')::boolean,
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id, v_number;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,courses}') loop
      if not private.management_json_types(
        v_item,
        array['semesterId', 'name', 'location', 'teacher', 'startTime', 'endTime', 'notes'],
        array['weekday', 'startWeek', 'endWeek'], '{}'::text[], '{}'::text[], '{}'::text[]
      )
        or not private.management_valid_uuid(v_item ->> 'semesterId')
        or v_item ->> 'startTime' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        or v_item ->> 'endTime' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        or jsonb_typeof(v_item -> 'weekRule') is distinct from 'object' then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      if (v_item ->> 'weekday')::numeric <> trunc((v_item ->> 'weekday')::numeric)
        or (v_item ->> 'weekday')::int not between 1 and 7
        or (v_item ->> 'startWeek')::numeric <> trunc((v_item ->> 'startWeek')::numeric)
        or (v_item ->> 'startWeek')::int < 1
        or (v_item ->> 'endWeek')::numeric <> trunc((v_item ->> 'endWeek')::numeric)
        or (v_item ->> 'endWeek')::int < 1
        or not private.valid_week_rule(
          v_item -> 'weekRule',
          (v_item ->> 'startWeek')::int,
          (v_item ->> 'endWeek')::int
        ) then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_courses');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, semester_id, name, location, teacher, weekday,
        start_time, end_time, start_week, end_week, week_rule, notes,
        created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, ($1 ->> 'semesterId')::uuid,
        $1 ->> 'name', $1 ->> 'location', $1 ->> 'teacher',
        ($1 ->> 'weekday')::int, ($1 ->> 'startTime')::time,
        ($1 ->> 'endTime')::time, ($1 ->> 'startWeek')::int,
        ($1 ->> 'endWeek')::int, $1 -> 'weekRule', $1 ->> 'notes',
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,teachers}') loop
      if not private.management_json_types(
        v_item, array['name', 'department'], '{}'::text[], '{}'::text[],
        '{}'::text[], array['archivedAt']
      )
        or jsonb_typeof(v_item -> 'archivedAt') = 'string'
          and not private.management_valid_timestamp(v_item ->> 'archivedAt') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_teachers');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, name, department, archived_at, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, $1 ->> 'name',
        $1 ->> 'department', ($1 ->> 'archivedAt')::timestamptz,
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,teacherYearSummaries}') loop
      if not private.management_json_types(
        v_item, array['teacherId', 'year', 'state'], '{}'::text[],
        '{}'::text[], '{}'::text[], '{}'::text[]
      )
        or not private.management_valid_uuid(v_item ->> 'teacherId')
        or v_item ->> 'year' !~ '^[0-9]{4}$'
        or v_item ->> 'state' not in ('empty', 'reported') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_teacher_year_summaries');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, teacher_id, year, state, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, ($1 ->> 'teacherId')::uuid,
        $1 ->> 'year', $1 ->> 'state',
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,teacherRecords}') loop
      if not private.management_json_types(
        v_item, array['teacherId', 'year', 'type', 'date', 'title', 'content', 'status', 'notes'],
        '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[]
      )
        or not private.management_valid_uuid(v_item ->> 'teacherId')
        or v_item ->> 'year' !~ '^[0-9]{4}$'
        or not private.management_valid_date(v_item ->> 'date')
        or v_item ->> 'type' not in ('work', 'meeting', 'material', 'publicService')
        or v_item ->> 'status' not in ('pending', 'attended', 'absent', 'leave', 'submitted', 'completed') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_teacher_records');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, teacher_id, year, type, date, title, content, status,
        notes, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, ($1 ->> 'teacherId')::uuid,
        $1 ->> 'year', $1 ->> 'type', ($1 ->> 'date')::date,
        $1 ->> 'title', $1 ->> 'content', $1 ->> 'status',
        $1 ->> 'notes', ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,mentorships}') loop
      if not private.management_json_types(
        v_item,
        array['teacherId', 'academicYear', 'studentName', 'grade', 'major', 'topic', 'status', 'notes'],
        '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[]
      )
        or not private.management_valid_uuid(v_item ->> 'teacherId')
        or v_item ->> 'status' not in ('planned', 'active', 'completed', 'paused') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_mentorships');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, teacher_id, academic_year, student_name, grade, major,
        topic, status, notes, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, ($1 ->> 'teacherId')::uuid,
        $1 ->> 'academicYear', $1 ->> 'studentName', $1 ->> 'grade',
        $1 ->> 'major', $1 ->> 'topic', $1 ->> 'status',
        $1 ->> 'notes', ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,researchItems}') loop
      if not private.management_json_types(
        v_item, array['title', 'authors', 'source', 'urlOrDoi', 'status', 'abstract', 'notes'],
        '{}'::text[], '{}'::text[], array['tags'], array['sourceType', 'sourceId']
      )
        or jsonb_typeof(v_item -> 'year') not in ('number', 'null')
        or jsonb_typeof(v_item -> 'rating') not in ('number', 'null')
        or v_item ->> 'status' not in ('unread', 'reading', 'read')
        or (v_item ->> 'sourceType') is not null and v_item ->> 'sourceType' <> 'idea'
        or jsonb_typeof(v_item -> 'sourceId') = 'string'
          and not private.management_valid_uuid(v_item ->> 'sourceId') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      if jsonb_typeof(v_item -> 'year') = 'number' and (
        (v_item ->> 'year')::numeric <> trunc((v_item ->> 'year')::numeric)
        or (v_item ->> 'year')::numeric not between 0 and 9999
      ) then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      if jsonb_typeof(v_item -> 'rating') = 'number' and (
        (v_item ->> 'rating')::numeric <> trunc((v_item ->> 'rating')::numeric)
        or (v_item ->> 'rating')::numeric not between 1 and 5
      ) then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_research_items');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, title, authors, source, year, url_or_doi, tags, status,
        rating, abstract, notes, source_type, source_id, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, $1 ->> 'title',
        $1 ->> 'authors', $1 ->> 'source', ($1 ->> 'year')::int,
        $1 ->> 'urlOrDoi', private.management_string_array($1 -> 'tags'),
        $1 ->> 'status', ($1 ->> 'rating')::int,
        $1 ->> 'abstract', $1 ->> 'notes', $1 ->> 'sourceType',
        ($1 ->> 'sourceId')::uuid,
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,learningMethods}') loop
      if not private.management_json_types(
        v_item, array['name', 'scenario', 'steps', 'evaluation'],
        '{}'::text[], '{}'::text[], array['tags'], '{}'::text[]
      ) then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_learning_methods');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, name, scenario, steps, evaluation, tags, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, $1 ->> 'name',
        $1 ->> 'scenario', $1 ->> 'steps', $1 ->> 'evaluation',
        private.management_string_array($1 -> 'tags'),
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,ideas}') loop
      if not private.management_json_types(
        v_item, array['content'], '{}'::text[], array['pinned'],
        array['tags'], array['archivedAt']
      )
        or jsonb_typeof(v_item -> 'archivedAt') = 'string'
          and not private.management_valid_timestamp(v_item ->> 'archivedAt') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_ideas');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, content, tags, pinned, archived_at, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, $1 ->> 'content',
        private.management_string_array($1 -> 'tags'),
        ($1 ->> 'pinned')::boolean, ($1 ->> 'archivedAt')::timestamptz,
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,lessonPlans}') loop
      if not private.management_json_types(
        v_item, array['chapter', 'objectives', 'outline', 'resources', 'activities', 'status'],
        '{}'::text[], '{}'::text[], '{}'::text[],
        array['courseId', 'plannedDate', 'sourceType', 'sourceId']
      )
        or v_item ->> 'status' not in ('notStarted', 'inProgress', 'done')
        or (v_item ->> 'sourceType') is not null and v_item ->> 'sourceType' <> 'idea'
        or jsonb_typeof(v_item -> 'courseId') = 'string'
          and not private.management_valid_uuid(v_item ->> 'courseId')
        or jsonb_typeof(v_item -> 'plannedDate') = 'string'
          and not private.management_valid_date(v_item ->> 'plannedDate')
        or jsonb_typeof(v_item -> 'sourceId') = 'string'
          and not private.management_valid_uuid(v_item ->> 'sourceId') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_lesson_plans');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, course_id, chapter, objectives, outline, resources,
        activities, planned_date, status, source_type, source_id,
        created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, ($1 ->> 'courseId')::uuid,
        $1 ->> 'chapter', $1 ->> 'objectives', $1 ->> 'outline',
        $1 ->> 'resources', $1 ->> 'activities',
        ($1 ->> 'plannedDate')::date, $1 ->> 'status',
        $1 ->> 'sourceType', ($1 ->> 'sourceId')::uuid,
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,students}') loop
      if not private.management_json_types(
        v_item, array['name', 'program', 'cohort', 'contact', 'notes'],
        '{}'::text[], '{}'::text[], '{}'::text[], array['archivedAt']
      )
        or jsonb_typeof(v_item -> 'archivedAt') = 'string'
          and not private.management_valid_timestamp(v_item ->> 'archivedAt') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_students');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, name, program, cohort, contact, notes, archived_at,
        created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, $1 ->> 'name',
        $1 ->> 'program', $1 ->> 'cohort', $1 ->> 'contact',
        $1 ->> 'notes', ($1 ->> 'archivedAt')::timestamptz,
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,studentRecords}') loop
      if not private.management_json_types(
        v_item, array['studentId', 'date', 'category', 'rating', 'content', 'followUp'],
        '{}'::text[], '{}'::text[], array['tags'], '{}'::text[]
      )
        or not private.management_valid_uuid(v_item ->> 'studentId')
        or not private.management_valid_date(v_item ->> 'date')
        or v_item ->> 'category' not in ('task', 'attendance', 'research', 'service', 'other')
        or v_item ->> 'rating' not in ('positive', 'normal', 'attention') then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_student_records');
      execute 'insert into ' || v_stage_name || $stage$ (
        id, user_id, student_id, date, category, rating, content, follow_up,
        tags, created_at, updated_at
      ) values (
        ($1 ->> 'id')::uuid, $2, ($1 ->> 'studentId')::uuid,
        ($1 ->> 'date')::date, $1 ->> 'category', $1 ->> 'rating',
        $1 ->> 'content', $1 ->> 'followUp',
        private.management_string_array($1 -> 'tags'),
        ($1 ->> 'createdAt')::timestamptz,
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    for v_item in select value from jsonb_array_elements(p_backup #> '{tables,settings}') loop
      v_stage_name := pg_catalog.format('%I.%I', 'pg_temp', 'restore_v1_app_settings');
      execute 'insert into ' || v_stage_name || $stage$ (
        user_id, key, value, updated_at
      ) values (
        $2, $1 ->> 'key', $1 -> 'value',
        ($1 ->> 'updatedAt')::timestamptz
      ) $stage$ using v_item, v_user_id;
    end loop;

    foreach v_table_name in array v_id_tables loop
      v_stage_name := pg_catalog.format(
        '%I.%I', 'pg_temp', 'restore_v1_' || v_table_name
      );
      v_stage_sql := 'select exists (select id from ' || v_stage_name
        || ' group by id having count(*) > 1)';
      execute v_stage_sql into v_found;
      if v_found then
        raise exception using errcode = '22023', message = 'malformed_backup';
      end if;

      v_stage_sql := 'select exists (select 1 from ' || v_stage_name
        || ' staged join '
        || pg_catalog.format('%I.%I', 'public', v_table_name)
        || ' stored using (id) where stored.user_id <> $1)';
      execute v_stage_sql into v_found using v_user_id;
      if v_found then
        raise exception using errcode = '42501', message = 'not_allowed';
      end if;
    end loop;

    v_stage_sql := $validate$ select exists (
      select 1 from pg_temp.restore_v1_app_settings
      group by key having count(*) > 1
    )
      or exists (
        select 1 from pg_temp.restore_v1_teacher_year_summaries
        group by teacher_id, year having count(*) > 1
      )
      or (select count(*) from pg_temp.restore_v1_semesters where is_active) > 1
      or exists (
        select 1 from pg_temp.restore_v1_semesters
        where end_date < start_date
      )
      or exists (
        select 1
        from pg_temp.restore_v1_courses c
        left join pg_temp.restore_v1_semesters s on s.id = c.semester_id
        where s.id is null
          or c.end_time <= c.start_time
          or c.end_week < c.start_week
          or c.end_week > s.total_weeks
      )
      or exists (
        select 1 from pg_temp.restore_v1_todos
        where start_at is not null and end_at is not null and end_at <= start_at
      )
      or exists (
        select 1 from pg_temp.restore_v1_teacher_year_summaries child
        where not exists (
          select 1 from pg_temp.restore_v1_teachers parent where parent.id = child.teacher_id
        )
      )
      or exists (
        select 1 from pg_temp.restore_v1_teacher_records child
        where not exists (
          select 1 from pg_temp.restore_v1_teachers parent where parent.id = child.teacher_id
        )
      )
      or exists (
        select 1 from pg_temp.restore_v1_mentorships child
        where not exists (
          select 1 from pg_temp.restore_v1_teachers parent where parent.id = child.teacher_id
        )
      )
      or exists (
        select 1 from pg_temp.restore_v1_student_records child
        where not exists (
          select 1 from pg_temp.restore_v1_students parent where parent.id = child.student_id
        )
      )
      or exists (
        select 1 from pg_temp.restore_v1_lesson_plans child
        where child.course_id is not null and not exists (
          select 1 from pg_temp.restore_v1_courses parent where parent.id = child.course_id
        )
      )
      or exists (
        select 1 from pg_temp.restore_v1_todos child
        where (child.source_type is null) <> (child.source_id is null)
          or child.source_id is not null and not exists (
            select 1 from pg_temp.restore_v1_ideas parent where parent.id = child.source_id
          )
      )
      or exists (
        select 1 from pg_temp.restore_v1_research_items child
        where (child.source_type is null) <> (child.source_id is null)
          or child.source_id is not null and not exists (
            select 1 from pg_temp.restore_v1_ideas parent where parent.id = child.source_id
          )
      )
      or exists (
        select 1 from pg_temp.restore_v1_lesson_plans child
        where (child.source_type is null) <> (child.source_id is null)
          or child.source_id is not null and not exists (
            select 1 from pg_temp.restore_v1_ideas parent where parent.id = child.source_id
          )
      ) $validate$ || pg_catalog.substring(v_user_id::text, 1, 0);
    execute v_stage_sql into v_found;
    if v_found then
      raise exception using errcode = '22023', message = 'malformed_backup';
    end if;
  exception
    when sqlstate '42501' then
      raise;
    when sqlstate '22023' then
      raise;
    when others then
      raise exception using errcode = '22023', message = 'malformed_backup';
  end;

  delete from public.teacher_records where user_id = v_user_id;
  delete from public.teacher_year_summaries where user_id = v_user_id;
  delete from public.mentorships where user_id = v_user_id;
  delete from public.student_records where user_id = v_user_id;
  delete from public.lesson_plans where user_id = v_user_id;
  delete from public.courses where user_id = v_user_id;
  delete from public.semesters where user_id = v_user_id;
  delete from public.todos where user_id = v_user_id;
  delete from public.research_items where user_id = v_user_id;
  delete from public.ideas where user_id = v_user_id;
  delete from public.teachers where user_id = v_user_id;
  delete from public.students where user_id = v_user_id;
  delete from public.learning_methods where user_id = v_user_id;
  delete from public.app_settings where user_id = v_user_id;

  foreach v_table_name in array array[
    'semesters', 'teachers', 'students', 'ideas', 'learning_methods',
    'app_settings', 'courses', 'todos', 'research_items',
    'teacher_year_summaries', 'teacher_records', 'mentorships',
    'student_records', 'lesson_plans'
  ] loop
    v_stage_name := pg_catalog.format(
      '%I.%I', 'pg_temp', 'restore_v1_' || v_table_name
    );
    v_stage_sql := 'insert into '
      || pg_catalog.format('%I.%I', 'public', v_table_name)
      || ' select * from ' || v_stage_name;
    execute v_stage_sql;
  end loop;
end;
$$;

revoke all on function public.restore_backup_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_backup_v1(jsonb)
  to authenticated;
