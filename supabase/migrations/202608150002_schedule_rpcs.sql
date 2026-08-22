create function private.parse_schedule_timestamp(p_value jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
  v_result timestamptz;
begin
  if jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) is distinct from 'string' then
    raise exception using errcode = '22023', message = 'malformed_timestamp';
  end if;

  v_text := p_value #>> '{}';
  if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?([zZ]|[+-][0-9]{2}(:?[0-9]{2})?)?$' then
    raise exception using errcode = '22023', message = 'malformed_timestamp';
  end if;

  v_result := case
    when v_text ~* '([zZ]|[+-][0-9]{2}(:?[0-9]{2})?)$' then v_text::timestamptz
    else v_text::timestamp at time zone 'Asia/Shanghai'
  end;
  if not pg_catalog.isfinite(v_result) then
    raise exception using errcode = '22023', message = 'malformed_timestamp';
  end if;
  return v_result;
exception
  when sqlstate '22023' then
    raise;
  when others then
    raise exception using errcode = '22023', message = 'malformed_timestamp';
end;
$$;

revoke all on function private.parse_schedule_timestamp(jsonb) from public;

create function private.lock_authenticated_schedule_writer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if current_user <> 'authenticated' then
    return null;
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150002)
  );
  return null;
end;
$$;

revoke all on function private.lock_authenticated_schedule_writer() from public;

create trigger courses_schedule_writer_lock
before insert or update or delete on public.courses
for each statement execute function private.lock_authenticated_schedule_writer();

create trigger semesters_schedule_writer_lock
before insert or update or delete on public.semesters
for each statement execute function private.lock_authenticated_schedule_writer();

revoke insert, update on public.todos from authenticated;

