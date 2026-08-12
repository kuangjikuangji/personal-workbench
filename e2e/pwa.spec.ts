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
    await page.getByRole('button', { name: '管理', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '管理导航' })).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
  } else {
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  }

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '灵感记录' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '离线持久化灵感' })).toBeVisible();
  await context.setOffline(false);
});
