import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { RepositoryProvider } from '../../app/providers';
import type { Repositories } from '../../db/repositories';
import { createTestRepositories } from '../../test/database';
import { TeacherPage } from './TeacherPage';

function renderTeacherPage(repositories: Repositories) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <RepositoryProvider repositories={repositories}>
      <QueryClientProvider client={client}>
        <MemoryRouter><TeacherPage /></MemoryRouter>
      </QueryClientProvider>
    </RepositoryProvider>,
  );
}

async function seedTeachers(repositories: Repositories, names: string[]) {
  return Promise.all(names.map((name) => repositories.teachers.create({
    name, department: '经济系', archivedAt: null,
  })));
}

function captureDownload() {
  let blob: Blob | undefined;
  let filename = '';
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (value: Blob) => { blob = value; return 'blob:export'; } });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
  return { result: () => ({ blob, filename }), restore: () => click.mockRestore() };
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

describe('TeacherPage', () => {
  test('fills missing teachers then applies meeting attendance in bulk after showing operation summaries', async () => {
    const repositories = createTestRepositories();
    await seedTeachers(repositories, ['张老师', '李老师']);
    const user = userEvent.setup();
    renderTeacherPage(repositories);

    await user.click(await screen.findByRole('button', { name: '年度记录' }));
    await user.click(screen.getByRole('button', { name: '一键补全未填报教师' }));
    expect(screen.getByText('将补全 2 位教师')).toBeVisible();
    expect(screen.getByText(/张老师、李老师/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '确认补全' }));

    await user.click(await screen.findByRole('checkbox', { name: '选择张老师' }));
    await user.click(screen.getByRole('checkbox', { name: '选择李老师' }));
    await user.click(screen.getByRole('button', { name: '批量登记例会' }));
    const meetingDialog = screen.getByRole('dialog', { name: '批量登记例会' });
    expect(within(meetingDialog).getByText('将为 2 位教师登记例会')).toBeVisible();
    await user.type(within(meetingDialog).getByLabelText('例会名称'), '八月例会');
    await user.click(within(meetingDialog).getByLabelText('参会'));
    await user.click(within(meetingDialog).getByRole('button', { name: '保存 2 条记录' }));

    await waitFor(async () => expect(await repositories.teacherRecords.list()).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByText('参会')).toHaveLength(2));
  });

  test('creates, edits, and archives teachers in the roster', async () => {
    const repositories = createTestRepositories();
    const user = userEvent.setup();
    renderTeacherPage(repositories);

    await user.click(await screen.findByRole('button', { name: '新增教师' }));
    const createDialog = screen.getByRole('dialog', { name: '新增教师' });
    await user.type(within(createDialog).getByLabelText('教师姓名'), '张老师');
    await user.type(within(createDialog).getByLabelText('系室'), '经济系');
    await user.click(within(createDialog).getByRole('button', { name: '保存' }));
    expect(await screen.findByText('张老师')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '编辑张老师' }));
    const editDialog = screen.getByRole('dialog', { name: '编辑教师' });
    await user.clear(within(editDialog).getByLabelText('系室'));
    await user.type(within(editDialog).getByLabelText('系室'), '金融系');
    await user.click(within(editDialog).getByRole('button', { name: '保存' }));
    expect(await screen.findByText('金融系')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '停用张老师' }));
    await user.click(within(screen.getByRole('dialog', { name: '停用教师' })).getByRole('button', { name: '确认停用' }));
    expect(await screen.findByText('暂无在岗教师')).toBeVisible();
  });

  test('adds a teacher record and a mentorship from teacher detail', async () => {
    const repositories = createTestRepositories();
    await seedTeachers(repositories, ['张老师']);
    const user = userEvent.setup();
    renderTeacherPage(repositories);

    await user.click(await screen.findByRole('button', { name: '查看张老师' }));
    const detail = screen.getByRole('dialog', { name: '张老师详情' });
    await user.click(within(detail).getByRole('button', { name: '新增年度记录' }));
    const recordDialog = screen.getByRole('dialog', { name: '新增年度记录' });
    await user.type(within(recordDialog).getByLabelText('标题'), '年度考核');
    await user.type(within(recordDialog).getByLabelText('内容'), '完成年度考核材料');
    await user.click(within(recordDialog).getByRole('button', { name: '保存' }));
    expect(await within(detail).findByText('年度考核')).toBeVisible();

    await user.click(within(detail).getByRole('button', { name: '科研导师' }));
    await user.click(within(detail).getByRole('button', { name: '新增指导学生' }));
    const mentorshipDialog = screen.getByRole('dialog', { name: '新增指导学生' });
    await user.type(within(mentorshipDialog).getByLabelText('学生姓名'), '王同学');
    await user.type(within(mentorshipDialog).getByLabelText('学年'), '2026');
    await user.type(within(mentorshipDialog).getByLabelText('年级'), '大三');
    await user.type(within(mentorshipDialog).getByLabelText('专业'), '经济学');
    await user.type(within(mentorshipDialog).getByLabelText('指导主题'), '数字经济');
    await user.type(within(mentorshipDialog).getByLabelText('备注'), '每周五同步论文进展');
    await user.click(within(mentorshipDialog).getByRole('button', { name: '保存' }));
    expect(await within(detail).findByText('王同学')).toBeVisible();
    expect(within(detail).getByText('备注：每周五同步论文进展')).toBeVisible();
  });

  test('edits and deletes teacher records and mentorships from teacher detail', async () => {
    const repositories = createTestRepositories();
    const teacher = await repositories.teachers.create({ name: '历史教师', department: '经济系', archivedAt: null });
    const record = await repositories.teacherRecords.create({ teacherId: teacher.id, year: '2025', type: 'meeting', date: '2025-06-01', title: '旧例会', content: '', status: 'attended', notes: '' });
    const mentorship = await repositories.mentorships.create({ teacherId: teacher.id, academicYear: '2025', studentName: '旧学生', grade: '大三', major: '经济学', topic: '旧主题', status: 'active', notes: '' });
    const user = userEvent.setup();
    renderTeacherPage(repositories);
    await user.click(await screen.findByRole('button', { name: '查看历史教师' }));
    const detail = screen.getByRole('dialog', { name: '历史教师详情' });
    await user.click(within(detail).getByRole('button', { name: '编辑旧例会' }));
    const recordDialog = screen.getByRole('dialog', { name: '编辑年度记录' });
    await user.clear(within(recordDialog).getByLabelText('标题'));
    await user.type(within(recordDialog).getByLabelText('标题'), '新例会');
    await user.click(within(recordDialog).getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await repositories.teacherRecords.get(record.id))?.title).toBe('新例会'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑年度记录' })).not.toBeInTheDocument());
    expect(await within(detail).findByText('新例会', { selector: 'strong' })).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: '删除新例会' }));
    await user.click(within(screen.getByRole('dialog', { name: '删除年度记录' })).getByRole('button', { name: '删除' }));
    await waitFor(async () => expect(await repositories.teacherRecords.get(record.id)).toBeUndefined());
    await user.click(within(detail).getByRole('button', { name: '科研导师' }));
    await user.click(within(detail).getByRole('button', { name: '编辑旧学生' }));
    const mentorshipDialog = screen.getByRole('dialog', { name: '编辑指导学生' });
    await user.clear(within(mentorshipDialog).getByLabelText('学生姓名'));
    await user.type(within(mentorshipDialog).getByLabelText('学生姓名'), '新学生');
    await user.click(within(mentorshipDialog).getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await repositories.mentorships.get(mentorship.id))?.studentName).toBe('新学生'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑指导学生' })).not.toBeInTheDocument());
    expect(await within(detail).findByText('新学生', { selector: 'strong' })).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: '删除新学生' }));
    await user.click(within(screen.getByRole('dialog', { name: '删除指导学生' })).getByRole('button', { name: '删除' }));
    await waitFor(async () => expect(await repositories.mentorships.get(mentorship.id)).toBeUndefined());
  });

  test('filters the mentorship summary by academic year, teacher, grade, and status', async () => {
    const repositories = createTestRepositories();
    const [first, second] = await seedTeachers(repositories, ['张老师', '李老师']);
    await repositories.mentorships.create({
      teacherId: first.id, academicYear: '2026', studentName: '王同学', grade: '大三', major: '经济学',
      topic: '数字经济', status: 'active', notes: '',
    });
    await repositories.mentorships.create({
      teacherId: second.id, academicYear: '2025', studentName: '赵同学', grade: '大二', major: '金融学',
      topic: '绿色金融', status: 'planned', notes: '',
    });
    const user = userEvent.setup();
    renderTeacherPage(repositories);

    await user.click(await screen.findByRole('button', { name: '科研导师汇总' }));
    await user.selectOptions(screen.getByLabelText('学年筛选'), '2026');
    await user.selectOptions(screen.getByLabelText('教师筛选'), first.id);
    await user.selectOptions(screen.getByLabelText('年级筛选'), '大三');
    await user.selectOptions(screen.getByLabelText('进展筛选'), 'active');

    expect(screen.getByText('王同学')).toBeVisible();
    expect(screen.queryByText('赵同学')).not.toBeInTheDocument();
    expect(screen.getByText('共 1 名学生')).toBeVisible();
  });

  test('exports only the currently filtered mentorship rows as a readable xlsx', async () => {
    const repositories = createTestRepositories();
    const [first, second] = await seedTeachers(repositories, ['张老师', '李老师']);
    await repositories.mentorships.create({ teacherId: first.id, academicYear: '2026', studentName: '王同学', grade: '大三', major: '经济学', topic: '数字经济', status: 'active', notes: '' });
    await repositories.mentorships.create({ teacherId: second.id, academicYear: '2025', studentName: '赵同学', grade: '大二', major: '金融学', topic: '绿色金融', status: 'planned', notes: '' });
    const download = captureDownload();
    const user = userEvent.setup();
    renderTeacherPage(repositories);
    await user.click(await screen.findByRole('button', { name: '科研导师汇总' }));
    await user.selectOptions(screen.getByLabelText('学年筛选'), '2026');
    await user.click(screen.getByRole('button', { name: '导出导师汇总 XLSX' }));

    const { blob, filename } = download.result();
    expect(filename).toMatch(/^科研导师汇总-\d{8}\.xlsx$/);
    const workbook = XLSX.read(await readBlob(blob!));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['科研导师汇总'])).toEqual([
      { 学生姓名: '王同学', 导师姓名: '张老师', 学年: '2026', 年级: '大三', 专业: '经济学', 指导主题: '数字经济', 进展: '进行中' },
    ]);
    download.restore();
  });

  test('shows archived teachers in historical year records and mentorship name filters', async () => {
    const repositories = createTestRepositories();
    const archived = await repositories.teachers.create({ name: '归档教师', department: '经济系', archivedAt: '2026-01-01T00:00:00.000Z' });
    await repositories.teacherRecords.create({ teacherId: archived.id, year: '2025', type: 'work', date: '2025-06-01', title: '历史工作', content: '', status: 'completed', notes: '' });
    await repositories.mentorships.create({ teacherId: archived.id, academicYear: '2025', studentName: '历史学生', grade: '大三', major: '经济学', topic: '历史主题', status: 'completed', notes: '' });
    const user = userEvent.setup();
    renderTeacherPage(repositories);
    await user.click(await screen.findByRole('button', { name: '年度记录' }));
    await user.selectOptions(screen.getByLabelText('年份'), '2025');
    expect(screen.getByRole('row', { name: /归档教师.*已完成/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '科研导师汇总' }));
    await user.selectOptions(screen.getByLabelText('教师筛选'), archived.id);
    expect(screen.getByRole('row', { name: /历史学生.*归档教师/ })).toBeVisible();
  });

  test('exports the current teacher annual summary with stable Chinese columns', async () => {
    const repositories = createTestRepositories();
    const [teacher] = await seedTeachers(repositories, ['张老师']);
    const year = new Date().getFullYear().toString();
    await repositories.teacherYearSummaries.create({ teacherId: teacher.id, year, state: 'reported' });
    const download = captureDownload();
    const user = userEvent.setup();
    renderTeacherPage(repositories);
    await user.click(await screen.findByRole('button', { name: '年度记录' }));
    await user.click(screen.getByRole('button', { name: '导出教师年度汇总 CSV' }));

    const { blob, filename } = download.result();
    expect(filename).toMatch(new RegExp(`^教师年度汇总-${year}-\\d{8}\\.csv$`));
    expect(new TextDecoder().decode(await readBlob(blob!))).toContain('教师姓名,系室,年份,填报状态,记录数\r\n张老师,经济系,');
    download.restore();
  });
});
