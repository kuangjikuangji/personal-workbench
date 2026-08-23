# Supabase Auth and Cross-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the workbench with Supabase username/password authentication, present the owner-provided campus photo on the login screen, move all business data to user-isolated Postgres tables with realtime cross-device refresh, and show a respectful PWA installation prompt after login.

**Architecture:** Supabase Auth owns credentials and sessions; a `profiles` table owns username, role, active state, and first-login state. Postgres RLS isolates every business row by `auth.uid()`, SQL RPCs replace the local multi-write transactions, and a Supabase repository adapter preserves the existing TypeScript entity API. React gates the application by auth state, subscribes to profile and table changes, blocks cloud writes while offline, and keeps the existing local repository only for tests and explicit dependency injection.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase JS, Supabase Auth/Postgres/Realtime/Edge Functions, PostgreSQL RLS and RPC, Vitest, pgTAP, Playwright, Vite PWA, GitHub Actions

## Global Constraints

- Initial account is `zhoujingjing`; its owner-provided initial password is supplied only through `INITIAL_ADMIN_PASSWORD`; first login must force a password change.
- The login screen uses the owner-provided campus photo as a bundled responsive background with a readable overlay on desktop and mobile.
- Public signup is disabled. Only an active, fully initialized administrator can create, reset, activate, or deactivate accounts.
- Passwords are owned by Supabase Auth. No plaintext or password hash is stored in application tables.
- The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` never enters Git, Vite, GitHub Pages, logs, or screenshots.
- Every account can read and write only its own business data. Administrators cannot inspect another account's workbench data.
- Existing IndexedDB data is not migrated. Supabase begins empty for each account.
- Supabase is the production source of truth. Offline business writes are rejected and never queued.
- All multi-record or validate-then-write operations execute as PostgreSQL RPC transactions.
- Realtime events invalidate TanStack Query caches; clients re-fetch authoritative data rather than merging payloads directly.
- The install banner appears only after authentication, is hidden in standalone mode, and has a seven-day dismissal cooldown.
- Existing GitHub Pages base path is `/personal-workbench/`; hash routing remains required.
- All user-facing copy defaults to Chinese.

---

## File and responsibility map

- `src/lib/supabase/config.ts`: validate browser configuration without exposing secrets.
- `src/lib/supabase/client.ts`: create the singleton typed Supabase client.
- `src/lib/supabase/database.types.ts`: generated database types from the local schema.
- `src/features/auth/*`: auth state machine, login, forced password change, route gate, and auth errors.
- `src/db/supabaseRepositories.ts`: single-table CRUD adapter and row mapping.
- `src/db/workbenchCommands.ts`: explicit atomic command interface shared by local tests and cloud RPCs.
- `src/db/supabaseCommands.ts`: RPC-backed command implementation.
- `src/app/realtime.ts`: profile and business-table subscriptions mapped to query keys.
- `src/app/connectivity.tsx`: online/offline state and write guard.
- `src/features/accounts/*`: administrator account-management UI and Edge Function client.
- `src/features/settings/InstallBanner.tsx`: authenticated install prompt and cooldown.
- `supabase/migrations/*`: schema, RLS, functions, grants, and realtime publication.
- `supabase/functions/admin-users/*`: server-only account management.
- `scripts/seed-admin.mjs`: idempotent service-role bootstrap for `zhoujingjing`, with the password read from the operator environment.
- `public/login-background.jpg`: optimized local login background derived from the owner-provided campus photo.
- `supabase/tests/database/*`: pgTAP isolation and RPC rollback tests.
- `e2e/auth-sync.spec.ts`: login, forced change, account isolation, and two-context sync.

---

### Task 1: Supabase toolchain and fail-closed browser configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `src/lib/supabase/config.ts`
- Create: `src/lib/supabase/config.test.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/database.types.ts`
- Create: `supabase/config.toml`

**Interfaces:**
- Produces: `readSupabaseConfig(env): { ok: true; value: SupabaseConfig } | { ok: false; message: string }`.
- Produces: `createWorkbenchSupabaseClient(config): SupabaseClient<Database>`.
- `SupabaseConfig` is `{ url: string; anonKey: string }`.

- [ ] **Step 1: Add a failing configuration test**

```ts
import { expect, test } from 'vitest';
import { readSupabaseConfig } from './config';

test('fails closed when Supabase browser configuration is absent', () => {
  expect(readSupabaseConfig({})).toEqual({ ok: false, message: '系统尚未配置。' });
});

test('accepts an HTTPS project URL and anon key', () => {
  expect(readSupabaseConfig({
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
  })).toEqual({ ok: true, value: { url: 'https://project.supabase.co', anonKey: 'public-anon-key' } });
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test:run -- src/lib/supabase/config.test.ts`

Expected: FAIL because `./config` does not exist.

- [ ] **Step 3: Install the browser client and implement strict configuration**

Run: `npm install @supabase/supabase-js`

Implement `readSupabaseConfig` with `z.object({ VITE_SUPABASE_URL: z.url(), VITE_SUPABASE_ANON_KEY: z.string().min(1) })`. Return the fixed Chinese message for every invalid configuration and never echo values.

Create `client.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { SupabaseConfig } from './config';

export function createWorkbenchSupabaseClient(config: SupabaseConfig) {
  return createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}
```

Use a minimal compile-safe `Database` interface until Task 2 generates the complete type. Add `.env.local`, `.env.*.local`, `.supabase/`, and `supabase/.temp/` to `.gitignore`; `.env.example` contains only variable names.

- [ ] **Step 4: Initialize local Supabase without starting containers**

Run: `npx supabase init`

Set in `supabase/config.toml`:

```toml
[auth]
enable_signup = false
minimum_password_length = 8
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test:run -- src/lib/supabase/config.test.ts
npm run typecheck
git diff --check
```

Commit:

```bash
git add package.json package-lock.json .gitignore .env.example src/lib/supabase supabase/config.toml
git commit -m "feat: add fail-closed Supabase configuration"
```

---

### Task 2: Postgres schema, ownership constraints, and RLS

**Files:**
- Create: `supabase/migrations/202608150001_auth_and_workbench_schema.sql`
- Create: `supabase/tests/database/01_rls.test.sql`
- Replace: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces database helper `public.current_user_can_access() returns boolean`.
- Produces RPC `public.complete_password_change() returns public.profiles`.
- Produces `Database` generated by `npx supabase gen types typescript --local`.

- [ ] **Step 1: Write failing pgTAP ownership tests**

Create two confirmed Auth users and profiles, set JWT claims with `set_config('request.jwt.claim.sub', user_uuid::text, true)`, switch to `authenticated`, and assert:

```sql
select throws_ok(
  $$ insert into public.todos (user_id, title, description, role, priority, status)
     values ('00000000-0000-4000-8000-000000000002', 'cross-user', '', 'personal', 'normal', 'open') $$,
  '42501'
);
select is((select count(*) from public.todos where user_id = '00000000-0000-4000-8000-000000000002'), 0::bigint);
```

Use `00000000-0000-4000-8000-000000000001` for user A and `00000000-0000-4000-8000-000000000002` for user B throughout the fixture. Add equivalent read/update/delete assertions, plus active and `must_change_password` cases.

- [ ] **Step 2: Run RED against a fresh local database**

Run:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

Expected: FAIL because `profiles`, business tables, and policies do not exist.

- [ ] **Step 3: Implement exact tables and constraints**

Enable `citext`, `pgcrypto`, and `pgtap`. Create `profiles` as specified in the design. Create the 14 business tables using this exact type map:

| Table | Domain columns beyond `id uuid`, `user_id uuid`, `created_at`, `updated_at` |
| --- | --- |
| `todos` | `title text`, `description text`, `role text`, `start_at timestamptz`, `end_at timestamptz`, `remind_at timestamptz`, `priority text`, `status text`, `source_type text`, `source_id uuid` |
| `semesters` | `name text`, `start_date date`, `end_date date`, `total_weeks int`, `is_active boolean` |
| `courses` | `semester_id uuid`, `name text`, `location text`, `teacher text`, `weekday int`, `start_time time`, `end_time time`, `start_week int`, `end_week int`, `week_rule jsonb`, `notes text` |
| `teachers` | `name text`, `department text`, `archived_at timestamptz` |
| `teacher_year_summaries` | `teacher_id uuid`, `year text`, `state text` |
| `teacher_records` | `teacher_id uuid`, `year text`, `type text`, `date date`, `title text`, `content text`, `status text`, `notes text` |
| `mentorships` | `teacher_id uuid`, `academic_year text`, `student_name text`, `grade text`, `major text`, `topic text`, `status text`, `notes text` |
| `research_items` | `title text`, `authors text`, `source text`, `year int`, `url_or_doi text`, `tags text[]`, `status text`, `rating int`, `abstract text`, `notes text`, `source_type text`, `source_id uuid` |
| `learning_methods` | `name text`, `scenario text`, `steps text`, `evaluation text`, `tags text[]` |
| `ideas` | `content text`, `tags text[]`, `pinned boolean`, `archived_at timestamptz` |
| `lesson_plans` | `course_id uuid`, `chapter text`, `objectives text`, `outline text`, `resources text`, `activities text`, `planned_date date`, `status text`, `source_type text`, `source_id uuid` |
| `students` | `name text`, `program text`, `cohort text`, `contact text`, `notes text`, `archived_at timestamptz` |
| `student_records` | `student_id uuid`, `date date`, `category text`, `rating text`, `content text`, `follow_up text`, `tags text[]` |
| `app_settings` | no `id`; primary key `(user_id, key text)` plus `value jsonb`, `updated_at timestamptz` |

Copy every enum/range/date invariant from `src/db/backup.ts` into `check` constraints. Add `unique(user_id, id)` to parent tables and composite foreign keys for semester, teacher, student, course, and idea references. Add partial unique indexes for one active semester per user and one teacher-year summary per `(user_id, teacher_id, year)`.

- [ ] **Step 4: Implement fail-closed RLS and profile RPC**

Use:

```sql
create function public.current_user_can_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and not p.must_change_password
  );
$$;
```

For every business table, create SELECT/INSERT/UPDATE/DELETE policies requiring `current_user_can_access()` and `user_id = auth.uid()` in both `using` and `with check`. Profiles allow a user to select only their own row; profile mutation occurs only through RPC/Edge Function. Revoke public function execution, then grant only required calls to `authenticated`.

- [ ] **Step 5: Verify schema and generate types**

Run:

```bash
npx supabase db reset
npx supabase test db
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
npm run typecheck
```

Expected: all pgTAP assertions pass and generated types compile.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests/database src/lib/supabase/database.types.ts
git commit -m "feat: add user-isolated Supabase schema"
```

---

### Task 3: Atomic schedule, semester, and import RPCs

**Files:**
- Create: `supabase/migrations/202608150002_schedule_rpcs.sql`
- Create: `supabase/tests/database/02_schedule_rpcs.test.sql`

**Interfaces:**
- Produces: `save_todo_with_conflict_check(p_todo jsonb, p_allow_conflicts boolean) returns jsonb`.
- Produces: `import_wechat_todos(p_todos jsonb) returns setof public.todos`.
- Produces: `set_active_semester(p_semester_id uuid) returns public.semesters`.
- Produces: `delete_semester(p_semester_id uuid) returns void`.

- [ ] **Step 1: Write failing transaction tests**

Cover: course/todo overlap returns conflicts with zero writes; `allow_conflicts=true` writes once; malformed batch imports write zero rows; switching active semester leaves exactly one active; deleting another user's semester raises `42501` and changes nothing.

- [ ] **Step 2: Run RED**

Run: `npx supabase db reset && npx supabase test db`

Expected: new tests fail with missing functions.

- [ ] **Step 3: Implement RPCs with JWT-derived ownership**

Each function starts with:

```sql
v_user_id uuid := auth.uid();
if v_user_id is null or not public.current_user_can_access() then
  raise exception using errcode = '42501', message = 'not_allowed';
end if;
```

Never accept `user_id` as a parameter. Parse JSON fields explicitly, validate end-after-start, and constrain all reads/writes by `v_user_id`. Return conflict rows before insert when override is false. Use one SQL function invocation per batch so exceptions roll back all rows.

- [ ] **Step 4: Verify and commit**

Run: `npx supabase db reset && npx supabase test db`

Commit:

```bash
git add supabase/migrations/202608150002_schedule_rpcs.sql supabase/tests/database/02_schedule_rpcs.test.sql
git commit -m "feat: add atomic schedule RPCs"
```

---

### Task 4: Atomic management, conversion, and backup RPCs

**Files:**
- Create: `supabase/migrations/202608150003_management_rpcs.sql`
- Create: `supabase/tests/database/03_management_rpcs.test.sql`

**Interfaces:**
- Produces: `fill_missing_teacher_summaries(p_year text)`.
- Produces: `add_teacher_record(p_record jsonb)` and `batch_teacher_records(p_teacher_ids uuid[], p_record jsonb)`.
- Produces: `add_student_record(p_record jsonb)`.
- Produces: `convert_idea(p_idea_id uuid, p_target text)`.
- Produces: `restore_backup_v1(p_backup jsonb)`.

- [ ] **Step 1: Write failing rollback and ownership tests**

Assert the following concrete cases: archived teacher causes batch records and summaries both to remain unchanged; foreign teacher/student/idea IDs raise `42501`; fill-missing is idempotent and active-only; repeated idea conversion returns the existing target; invalid backup reference leaves all current rows untouched; valid restore replaces only caller-owned rows and preserves another user's rows.

- [ ] **Step 2: Run RED**

Run: `npx supabase db reset && npx supabase test db`

Expected: missing-function failures.

- [ ] **Step 3: Implement functions and grants**

Reuse the fail-closed ownership preamble from Task 3. Validate backup `schemaVersion = 1`, table arrays, IDs, references, enum values, one active semester, and all user ownership before the first delete. Delete and reinsert in foreign-key-safe order inside the function transaction. Grant execution only to `authenticated` and revoke from `anon`/`public`.

- [ ] **Step 4: Verify and commit**

Run: `npx supabase db reset && npx supabase test db`

Commit:

```bash
git add supabase/migrations/202608150003_management_rpcs.sql supabase/tests/database/03_management_rpcs.test.sql
git commit -m "feat: add atomic management RPCs"
```

---

### Task 5: Server-only account administration and initial admin seed

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/admin-users/index.ts`
- Create: `supabase/functions/admin-users/policy.ts`
- Create: `supabase/functions/admin-users/policy.test.ts`
- Create: `scripts/seed-admin.mjs`
- Create: `scripts/seed-admin.test.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Edge Function accepts `{ action: 'list' | 'create' | 'activate' | 'deactivate' | 'resetPassword', ... }`.
- Produces `assertAdminActor(profile, action, target)` pure policy helper.
- Seed command: `npm run supabase:seed-admin`.

- [ ] **Step 1: Write failing administrator-policy tests**

```ts
Deno.test('member cannot administer accounts', () => {
  assertThrows(() => assertAdminActor(
    { id: 'member', role: 'member', is_active: true, must_change_password: false },
    'create', null,
  ), Error, 'admin_required');
});

Deno.test('current account and final active admin cannot be deactivated', () => {
  const actor = { id: 'admin', role: 'admin', is_active: true, must_change_password: false } as const;
  assertThrows(
    () => assertAdminActor(actor, 'deactivate', { id: 'other-admin', role: 'admin', activeAdminCount: 1 }),
    Error,
    'last_admin',
  );
});
```

- [ ] **Step 2: Run RED**

Run: `deno test supabase/functions/admin-users/policy.test.ts`

Expected: FAIL because policy implementation is absent. If `deno` is unavailable, install it through the documented Supabase local-development prerequisite before continuing; do not skip the test.

- [ ] **Step 3: Implement the Edge Function**

Validate the bearer JWT with the anon client, load the actor profile, apply `assertAdminActor`, then create a second client with `SUPABASE_SERVICE_ROLE_KEY`. Normalize usernames with `^[a-z0-9][a-z0-9._-]{2,31}$`, map to `${username}@users.workbench.invalid`, require temporary passwords of at least 8 characters, set `email_confirm: true`, and upsert the profile. Deactivate/reset actions set `must_change_password` correctly and never return Auth email or password.

CORS permits only `http://localhost:5173`, `http://127.0.0.1:5173`, and `https://kuangjikuangji.github.io`; authorization remains JWT-based.

- [ ] **Step 4: Write RED seed configuration tests**

Test that the seed rejects a missing `INITIAL_ADMIN_PASSWORD`, rejects passwords shorter than eight characters, maps `zhoujingjing` to `zhoujingjing@users.workbench.invalid`, and never returns or prints the password.

Run: `node --test scripts/seed-admin.test.mjs`

Expected: FAIL until the seed exposes a testable configuration parser.

- [ ] **Step 5: Implement idempotent `zhoujingjing` seed**

Use `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`, require `INITIAL_ADMIN_PASSWORD`, search for internal email `zhoujingjing@users.workbench.invalid`, create it with the supplied password only when absent, and upsert profile `{ username: 'zhoujingjing', role: 'admin', is_active: true, must_change_password: true }`. Never print the service key or password.

- [ ] **Step 6: Verify and commit**

Run:

```bash
deno test supabase/functions/admin-users/policy.test.ts
node --test scripts/seed-admin.test.mjs
npm run typecheck
if rg -n "SUPABASE_SERVICE_ROLE_KEY|INITIAL_ADMIN_PASSWORD" dist src; then exit 1; fi
```

Only the server function, seed script, docs, and tests may mention these strings; `src` and `dist` must contain neither.

Commit:

```bash
git add supabase/functions scripts/seed-admin.mjs package.json README.md
git commit -m "feat: add secure account administration"
```

---

### Task 6: Auth state machine, login, forced password change, and route gate

**Files:**
- Create: `src/features/auth/authTypes.ts`
- Create: `src/features/auth/authService.ts`
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/AuthGate.tsx`
- Create: `src/features/auth/LoginPage.tsx`
- Create: `src/features/auth/ChangePasswordPage.tsx`
- Create: `src/features/auth/AuthGate.test.tsx`
- Create: `src/features/auth/LoginPage.test.tsx`
- Create: `public/login-background.jpg`
- Modify: `src/app/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `AuthState = { status: 'loading' } | { status: 'anonymous'; error?: AuthMessage } | { status: 'mustChange'; session: Session; profile: Profile } | { status: 'authenticated'; session: Session; profile: Profile } | { status: 'misconfigured'; message: string }`.
- `usernameToInternalEmail(username): string`.
- `AuthContext` exposes `signIn`, `completePasswordChange`, `signOut`, and `refreshProfile`.

- [ ] **Step 1: Write RED component tests**

Test exact visible states: loading text; anonymous login only; bad credentials message; inactive profile signs out; must-change page has no main navigation even at `#/todos`; authenticated state renders a child; missing config shows `系统尚未配置。`. The anonymous login container must expose a background style containing `login-background.jpg`, and the photo must not render after authentication.

Test normalization:

```ts
expect(usernameToInternalEmail('  ZhouJingJing ')).toBe('zhoujingjing@users.workbench.invalid');
```

- [ ] **Step 2: Run RED**

Run: `npm run test:run -- src/features/auth`

Expected: missing components and service failures.

- [ ] **Step 3: Implement auth service and state transitions**

Use `getSession()` at startup and `onAuthStateChange` afterward. Fetch only the current profile. On inactive/missing profile, call `signOut()` and set a stable Chinese message. Forced password change re-authenticates with current password, calls `updateUser({ password: newPassword })`, invokes `complete_password_change`, then refreshes the profile. Preserve the partial-failure message described in the design.

- [ ] **Step 4: Add and style the supplied campus background**

Create the web asset from `/Users/zhoujingjing/Desktop/学校文件/学校照片/4.jpg`:

```bash
sips -Z 2400 -s format jpeg -s formatOptions 82 "/Users/zhoujingjing/Desktop/学校文件/学校照片/4.jpg" --out public/login-background.jpg
```

Set the login page background from `${import.meta.env.BASE_URL}login-background.jpg`. Use `background-position: center`, `background-size: cover`, a dark blue gradient overlay, and a high-contrast translucent card. At widths below 640px, keep at least 20px viewport padding and make the card full-width without horizontal overflow. Preserve visible focus rings and respect `prefers-reduced-motion`.

- [ ] **Step 5: Gate the application before repositories initialize**

`App` becomes:

```tsx
export function App() {
  return (
    <AuthProvider>
      <AuthGate>{(identity) => <CloudWorkbench identity={identity} />}</AuthGate>
    </AuthProvider>
  );
}
```

Keep injectable auth/client props for tests. `CloudWorkbench` is introduced in Task 9; temporarily render the existing `AppProviders` only in authenticated state.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run test:run -- src/features/auth src/app
npm run typecheck
```

Commit:

```bash
git add src/features/auth src/app/App.tsx src/styles.css public/login-background.jpg
git commit -m "feat: gate workbench behind Supabase auth"
```

---

### Task 7: Supabase CRUD repositories and exact entity mapping

**Files:**
- Create: `src/db/supabaseRowMapping.ts`
- Create: `src/db/supabaseRowMapping.test.ts`
- Create: `src/db/supabaseRepositories.ts`
- Create: `src/db/supabaseRepositories.test.ts`
- Modify: `src/db/repositories.ts`

**Interfaces:**
- `toDomain(table, row)` converts top-level snake_case database fields to the existing entity.
- `toInsert(table, input)` converts camelCase inputs and excludes `id`, audit fields, and arbitrary `user_id`.
- `createSupabaseRepositories(client): Repositories`.
- Removes `Repositories.transaction` only after Task 8 removes every production caller.

- [ ] **Step 1: Write RED mapping and repository contract tests**

Use a fake Supabase query builder that records table, filters, and payload. For each of the 14 repositories, assert list applies `.order('updated_at', { ascending: false })`, get applies `.eq('id', id).maybeSingle()`, create never sends `user_id`, patch preserves `id/createdAt`, delete filters ID, and errors throw a normalized `WorkbenchDataError`.

Round-trip representative complex fields:

```ts
expect(toDomain('courses', {
  id: courseId, user_id: userId, semester_id: semesterId,
  start_time: '09:00:00', week_rule: { kind: 'explicit', weeks: [1, 3] },
  created_at: timestamp, updated_at: timestamp,
  name: '统计学', location: '', teacher: '', weekday: 1,
  end_time: '10:30:00', start_week: 1, end_week: 4, notes: '',
})).toMatchObject({ semesterId, startTime: '09:00', weekRule: { kind: 'explicit', weeks: [1, 3] } });
```

- [ ] **Step 2: Run RED**

Run: `npm run test:run -- src/db/supabaseRowMapping.test.ts src/db/supabaseRepositories.test.ts`

- [ ] **Step 3: Implement mapping and CRUD**

Use an explicit `tableDefinitions` map rather than unconstrained recursive key conversion. Validate returned rows with the same Zod entity schemas extracted from `src/db/backup.ts` into `src/domain/entitySchemas.ts`; update backup validation to import them. Convert SQL `time` values to `HH:mm` and dates to `YYYY-MM-DD` without timezone reinterpretation.

- [ ] **Step 4: Run repository and backup regression tests**

Run:

```bash
npm run test:run -- src/db src/domain/entitySchemas.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/db src/domain/entitySchemas.ts src/domain/entitySchemas.test.ts
git commit -m "feat: add Supabase repositories"
```

---

### Task 8: Explicit atomic command layer and removal of browser transactions

**Files:**
- Create: `src/db/workbenchCommands.ts`
- Create: `src/db/localWorkbenchCommands.ts`
- Create: `src/db/supabaseCommands.ts`
- Create: `src/db/supabaseCommands.test.ts`
- Modify: `src/app/providers.tsx`
- Modify: `src/db/repositories.ts`
- Modify: `src/domain/teacherOperations.ts`
- Modify: `src/domain/studentOperations.ts`
- Modify: `src/features/todos/todoQueries.ts`
- Modify: `src/features/todos/WeChatImportDialog.tsx`
- Modify: `src/features/courses/courseQueries.ts`
- Modify: `src/features/ideas/ideaConversions.ts`
- Modify: `src/db/backup.ts`
- Modify: corresponding tests for every changed operation

**Interfaces:**
- `WorkbenchServices = { repositories: Repositories; commands: WorkbenchCommands }`.
- `WorkbenchCommands` has one typed method for each RPC from Tasks 3-4.
- `useWorkbenchCommands()` reads the new context.

- [ ] **Step 1: Write RED command-adapter tests**

Assert exact RPC names, payload keys, domain row mapping, conflict-result mapping, and normalized errors. Add a source scan test that fails while any production file outside `localRepositories.ts` contains `repositories.transaction(`.

- [ ] **Step 2: Run RED**

Run: `npm run test:run -- src/db/supabaseCommands.test.ts src/domain src/features/todos src/features/courses src/features/ideas src/features/settings`

- [ ] **Step 3: Implement cloud and local commands**

Cloud methods call the exact SQL RPC names. Local commands preserve current Dexie transaction behavior so isolated component/unit tests remain deterministic. Provider injection accepts complete `WorkbenchServices`; production constructs Supabase implementations only after authentication.

- [ ] **Step 4: Refactor every transaction caller**

Replace all ten production call sites found by:

```bash
rg -n "\.transaction\(" src --glob '!**/*.test.*' --glob '!src/db/localRepositories.ts'
```

The command must produce no output. Remove `transaction` from `Repositories` after the last caller moves. Preserve conflict dialogs, confirmation flows, cache invalidation, rollback expectations, and Chinese errors.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test:run -- src/db src/domain src/features/todos src/features/courses src/features/ideas src/features/settings
npm run typecheck
```

