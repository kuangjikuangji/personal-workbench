import { randomUUID } from 'node:crypto';
import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  appPath,
  ensureOfflineReloadIsControlled,
  expect,
  loginWithSyncTestAccount,
  readSyncTestCredentials,
  readWorkbenchMirrorCounts,
  restoreSyncTestAccount,
} from './helpers';

async function signOutAndExpectEmptyMirror(page: Page): Promise<void> {
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '个人工作学习工作台' })).toBeVisible({ timeout: 30_000 });
  expect(await readWorkbenchMirrorCounts(page)).toEqual({
    todos: 0,
    semesters: 0,
    courses: 0,
    teachers: 0,
    teacherYearSummaries: 0,
    teacherRecords: 0,
    mentorships: 0,
    researchItems: 0,
    learningMethods: 0,
    ideas: 0,
    lessonPlans: 0,
    students: 0,
    studentRecords: 0,
    settings: 0,
    syncOperations: 0,
  });
}

async function removeTodoThroughUi(page: Page, titles: string[]): Promise<boolean> {
  if (page.isClosed()) return false;
  await page.goto(appPath('/todos'));
  if (!await page.getByRole('heading', { name: '待办管理', exact: true }).isVisible()) return false;

  for (const title of titles) {
    const remove = page.getByRole('button', { name: `删除${title}`, exact: true });
    if (await remove.count() === 0 || !await remove.isVisible()) continue;
    await remove.click();
    const dialog = page.getByRole('dialog', { name: '删除待办' });
    await dialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.sync-status')).toHaveText('已同步', { timeout: 30_000 });
    return true;
  }
  return false;
}

test('synchronizes realtime and offline todo changes, then clears both local mirrors on sign-out', async ({ browser }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'Remote synchronization runs once in the desktop Chromium project.',
  );
  const credentials = readSyncTestCredentials();
  test.skip(
    credentials === null,
    'Remote synchronization skipped: set both E2E_SYNC_USERNAME and E2E_SYNC_PASSWORD.',
  );
  if (!credentials) return;

  test.setTimeout(240_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const terminalA = await browser.newContext({ baseURL });
  const pageA = await terminalA.newPage();
  let terminalB: BrowserContext | null = null;
  let pageB: Page | null = null;
  const marker = `E2E 同步 ${Date.now()}-${randomUUID().slice(0, 8)}`;
  const createdTitle = `${marker} 新建`;
  const offlineTitle = `${marker} 离线更新`;
  let cleanupRequired = false;

  try {
    await loginWithSyncTestAccount(pageA, credentials);
    terminalB = await browser.newContext({
      baseURL,
      storageState: await terminalA.storageState(),
    });
    pageB = await terminalB.newPage();
    await restoreSyncTestAccount(pageB);

    await pageA.getByRole('button', { name: '新建待办' }).click();
    const createDialog = pageA.getByRole('dialog', { name: '新建待办' });
    await createDialog.getByLabel('标题').fill(createdTitle);
    cleanupRequired = true;
    await createDialog.getByRole('button', { name: '保存' }).click();
    await expect(createDialog).toBeHidden();
    await expect(pageA.getByText(createdTitle, { exact: true })).toBeVisible();
    await expect(pageB.getByText(createdTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(pageA.locator('.sync-status')).toHaveText('已同步', { timeout: 30_000 });

    await ensureOfflineReloadIsControlled(pageA);
    await terminalA.setOffline(true);
    await pageA.getByRole('button', { name: `编辑${createdTitle}`, exact: true }).click();
    const editDialog = pageA.getByRole('dialog', { name: '编辑待办' });
    await editDialog.getByLabel('标题').fill(offlineTitle);
    await editDialog.getByRole('button', { name: '保存' }).click();
    await expect(editDialog).toBeHidden();
    await expect(pageA.getByText(offlineTitle, { exact: true })).toBeVisible();
    await expect(pageA.locator('.sync-status')).toContainText('离线，1 项待同步');

    await terminalA.setOffline(false);
    await expect(pageB.getByText(offlineTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByText(createdTitle, { exact: true })).toHaveCount(0);
    await expect(pageA.locator('.sync-status')).toHaveText('已同步', { timeout: 30_000 });

    await pageA.getByRole('button', { name: `删除${offlineTitle}`, exact: true }).click();
    const deleteDialog = pageA.getByRole('dialog', { name: '删除待办' });
    await deleteDialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(pageA.getByText(offlineTitle, { exact: true })).toHaveCount(0);
    await expect(pageB.getByText(offlineTitle, { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(pageA.locator('.sync-status')).toHaveText('已同步', { timeout: 30_000 });
    cleanupRequired = false;

    await signOutAndExpectEmptyMirror(pageA);
    await signOutAndExpectEmptyMirror(pageB);
  } finally {
    await Promise.allSettled([
      terminalA.setOffline(false),
      terminalB?.setOffline(false) ?? Promise.resolve(),
    ]);
    if (cleanupRequired) {
      const titles = [offlineTitle, createdTitle];
      const removedFromA = await removeTodoThroughUi(pageA, titles).catch(() => false);
      if (!removedFromA && pageB) await removeTodoThroughUi(pageB, titles).catch(() => false);
    }
    await Promise.allSettled([terminalA.close(), terminalB?.close() ?? Promise.resolve()]);
  }
});