create function public.save_todo_with_conflict_check(
  p_todo jsonb,
  p_allow_conflicts boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_candidate public.todos;
  v_conflicts jsonb := '[]'::jsonb;
  v_saved public.todos;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_allow_conflicts is null then
    raise exception using errcode = '22023', message = 'allow_conflicts_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150002)
  );

  begin
    if jsonb_typeof(p_todo) is distinct from 'object'
      or p_todo ? 'user_id'
      or p_todo ? 'userId'
      or not p_todo ?& array[
        'title', 'description', 'role', 'start_at', 'end_at',
        'remind_at', 'priority', 'status'
      ]
      or jsonb_typeof(p_todo -> 'title') is distinct from 'string'
      or jsonb_typeof(p_todo -> 'description') is distinct from 'string'
      or jsonb_typeof(p_todo -> 'role') is distinct from 'string'
      or jsonb_typeof(p_todo -> 'priority') is distinct from 'string'
      or jsonb_typeof(p_todo -> 'status') is distinct from 'string'
      or jsonb_typeof(p_todo -> 'start_at') not in ('string', 'null')
      or jsonb_typeof(p_todo -> 'end_at') not in ('string', 'null')
      or jsonb_typeof(p_todo -> 'remind_at') not in ('string', 'null')
      or (
        p_todo ? 'id'
        and jsonb_typeof(p_todo -> 'id') not in ('string', 'null')
      )
      or (
        p_todo ? 'source_type'
        and jsonb_typeof(p_todo -> 'source_type') not in ('string', 'null')
      )
      or (
        p_todo ? 'source_id'
        and jsonb_typeof(p_todo -> 'source_id') not in ('string', 'null')
      ) then
      raise exception using errcode = '22023', message = 'malformed_todo';
    end if;

    v_candidate.id := case
      when jsonb_typeof(p_todo -> 'id') = 'string' then (p_todo ->> 'id')::uuid
      else null
    end;
    v_candidate.title := p_todo ->> 'title';
    v_candidate.description := p_todo ->> 'description';
    v_candidate.role := p_todo ->> 'role';
    v_candidate.priority := p_todo ->> 'priority';
    v_candidate.status := p_todo ->> 'status';
    v_candidate.source_type := case
      when jsonb_typeof(p_todo -> 'source_type') = 'string' then p_todo ->> 'source_type'
      else null
    end;
    v_candidate.source_id := case
      when jsonb_typeof(p_todo -> 'source_id') = 'string' then (p_todo ->> 'source_id')::uuid
      else null
    end;

    if btrim(v_candidate.title) = ''
      or v_candidate.role not in ('dean', 'head', 'personal')
      or v_candidate.priority not in ('low', 'normal', 'high')
      or v_candidate.status not in ('open', 'done')
      or v_candidate.source_type is not null and v_candidate.source_type <> 'idea' then
      raise exception using errcode = '22023', message = 'malformed_todo';
    end if;

    v_candidate.start_at := private.parse_schedule_timestamp(p_todo -> 'start_at');
    v_candidate.end_at := private.parse_schedule_timestamp(p_todo -> 'end_at');
    v_candidate.remind_at := private.parse_schedule_timestamp(p_todo -> 'remind_at');

    if v_candidate.start_at is not null
      and v_candidate.end_at is not null
      and v_candidate.end_at <= v_candidate.start_at then
      raise exception using errcode = '22023', message = 'end_must_follow_start';
    end if;
  exception
    when sqlstate '22023' then
      raise;
    when others then
      raise exception using errcode = '22023', message = 'malformed_todo';
  end;

  if v_candidate.start_at is not null then
    with todo_conflicts as (
      select
        t.start_at as sort_start,
        jsonb_build_object(
          'id', t.id::text,
          'sourceId', t.id::text,
          'kind', 'todo',
          'title', t.title,
          'start', to_char(
            t.start_at at time zone 'Asia/Shanghai',
            'YYYY-MM-DD"T"HH24:MI:SS'
          ),
          'end', to_char(
            coalesce(t.end_at, t.start_at + interval '30 minutes')
              at time zone 'Asia/Shanghai',
            'YYYY-MM-DD"T"HH24:MI:SS'
          )
        ) as conflict
      from public.todos t
      where t.user_id = v_user_id
        and t.status = 'open'
        and (v_candidate.id is null or t.id <> v_candidate.id)
        and t.start_at is not null
        and t.start_at < coalesce(
          v_candidate.end_at,
          v_candidate.start_at + interval '30 minutes'
        )
        and v_candidate.start_at < coalesce(
          t.end_at,
          t.start_at + interval '30 minutes'
        )
    ),
    course_occurrences as (
      select
        c.id,
        c.name,
        occurrence.lesson_date,
        occurrence.lesson_date + c.start_time as local_start,
        occurrence.lesson_date + c.end_time as local_end
      from public.courses c
      join public.semesters s
        on s.user_id = c.user_id
       and s.id = c.semester_id
       and s.is_active
      cross join lateral generate_series(c.start_week, c.end_week) teaching_week(week_number)
      cross join lateral (
        select (
          date_trunc('week', s.start_date::timestamp)::date
          + ((teaching_week.week_number - 1) * 7 + c.weekday - 1)
        )::date as lesson_date
      ) occurrence
      where c.user_id = v_user_id
        and occurrence.lesson_date between s.start_date and s.end_date
        and case c.week_rule ->> 'kind'
          when 'every' then true
          when 'odd' then teaching_week.week_number % 2 = 1
          when 'even' then teaching_week.week_number % 2 = 0
          when 'explicit' then exists (
            select 1
            from jsonb_array_elements_text(c.week_rule -> 'weeks') explicit_week(value)
            where explicit_week.value::int = teaching_week.week_number
          )
          else false
        end
    ),
    course_conflicts as (
      select
        occurrence.local_start at time zone 'Asia/Shanghai' as sort_start,
        jsonb_build_object(
          'id', occurrence.id::text || '@' || occurrence.lesson_date::text,
          'sourceId', occurrence.id::text,
          'kind', 'course',
          'title', occurrence.name,
          'start', to_char(occurrence.local_start, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'end', to_char(occurrence.local_end, 'YYYY-MM-DD"T"HH24:MI:SS')
        ) as conflict
      from course_occurrences occurrence
      where occurrence.local_start at time zone 'Asia/Shanghai' < coalesce(
          v_candidate.end_at,
          v_candidate.start_at + interval '30 minutes'
        )
        and v_candidate.start_at < occurrence.local_end at time zone 'Asia/Shanghai'
    ),
    all_conflicts as (
      select sort_start, conflict from todo_conflicts
      union all
      select sort_start, conflict from course_conflicts
    )
    select coalesce(
      jsonb_agg(
        conflict
        order by sort_start, conflict ->> 'kind', conflict ->> 'id'
      ),
      '[]'::jsonb
    )
    into v_conflicts
    from all_conflicts;
  end if;

  if jsonb_array_length(v_conflicts) > 0 and not p_allow_conflicts then
    return jsonb_build_object('todo', null, 'conflicts', v_conflicts);
  end if;

  if v_candidate.id is not null and exists (
    select 1
    from public.todos t
    where t.user_id = v_user_id and t.id = v_candidate.id
  ) then
    update public.todos
    set title = v_candidate.title,
        description = v_candidate.description,
        role = v_candidate.role,
        start_at = v_candidate.start_at,
        end_at = v_candidate.end_at,
        remind_at = v_candidate.remind_at,
        priority = v_candidate.priority,
        status = v_candidate.status,
        source_type = v_candidate.source_type,
        source_id = v_candidate.source_id
    where user_id = v_user_id and id = v_candidate.id
    returning * into v_saved;
  else
    begin
      insert into public.todos (
        id, user_id, title, description, role, start_at, end_at,
        remind_at, priority, status, source_type, source_id
      )
      values (
        coalesce(v_candidate.id, extensions.gen_random_uuid()),
        v_user_id,
        v_candidate.title,
        v_candidate.description,
        v_candidate.role,
        v_candidate.start_at,
        v_candidate.end_at,
        v_candidate.remind_at,
        v_candidate.priority,
        v_candidate.status,
        v_candidate.source_type,
        v_candidate.source_id
      )
      returning * into v_saved;
    exception
      when unique_violation then
        raise exception using errcode = '42501', message = 'not_allowed';
    end;
  end if;

  return jsonb_build_object('todo', to_jsonb(v_saved), 'conflicts', v_conflicts);
end;
$$;

revoke all on function public.save_todo_with_conflict_check(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.save_todo_with_conflict_check(jsonb, boolean)
  to authenticated;

create function public.import_wechat_todos(p_todos jsonb)
returns setof public.todos
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_result jsonb;
  v_saved public.todos;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if jsonb_typeof(p_todos) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'malformed_todo_batch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150002)
  );

  for v_item in select value from jsonb_array_elements(p_todos)
  loop
    v_result := public.save_todo_with_conflict_check(v_item, true);
    select t.*
    into strict v_saved
    from public.todos t
    where t.user_id = v_user_id
      and t.id = (v_result #>> '{todo,id}')::uuid;
    return next v_saved;
  end loop;
  return;
end;
$$;

revoke all on function public.import_wechat_todos(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_wechat_todos(jsonb)
  to authenticated;

create function public.set_active_semester(p_semester_id uuid)
returns public.semesters
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_semester public.semesters;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150002)
  );
  select s.*
  into v_semester
  from public.semesters s
  where s.user_id = v_user_id and s.id = p_semester_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  update public.semesters
  set is_active = false
  where user_id = v_user_id
    and id <> p_semester_id
    and is_active;

  update public.semesters
  set is_active = true
  where user_id = v_user_id and id = p_semester_id
  returning * into v_semester;

  return v_semester;
end;
$$;

revoke all on function public.set_active_semester(uuid)
  from public, anon, authenticated;
grant execute on function public.set_active_semester(uuid)
  to authenticated;

create function public.delete_semester(p_semester_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 202608150002)
  );
  perform 1
  from public.semesters s
  where s.user_id = v_user_id and s.id = p_semester_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;

  perform 1
  from public.courses c
  where c.user_id = v_user_id and c.semester_id = p_semester_id
  for update;

  update public.lesson_plans lp
  set course_id = null
  where lp.user_id = v_user_id
    and exists (
      select 1
      from public.courses c
      where c.user_id = v_user_id
        and c.semester_id = p_semester_id
        and c.id = lp.course_id
    );

  delete from public.courses
  where user_id = v_user_id and semester_id = p_semester_id;
  delete from public.semesters
  where user_id = v_user_id and id = p_semester_id;
end;
$$;

revoke all on function public.delete_semester(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_semester(uuid)
  to authenticated;
