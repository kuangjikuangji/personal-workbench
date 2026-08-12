import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
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
});