Commit:

```bash
git add src/db src/app/providers.tsx src/domain src/features/todos src/features/courses src/features/ideas src/features/settings
git commit -m "refactor: use explicit cloud transactions"
```

---

### Task 9: Authenticated cloud app, realtime refresh, and offline write guard

**Files:**
- Create: `src/app/CloudWorkbench.tsx`
- Create: `src/app/connectivity.tsx`
- Create: `src/app/connectivity.test.tsx`
- Create: `src/app/realtime.ts`
- Create: `src/app/realtime.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/providers.tsx`
- Modify: `src/shared/ui/Button.tsx`
- Modify: all create/edit/delete forms and mutation entry buttons under `src/features/`
- Modify: `src/styles.css`

**Interfaces:**
- `CloudWorkbench({ identity })` builds Supabase repositories/commands and QueryClient scope for that user.
- `ConnectivityContext` exposes `{ online: boolean; assertOnline(): void }`.
- `subscribeToWorkbench(client, userId, queryClient): () => void`.

- [ ] **Step 1: Write RED realtime and connectivity tests**

Assert one profile plus 14 table subscriptions, table-to-query-key invalidation, full invalidation after `SUBSCRIBED` following an error, cleanup on user change/logout, offline banner visibility, and `assertOnline()` throwing `当前离线，连接网络后可继续。`.

