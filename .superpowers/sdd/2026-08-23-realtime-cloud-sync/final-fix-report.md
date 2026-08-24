# Realtime Cloud Sync Final Fix Report

Date: 2026-08-24

Starting commit: `29af707`

Scope: final whole-branch review findings 1-10

## Outcome

All ten final-review findings are implemented and covered by focused regression tests. The full application test suite, full local pgTAP suite, TypeScript typecheck, and production build pass.

## Implemented fixes

1. **Identity-only tombstones:** `apply_workbench_change` now uses allowlisted, owner-scoped tombstone `UPDATE` paths for delete payloads containing only `id`/`key`. Todos retain their dedicated security-definer helper. Both paths perform LWW comparison and return the authoritative row.
2. **Session-bound writes:** the RPC requires `p_expected_user_id` and rejects an `auth.uid()` mismatch. The gateway rejects operations owned by another user before transport, passes the expected user to the RPC, and classifies a server `expected_user_mismatch` as an authentication failure.
3. **Write lease:** synchronized repositories share a user-scoped revocable lease. Sync cleanup revokes it synchronously before engine stop/mirror cleanup, auth transitions render neutral noninteractive UI immediately, and every mutation rechecks the lease across async/transaction boundaries.
4. **Query refresh:** accepted pull changes are notified once per catch-up batch, acknowledgements once per queue flush batch, and Realtime once per accepted change. The application invalidates React Query once per notification set. Duplicate/stale rejected merges do not loop.
5. **Deterministic pagination:** every table is ordered by `id` (or setting `key`) and fetched page-by-page until a short page. The full-sync marker is written only after `pullAll` has exhausted every page and queued writes have flushed.
6. **Monotonic mutation time:** create/put/patch/delete/settings mutations use one repository mutation clock that advances beyond the wall clock, current mirror value, queued versions, and the prior issued value. SQL conflict comparison uses `>=`, so equal client timestamps resolve by last server arrival.
7. **Synchronized restore:** restore writes fresh synchronized records and queues them in dependency-safe order (ideas, semesters, teachers, students, then dependants). Clear/tombstone order is reversed for dependencies. Round-trip and queue-order coverage use synchronized repositories.
8. **Typed failure lifecycle:** only typed network failures automatically back off. Auth failures pause the engine and signal the auth controller once. Permission/validation failures retain and annotate all compacted source operations without automatic loops and remain manually retryable. Online profile transport failures hide protected UI without deleting the cache, mirror, or queue.
9. **Early observers and bounded readiness:** online/focus listeners and the queue observer start before Realtime readiness. Offline approved mirrors expose pending count. Realtime readiness has a configurable timeout, releases failed channels, and creates a fresh channel on retry while preserving SUBSCRIBED-before-pull.
10. **Safe compaction integration:** queue flush uses compacted batches, preserves latest operation identity and local-create provenance, atomically acknowledges every source ID with its authoritative mirror merge, cancels unsynced create-delete pairs locally, and preserves earliest source ordering across entities.

## TDD evidence

### RED

- Gateway review tests initially reported 6 failures for missing deterministic range/order calls, missing expected-user binding, and missing local/in-flight identity checks.
- The revised pgTAP contract stopped at the missing five-argument RPC signature before the migration change.
- New repository/backup/auth/provider tests failed against the absence of leases, fresh restore timestamps/order, and neutral transition behavior.
- Queue compaction tests initially failed because source-ID provenance/cancellation metadata was absent; a later ordering regression test showed `dependent-create` incorrectly preceding the compacted parent update.
- Sync engine review run initially reported **10 failures / 26 passes**: scalar notification, no pull/ack notification, late offline observation, unbounded readiness, no compaction/cancellation, automatic permission/validation retries, and no auth lifecycle signal.
- Provider auth-controller test initially captured no `onAuthError` callback.
- Online-to-offline profile transport test initially exposed cached protected content.

### GREEN (focused)

- `src/sync/cloudGateway.test.ts`: **17/17**
- `src/sync/syncEngine.test.ts`: **37/37**
- `src/sync/operationQueue.test.ts`: **9/9**
- `src/db/syncedRepositories.test.ts`: **14/14**
- `src/db/backup.test.ts`: **12/12**
- `src/features/auth/AuthGate.test.tsx`: **22/22**
- `src/sync/SyncProvider.test.tsx`: **13/13**
- `src/app/App.test.tsx`: **4/4**
- Combined focused run: **8 files, 128/128 tests**
- Realtime business-sync pgTAP: **57/57** (also included in the full database pass)

## Final verification

| Verification | Result |
| --- | --- |
| `npx --yes supabase test db` | PASS — 9 files, 315 tests |
| `npm run test:run` | PASS — 47 files, 311 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

The first full database attempt could not run three pre-existing dblink concurrency files because Colima did not provide `host.docker.internal`. A temporary local Nginx TCP proxy with that network alias was used after a clean `supabase db reset`; the full 315-test run then passed. The proxy and its temporary configuration were removed after verification.

## Self-review / residual concerns

- No unresolved correctness or security concern was found in the changed sync paths.
- The production build retains the pre-existing Vite warning for chunks larger than 500 kB; it is unrelated to this change and does not fail the build.
- No deploy, push, merge, or remote-state mutation was performed.
