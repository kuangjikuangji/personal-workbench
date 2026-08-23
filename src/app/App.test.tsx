import { act, render, screen } from '@testing-library/react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { expect, test, vi } from 'vitest';
import { WorkbenchDatabase } from '../db/database';
import { createSyncedRepositories } from '../db/syncedRepositories';
import type { AuthBackend } from '../features/auth/authTypes';
import type { Database } from '../lib/supabase/database.types';
import type { SyncProviderDependencies } from '../sync/SyncProvider';
import type { EntityKind } from '../sync/types';
import { App } from './App';

test('fails closed when cloud authentication is not configured', async () => {
  render(<App />);

  expect(await screen.findByRole('alert')).toHaveTextContent('系统尚未配置。');
  expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
});

test('uses injected synchronization dependencies with an injected authentication backend', async () => {
  const session = { user: { id: 'user-1' } } as Session;
  const backend: AuthBackend = {
    getSession: async () => session,
    subscribe: () => () => undefined,
    getProfile: async () => ({
      id: 'user-1',
      username: 'zhoujingjing',
      role: 'admin',
      isActive: true,
      mustChangePassword: false,
    }),
    signIn: async () => session,
    signOut: async () => undefined,
    completePasswordChange: async () => undefined,
  };
  const database = new WorkbenchDatabase(`app-sync-${crypto.randomUUID()}`);
  const start = vi.fn(async () => true);
  const dependencies: SyncProviderDependencies = {
    client: {} as SupabaseClient<Database>,
    database,
    createGateway: vi.fn(() => ({
      pullAll: async () => [],
      apply: async () => { throw new Error('unused gateway apply'); },
      subscribe: () => ({ ready: Promise.resolve(), unsubscribe: async () => undefined }),
    })),
    createRepositories: vi.fn((db, userId) => createSyncedRepositories(db, userId)),
    createEngine: vi.fn(() => ({ start, retry: async () => true, stop: async () => undefined })),
  };

  const view = render(<App authBackend={backend} syncDependencies={dependencies} />);

  expect(await screen.findByRole('navigation', { name: '主导航' })).toBeInTheDocument();
  expect(start).toHaveBeenCalledTimes(1);

  view.unmount();
  await database.delete();
});

test('refetches an active feature query after the sync engine accepts a realtime change', async () => {
  window.location.hash = '#/todos';
  const session = { user: { id: 'user-1' } } as Session;
  const backend: AuthBackend = {
    getSession: async () => session,
    subscribe: () => () => undefined,
    getProfile: async () => ({
      id: 'user-1',
      username: 'zhoujingjing',
      role: 'admin',
      isActive: true,
      mustChangePassword: false,
    }),
    signIn: async () => session,
    signOut: async () => undefined,
    completePasswordChange: async () => undefined,
  };
  const database = new WorkbenchDatabase(`app-realtime-${crypto.randomUUID()}`);
  let onRemoteChange: ((entityKind: EntityKind) => void) | undefined;
  const dependencies: SyncProviderDependencies = {
    client: {} as SupabaseClient<Database>,
    database,
    createGateway: vi.fn(() => ({
      pullAll: async () => [],
      apply: async () => { throw new Error('unused gateway apply'); },
      subscribe: () => ({ ready: Promise.resolve(), unsubscribe: async () => undefined }),
    })),
    createRepositories: vi.fn((db, userId) => createSyncedRepositories(db, userId)),
    createEngine: vi.fn((options) => {
      onRemoteChange = options.onRemoteChange;
      return { start: async () => true, retry: async () => true, stop: async () => undefined };
    }),
  };
  const view = render(<App authBackend={backend} syncDependencies={dependencies} />);

  try {
    expect(await screen.findByRole('heading', { name: '待办管理' })).toBeInTheDocument();
    expect(await screen.findByText('暂无待办')).toBeInTheDocument();
    await database.todos.add({
      id: 'remote-todo',
      title: '跨端实时待办',
      description: '',
      role: 'personal',
      startAt: null,
      endAt: null,
      remindAt: null,
      priority: 'normal',
      status: 'open',
      sourceType: null,
      sourceId: null,
      createdAt: '2026-08-23T08:00:00.000Z',
      updatedAt: '2026-08-23T08:00:00.000Z',
    });

    expect(onRemoteChange).toBeTypeOf('function');
    await act(async () => { onRemoteChange?.('todos'); });
    expect(await screen.findByText('跨端实时待办')).toBeInTheDocument();
  } finally {
    view.unmount();
    window.location.hash = '';
    await database.delete();
  }
});
