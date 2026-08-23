do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'todos', 'semesters', 'courses', 'teachers',
    'teacher_year_summaries', 'teacher_records', 'mentorships',
    'research_items', 'learning_methods', 'ideas', 'lesson_plans',
    'students', 'student_records', 'app_settings'
  ]
  loop
    execute format(
      'alter table public.%I
         add column deleted_at timestamptz,
         add column server_updated_at timestamptz not null default now()',
      table_name
    );
    execute format(
      'create index %I on public.%I (user_id, server_updated_at)',
      table_name || '_user_server_updated_at_idx',
      table_name
    );
    execute format('alter table public.%I replica identity full', table_name);

    if not exists (
      select 1
      from pg_publication publication
      join pg_publication_rel publication_table
        on publication_table.prpubid = publication.oid
      join pg_class table_class
        on table_class.oid = publication_table.prrelid
      join pg_namespace table_namespace
        on table_namespace.oid = table_class.relnamespace
      where publication.pubname = 'supabase_realtime'
        and table_namespace.nspname = 'public'
        and table_class.relname = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;

drop trigger profiles_set_updated_at on public.profiles;

create function private.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_profile_updated_at() from public;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_profile_updated_at();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

create schema sync_private;
revoke all on schema sync_private from public;
grant usage on schema sync_private to authenticated, service_role;

create function sync_private.apply_todo_change(
  p_record jsonb,
  p_client_updated_at timestamptz,
  p_deleted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_record jsonb;
  v_identity text;
  v_row jsonb;
  v_applied boolean;
begin
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if jsonb_typeof(p_record) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'malformed_record';
  end if;
  if p_client_updated_at is null then
    raise exception using errcode = '22023', message = 'client_updated_at_required';
  end if;

  v_identity := p_record ->> 'id';
  if v_identity is null then
    raise exception using errcode = '22023', message = 'entity_identity_required';
  end if;

  v_record := (p_record - array[
    'user_id', 'updated_at', 'deleted_at', 'server_updated_at'
  ]) || jsonb_build_object(
    'user_id', v_user_id,
    'updated_at', p_client_updated_at,
    'deleted_at', p_deleted_at,
    'server_updated_at', clock_timestamp()
  );

  insert into public.todos as target (
    id, user_id, title, description, role, start_at, end_at, remind_at,
    priority, status, source_type, source_id, created_at, updated_at,
    deleted_at, server_updated_at
  )
  select (jsonb_populate_record(null::public.todos, v_record)).*
  on conflict (id) do update
  set
    title = excluded.title,
    description = excluded.description,
    role = excluded.role,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    remind_at = excluded.remind_at,
    priority = excluded.priority,
    status = excluded.status,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at
  where target.user_id = v_user_id
    and greatest(
      excluded.updated_at,
      coalesce(excluded.deleted_at, excluded.updated_at)
    ) > greatest(
      target.updated_at,
      coalesce(target.deleted_at, target.updated_at)
    )
  returning to_jsonb(target)
  into v_row;

  v_applied := v_row is not null;

  if not v_applied then
    select to_jsonb(target)
    into v_row
    from public.todos target
    where target.user_id = v_user_id
      and target.id = v_identity::uuid;
  end if;

  return jsonb_build_object('applied', v_applied, 'row', v_row);
end;
$$;

revoke all on function sync_private.apply_todo_change(
  jsonb, timestamptz, timestamptz
) from public;
grant execute on function sync_private.apply_todo_change(
  jsonb, timestamptz, timestamptz
) to authenticated, service_role;

create function public.apply_workbench_change(
  p_table text,
  p_record jsonb,
  p_client_updated_at timestamptz,
  p_deleted_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_record jsonb;
  v_columns text;
  v_assignments text;
  v_conflict_columns text;
  v_entity_identity text;
  v_row jsonb;
  v_applied boolean := false;
begin
  if p_table is null or p_table not in (
    'todos', 'semesters', 'courses', 'teachers',
    'teacher_year_summaries', 'teacher_records', 'mentorships',
    'research_items', 'learning_methods', 'ideas', 'lesson_plans',
    'students', 'student_records', 'app_settings'
  ) then
    raise exception using errcode = '22023', message = 'table_not_allowed';
  end if;
  if v_user_id is null or not public.current_user_can_access() then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if jsonb_typeof(p_record) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'malformed_record';
  end if;
  if p_client_updated_at is null then
    raise exception using errcode = '22023', message = 'client_updated_at_required';
  end if;

  if p_table = 'app_settings' then
    v_entity_identity := p_record ->> 'key';
    v_conflict_columns := 'user_id, key';
  else
    v_entity_identity := p_record ->> 'id';
    v_conflict_columns := 'id';
  end if;
  if v_entity_identity is null then
    raise exception using errcode = '22023', message = 'entity_identity_required';
  end if;

  if p_table = 'todos' then
    return sync_private.apply_todo_change(
      p_record,
      p_client_updated_at,
      p_deleted_at
    );
  end if;

  v_record := (p_record - array[
    'user_id', 'updated_at', 'deleted_at', 'server_updated_at'
  ]) || jsonb_build_object(
    'user_id', v_user_id,
    'updated_at', p_client_updated_at,
    'deleted_at', p_deleted_at,
    'server_updated_at', clock_timestamp()
  );

  select
    string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum),
    string_agg(
      format('%1$I = excluded.%1$I', attribute.attname),
      ', ' order by attribute.attnum
    ) filter (
      where attribute.attname not in (
        'id', 'user_id', 'key', 'created_at', 'server_updated_at'
      )
    )
  into v_columns, v_assignments
  from pg_attribute attribute
  where attribute.attrelid = format('public.%I', p_table)::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped;

  execute format(
    'insert into public.%1$I as target (%2$s)
     select (jsonb_populate_record(null::public.%1$I, $1)).*
     on conflict (%3$s) do update
     set %4$s
     where greatest(
       excluded.updated_at,
       coalesce(excluded.deleted_at, excluded.updated_at)
     ) > greatest(
       target.updated_at,
       coalesce(target.deleted_at, target.updated_at)
     )
     returning to_jsonb(target)',
    p_table,
    v_columns,
    v_conflict_columns,
    v_assignments
  )
  using v_record
  into v_row;

  v_applied := v_row is not null;

  if not v_applied then
    if p_table = 'app_settings' then
      execute format(
        'select to_jsonb(target)
         from public.%I target
         where target.user_id = $1 and target.key = $2',
        p_table
      )
      using v_user_id, v_entity_identity
      into v_row;
    else
      execute format(
        'select to_jsonb(target)
         from public.%I target
         where target.user_id = $1 and target.id = $2::uuid',
        p_table
      )
      using v_user_id, v_entity_identity
      into v_row;
    end if;
  end if;

  return jsonb_build_object('applied', v_applied, 'row', v_row);
end;
$$;

revoke all on function public.apply_workbench_change(
  text, jsonb, timestamptz, timestamptz
) from public;
grant execute on function public.apply_workbench_change(
  text, jsonb, timestamptz, timestamptz
) to authenticated, service_role;
