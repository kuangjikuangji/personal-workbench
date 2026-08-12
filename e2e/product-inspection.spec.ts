import { expect, test } from './helpers';

const routes = [
  ['概览', '工作概览'],
  ['待办管理', '待办管理'],
  ['日历', '日历'],
  ['课表', '学期与课表'],
  ['系室管理', '系室管理'],
  ['学生管理', '学生管理'],
  ['个人科研', '个人科研'],
  ['灵感记录', '灵感记录'],
  ['教学备课', '教学备课'],
  ['设置', '设置'],
] as const;

test('desktop navigation reaches every product module and exposes install guidance', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'desktop navigation inspection');
  await page.goto('/');
  for (const [link, heading] of routes) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: '安装应用' })).toBeVisible();
  await expect(page.getByText(/Chrome\/Edge.*添加到主屏幕.*Android/)).toBeVisible();
});

test('mobile responsive tables render as cards and management navigation remains usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'mobile responsive inspection');
  await page.goto('/teachers');
  await page.getByRole('button', { name: '新增教师' }).click();
  const dialog = page.getByRole('dialog', { name: '新增教师' });
  await dialog.getByLabel('教师姓名').fill('响应式教师');
  await dialog.getByLabel('系室').fill('信息管理系');
  await dialog.getByRole('button', { name: '保存' }).click();
  const row = page.getByRole('row', { name: /响应式教师/ });
  await expect(row).toHaveCSS('display', 'grid');
  await expect(row.getByRole('button', { name: '查看响应式教师' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  await page.getByRole('button', { name: '管理', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '管理导航' }).getByRole('link', { name: '学生管理' })).toBeVisible();
});

test('denied notifications fall back to an in-app reminder', async ({ context, page }) => {
  await context.grantPermissions([]);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } });
  });
  await page.goto('/todos');
  await page.getByRole('button', { name: '新建待办' }).click();
  const dialog = page.getByRole('dialog', { name: '新建待办' });
  await dialog.getByLabel('标题').fill('通知降级待办');
  const past = new Date(Date.now() - 60_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  const localPast = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;
  await dialog.getByLabel('开始时间').fill(localPast);
  await dialog.getByLabel('提醒时间').fill(localPast);
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('region', { name: '待办提醒' })).toContainText('通知降级待办');
});