- [ ] **Step 2: Run RED**

Run: `npm run test:run -- src/app/realtime.test.ts src/app/connectivity.test.tsx`

- [ ] **Step 3: Implement scoped services and subscriptions**

Construct services with the authenticated client and reset QueryClient on user ID changes/logout. Subscribe with channel names containing the user ID; apply `filter: user_id=eq.${userId}` for business tables and `id=eq.${userId}` for profile. Profile deactivation signs out; `must_change_password` returns to the forced-change gate.

- [ ] **Step 4: Block all business mutations while offline**

Call `assertOnline()` in Supabase repository and command write methods. Pass `offline` to create/edit/delete/batch/restore controls and preserve form state after rejected writes. Navigation, viewing cached React state, theme controls, logout, and install instructions remain usable.

Audit with:

```bash
rg -n "mutate\(|\.create\(|\.patch\(|\.delete\(|restoreBackup" src/features --glob '!**/*.test.*'
```

For every result, the enclosing action must either be disabled by connectivity state or call a guarded cloud method while preserving input on failure.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test:run -- src/app src/features
npm run typecheck
```

Commit:

```bash
git add src/app src/features src/shared/ui/Button.tsx src/styles.css
git commit -m "feat: add realtime cloud workbench state"
```

---

### Task 10: Administrator account-management UI

**Files:**
- Create: `src/features/accounts/accountClient.ts`
- Create: `src/features/accounts/AccountManagement.tsx`
- Create: `src/features/accounts/AccountManagement.test.tsx`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/features/settings/SettingsPage.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `AccountAdminClient` exposes `list`, `create`, `activate`, `deactivate`, and `resetPassword` using `supabase.functions.invoke('admin-users')`.
- UI consumes current `Profile`; member role never calls list.

- [ ] **Step 1: Write RED role and interaction tests**

Cover: account section absent for member; admin sees rows; create validates username and 8-character temporary password; current user deactivate button absent; deactivate/reset require confirmation; server error keeps dialog input; success refreshes list; final-admin error maps to `不能停用最后一个有效管理员。`.

- [ ] **Step 2: Run RED**

Run: `npm run test:run -- src/features/accounts src/features/settings`

- [ ] **Step 3: Implement account client and UI**

Do not render Auth emails, user UUIDs, service errors, or returned temporary passwords. Use existing `Dialog`, `ConfirmDialog`, `DataTable`, and `Button`. All sensitive mutations require an explicit confirmation step.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:run -- src/features/accounts src/features/settings
npm run typecheck
```

