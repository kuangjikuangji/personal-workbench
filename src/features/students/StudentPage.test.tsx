import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { RepositoryProvider } from '../../app/providers';
import { createTestRepositories } from '../../test/database';
import { StudentPage } from './StudentPage';

function renderStudentPage(repositories = createTestRepositories()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><StudentPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);
  return { repositories };
}

async function createStudent(repositories = createTestRepositories(), name = '林同学') {
  return repositories.students.create({ name, program: '应用经济学', cohort: '2024级', contact: 'lin@example.com', notes: '班委', archivedAt: null });
}

describe('StudentPage', () => {
  test('edits and deletes a student record from student detail', async () => {
    const repositories = createTestRepositories();
    const student = await repositories.students.create({ name: '陈同学', program: '', cohort: '', contact: '', notes: '', archivedAt: null });
    const record = await repositories.studentRecords.create({ studentId: student.id, date: '2026-08-10', category: 'task', rating: 'positive', content: '旧记录', followUp: '', tags: [] });
    const user = userEvent.setup();
    renderStudentPage(repositories);
    await user.click(await screen.findByRole('button', { name: '查看陈同学' }));
    const detail = screen.getByRole('dialog', { name: '陈同学详情' });
    await user.click(within(detail).getByRole('button', { name: '编辑旧记录' }));
    const editDialog = screen.getByRole('dialog', { name: '编辑日常记录' });
    await user.clear(within(editDialog).getByLabelText('内容'));
    await user.type(within(editDialog).getByLabelText('内容'), '新记录');
    await user.click(within(editDialog).getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await repositories.studentRecords.get(record.id))?.content).toBe('新记录'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑日常记录' })).not.toBeInTheDocument());
    expect(await within(detail).findByText('新记录', { selector: 'strong' })).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: '删除新记录' }));
    await user.click(within(screen.getByRole('dialog', { name: '删除日常记录' })).getByRole('button', { name: '删除' }));
    await waitFor(async () => expect(await repositories.studentRecords.get(record.id)).toBeUndefined());
  });
  test('adds an individual performance record with all fields and filters the summary', async () => {
    const repositories = createTestRepositories();
    await createStudent(repositories);
    const user = userEvent.setup();
    renderStudentPage(repositories);

    await user.click(await screen.findByRole('link', { name: '林同学' }));
    await user.click(screen.getByRole('button', { name: '添加日常记录' }));
    const form = screen.getByRole('dialog', { name: '添加日常记录' });
    await user.clear(within(form).getByLabelText('日期'));
    await user.type(within(form).getByLabelText('日期'), '2026-08-10');
    await user.selectOptions(within(form).getByLabelText('类别'), 'task');
    await user.selectOptions(within(form).getByLabelText('等级'), 'positive');
    await user.type(within(form).getByLabelText('内容'), '按时完成数据清理');
    await user.type(within(form).getByLabelText('后续跟进'), '下周复盘');
    await user.type(within(form).getByLabelText('标签'), '数据,主动');
    await user.click(within(form).getByRole('button', { name: '保存' }));
    expect(await screen.findByText('按时完成数据清理', { selector: 'strong' })).toBeVisible();
    expect((await repositories.studentRecords.list())[0]).toMatchObject({ followUp: '下周复盘', tags: ['数据', '主动'] });

    await user.click(screen.getByRole('button', { name: '学生记录汇总' }));
    await user.selectOptions(screen.getByLabelText('类别筛选'), 'task');
    await user.selectOptions(screen.getByLabelText('等级筛选'), 'positive');
    const summary = screen.getByRole('table', { name: '学生记录汇总' });
    expect(within(summary).getByText('按时完成数据清理')).toBeVisible();
    expect(within(summary).getByText('任务推进')).toBeVisible();
    expect(within(summary).getByText('积极')).toBeVisible();
  });

  test('shows the associated-record count and defaults destructive dialog focus to archive', async () => {
    const repositories = createTestRepositories();
    const student = await createStudent(repositories);
    await repositories.studentRecords.create({ studentId: student.id, date: '2026-08-10', category: 'task', rating: 'positive', content: '记录', followUp: '', tags: [] });
    const user = userEvent.setup();
    renderStudentPage(repositories);

    await user.click(await screen.findByRole('button', { name: '删除林同学' }));
    const dialog = screen.getByRole('dialog', { name: '处理学生记录' });
    expect(within(dialog).getByLabelText('关联日常记录：1 条')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '归档学生' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: '归档学生' }));
    expect((await repositories.students.get(student.id))?.archivedAt).not.toBeNull();
    expect(await repositories.studentRecords.list()).toHaveLength(1);
  });

  test('keeps archived students available in summary filters with their historical records', async () => {
    const repositories = createTestRepositories();
    const archived = await createStudent(repositories, '林同学');
    const active = await createStudent(repositories, '周同学');
    await repositories.students.patch(archived.id, { archivedAt: '2026-08-10T00:00:00.000Z' });
    await repositories.studentRecords.create({ studentId: archived.id, date: '2026-08-10', category: 'task', rating: 'positive', content: '归档学生历史记录', followUp: '', tags: [] });
    await repositories.studentRecords.create({ studentId: active.id, date: '2026-08-10', category: 'task', rating: 'positive', content: '在读学生记录', followUp: '', tags: [] });
    const user = userEvent.setup();
    renderStudentPage(repositories);

    await user.click(await screen.findByRole('button', { name: '学生记录汇总' }));
    const studentFilter = screen.getByLabelText('学生筛选');
    expect(within(studentFilter).getByRole('option', { name: '林同学（已归档）' })).toBeVisible();
    await user.selectOptions(studentFilter, archived.id);

    const summary = screen.getByRole('table', { name: '学生记录汇总' });
    expect(within(summary).getByText('归档学生历史记录')).toBeVisible();
    expect(within(summary).queryByText('在读学生记录')).not.toBeInTheDocument();
  });

  test('exports only the currently filtered student summary rows', async () => {
    const repositories = createTestRepositories();
    const first = await createStudent(repositories, '林同学');
    const second = await createStudent(repositories, '周同学');
    await repositories.studentRecords.create({ studentId: first.id, date: '2026-08-10', category: 'task', rating: 'positive', content: '完成数据清理', followUp: '下周复盘', tags: [] });
    await repositories.studentRecords.create({ studentId: second.id, date: '2026-08-09', category: 'attendance', rating: 'attention', content: '迟到', followUp: '', tags: [] });
    let blob: Blob | undefined; let filename = '';
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (value: Blob) => { blob = value; return 'blob:export'; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    const user = userEvent.setup();
    renderStudentPage(repositories);
    await user.click(await screen.findByRole('button', { name: '学生记录汇总' }));
    await user.selectOptions(screen.getByLabelText('学生筛选'), first.id);
    await user.click(screen.getByRole('button', { name: '导出学生记录汇总 XLSX' }));

    const reader = new FileReader();
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => { reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob!); });
    expect(filename).toMatch(/^学生记录汇总-\d{8}\.xlsx$/);
    const workbook = XLSX.read(buffer);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['学生记录汇总'])).toEqual([
      { 学生姓名: '林同学', 日期: '2026-08-10', 类别: '任务推进', 等级: '积极', 内容: '完成数据清理', 后续跟进: '下周复盘' },
    ]);
  });
});
