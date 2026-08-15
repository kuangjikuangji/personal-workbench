import { createIdea, expect, test } from './helpers';

test('keeps local data through an offline reload and exposes responsive navigation', async ({ context, page }, testInfo) => {
  await createIdea(page, '离线持久化灵感');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json() as Record<string, unknown>;
  expect(manifest).toMatchObject({ name: '个人工作学习工作台', display: 'standalone', start_url: './' });
  expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: '192x192' }), expect.objectContaining({ sizes: '512x512' })]));

  await page.reload();
  await expect(page.getByRole('heading', { name: '离线持久化灵感' })).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
    await registration.update();
  });

  if (testInfo.project.name === 'chromium-mobile') {
    await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible();
    for (const [label, heading] of [['概览', '工作概览'], ['待办', '待办管理'], ['日历', '日历']]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await page.getByRole('button', { name: '管理', exact: true }).click();
    const management = page.getByRole('navigation', { name: '管理导航' });
    await expect(management).toBeVisible();
    for (const [label, heading] of [['课表', '学期与课表'], ['系室管理', '系室管理'], ['学生管理', '学生管理']]) {
      await management.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      if (label !== '学生管理') await page.getByRole('button', { name: '管理', exact: true }).click();
    }
    await page.getByRole('button', { name: '我的', exact: true }).click();
    const personal = page.getByRole('navigation', { name: '我的导航' });
    for (const [label, heading] of [['个人科研', '个人科研'], ['灵感记录', '灵感记录'], ['教学备课', '教学备课'], ['设置', '设置']]) {
      await personal.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      if (label !== '设置') await page.getByRole('button', { name: '我的', exact: true }).click();
    }
    await page.goto('/ideas');
  } else {
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  }

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '灵感记录' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '离线持久化灵感' })).toBeVisible();
  await context.setOffline(false);
});
