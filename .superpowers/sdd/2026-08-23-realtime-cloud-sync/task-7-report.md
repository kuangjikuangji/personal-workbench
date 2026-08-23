# Task 7 report: actionable synchronization status UI

## Delivered

- Added `SyncStatus`, consuming `useSyncStatus()` and its `retry()` action.
- Renders the required labels: `已同步`, `正在同步`, `离线，N 项待同步`, and `同步失败` with `重试`.
- Normal states use `role="status"`; failures use `role="alert"`.
- Does not render the engine's raw error `message`; failure text stays safe and actionable.
- Injected the status in the desktop account summary and the mobile “我的” drawer. The indicator is inline rather than fixed, so it does not cover bottom navigation or the PWA banner.
- Kept `AppRouter` usable outside `SyncProvider` by injecting the context-bound status from the authenticated application boundary.

## Tests and verification

- TDD red: `npm run test:run -- src/sync/SyncStatus.test.tsx` failed because `./SyncStatus` was absent.
- Focused regression: `npm run test:run -- src/sync/SyncStatus.test.tsx src/app/AppShell.test.tsx src/app/router.test.tsx src/styles.dark.test.ts` — 30 tests passed.
- Full checks: `npm run typecheck`, `npm run test:run` (273 tests passed), and `npm run build` all exited successfully.

## Self-review

- Checked the complete diff and `git diff --check` for whitespace/errors.
- Verified all four required states, retry behavior, error-message redaction, desktop placement, mobile-drawer placement, dark styling, and standalone-router compatibility.
