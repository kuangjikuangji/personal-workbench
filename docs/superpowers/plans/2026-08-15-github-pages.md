# GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the personal workbench at `https://kuangjikuangji.github.io/personal-workbench/` with reliable hash routing, PWA assets, and automatic deployment from `master`.

**Architecture:** Vite builds production assets under `/personal-workbench/`, while React Router keeps application routes in the URL hash so GitHub Pages only serves one physical HTML file. A GitHub Actions workflow validates the project, uploads `dist`, and deploys it with the official Pages actions.

**Tech Stack:** React 19, TypeScript, React Router, Vite 8, vite-plugin-pwa, Vitest, Playwright, GitHub Actions, GitHub Pages

## Global Constraints

- Public site URL is exactly `https://kuangjikuangji.github.io/personal-workbench/`.
- Application routes use `HashRouter`; direct refreshes must not depend on a custom `404.html` redirect.
- Production assets and the Service Worker stay under `/personal-workbench/`.
- `npm run dev` remains available at the Vite development-server root.
- Deployment runs only from `master` or by manual workflow dispatch.
- Supabase, custom domains, and the IndexedDB data model are outside this change.

---

### Task 1: Make routing and PWA assets safe under the Pages subpath

**Files:**
- Create: `src/app/providers.test.tsx`
- Create: `vite.config.test.ts`
- Modify: `src/app/providers.tsx`
- Modify: `vite.config.ts`
- Modify: `playwright.config.ts`
- Modify: `e2e/helpers.ts`
- Modify: `e2e/pwa.spec.ts`
- Modify: `e2e/product-inspection.spec.ts`
- Modify: `e2e/students-learning.spec.ts`
- Modify: `e2e/teachers.spec.ts`
- Modify: `e2e/todos-calendar.spec.ts`

**Interfaces:**
- Produces: `resolveBasePath(command: ConfigEnv['command']): '/' | '/personal-workbench/'` in `vite.config.ts`.
- Produces: `appPath(route?: string): string` in `e2e/helpers.ts`, returning `/personal-workbench/#/` for the root and `/personal-workbench/#/<route>` for application routes.
- Consumes: Existing `AppProviders`, `Repositories`, and Playwright `Page` APIs.

- [ ] **Step 1: Write the failing router and build-path tests**

Create `src/app/providers.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { createTestRepositories } from '../test/database';
import { AppProviders } from './providers';

afterEach(() => { window.location.hash = ''; });

test('reads application routes from the URL hash', async () => {
  window.location.hash = '#/todos';
  render(
    <AppProviders repositories={createTestRepositories()}>
      <Routes><Route path="/todos" element={<h1>待办路由</h1>} /></Routes>
    </AppProviders>,
  );
  expect(await screen.findByRole('heading', { name: '待办路由' })).toBeVisible();
});
```

Create `vite.config.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { resolveBasePath } from './vite.config';

describe('GitHub Pages base path', () => {
  test('keeps development at the origin root', () => {
    expect(resolveBasePath('serve')).toBe('/');
  });

  test('builds production assets below the repository path', () => {
    expect(resolveBasePath('build')).toBe('/personal-workbench/');
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
npm run test:run -- src/app/providers.test.tsx vite.config.test.ts
```

Expected: FAIL because `AppProviders` still uses `BrowserRouter` and `resolveBasePath` does not exist.

- [ ] **Step 3: Implement the router and Vite/PWA base path**

In `src/app/providers.tsx`, replace `BrowserRouter` with `HashRouter`:

```tsx
import { HashRouter } from 'react-router-dom';
// ...
<QueryClientProvider client={client}><HashRouter>{children}</HashRouter></QueryClientProvider>
```

In `vite.config.ts`, export and use the command-aware base path:

```ts
import type { ConfigEnv } from 'vite';

export function resolveBasePath(command: ConfigEnv['command']): '/' | '/personal-workbench/' {
  return command === 'build' ? '/personal-workbench/' : '/';
}

export default defineConfig(({ command }) => ({
  base: resolveBasePath(command),
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '个人工作学习工作台',
        short_name: '工作台',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#173b67',
        background_color: '#f5f7fb',
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    css: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
```

- [ ] **Step 4: Update production-preview navigation to exercise the deployed path**

Add to `e2e/helpers.ts`:

