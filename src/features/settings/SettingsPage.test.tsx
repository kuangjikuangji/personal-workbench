import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import type { Repositories } from '../../db/repositories';
import { exportBackup } from '../../db/backup';
import { createTestRepositories } from '../../test/database';
import { SettingsPage } from './SettingsPage';

function renderSettings(repositories: Repositories) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <RepositoryProvider repositories={repositories}>
      <QueryClientProvider client={client}><MemoryRouter><SettingsPage /></MemoryRouter></QueryClientProvider>
    </RepositoryProvider>,
  );
  return { client, view };
}

afterEach(() => vi.restoreAllMocks());

describe('SettingsPage', () => {
  test('validates a selected backup and previews every table count before confirmation', async () => {
    const source = createTestRepositories();
    await source.todos.create({ title: '恢复待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const backup = await exportBackup(source);
    const target = createTestRepositories();
    renderSettings(target);

    fireEvent.change(screen.getByLabelText('选择备份文件'), {
      target: { files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })] },
    });

    const preview = await screen.findByRole('dialog', { name: '恢复备份预览' });
    expect(within(preview).getByText('待办')).toBeVisible();
    expect(within(preview).getByText('教师年度汇总')).toBeVisible();
    expect(within(preview).getAllByText('1')).toHaveLength(1);
    expect(within(preview).getAllByText('0')).toHaveLength(13);
    expect(within(preview).getByRole('button', { name: '确认覆盖当前数据' })).toBeVisible();
  });

  test('downloads the complete current backup before restoring in one transaction', async () => {
    const source = createTestRepositories();
    await source.todos.create({ title: '恢复待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const backup = await exportBackup(source);
    const target = createTestRepositories();
    await target.todos.create({ title: '当前待办', description: '', role: 'head', startAt: null, endAt: null, remindAt: null, priority: 'high', status: 'open' });
    const events: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => { events.push('download'); return 'blob:test'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const repositories: Repositories = {
      ...target,
      transaction: async (work) => { events.push('transaction'); return target.transaction(work); },
    };
    const user = userEvent.setup();
    renderSettings(repositories);
    fireEvent.change(screen.getByLabelText('选择备份文件'), {
      target: { files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })] },
    });

    await user.click(await screen.findByRole('button', { name: '确认覆盖当前数据' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('备份恢复成功'));
    expect(events).toEqual(['download', 'transaction']);
    expect(await target.todos.list()).toEqual([expect.objectContaining({ title: '恢复待办' })]);
  });

  test('removes stale business snapshots after restore so returning pages read restored data', async () => {
    const source = createTestRepositories();
    const restoredTodo = await source.todos.create({ title: '恢复待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const restoredTeacher = await source.teachers.create({ name: '恢复教师', department: '经济系', archivedAt: null });
    const backup = await exportBackup(source);
    const target = createTestRepositories();
    const oldTodo = await target.todos.create({ title: '旧待办', description: '', role: 'head', startAt: null, endAt: null, remindAt: null, priority: 'high', status: 'open' });
    const oldTeacher = await target.teachers.create({ name: '旧教师', department: '金融系', archivedAt: null });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { client } = renderSettings(target);
    client.setQueryData(['todos'], [oldTodo]);
    client.setQueryData(['teachers'], [oldTeacher]);
    fireEvent.change(screen.getByLabelText('选择备份文件'), {
      target: { files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })] },
    });

    await userEvent.setup().click(await screen.findByRole('button', { name: '确认覆盖当前数据' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('备份恢复成功'));
    expect(client.getQueryData(['todos'])).toBeUndefined();
    expect(client.getQueryData(['teachers'])).toBeUndefined();
    await expect(client.fetchQuery({ queryKey: ['todos'], queryFn: () => target.todos.list() })).resolves.toEqual([restoredTodo]);
    await expect(client.fetchQuery({ queryKey: ['teachers'], queryFn: () => target.teachers.list() })).resolves.toEqual([restoredTeacher]);
  });

  test('keeps existing query snapshots when restore transaction fails', async () => {
    const source = createTestRepositories();
    const backup = await exportBackup(source);
    const target = createTestRepositories();
    const oldTodo = await target.todos.create({ title: '保留待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const repositories: Repositories = { ...target, transaction: async () => { throw new Error('注入失败'); } };
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { client } = renderSettings(repositories);
    client.setQueryData(['todos'], [oldTodo]);
    fireEvent.change(screen.getByLabelText('选择备份文件'), {
      target: { files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })] },
    });

    await userEvent.setup().click(await screen.findByRole('button', { name: '确认覆盖当前数据' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('恢复失败：注入失败'));
    expect(client.getQueryData(['todos'])).toEqual([oldTodo]);
  });

  test('reports an invalid backup without offering destructive confirmation', async () => {
    renderSettings(createTestRepositories());
    fireEvent.change(screen.getByLabelText('选择备份文件'), {
      target: { files: [new File(['{"schemaVersion":99}'], 'bad.json', { type: 'application/json' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('不支持的备份版本');
    expect(screen.queryByRole('button', { name: '确认覆盖当前数据' })).not.toBeInTheDocument();
  });

  test('shows backup and install panels on the settings route', () => {
    renderSettings(createTestRepositories());
    expect(screen.getByRole('heading', { name: '备份与恢复' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '安装应用' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '外观与通知' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '主题' })).toBeVisible();
  });
});
