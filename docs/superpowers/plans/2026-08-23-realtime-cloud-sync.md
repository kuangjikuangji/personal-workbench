# Realtime Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every workbench business entity in Supabase while retaining an IndexedDB offline mirror, automatically synchronizing queued offline changes and Supabase Realtime events across terminals.

**Architecture:** Existing feature code continues to consume the `Repositories` interface. A synchronized repository writes the Dexie mirror and an operation queue atomically; a session-scoped sync engine pulls cloud state, flushes queued operations through a conflict-safe PostgreSQL RPC, subscribes to Realtime, and invalidates React Query after applying remote changes.

**Tech Stack:** React, TypeScript, Dexie/IndexedDB, TanStack Query, Supabase PostgreSQL/RLS/Realtime, Vitest, pgTAP, Playwright, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-23-realtime-cloud-sync-design.md`

## Global Constraints

- Supabase is the final persistent source; IndexedDB is the offline mirror and durable outbound queue.
- All 14 existing business repositories are synchronized without changing feature-facing repository method signatures.
- The current empty local database is not imported as cloud data.
- Business rows are private to `auth.uid()` through RLS and same-owner foreign keys.
- Offline create, update, and delete remain available and survive page reloads.
- Conflicts use last-modified-wins; a later deletion beats an earlier modification.
- Sign-out stops synchronization and removes the authenticated user's local business mirror and pending queue.
- Theme, notification deduplication, and PWA installation preferences remain device-local.
- Tests are written and observed failing before production implementation.

---

### Task 1: Add conflict-safe cloud schema and Realtime publication

**Files:**
- Create: `supabase/migrations/202608230002_realtime_business_sync.sql`
- Create: `supabase/tests/database/07_realtime_business_sync.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: the 14 business tables created by `202608150001_auth_and_workbench_schema.sql`.
- Produces: `public.apply_workbench_change(p_table text, p_record jsonb, p_client_updated_at timestamptz, p_deleted_at timestamptz)` and cloud rows with `deleted_at` plus `server_updated_at`.

- [ ] **Step 1: Write failing pgTAP coverage for columns, RLS, publication, and conflict order**

Create tests that assert every table in this exact list has `deleted_at` and `server_updated_at`: `todos`, `semesters`, `courses`, `teachers`, `teacher_year_summaries`, `teacher_records`, `mentorships`, `research_items`, `learning_methods`, `ideas`, `lesson_plans`, `students`, `student_records`, `app_settings`. Insert a row as user A, prove user B cannot read or mutate it, apply a newer update and an older update through the RPC, and assert the newer value remains. Apply an older deletion followed by a newer update and assert the row is active; apply a newer deletion and assert `deleted_at` is set.

- [ ] **Step 2: Run the database test and verify the intended failure**

Run: `supabase test db supabase/tests/database/07_realtime_business_sync.test.sql`

Expected: FAIL because `deleted_at`, `server_updated_at`, and `apply_workbench_change` do not exist.

- [ ] **Step 3: Implement the migration**

Add nullable `deleted_at`, non-null `server_updated_at default now()`, and `(user_id, server_updated_at)` indexes. Set `replica identity full` and add all 14 tables to `supabase_realtime`. Implement the RPC as `security invoker`, reject table names outside the fixed allowlist, force `user_id := auth.uid()`, and update only when the incoming `updated_at` or `deleted_at` is newer than the stored winning timestamp. Return `{applied, row}` so retries are idempotent. Update the existing timestamp trigger to set only `server_updated_at`, preserving the client-supplied `updated_at` used for conflict comparison.

- [ ] **Step 4: Regenerate checked-in Supabase types and rerun database tests**

Run: `supabase gen types typescript --local > /tmp/workbench-database.types.ts` and replace `src/lib/supabase/database.types.ts` with the generated output using `apply_patch`.

Run: `supabase test db`

Expected: every pgTAP test passes, including cross-user denial and conflict ordering.

- [ ] **Step 5: Commit the schema slice**

Run: `git add supabase/migrations/202608230002_realtime_business_sync.sql supabase/tests/database/07_realtime_business_sync.test.sql src/lib/supabase/database.types.ts && git commit -m "feat: add conflict-safe realtime business schema"`

---

### Task 2: Define entity mapping and local sync metadata

**Files:**
- Create: `src/sync/entityRegistry.ts`
- Create: `src/sync/entityRegistry.test.ts`
- Create: `src/sync/types.ts`
- Modify: `src/db/database.ts`
- Test: `src/test/database.ts`

**Interfaces:**
- Produces: `EntityKind`, `SyncOperation`, `SyncMetadata`, `entityRegistry`, `serializeEntity(kind, value)`, and `deserializeEntity(kind, row)`.
- Produces Dexie tables `syncOperations` keyed by operation ID and `syncMetadata` keyed by `key`.