Commit:

```bash
git add src/features/accounts src/features/settings src/styles.css
git commit -m "feat: add administrator account management"
```

---

### Task 11: Identity controls and seven-day PWA install banner

**Files:**
- Create: `src/features/settings/InstallBanner.tsx`
- Create: `src/features/settings/InstallBanner.test.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/AppShell.test.tsx`
- Modify: `src/features/settings/InstallPanel.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `INSTALL_DISMISS_KEY = 'workbench-install-dismissed-at'`.
- `shouldShowInstallBanner({ now, dismissedAt, canInstall, standalone, authenticated }): boolean`.

- [ ] **Step 1: Write RED install and identity tests**

Assert: login page never shows banner; authenticated installable browser does; dismiss hides for exactly seven days; day eight shows again; standalone hides; install clears prompt; iOS guidance remains in settings; shell shows username/role/logout; mobile “我的” drawer reaches logout and account management for admin.

- [ ] **Step 2: Run RED**

Run: `npm run test:run -- src/features/settings/InstallBanner.test.tsx src/app/AppShell.test.tsx`

- [ ] **Step 3: Implement banner and shell identity controls**

Use existing `useInstallPrompt`. Detect standalone with `matchMedia('(display-mode: standalone)').matches || navigator.standalone === true` behind a typed helper. Store only dismissal timestamp in localStorage; it is application-level and never sent to Supabase.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:run -- src/features/settings src/app
npm run typecheck
```

