import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { appPath, expect, openManagementRoute, saveDownload, test } from './helpers';

test('records and exports a student performance entry', async ({ page }, testInfo) => {
  await page.goto(appPath());
  await openManagementRoute(page, '学生管理');
  await page.getByRole('button', { name: '新增学生' }).click();
  const studentDialog = page.getByRole('dialog', { name: '新增学生' });
  await studentDialog.getByLabel('学生姓名').fill('陈同学');
  await studentDialog.getByLabel('培养项目').fill('数字经济专硕');
  await studentDialog.getByLabel('年级').fill('2025 级');
  await studentDialog.getByRole('button', { name: '保存' }).click();
  await expect(studentDialog).toBeHidden();

  await page.getByRole('button', { name: '查看陈同学' }).click();
  const detailDialog = page.getByRole('dialog', { name: '陈同学详情' });
  await detailDialog.getByRole('button', { name: '添加日常记录' }).click();
  const recordDialog = page.getByRole('dialog', { name: '添加日常记录' });
  await recordDialog.getByLabel('类别').selectOption('research');
  await recordDialog.getByLabel('等级').selectOption('positive');
  await recordDialog.getByLabel('内容').fill('完成数据分析初稿');
  await recordDialog.getByLabel('后续跟进').fill('下周修订图表');
  await recordDialog.getByRole('button', { name: '保存' }).click();
  await expect(recordDialog).toBeHidden();
  await expect(detailDialog.getByText('完成数据分析初稿')).toBeVisible();
  await detailDialog.getByRole('button', { name: '编辑完成数据分析初稿' }).click();
  const editRecordDialog = page.getByRole('dialog', { name: '编辑日常记录' });
  await editRecordDialog.getByLabel('内容').fill('完成数据分析定稿');
  await editRecordDialog.getByRole('button', { name: '保存' }).click();
  await expect(editRecordDialog).toBeHidden();
  await expect(detailDialog.getByText('完成数据分析定稿')).toBeVisible();

  await detailDialog.getByRole('button', { name: '添加日常记录' }).click();
  const secondRecordDialog = page.getByRole('dialog', { name: '添加日常记录' });
  await secondRecordDialog.getByLabel('类别').selectOption('service');
  await secondRecordDialog.getByLabel('等级').selectOption('attention');
  await secondRecordDialog.getByLabel('内容').fill('协作记录需改进');
  await secondRecordDialog.getByRole('button', { name: '保存' }).click();
  await expect(secondRecordDialog).toBeHidden();
  await expect(detailDialog.getByText('协作记录需改进')).toBeVisible();
  await detailDialog.getByRole('button', { name: '删除协作记录需改进' }).click();
  const deleteRecordDialog = page.getByRole('dialog', { name: '删除日常记录' });
  await deleteRecordDialog.getByRole('button', { name: '删除' }).click();
  await expect(deleteRecordDialog).toBeHidden();
  await expect(detailDialog.getByText('协作记录需改进')).toBeHidden();
  await detailDialog.getByRole('button', { name: '关闭' }).first().click();

  await page.getByRole('button', { name: '学生记录汇总' }).click();
  await page.getByLabel('类别筛选').selectOption('research');
  await page.getByLabel('等级筛选').selectOption('positive');
  await expect(page.getByRole('row', { name: /陈同学.*科研学习.*积极/ })).toBeVisible();
  await expect(page.getByText('协作记录需改进')).toBeHidden();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出学生记录汇总 XLSX' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^学生记录汇总-\d{8}\.xlsx$/);
  const path = testInfo.outputPath(download.suggestedFilename());
  await saveDownload(download, path);
  const workbook = XLSX.read(await readFile(path));
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[workbook.SheetNames[0]]!);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ '学生姓名': '陈同学', '类别': '科研学习', '等级': '积极', '内容': '完成数据分析定稿' });
  expect(JSON.stringify(rows)).not.toContain('协作记录需改进');
});

test('keeps research, learning method, idea, and lesson data after reload', async ({ page }) => {
  await page.goto(appPath('/research'));
  await page.getByRole('button', { name: '新建文献' }).click();
  const researchDialog = page.getByRole('dialog', { name: '新建文献' });
  await researchDialog.getByLabel('题目').fill('数字化教学评价');
  await researchDialog.getByLabel('阅读状态').selectOption('reading');
  await researchDialog.getByRole('button', { name: '保存' }).click();
  await expect(researchDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: '数字化教学评价' })).toBeVisible();

  await page.getByRole('button', { name: '新建学习方法' }).click();
  const methodDialog = page.getByRole('dialog', { name: '新建学习方法' });
  await methodDialog.getByLabel('名称').fill('三轮文献阅读法');
  await methodDialog.getByLabel('步骤').fill('速读、精读、复盘');
  await methodDialog.getByRole('button', { name: '保存' }).click();
  await expect(methodDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: '三轮文献阅读法' })).toBeVisible();

  await page.goto(appPath('/ideas'));
  await page.getByLabel('灵感内容').fill('课程思政案例');
  await page.getByRole('button', { name: '记录灵感' }).click();
  await expect(page.getByRole('heading', { name: '课程思政案例' })).toBeVisible();

  await page.goto(appPath('/lessons'));
  await page.getByRole('button', { name: '新建备课' }).click();
  const lessonDialog = page.getByRole('dialog', { name: '新建备课' });
  await lessonDialog.getByLabel('章节').fill('回归分析导入');
  await lessonDialog.getByLabel('内容提纲').fill('从真实数据集引入模型');
  await lessonDialog.getByRole('button', { name: '保存' }).click();
  await expect(lessonDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: '回归分析导入' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '回归分析导入' })).toBeVisible();
  await page.goto(appPath('/research'));
  await expect(page.getByRole('heading', { name: '数字化教学评价' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '三轮文献阅读法' })).toBeVisible();
  await page.goto(appPath('/ideas'));
  await expect(page.getByRole('heading', { name: '课程思政案例' })).toBeVisible();
});
