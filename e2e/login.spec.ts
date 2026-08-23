import { appPath, expect, test } from './helpers';

test('protects the workbench with the responsive campus-photo login page', async ({ page }, testInfo) => {
  await page.goto(appPath('/'));

  await expect(page.getByRole('heading', { name: '个人工作学习工作台' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0);
  const background = await page.locator('.login-page').evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain('/personal-workbench/login-background.jpg');
  const imageResponse = await page.request.get('/personal-workbench/login-background.jpg');
  expect(imageResponse.ok()).toBe(true);

  await expect(page.getByLabel('账号')).toBeEditable();
  await expect(page.getByLabel('密码')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: '登录' })).toBeEnabled();

  if (testInfo.project.name === 'chromium-mobile') {
    const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    expect(widths.document).toBe(widths.viewport);
  }
});
