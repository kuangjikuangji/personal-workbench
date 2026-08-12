import { addTeacher, expect, openManagementRoute, saveDownload, test } from './helpers';

test('fills teachers, records attendance, and exports mentorship summary', async ({ page }, testInfo) => {
  await page.goto('/');
  await openManagementRoute(page, '系室管理');
  await addTeacher(page, '张老师');
  await addTeacher(page, '李老师');

  await page.getByRole('button', { name: '年度记录', exact: true }).click();
  await page.getByRole('button', { name: '一键补全未填报教师' }).click();
  await expect(page.getByRole('dialog', { name: '补全年度记录' })).toContainText('将补全 2 位教师');
  await page.getByRole('button', { name: '确认补全' }).click();
  await expect(page.getByRole('dialog', { name: '补全年度记录' })).toBeHidden();
  await expect(page.getByRole('row', { name: /选择张老师.*未填报/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /选择李老师.*未填报/ })).toBeVisible();

  await page.getByLabel('选择张老师').check();
  await page.getByLabel('选择李老师').check();
  await page.getByRole('button', { name: '批量登记例会' }).click();
  const meetingDialog = page.getByRole('dialog', { name: '批量登记例会' });
  await expect(meetingDialog).toContainText('将为 2 位教师登记例会');
  await meetingDialog.getByLabel('例会名称').fill('学期工作例会');
  await meetingDialog.getByLabel('参会').check();
  await meetingDialog.getByRole('button', { name: '保存 2 条记录' }).click();
  await expect(meetingDialog).toBeHidden();
  await expect(page.getByRole('row', { name: /选择张老师.*已填报.*参会/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /选择李老师.*已填报.*参会/ })).toBeVisible();

  await page.getByLabel('选择张老师').check();
  await page.getByLabel('选择李老师').check();
  await page.getByRole('button', { name: '批量登记材料' }).click();
  const materialDialog = page.getByRole('dialog', { name: '批量登记材料' });
  await materialDialog.getByLabel('材料名称').fill('教学大纲');
  await materialDialog.getByRole('button', { name: '保存 2 条记录' }).click();
  await expect(materialDialog).toBeHidden();
  await expect(page.getByRole('row', { name: /选择张老师.*已提交/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /选择李老师.*已提交/ })).toBeVisible();

  await page.getByRole('button', { name: '教师名册' }).click();
  await page.getByRole('button', { name: '查看张老师' }).click();
  const teacherDialog = page.getByRole('dialog', { name: '张老师详情' });
  await teacherDialog.getByRole('button', { name: '科研导师' }).click();
  await teacherDialog.getByRole('button', { name: '新增指导学生' }).click();
  const mentorshipDialog = page.getByRole('dialog', { name: '新增指导学生' });
  await mentorshipDialog.getByLabel('学生姓名').fill('王同学');
  await mentorshipDialog.getByLabel('年级').fill('大三');
  await mentorshipDialog.getByLabel('专业').fill('信息管理');
  await mentorshipDialog.getByLabel('指导主题').fill('数据治理');
  await mentorshipDialog.getByRole('button', { name: '保存' }).click();
  await expect(mentorshipDialog).toBeHidden();
  await expect(teacherDialog.getByText('王同学', { exact: true })).toBeVisible();
  await teacherDialog.getByRole('button', { name: '关闭' }).first().click();

  await page.getByRole('button', { name: '科研导师汇总' }).click();
  await expect(page.getByRole('row', { name: /王同学.*张老师/ })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出导师汇总 XLSX' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^科研导师汇总-\d{8}\.xlsx$/);
  const path = testInfo.outputPath(download.suggestedFilename());
  await saveDownload(download, path);
});