```ts
export function appPath(route = '/'): string {
  const normalized = route === '/' ? '/' : `/${route.replace(/^\/+/, '')}`;
  return `/personal-workbench/#${normalized}`;
}
```

Replace every direct application `page.goto('/...')` call in `e2e/` with
`page.goto(appPath('/...'))`, importing `appPath` from `./helpers`. Change the
manifest request in `e2e/pwa.spec.ts` to:

```ts
const manifest = await (await page.request.get('/personal-workbench/manifest.webmanifest')).json() as Record<string, unknown>;
```

Update `playwright.config.ts` so the preview readiness URL is the built site:

```ts
webServer: {
  command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
  url: 'http://127.0.0.1:4173/personal-workbench/',
  reuseExistingServer: false,
  timeout: 120_000,
},
```

- [ ] **Step 5: Run focused and full routing checks**

Run:

```bash
npm run test:run -- src/app/providers.test.tsx vite.config.test.ts
npm run typecheck
npm run build
npm run test:e2e
```

Expected: focused tests PASS; typecheck PASS; build creates `dist/manifest.webmanifest` and `dist/sw.js`; Playwright reports 16 passed and 2 device-specific skips.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/app/providers.tsx src/app/providers.test.tsx vite.config.ts vite.config.test.ts playwright.config.ts e2e
git commit -m "feat: prepare PWA for GitHub Pages"
```

---

### Task 2: Add a validated GitHub Pages deployment workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `src/app/pagesWorkflow.test.ts`

**Interfaces:**
- Consumes: `npm ci`, `npm run typecheck`, `npm run test:run`, and `npm run build`.
- Produces: A Pages artifact named by `actions/upload-pages-artifact` and a deployment created by `actions/deploy-pages`.

- [ ] **Step 1: Write a failing deployment-contract test**

Create `src/app/pagesWorkflow.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('GitHub Pages workflow', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

  test('validates and deploys dist from master with minimum permissions', () => {
    expect(workflow).toContain('branches: [master]');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm run test:run');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('path: ./dist');
    expect(workflow).toContain('actions/deploy-pages@v4');
  });
});
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run:

```bash
npm run test:run -- src/app/pagesWorkflow.test.ts
```

Expected: FAIL with `ENOENT` because `.github/workflows/deploy-pages.yml` does not exist.

- [ ] **Step 3: Add the official Pages workflow**

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:run
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Run the workflow test and the full local gate**

Run:

```bash
npm run test:run
npm run typecheck
npm run build
git diff --check
```

Expected: all tests PASS, typecheck PASS, build PASS, and no whitespace errors.

- [ ] **Step 5: Commit Task 2**

```bash
git add .github/workflows/deploy-pages.yml src/app/pagesWorkflow.test.ts
git commit -m "ci: deploy workbench to GitHub Pages"
```

---

### Task 3: Publish, enable Pages, and verify the live application

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: GitHub repository `kuangjikuangji/personal-workbench`, branch `agent/github-pages`, and the approved commits from Tasks 1-2.
- Produces: Live site `https://kuangjikuangji.github.io/personal-workbench/` and documented access instructions.

- [ ] **Step 1: Document the online address**

Add below the README introduction:

```md
## 在线访问

- GitHub Pages：<https://kuangjikuangji.github.io/personal-workbench/>
- 支持从 Chrome/Edge 安装为 PWA；数据当前保存在本机浏览器 IndexedDB 中。
```

- [ ] **Step 2: Commit the README change and push the feature branch**

```bash
git add README.md
git commit -m "docs: add online workbench link"
git push -u origin agent/github-pages
```

- [ ] **Step 3: Open and merge the reviewed deployment PR**

Create a draft PR targeting `master`, summarize the routing/PWA/workflow changes and local checks, mark it ready after checks pass, then merge it with:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Ensure Pages uses GitHub Actions and watch deployment**

Run:

```bash
gh api -X POST repos/kuangjikuangji/personal-workbench/pages -f build_type=workflow
gh run list --workflow deploy-pages.yml --limit 1
gh run watch --exit-status
```

If the Pages endpoint already exists, use:

```bash
gh api -X PUT repos/kuangjikuangji/personal-workbench/pages -f build_type=workflow
```

Expected: the newest `Deploy GitHub Pages` workflow concludes with `success`.

- [ ] **Step 5: Verify the deployed files and application routes**

Run:

```bash
curl --fail --location https://kuangjikuangji.github.io/personal-workbench/
curl --fail --location https://kuangjikuangji.github.io/personal-workbench/manifest.webmanifest
curl --fail --location https://kuangjikuangji.github.io/personal-workbench/sw.js
```

Open `https://kuangjikuangji.github.io/personal-workbench/#/todos` in Chromium and confirm the Chinese `待办管理` heading is visible without console errors.

- [ ] **Step 6: Synchronize local master and report the deployment**

```bash
git switch master
git pull --ff-only origin master
git status -sb
```

Expected: local `master` tracks `origin/master`, the worktree is clean, and the final response includes the repository, workflow run, and live Pages URL.