- [ ] **Step 1: Write failing registry round-trip tests**

For every entity kind, assert camelCase fields round-trip to the expected snake_case table row and back. Include JSON `weekRule`, arrays, nullable timestamps, `app_settings.key`, and a deletion tombstone.

Example assertion:

```ts
expect(serializeEntity('courses', course)).toMatchObject({
  semester_id: course.semesterId,
  week_rule: course.weekRule,
  updated_at: course.updatedAt,
});
expect(deserializeEntity('courses', serializeEntity('courses', course))).toEqual(course);
```

- [ ] **Step 2: Run the registry test and verify it fails because the module is missing**

Run: `npm run test:run -- src/sync/entityRegistry.test.ts`

Expected: FAIL resolving `./entityRegistry`.

- [ ] **Step 3: Implement focused sync types, registry, and Dexie version 2**

Define:

```ts
type SyncOperationType = 'upsert' | 'delete';
interface SyncOperation {
  id: string; userId: string; entityKind: EntityKind; entityId: string;
  type: SyncOperationType; record: Record<string, unknown> | null;
  clientUpdatedAt: string; retryCount: number; lastError: string | null; createdAt: string;
}
interface SyncMetadata { key: string; value: unknown; updatedAt: string }
```

Add Dexie version 2 stores without removing version 1 definitions. Index `syncOperations` by `id, userId, [userId+entityKind+entityId], createdAt` and `syncMetadata` by `key`.

- [ ] **Step 4: Run focused and existing database tests**

Run: `npm run test:run -- src/sync/entityRegistry.test.ts src/db/localRepositories.test.ts src/db/backup.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the local schema slice**

Run: `git add src/sync src/db/database.ts src/test/database.ts && git commit -m "feat: define local synchronization metadata"`

---

### Task 3: Make repository writes atomic and queue-aware

**Files:**
- Create: `src/db/syncedRepositories.ts`
- Create: `src/db/syncedRepositories.test.ts`
- Create: `src/sync/operationQueue.ts`
- Create: `src/sync/operationQueue.test.ts`
- Modify: `src/db/localRepositories.ts`

**Interfaces:**
- Consumes: `Repositories`, `SyncOperation`, and `entityRegistry` from Tasks 1–2.
- Produces: `createSyncedRepositories(db, userId): Repositories`, `compactOperations(operations)`, and `clearUserMirror(db, userId)`.

- [ ] **Step 1: Write failing queue-compaction tests**

Assert two updates become one upsert with the last snapshot, create then update becomes one upsert, unsynced create then delete cancels, and a delete of an existing record produces one tombstone operation.

- [ ] **Step 2: Run the queue test and verify it fails**

Run: `npm run test:run -- src/sync/operationQueue.test.ts`

Expected: FAIL resolving `./operationQueue`.

- [ ] **Step 3: Implement pure operation compaction and pass its tests**

Run: `npm run test:run -- src/sync/operationQueue.test.ts`

Expected: PASS for all four transitions.

- [ ] **Step 4: Write failing synchronized repository tests**

Use `fake-indexeddb` to prove `create`, `put`, `patch`, settings `put`, and `delete` update the mirror and queue within one Dexie transaction. Force the queue insert to reject and assert the mirror write rolls back. Assert list/get signatures remain identical to `Repositories`.

- [ ] **Step 5: Run the repository test and verify the missing implementation failure**

Run: `npm run test:run -- src/db/syncedRepositories.test.ts`

Expected: FAIL resolving `./syncedRepositories`.

- [ ] **Step 6: Implement synchronized repositories and user cleanup**

Reuse audit-field creation from `localRepositories.ts` through an exported helper rather than duplicating timestamps. Each mutation must call `db.transaction('rw', [entityTable, db.syncOperations], ...)`. `clearUserMirror` clears all business tables, this user's queue rows, and mirror-owner metadata in one transaction.

- [ ] **Step 7: Run repository regression tests and commit**

Run: `npm run test:run -- src/db/syncedRepositories.test.ts src/db/localRepositories.test.ts src/domain`

Expected: PASS.

Run: `git add src/db src/sync/operationQueue.ts src/sync/operationQueue.test.ts && git commit -m "feat: queue offline repository mutations"`

---

### Task 4: Implement the Supabase sync gateway

**Files:**
- Create: `src/sync/cloudGateway.ts`
- Create: `src/sync/cloudGateway.test.ts`

**Interfaces:**
- Consumes: authenticated `SupabaseClient<Database>`, `EntityKind`, `SyncOperation`, and entity serializers.
- Produces: `createCloudGateway(client, userId)` with `pullAll()`, `apply(operation)`, and `subscribe(onChange, onStatus)`.

- [ ] **Step 1: Write failing gateway contract tests**

Use a narrow fake Supabase client to assert `pullAll` requests every registered table for the current user, `apply` calls `apply_workbench_change` with serialized payload and timestamps, and `subscribe` registers one postgres-changes channel filtered by `user_id=eq.<userId>` for every table. Assert unsubscribe removes the channel.

- [ ] **Step 2: Run and verify the missing module failure**

Run: `npm run test:run -- src/sync/cloudGateway.test.ts`

Expected: FAIL resolving `./cloudGateway`.

- [ ] **Step 3: Implement the gateway with stable error classification**

Return normalized changes shaped as `{ entityKind, entityId, value, deletedAt, clientUpdatedAt }`. Classify errors as `network`, `auth`, `permission`, or `validation`; never include tokens or row contents in user-visible errors.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/sync/cloudGateway.test.ts src/lib/supabase/config.test.ts`

