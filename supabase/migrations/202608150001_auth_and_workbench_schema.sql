create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext not null unique,
  role text not null check (role in ('admin', 'member')),
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.todos (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  role text not null check (role in ('dean', 'head', 'personal')),
  start_at timestamptz,
  end_at timestamptz,
  remind_at timestamptz,
  priority text not null check (priority in ('low', 'normal', 'high')),
  status text not null check (status in ('open', 'done')),
  source_type text check (source_type is null or source_type = 'idea'),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todos_time_order check (start_at is null or end_at is null or end_at > start_at)
);

create table public.semesters (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  total_weeks int not null check (total_weeks between 1 and 60),
  is_active boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint semesters_date_order check (end_date >= start_date),
  constraint semesters_user_id_id_key unique (user_id, id)
);

create function private.valid_week_rule(rule jsonb, first_week int, last_week int)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind text;
  week_value jsonb;
  week_number numeric;
begin
  if jsonb_typeof(rule) is distinct from 'object' then
    return false;
  end if;

  kind := rule ->> 'kind';
  if kind in ('every', 'odd', 'even') then
    return true;
  end if;
  if kind is distinct from 'explicit'
    or jsonb_typeof(rule -> 'weeks') is distinct from 'array' then
    return false;
  end if;

  for week_value in select value from jsonb_array_elements(rule -> 'weeks')
  loop
    if jsonb_typeof(week_value) <> 'number' then
      return false;
    end if;
    week_number := (week_value #>> '{}')::numeric;
    if week_number <> trunc(week_number)
      or week_number < 1
      or week_number < first_week
      or week_number > last_week then
      return false;
    end if;
  end loop;
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.valid_week_rule(jsonb, int, int) from public;
grant execute on function private.valid_week_rule(jsonb, int, int)
  to authenticated, service_role;

create table public.courses (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null,
  name text not null,
  location text not null,
  teacher text not null,
  weekday int not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  start_week int not null check (start_week >= 1),
  end_week int not null check (end_week >= 1),
  week_rule jsonb not null,
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_time_order check (end_time > start_time),
  constraint courses_week_order check (end_week >= start_week),
  constraint courses_week_rule_valid check (private.valid_week_rule(week_rule, start_week, end_week)),
  constraint courses_user_id_id_key unique (user_id, id),
  constraint courses_semester_fk foreign key (user_id, semester_id)
    references public.semesters(user_id, id)
);

create table public.teachers (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  department text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teachers_user_id_id_key unique (user_id, id)
);

create table public.teacher_year_summaries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  teacher_id uuid not null,
  year text not null check (year ~ '^[0-9]{4}$'),
  state text not null check (state in ('empty', 'reported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_year_summaries_teacher_fk foreign key (user_id, teacher_id)
    references public.teachers(user_id, id)
);

create table public.teacher_records (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  teacher_id uuid not null,
  year text not null check (year ~ '^[0-9]{4}$'),
  type text not null check (type in ('work', 'meeting', 'material', 'publicService')),
  date date not null,
  title text not null,
  content text not null,
  status text not null check (status in ('pending', 'attended', 'absent', 'leave', 'submitted', 'completed')),
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_records_teacher_fk foreign key (user_id, teacher_id)
    references public.teachers(user_id, id)
);

create table public.mentorships (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  teacher_id uuid not null,
  academic_year text not null,
  student_name text not null,
  grade text not null,
  major text not null,
  topic text not null,
  status text not null check (status in ('planned', 'active', 'completed', 'paused')),
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentorships_teacher_fk foreign key (user_id, teacher_id)
    references public.teachers(user_id, id)
);

create table public.research_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  authors text not null,
  source text not null,
  year int check (year is null or year between 0 and 9999),
  url_or_doi text not null,
  tags text[] not null,
  status text not null check (status in ('unread', 'reading', 'read')),
  rating int check (rating is null or rating between 1 and 5),
  abstract text not null,
  notes text not null,
  source_type text check (source_type is null or source_type = 'idea'),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_methods (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  scenario text not null,
  steps text not null,
  evaluation text not null,
  tags text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ideas (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null,
  tags text[] not null,
  pinned boolean not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_user_id_id_key unique (user_id, id)
);

alter table public.todos
  add constraint todos_source_idea_fk foreign key (user_id, source_id)
  references public.ideas(user_id, id);

alter table public.research_items
  add constraint research_items_source_idea_fk foreign key (user_id, source_id)
  references public.ideas(user_id, id);

create table public.lesson_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid,
  chapter text not null,
  objectives text not null,
  outline text not null,
  resources text not null,
  activities text not null,
  planned_date date,
  status text not null check (status in ('notStarted', 'inProgress', 'done')),
  source_type text check (source_type is null or source_type = 'idea'),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_plans_course_fk foreign key (user_id, course_id)
    references public.courses(user_id, id),
  constraint lesson_plans_source_idea_fk foreign key (user_id, source_id)
    references public.ideas(user_id, id)
);

create table public.students (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  program text not null,
  cohort text not null,
  contact text not null,
  notes text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_user_id_id_key unique (user_id, id)
);

create table public.student_records (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null,
  date date not null,
  category text not null check (category in ('task', 'attendance', 'research', 'service', 'other')),
  rating text not null check (rating in ('positive', 'normal', 'attention')),
  content text not null,
  follow_up text not null,
  tags text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_records_student_fk foreign key (user_id, student_id)
    references public.students(user_id, id)
);

create table public.app_settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create unique index semesters_one_active_per_user
  on public.semesters (user_id)
  where is_active;

create unique index teacher_year_summaries_user_teacher_year_key
  on public.teacher_year_summaries (user_id, teacher_id, year);

create function private.enforce_course_semester_weeks()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  semester_weeks int;
begin
  select s.total_weeks
  into semester_weeks
  from public.semesters s
  where s.user_id = new.user_id and s.id = new.semester_id
  for update;

  if found and new.end_week > semester_weeks then
    raise exception 'course weeks exceed semester total weeks' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_course_semester_weeks() from public;

create trigger courses_semester_weeks_check
before insert or update of user_id, semester_id, end_week on public.courses
for each row execute function private.enforce_course_semester_weeks();

create function private.prevent_semester_week_truncation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.courses c
    where c.user_id = new.user_id
      and c.semester_id = new.id
      and c.end_week > new.total_weeks
  ) then
    raise exception 'semester total weeks exclude an existing course' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_semester_week_truncation() from public;

create trigger semesters_total_weeks_check
before update of total_weeks on public.semesters
for each row execute function private.prevent_semester_week_truncation();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'todos', 'semesters', 'courses', 'teachers',
    'teacher_year_summaries', 'teacher_records', 'mentorships',
    'research_items', 'learning_methods', 'ideas', 'lesson_plans',
    'students', 'student_records', 'app_settings'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

create function public.current_user_can_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and not p.must_change_password
  );
$$;

revoke all on function public.current_user_can_access() from public;
grant execute on function public.current_user_can_access() to authenticated;

alter table public.profiles enable row level security;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

revoke all privileges on table public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

do $$
declare
  table_name text;
  access_expression constant text :=
    'public.current_user_can_access() and user_id = (select auth.uid())';
begin
  foreach table_name in array array[
    'todos', 'semesters', 'courses', 'teachers',
    'teacher_year_summaries', 'teacher_records', 'mentorships',
    'research_items', 'learning_methods', 'ideas', 'lesson_plans',
    'students', 'student_records', 'app_settings'
  ]
  loop
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      table_name || '_select_own', table_name, access_expression
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      table_name || '_insert_own', table_name, access_expression
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      table_name || '_update_own', table_name, access_expression, access_expression
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      table_name || '_delete_own', table_name, access_expression
    );
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      table_name
    );
  end loop;
end;
$$;