Commit:

```bash
git add src/features/settings src/app/AppShell.tsx src/app/AppShell.test.tsx src/styles.css
git commit -m "feat: add authenticated install prompt"
```

---

### Task 12: Full integration, CI, live Supabase deployment, and acceptance

**Files:**
- Create: `e2e/auth-sync.spec.ts`
- Create: `e2e/supabase-global-setup.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- E2E setup creates disposable users through a local service-role environment and deletes them after the run.
- GitHub workflow consumes repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Write RED production E2E**

Cover these exact journeys on desktop and Pixel 7:

1. The seeded `zhoujingjing` account is forced to change its owner-supplied initial password and cannot reach `#/todos` first.
2. The unauthenticated desktop and Pixel 7 login pages load `login-background.jpg`, keep the form within the viewport, and expose readable labels and focus states.
3. Admin creates a member, resets it, activates/deactivates it, and the member loses business access.
4. Two browser contexts signed into the same account: context A creates `跨端同步待办`; context B receives and displays it without reload.
5. A second account cannot see that todo and cannot fetch it through Supabase REST.
6. Offline mode shows the banner, disables create/edit/delete, and online restoration refreshes data.
7. Install prompt banner respects dismissal cooldown.
8. Existing business E2E is updated to authenticate before each journey and still passes.