Expected: PASS.

Run: `git add src/sync/cloudGateway.ts src/sync/cloudGateway.test.ts && git commit -m "feat: add Supabase synchronization gateway"`

---

### Task 5: Build the session-scoped sync engine

**Files:**
- Create: `src/sync/syncEngine.ts`
- Create: `src/sync/syncEngine.test.ts`
- Create: `src/sync/syncStore.ts`
- Create: `src/sync/syncStore.test.ts`

**Interfaces:**
- Consumes: `WorkbenchDatabase`, `CloudGateway`, registry merge helpers, and the authenticated user ID.
- Produces: `createSyncEngine({ db, gateway, userId, now, online })` with `start()`, `retry()`, and `stop()`; Zustand state `status`, `pendingCount`, `message`.

- [ ] **Step 1: Write failing state-machine tests**

Cover start ordering (`subscribe` before `pullAll`), remote merge into Dexie, queue flush success, network failure retaining the queue, retry after `online`, last-modified-wins, deletion tombstones, duplicate-event idempotence, stop/unsubscribe, and mirror reset when `mirrorOwner` differs from the authenticated user.

- [ ] **Step 2: Run and verify the missing implementation failure**

Run: `npm run test:run -- src/sync/syncEngine.test.ts src/sync/syncStore.test.ts`

Expected: FAIL resolving sync engine/store modules.

- [ ] **Step 3: Implement deterministic merge and state transitions**

Use one `applyRemoteChange(db, change)` function for pull results and Realtime events. Compare `max(updatedAt, deletedAt)` before replacing a local record. Flush operations sequentially by `createdAt`; delete an operation only after cloud acknowledgement. Register `online`, `focus`, and channel reconnect triggers, with bounded exponential retry delays of 1, 2, 4, 8, and 16 seconds.

- [ ] **Step 4: Run engine tests with fake timers**

Run: `npm run test:run -- src/sync/syncEngine.test.ts src/sync/syncStore.test.ts`

Expected: PASS without pending timer warnings.

- [ ] **Step 5: Commit the engine**

Run: `git add src/sync/syncEngine.ts src/sync/syncEngine.test.ts src/sync/syncStore.ts src/sync/syncStore.test.ts && git commit -m "feat: synchronize offline changes in background"`

---

### Task 6: Bind repositories and synchronization to authenticated sessions

**Files:**
- Create: `src/sync/SyncProvider.tsx`
- Create: `src/sync/SyncProvider.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/providers.tsx`
- Modify: `src/features/auth/AuthProvider.tsx`
- Modify: `src/lib/supabase/client.ts`

**Interfaces:**
- Consumes: authenticated `AuthIdentity`, singleton Supabase client, `createSyncedRepositories`, and `createSyncEngine`.
- Produces: `SyncProvider`, `useSyncStatus()`, and authenticated repositories supplied to `AppProviders`.

- [ ] **Step 1: Write failing lifecycle tests**

Assert no engine exists for anonymous or forced-password-change states; authenticated state creates exactly one user-scoped repository/engine; rerender does not recreate the Supabase client; sign-out awaits `engine.stop()` and local cleanup before exposing the anonymous screen.

- [ ] **Step 2: Run and verify the missing provider failure**

Run: `npm run test:run -- src/sync/SyncProvider.test.tsx src/app/App.test.tsx`

Expected: FAIL resolving `./SyncProvider`.

- [ ] **Step 3: Implement authenticated composition**

Expose a single configured Supabase client from `client.ts`. Nest `SyncProvider` inside `AuthGate`, pass synchronized repositories into `AppProviders`, and add an auth sign-out cleanup hook instead of allowing `AuthProvider` to know Dexie internals. Render a cloud-loading state until initial pull completes; offline startup may proceed from an existing same-user mirror.

