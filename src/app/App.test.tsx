import { render, screen } from '@testing-library/react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { expect, test, vi } from 'vitest';
import { WorkbenchDatabase } from '../db/database';
import { createSyncedRepositories } from '../db/syncedRepositories';
import type { AuthBackend } from '../features/auth/authTypes';
import type { Database } from '../lib/supabase/database.types';
import type { SyncProviderDependencies } from '../sync/SyncProvider';
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
  const start = vi.fn(async () => undefined);
  const dependencies: SyncProviderDependencies = {
    client: {} as SupabaseClient<Database>,
    database,
    createGateway: vi.fn(() => ({
      pullAll: async () => [],
      apply: async () => { throw new Error('unused gateway apply'); },
      subscribe: () => ({ ready: Promise.resolve(), unsubscribe: async () => undefined }),
    })),
    createRepositories: vi.fn((db, userId) => createSyncedRepositories(db, userId)),
    createEngine: vi.fn(() => ({ start, retry: async () => undefined, stop: async () => undefined })),
  };

  const view = render(<App authBackend={backend} syncDependencies={dependencies} />);

  expect(await screen.findByRole('navigation', { name: '主导航' })).toBeInTheDocument();
  expect(start).toHaveBeenCalledTimes(1);

  view.unmount();
  await database.delete();
});
