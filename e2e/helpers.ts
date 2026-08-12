import { expect, test as base, type Download, type Locator, type Page } from '@playwright/test';

export { expect };

export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

export type ScheduleFixture = {
  courseDate: string;
  semesterEnd: string;
  semesterStart: string;
  secondWeekDate: string;
  todoEnd: string;
  todoStart: string;
};

function localDateParts(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function futureOddWeekSchedule(now = new Date()): ScheduleFixture {
  const nextMonday = addDays(now, ((8 - now.getDay()) % 7) || 7);
  return {
    semesterStart: localDateParts(nextMonday),
    semesterEnd: localDateParts(addDays(nextMonday, 27)),
    secondWeekDate: localDateParts(addDays(nextMonday, 7)),
    courseDate: localDateParts(nextMonday),
    todoStart: `${localDateParts(nextMonday)}T09:30`,
    todoEnd: `${localDateParts(nextMonday)}T10:00`,
  };
}

export async function openManagementRoute(page: Page, name: '系室管理' | '学生管理'): Promise<void> {
  const desktopLink = page.getByRole('link', { name, exact: true });
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
    return;
  }
  await page.getByRole('button', { name: '管理', exact: true }).click();
  await page.getByRole('navigation', { name: '管理导航' }).getByRole('link', { name, exact: true }).click();
}

export async function createSemesterAndOddWeekCourse(page: Page, schedule = futureOddWeekSchedule()): Promise<void> {
  await page.goto('/courses');
  await page.getByRole('button', { name: '新建学期' }).click();
  const semesterDialog = page.getByRole('dialog', { name: '新建学期' });
  await semesterDialog.getByLabel('学期名称').fill('E2E 动态学期');
  await semesterDialog.getByLabel('开始日期').fill(schedule.semesterStart);
  await semesterDialog.getByLabel('结束日期').fill(schedule.semesterEnd);
  await semesterDialog.getByLabel('教学周数').fill('4');
  await semesterDialog.getByLabel('设为当前学期').check();
  await semesterDialog.getByRole('button', { name: '保存' }).click();
  await expect(semesterDialog).toBeHidden();

  await page.getByRole('button', { name: '新建课程' }).click();
  const courseDialog = page.getByRole('dialog', { name: '新建课程' });
  await courseDialog.getByLabel('课程名称').fill('统计学');
  await courseDialog.getByLabel('地点').fill('教学楼 301');
  await courseDialog.getByLabel('星期').selectOption('1');
  await courseDialog.getByLabel('开始时间').fill('09:00');
  await courseDialog.getByLabel('结束时间').fill('10:30');
  await courseDialog.getByLabel('起始周').fill('1');
  await courseDialog.getByLabel('结束周').fill('4');
  await courseDialog.getByLabel('周次规则').selectOption('odd');
  await courseDialog.getByRole('button', { name: '保存' }).click();
  await expect(courseDialog).toBeHidden();
  await expect(page.getByText('统计学', { exact: true })).toBeVisible();
}

export async function createTodo(
  page: Page,
  input: { end?: string; role: '院长助理' | '系主任' | '个人'; start: string; title: string },
): Promise<Locator> {
  await page.goto('/todos');
  await page.getByRole('button', { name: '新建待办' }).click();
  const dialog = page.getByRole('dialog', { name: '新建待办' });
  await dialog.getByLabel('标题').fill(input.title);
  await dialog.getByLabel('归属角色').selectOption({ label: input.role });
  await dialog.getByLabel('开始时间').fill(input.start);
  if (input.end) await dialog.getByLabel('结束时间').fill(input.end);
  await dialog.getByRole('button', { name: '保存' }).click();
  return dialog;
}

export async function addTeacher(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '新增教师' }).click();
  const dialog = page.getByRole('dialog', { name: '新增教师' });
  await dialog.getByLabel('教师姓名').fill(name);
  await dialog.getByLabel('系室').fill('信息管理系');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: `查看${name}` })).toBeVisible();
}

export async function saveDownload(download: Download, testInfoOutputPath: string): Promise<string> {
  await download.saveAs(testInfoOutputPath);
  return testInfoOutputPath;
}

export async function createIdea(page: Page, content: string): Promise<void> {
  await page.goto('/ideas');
  await page.getByLabel('灵感内容').fill(content);
  await page.getByRole('button', { name: '记录灵感' }).click();
  await expect(page.getByRole('heading', { name: content })).toBeVisible();
}