- [ ] **Step 4: Run auth, provider, and app tests**

Run: `npm run test:run -- src/features/auth src/sync/SyncProvider.test.tsx src/app/providers.test.tsx src/app/App.test.tsx`

Expected: PASS, including existing login and forced-password-change behavior.

- [ ] **Step 5: Commit session integration**

Run: `git add src/app src/features/auth/AuthProvider.tsx src/lib/supabase/client.ts src/sync/SyncProvider.tsx src/sync/SyncProvider.test.tsx && git commit -m "feat: bind cloud sync to authenticated sessions"`

---

### Task 7: Display actionable synchronization status

**Files:**
- Create: `src/sync/SyncStatus.tsx`
- Create: `src/sync/SyncStatus.test.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `useSyncStatus()` and `retry()` from Task 6.
- Produces accessible labels: `已同步`, `正在同步`, `离线，N 项待同步`, and `同步失败` with a `重试` button.

- [ ] **Step 1: Write failing UI tests for all sync states**

Render `SyncStatus` with each store state, assert the exact Chinese label, `role="status"` for normal states, `role="alert"` for errors, and retry invocation on button click.

- [ ] **Step 2: Run and verify the missing component failure**

Run: `npm run test:run -- src/sync/SyncStatus.test.tsx`

Expected: FAIL resolving `./SyncStatus`.

- [ ] **Step 3: Implement desktop and mobile status placement**

Place the compact indicator beside the account summary and in the mobile “我的” drawer. Add responsive styling that does not obscure navigation or the PWA update banner.

- [ ] **Step 4: Run UI and shell regression tests**

Run: `npm run test:run -- src/sync/SyncStatus.test.tsx src/app/AppShell.test.tsx src/styles.dark.test.ts`

Expected: PASS in light/dark state tests.

- [ ] **Step 5: Commit the status UI**

Run: `git add src/sync/SyncStatus.tsx src/sync/SyncStatus.test.tsx src/app/AppShell.tsx src/app/router.tsx src/styles.css && git commit -m "feat: show cloud synchronization status"`

---

### Task 8: Verify two-terminal, offline, deployment, and documentation flows

**Files:**
- Create: `e2e/realtime-sync.spec.ts`
- Modify: `e2e/helpers.ts`
- Modify: `README.md`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: the complete authenticated cloud-sync application.
- Produces: automated evidence for cross-terminal Realtime, offline queue recovery, cleanup, and production deployment.

- [ ] **Step 1: Write the failing two-context Playwright test**

Create two isolated browser contexts signed into the same disposable test account. Verify terminal A creates a todo and terminal B observes it without reload; terminal A goes offline, edits the todo, reloads and still sees the edit; after reconnect terminal B observes the edit; terminal A deletes it and terminal B removes it. Sign out and inspect IndexedDB to assert business tables and queue are empty.

- [ ] **Step 2: Run the E2E test against the pre-feature app and verify failure**

Run: `npx playwright test e2e/realtime-sync.spec.ts --project=chromium`

Expected: FAIL because terminal B does not receive terminal A's local IndexedDB data.

- [ ] **Step 3: Add safe CI test-account configuration and operational documentation**

Read test credentials only from `E2E_SYNC_USERNAME` and `E2E_SYNC_PASSWORD`; skip the remote E2E test with a clear message when absent. Document cloud ownership, offline semantics, conflict rule, synchronization labels, Supabase deployment commands, and recovery steps. Do not print credentials or secrets in logs.

- [ ] **Step 4: Run the complete local verification suite**

Run: `npm run typecheck && npm run test:run && npm run build`

Run with test-account secrets present: `npx playwright test e2e/realtime-sync.spec.ts --project=chromium`

Expected: typecheck, all Vitest tests, production build, and two-terminal E2E pass. Only the known Vite large-chunk advisory may remain.

- [ ] **Step 5: Push and verify Supabase deployment**

Run: `supabase db push --dry-run`, review the single new migration, then run `supabase db push` and `supabase config push`.

Run the remote RLS/conflict smoke test using two disposable users and sanitized output. Confirm every business table appears in `supabase_realtime` and no service-role token enters `dist` using `rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY" dist src`.

- [ ] **Step 6: Commit documentation and E2E coverage**

Run: `git add e2e README.md .github/workflows/deploy-pages.yml && git commit -m "test: verify realtime offline synchronization"`

- [ ] **Step 7: Complete release verification and GitHub deployment**

Run `git diff --check`, `git status --short`, the complete unit/build/E2E suite again, then push the feature branch and create a PR. After approval, merge to `master`, wait for the GitHub Pages workflow, and verify `https://kuangjikuangji.github.io/personal-workbench/` returns HTTP 200 and passes a production two-terminal smoke test.

