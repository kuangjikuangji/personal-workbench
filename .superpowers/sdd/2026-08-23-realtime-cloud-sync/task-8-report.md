# Task 8 report: realtime, offline, cleanup, and release verification

## Delivered

- Added `e2e/realtime-sync.spec.ts`, gated exclusively by
  `E2E_SYNC_USERNAME` and `E2E_SYNC_PASSWORD` with a clear missing-secret
  skip reason and no default credentials.
- The E2E journey creates two independent browser contexts for the same
  disposable account and verifies create/update/delete propagation without
  reloading terminal B, an offline edit surviving terminal A reload,
  automatic reconnect upload, and sign-out cleanup of all 14 local business
  tables plus `syncOperations` in both contexts.
- Test-created todo titles include a timestamp and UUID suffix. The normal
  path deletes the todo through the UI; the `finally` path reconnects both
  contexts and attempts UI cleanup from either authenticated terminal.
- Added reusable credential, login, service-worker readiness, and IndexedDB
  inspection helpers in `e2e/helpers.ts`.
- Added a Pages-workflow Chromium install and credential-gated
  `chromium-desktop` synchronization verification step. The workflow passes
  public Supabase build variables separately from the two GitHub Actions
  test-account secrets.
- Updated `README.md` with cloud ownership, RLS, offline queue semantics,
  last-modified-wins conflicts, all synchronization labels, hosted Supabase
  deployment commands, disposable E2E-account handling, and safe recovery
  guidance.

## Realtime query refresh gap found during Task 8

Code inspection showed that accepted Realtime changes updated Dexie but did
not invalidate the active TanStack Query cache, so terminal B could not meet
the no-reload assertion. Under the controller's Task 8 scope expansion:

- Added a typed `RemoteChangeListener` callback to the sync engine and invoked
  it only after a Realtime change wins merge comparison and is committed to
  the mirror. Startup and rejected stale events do not notify; local
  repository writes and cloud acknowledgements are unchanged.
- Passed the callback through `SyncProvider`.
- Created one stable QueryClient for the authenticated workbench and supplied
  that same instance to both `AppProviders` and the callback that invalidates
  active feature queries.
- Added engine coverage for accepted-versus-stale Realtime notifications and
  an app integration test proving the active todo query refetches the newly
  committed IndexedDB row.

## TDD evidence

- RED: `npm run test:run -- src/sync/syncEngine.test.ts src/app/App.test.tsx`
  failed in two intended places: the accepted Realtime merge called the
  listener zero times, and the app-provided listener was `undefined`.
- GREEN: `npm run test:run -- src/sync/syncEngine.test.ts src/app/App.test.tsx src/app/providers.test.tsx src/sync/SyncProvider.test.tsx`
  passed 43 tests after the typed callback and shared QueryClient composition
  were implemented.
- The brief's pre-feature remote RED and final credentialed GREEN could not be
  executed locally because the two approved E2E credential variables are
  absent. No account or credential was invented. The hosted migration and
  disposable-account smoke test remain controller-owned.

## Local verification

- `npm run typecheck && npm run test:run && npm run build` exited 0:
  46 Vitest files and 275 tests passed; the production build completed. The
  known Vite large-chunk advisory remains.
- `npx playwright test e2e/realtime-sync.spec.ts --project=chromium-desktop`
  exited 0 with one expected credential-absent skip. The Playwright web-server
  process also emitted environment-only `NO_COLOR`/`FORCE_COLOR` notices.
- `rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY" dist src` returned no
  matches.
- `git diff --check` exited 0.

## Plan correction and deferred release work

- The plan's `--project=chromium` command is a typo in this repository:
  Playwright reports the available projects as `chromium-desktop` and
  `chromium-mobile`. Per controller ruling, all Task 8 code, documentation,
  workflow configuration, and verification use `chromium-desktop`.
- No Supabase migration/config push, hosted RLS/conflict/publication smoke
  test, remote user creation/deletion, GitHub push/PR/merge, Pages deployment,
  or production URL smoke test was performed. Those external-state release
  steps remain controller-owned after review.

## Self-review

- Confirmed the E2E reads only the two approved credential variables and does
  not log their values.
- Confirmed terminal B assertions do not reload the page.
- Confirmed accepted Realtime changes refetch active queries without global
  DOM events and without changing local-write invalidation behavior.
- Confirmed sign-out assertions cover every business mirror table and the
  pending queue, while intentionally leaving non-business device preferences
  outside the assertion.
- Confirmed all changes are local repository changes and no external state was
  mutated.

## Fix round 1: offline identity restoration and account cache isolation

Two P1 review findings were reproduced and fixed locally.

### Secure offline profile fallback

- Added a browser-storage adapter that persists only `id`, `username`, `role`,
  `isActive`, and `mustChangePassword`, under a key scoped to the Supabase user
  ID. Reads validate every field and reject a payload whose ID differs from the
  requested session user.
- Production authentication uses the browser cache by default; injected auth
  backends remain cache-isolated unless a test explicitly supplies an adapter.
- A successful profile request that starts online updates the cache. A rejected
  profile request may use it only while the browser is offline, the persisted
  session has a future `expires_at`, the cache matches that session user, the
  profile is active, and `mustChangePassword` is false.
- Online failure, missing/different/expired session, inactive cache, and forced
  password change all fail closed to an actionable anonymous state instead of
  leaving authentication indefinitely at `loading`.
- Explicit sign-out removes the current profile cache. Direct A-to-B session
  replacement removes A's cache and awaits registered mirror cleanup before B
  is resolved.

TDD evidence:

- Cache RED: `npm run test:run -- src/features/auth/authService.test.ts` failed
  because `createOfflineProfileCache` did not exist. GREEN: 2 tests passed.
- Provider RED: `npm run test:run -- src/features/auth/AuthGate.test.tsx`
  produced seven unhandled profile-fetch rejections and left the UI at
  `正在验证登录状态…`; the sign-out test also showed no profile had been cached.
- Account-transition RED: the focused test expected A's cache to be absent
  after B rendered but received A's profile. GREEN: AuthProvider/auth-service
  coverage passes 22 tests.

### QueryClient isolation across identity replacement

- Keyed the QueryClient-owning `AuthenticatedWorkbench` by
  `identity.session.user.id`, so direct A-to-B replacement unmounts A's query
  cache before B's repositories render.
- Added an integration test that keeps B's todo request pending after B's
  profile becomes visible. Before the fix, A's private cached todo remained in
  the DOM. After the key was added, A's todo is absent and only B's todo renders
  when B's request resolves.
- Preserved the accepted-Realtime-change invalidation callback and the inner
  user-keyed SyncProvider lifecycle.

### E2E and documentation

- Strengthened the offline-reload boundary to assert the same account username
  and `离线，1 项待同步` after reload, in addition to the queued edited todo.
- Documented the minimal offline identity cache, unexpired same-user session
  requirement, fail-closed cases, and cache removal on sign-out.

### Fix-round verification

- Focused auth/App/Sync command: 5 files and 65 tests passed.
- `npx playwright test e2e/realtime-sync.spec.ts --project=chromium-desktop`
  exited 0 with the expected one skip because the approved credential variables
  remain absent. The credentialed offline reload remains controller-owned.
- `npm run typecheck` exited 0.
- Full Vitest: 47 files and 288 tests passed.
- `npm run build` exited 0 with only the known Vite large-chunk advisory.
- No remote account, Supabase, GitHub, or Pages state was changed.