Run: `npm run test:e2e`

Expected: FAIL until local Supabase services, seed, auth fixtures, and cloud app are all connected.

- [ ] **Step 2: Add CI and local E2E environment wiring**

For pull-request CI, start local Supabase, reset migrations, seed disposable accounts, run pgTAP, unit/type/build/E2E, then stop Supabase. In Pages deploy, pass:

```yaml
env:
  VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
```

Add a build scan that fails if `SUPABASE_SERVICE_ROLE_KEY`, the real service key value, `INITIAL_ADMIN_PASSWORD`, or the operator-supplied initial password appears in `dist`.

- [ ] **Step 3: Run the complete local gate**

```bash
npx supabase start
npx supabase db reset
npm run supabase:seed-admin
npx supabase test db
TZ=UTC npm run test:run
npm run typecheck
npm run build
npm run test:e2e
git diff --check
npx supabase stop
```

Expected: zero failures; E2E has only explicitly documented device-specific skips.

- [ ] **Step 4: Commit the verified Task 12 artifacts**

```bash
git add e2e playwright.config.ts .github/workflows/deploy-pages.yml README.md .env.example
git commit -m "test: verify authenticated cross-device workbench"
```

- [ ] **Step 5: Stop for live-project authorization if no project is linked**

Run:

```bash
npx supabase projects list
npx supabase status
```

