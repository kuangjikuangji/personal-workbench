import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RepositoryProvider } from '../../app/providers';
import { createTestRepositories } from '../../test/database';
import { DashboardPage } from './DashboardPage';

test('links overview cards to filtered destinations and opens every quick create flow', async () => {
  const repositories = createTestRepositories();
  await repositories.teachers.create({ name: '张老师', department: '统计系', archivedAt: null });
  await repositories.students.create({ name: '李同学', program: '硕士', cohort: '2025', contact: '', notes: '', archivedAt: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><DashboardPage now={() => new Date('2026-08-10T12:00:00+08:00')} /></MemoryRouter></QueryClientProvider></RepositoryProvider>);

  expect(await screen.findByRole('link', { name: /今日待办/ })).toHaveAttribute('href', '/todos?status=open&date=2026-08-10');
  expect(screen.getByRole('link', { name: /逾期待办/ })).toHaveAttribute('href', '/todos?status=open&due=overdue&before=2026-08-10');
  expect(screen.getByRole('link', { name: /今日课程/ })).toHaveAttribute('href', '/calendar?date=2026-08-10&kind=course');

  await user.click(screen.getByRole('button', { name: '新建待办' }));
  expect(screen.getByRole('dialog', { name: '新建待办' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '关闭' }));
  await user.click(screen.getByRole('button', { name: '记录灵感' }));
  expect(screen.getByRole('dialog', { name: '记录灵感' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '关闭' }));
  await user.click(screen.getByRole('button', { name: '记录教师工作' }));
  expect(await screen.findByLabelText('选择教师')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '关闭' }));
  await user.click(screen.getByRole('button', { name: '记录学生日常' }));
  expect(await screen.findByLabelText('选择学生')).toBeVisible();
});

test('refreshes the overview after a quick-created todo is saved', async () => {
  const repositories = createTestRepositories();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><DashboardPage now={() => new Date('2026-08-10T12:00:00+08:00')} /></MemoryRouter></QueryClientProvider></RepositoryProvider>);

  expect(await screen.findByRole('link', { name: /个人\s*0/ })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '新建待办' }));
  await user.type(screen.getByRole('textbox', { name: '标题' }), '快捷任务');
  await user.click(screen.getByRole('button', { name: '保存' }));

  expect(await screen.findByRole('link', { name: /个人\s*1/ })).toBeVisible();
});
