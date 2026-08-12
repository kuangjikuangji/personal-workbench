import { createSemesterAndOddWeekCourse, createTodo, expect, futureOddWeekSchedule, test } from './helpers';

test('todo and odd-week course appear as text and conflict on overlap', async ({ page }) => {
  const schedule = futureOddWeekSchedule();
  await createSemesterAndOddWeekCourse(page, schedule);
  const dialog = await createTodo(page, {
    title: '提交预算',
    role: '院长助理',
    start: schedule.todoStart,
    end: schedule.todoEnd,
  });

  await expect(page.getByText('与以下日程冲突，是否仍然保存？')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '时间冲突' }).getByText('统计学', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '仍然保存' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('link', { name: '日历', exact: true }).click();
  await expect(page.getByRole('heading', { name: '日历', exact: true })).toBeVisible();
  await page.goto(`/calendar?date=${schedule.courseDate}`);
  const firstWeekCell = page.locator(`.fc-daygrid-day[data-date="${schedule.courseDate}"]`);
  await expect(firstWeekCell).toBeVisible();
  await expect(firstWeekCell.locator('.fc-event').filter({ hasText: '提交预算' })).toBeVisible();
  await expect(firstWeekCell.locator('.fc-event').filter({ hasText: '统计学' })).toBeVisible();
  await expect(firstWeekCell.locator('.fc-event').filter({ hasText: '提交预算' }).locator('.calendar-event-time')).toContainText('09:30');
  await expect(firstWeekCell.locator('.fc-event').filter({ hasText: '统计学' }).locator('.calendar-event-time')).toContainText('09:00');

  await page.goto(`/calendar?date=${schedule.secondWeekDate}`);
  const secondWeekCell = page.locator(`.fc-daygrid-day[data-date="${schedule.secondWeekDate}"]`);
  await expect(secondWeekCell).toBeVisible();
  await expect(secondWeekCell.locator('.fc-daygrid-day-events')).toBeVisible();
  await expect(secondWeekCell.locator('.fc-event').filter({ hasText: '统计学' })).toHaveCount(0);
});

test('creates todos for all three roles with visible text labels', async ({ page }) => {
  for (const [title, role] of [['院办任务', '院长助理'], ['系室任务', '系主任'], ['个人任务', '个人']] as const) {
    const dialog = await createTodo(page, { title, role, start: '' });
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row', { name: new RegExp(`${title}.*${role}`) })).toBeVisible();
  }
});