If no intended hosted project is already linked, ask the user to choose or create the project before any billable project creation, migration push, Edge Function deployment, secret mutation, or production seed. Do not infer an organization, region, billing tier, or project target.

- [ ] **Step 6: Deploy to the explicitly selected Supabase project**

After authorization, obtain the confirmed values interactively and export them only in the operator shell; never place them in repository files or command history. Supabase supplies `SUPABASE_SERVICE_ROLE_KEY` automatically to deployed Edge Functions, so do not attempt to set that reserved secret manually.

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push
npx supabase config push
npx supabase functions deploy admin-users
SUPABASE_URL="$SUPABASE_PROJECT_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" INITIAL_ADMIN_PASSWORD="$INITIAL_ADMIN_PASSWORD" npm run supabase:seed-admin
```

`SUPABASE_PROJECT_REF`, `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `INITIAL_ADMIN_PASSWORD` are operator-supplied environment variables from the confirmed project. Configure GitHub Actions Variables for URL and anon key through `gh variable set`, not repository files. Never configure the initial password as a GitHub Pages build variable.

- [ ] **Step 7: Push a draft PR and verify hosted CI**

Run full verification immediately before push, then push `agent/supabase-auth-sync`, open a draft PR to `master`, and wait for every check. Address only verified failures; never paste service-role values into PR text or logs.

- [ ] **Step 8: Merge and verify production acceptance**

After CI approval, merge the PR and wait for Pages deployment. Verify:

- login and forced password change;
- desktop-to-phone realtime todo;
- different-account isolation;
- deactivation blocks active-session business access;
- install banner and installed standalone launch;
- homepage, manifest, service worker, Auth, REST, Realtime, and Edge Function endpoints return expected statuses;
- local `master` matches `origin/master` and is clean.
