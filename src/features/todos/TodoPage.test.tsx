import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import type { Todo } from '../../domain/entities';
import { createTestRepositories } from '../../test/database';
import { TodoPage } from './TodoPage';

function todoFixture(overrides: Partial<Todo> = {}): Omit<Todo, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: '原有会议',
    description: '',
    role: 'personal',
    startAt: '2026-08-10T09:00',
    endAt: '2026-08-10T10:00',
    remindAt: null,
    priority: 'normal',
    status: 'open',
    sourceType: null,
    sourceId: null,
    ...overrides,
  };
}

describe('TodoPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/todos');
  });

  test('creates a dean todo and confirms a detected conflict', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoFixture());
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/todos']}><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await screen.findByText('原有会议');
    await user.click(screen.getByRole('button', { name: '新建待办' }));
    const formDialog = screen.getByRole('dialog', { name: '新建待办' });
    await user.type(within(formDialog).getByLabelText('标题'), '审核预算');
    await user.selectOptions(within(formDialog).getByLabelText('归属角色'), 'dean');
    await user.type(within(formDialog).getByLabelText('开始时间'), '2026-08-10T09:30');
    await user.type(within(formDialog).getByLabelText('结束时间'), '2026-08-10T10:30');
    await user.click(within(formDialog).getByRole('button', { name: '保存' }));

    const conflictDialog = await screen.findByRole('dialog', { name: '时间冲突' });
    expect(within(conflictDialog).getByText(/与以下日程冲突/)).toBeVisible();
    expect(within(conflictDialog).getByText('原有会议')).toBeVisible();
    await user.click(within(conflictDialog).getByRole('button', { name: '仍然保存' }));

    expect(await screen.findByText('审核预算')).toBeVisible();
    expect((await repositories.todos.list()).map((todo) => todo.title)).toContain('审核预算');
  });

  test('uses a fresh repository snapshot when saving before queries finish', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoFixture());
    const realList = repositories.todos.list.bind(repositories.todos);
    vi.spyOn(repositories.todos, 'list')
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementation(() => realList());
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await user.click(screen.getByRole('button', { name: '新建待办' }));
    const formDialog = screen.getByRole('dialog', { name: '新建待办' });
    await user.type(within(formDialog).getByLabelText('标题'), '快速提交');
    await user.type(within(formDialog).getByLabelText('开始时间'), '2026-08-10T09:30');
    await user.type(within(formDialog).getByLabelText('结束时间'), '2026-08-10T10:30');
    await user.click(within(formDialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('dialog', { name: '时间冲突' })).toBeVisible();
    expect((await realList()).map((todo) => todo.title)).toEqual(['原有会议']);
  });

  test('blocks saving when the conflict snapshot cannot be read', async () => {
    const repositories = createTestRepositories();
    vi.spyOn(repositories.courses, 'list').mockRejectedValue(new Error('read failed'));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await user.click(screen.getByRole('button', { name: '新建待办' }));
    const formDialog = screen.getByRole('dialog', { name: '新建待办' });
    await user.type(within(formDialog).getByLabelText('标题'), '不应保存');
    await user.type(within(formDialog).getByLabelText('开始时间'), '2026-08-10T09:30');
    await user.click(within(formDialog).getByRole('button', { name: '保存' }));

    expect(await within(formDialog).findByText('读取日程失败，未保存待办')).toBeVisible();
    expect(await repositories.todos.list()).toEqual([]);
  });

  test('filters todos and switches between list and board views', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoFixture({ title: '院长任务', role: 'dean' }));
    await repositories.todos.create(todoFixture({ title: '个人任务', role: 'personal', status: 'done' }));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await screen.findByText('院长任务');
    await user.selectOptions(screen.getByLabelText('角色筛选'), 'personal');
    expect(screen.queryByText('院长任务')).not.toBeInTheDocument();
    expect(screen.getByText('个人任务')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '看板视图' }));
    expect(screen.getByRole('heading', { name: '已完成' })).toBeVisible();
  });

  test('blocks a checked WeChat row until its date is confirmed', async () => {
    const repositories = createTestRepositories();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await screen.findByText('暂无待办');
    await user.click(screen.getByRole('button', { name: '微信文本导入' }));
    const dialog = screen.getByRole('dialog', { name: '微信文本导入' });
    await user.type(within(dialog).getByLabelText('微信对话文本'), '下次开会提交预算表 @院长助理');
    await user.click(within(dialog).getByRole('button', { name: '解析预览' }));

    expect(within(dialog).getByRole('button', { name: '导入选中' })).toBeDisabled();
    expect(within(dialog).getByText('请确认日期')).toBeVisible();
    await user.type(within(dialog).getByLabelText('第 1 行开始时间'), '2026-08-12T09:00');
    expect(within(dialog).getByRole('button', { name: '导入选中' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: '导入选中' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '微信文本导入' })).not.toBeInTheDocument());
    expect(screen.getByText('下次开会提交预算表')).toBeVisible();
  });

  test('cancels a conflicting WeChat batch without writing any selected row', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoFixture());
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await screen.findByText('原有会议');
    await user.click(screen.getByRole('button', { name: '微信文本导入' }));
    const importDialog = screen.getByRole('dialog', { name: '微信文本导入' });
    await user.type(within(importDialog).getByLabelText('微信对话文本'), '2026-08-10 09:30-10:30 导入冲突');
    await user.click(within(importDialog).getByRole('button', { name: '解析预览' }));
    await user.click(within(importDialog).getByRole('button', { name: '导入选中' }));

    const conflictDialog = await screen.findByRole('dialog', { name: '导入时间冲突' });
    expect(within(conflictDialog).getByText('原有会议')).toBeVisible();
    await user.click(within(conflictDialog).getByRole('button', { name: '取消' }));

    expect(screen.getByRole('dialog', { name: '微信文本导入' })).toBeVisible();
    expect((await repositories.todos.list()).map((todo) => todo.title)).toEqual(['原有会议']);
  });

  test('atomically imports a conflicting WeChat batch after explicit override', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoFixture());
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await screen.findByText('原有会议');
    await user.click(screen.getByRole('button', { name: '微信文本导入' }));
    const importDialog = screen.getByRole('dialog', { name: '微信文本导入' });
    await user.type(within(importDialog).getByLabelText('微信对话文本'), '2026-08-10 09:30-10:30 导入冲突');
    await user.click(within(importDialog).getByRole('button', { name: '解析预览' }));
    await user.click(within(importDialog).getByRole('button', { name: '导入选中' }));

    const conflictDialog = await screen.findByRole('dialog', { name: '导入时间冲突' });
    await user.click(within(conflictDialog).getByRole('button', { name: '仍然导入' }));

    await waitFor(async () => expect((await repositories.todos.list()).map((todo) => todo.title)).toEqual([
      '原有会议',
      '导入冲突',
    ]));
  });

  test('completes, restores, and deletes a todo', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoFixture({ title: '可操作任务' }));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><TodoPage /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    await screen.findByText('可操作任务');
    await user.click(screen.getByRole('button', { name: '完成可操作任务' }));
    expect(await screen.findByRole('button', { name: '恢复可操作任务' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '恢复可操作任务' }));
    expect(await screen.findByRole('button', { name: '完成可操作任务' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '删除可操作任务' }));
    await user.click(within(screen.getByRole('dialog', { name: '删除待办' })).getByRole('button', { name: '删除' }));

    expect(await screen.findByText('暂无待办')).toBeVisible();
    expect(await repositories.todos.list()).toEqual([]);
  });
});
