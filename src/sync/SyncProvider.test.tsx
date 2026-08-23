import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../app/App';
import { WorkbenchDatabase } from '../db/database';
import { createSyncedRepositories } from '../db/syncedRepositories';
import { AuthGate } from '../features/auth/AuthGate';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import type { AuthBackend, AuthIdentity, Profile } from '../features/auth/authTypes';
import type { Database } from '../lib/supabase/database.types';
import { getWorkbenchSupabaseClient } from '../lib/supabase/client';
import type { CloudGateway } from './cloudGateway';
import { SyncProvider, type SyncProviderDependencies, useSyncStatus } from './SyncProvider';
import type { SyncEngine } from './syncEngine';
import { setSyncState } from './syncStore';
import type { SyncOperation } from './types';

const userId = 'user-1';
const session = { user: { id: userId } } as Session;
const profile: Profile = {
  id: userId,
  username: 'zhoujingjing',
  role: 'admin',
  isActive: true,
  mustChangePassword: false,
};
const identity: AuthIdentity = { session, profile };
const client = {} as SupabaseClient<Database>;
const databases: WorkbenchDatabase[] = [];

function createDatabase(): WorkbenchDatabase {
  const database = new WorkbenchDatabase(`sync-provider-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

function authBackend(overrides: Partial<AuthBackend> = {}): AuthBackend {
  return {
    getSession: async () => null,
    subscribe: () => () => undefined,
    getProfile: async () => profile,
    signIn: async () => session,
    signOut: async () => undefined,
    completePasswordChange: async () => undefined,
    ...overrides,
  };
}

function gateway(): CloudGateway {
  return {
    pullAll: async () => [],
    apply: async () => { throw new Error('unused gateway apply'); },
    subscribe: () => ({ ready: Promise.resolve(), unsubscribe: async () => undefined }),
  };
}

function engine(overrides: Partial<SyncEngine> = {}): SyncEngine {
  return {
    start: vi.fn(async () => true),
    retry: vi.fn(async () => true),
    stop: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function markCompletedMirror(database: WorkbenchDatabase, owner = userId): Promise<void> {
  const completedAt = '2026-08-23T00:00:00.000Z';
  await database.syncMetadata.bulkPut([
    { key: 'mirrorOwner', value: owner, updatedAt: completedAt },
    { key: 'lastFullSyncAt', value: { userId: owner, completedAt }, updatedAt: completedAt },
  ]);
}

function dependencies(
  database: WorkbenchDatabase,
  syncEngine: SyncEngine,
  overrides: Partial<SyncProviderDependencies> = {},
): SyncProviderDependencies {
  return {
    client,
    database,
    createGateway: vi.fn(() => gateway()),
    createRepositories: vi.fn((db, scopedUserId) => createSyncedRepositories(db, scopedUserId)),
    createEngine: vi.fn(() => syncEngine),
    ...overrides,
  };
}

function SignOutButton() {
  const auth = useAuth();
  return <button type="button" onClick={() => { void auth.signOut(); }}>end session</button>;
}

function SyncProbe() {
  const sync = useSyncStatus();
  return (
    <div>
      <span>{sync.status}:{sync.pendingCount}</span>
      <button type="button" onClick={() => { void sync.retry(); }}>retry sync</button>
    </div>
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

test('reuses one configured Supabase client across component rerenders', () => {
  const clients: SupabaseClient<Database>[] = [];
  const config = {
    url: `https://${crypto.randomUUID()}.supabase.co`,
    anonKey: `test-${crypto.randomUUID()}`,
  };
  function ClientProbe() {
    clients.push(getWorkbenchSupabaseClient(config));
    return null;
  }

  const view = render(<ClientProbe />);
  view.rerender(<ClientProbe />);

  expect(clients).toHaveLength(2);
  expect(clients[1]).toBe(clients[0]);
});

test('does not create synchronized repositories or an engine before normal authentication', async () => {
  const anonymousDependencies = dependencies(createDatabase(), engine());
  const anonymous = render(
    <App authBackend={authBackend()} syncDependencies={anonymousDependencies} />,
  );

  expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(anonymousDependencies.createRepositories).not.toHaveBeenCalled();
  expect(anonymousDependencies.createEngine).not.toHaveBeenCalled();
  anonymous.unmount();

  const mustChangeDependencies = dependencies(createDatabase(), engine());
  render(
    <App
      authBackend={authBackend({
        getSession: async () => session,
        getProfile: async () => ({ ...profile, mustChangePassword: true }),
      })}
      syncDependencies={mustChangeDependencies}
    />,
  );

  expect(await screen.findByRole('heading', { name: '修改初始密码' })).toBeInTheDocument();
  expect(mustChangeDependencies.createRepositories).not.toHaveBeenCalled();
  expect(mustChangeDependencies.createEngine).not.toHaveBeenCalled();
});

test('creates one user-scoped repository and engine and preserves them across rerenders', async () => {
  const database = createDatabase();
  const syncEngine = engine();
  const syncDependencies = dependencies(database, syncEngine);
  const backend = authBackend({ getSession: async () => session });
  const view = render(<App authBackend={backend} syncDependencies={syncDependencies} />);

  expect(await screen.findByRole('navigation', { name: '主导航' })).toBeInTheDocument();
  view.rerender(<App authBackend={backend} syncDependencies={syncDependencies} />);
  await act(async () => undefined);

  expect(syncDependencies.createRepositories).toHaveBeenCalledTimes(1);
  expect(syncDependencies.createRepositories).toHaveBeenCalledWith(database, userId);
  expect(syncDependencies.createGateway).toHaveBeenCalledTimes(1);
  expect(syncDependencies.createGateway).toHaveBeenCalledWith(client, userId);
  expect(syncDependencies.createEngine).toHaveBeenCalledTimes(1);
  expect(syncDependencies.createEngine).toHaveBeenCalledWith(expect.objectContaining({
    db: database,
    gateway: expect.any(Object),
    userId,
  }));
  expect(syncEngine.start).toHaveBeenCalledTimes(1);
});

test('gates business content on the initial cloud load and exposes store state with retry', async () => {
  const database = createDatabase();
  let finishInitialLoad: (() => void) | undefined;
  const initialLoad = new Promise<boolean>((resolve) => {
    finishInitialLoad = () => resolve(true);
  });
  const syncEngine = engine({ start: vi.fn(() => initialLoad) });
  const syncDependencies = dependencies(database, syncEngine, { online: () => true });

  render(
    <AuthProvider backend={authBackend()}>
      <SyncProvider dependencies={syncDependencies} identity={identity}>
        {() => <><div>business content</div><SyncProbe /></>}
      </SyncProvider>
    </AuthProvider>,
  );

  expect(screen.getByRole('status')).toHaveTextContent('正在加载云端数据');
  expect(screen.queryByText('business content')).not.toBeInTheDocument();
  setSyncState({ status: 'syncing', pendingCount: 2, message: null });
  finishInitialLoad?.();
  expect(await screen.findByText('business content')).toBeInTheDocument();
  expect(screen.getByText('syncing:2')).toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole('button', { name: 'retry sync' }));
  expect(syncEngine.retry).toHaveBeenCalledTimes(1);
});

test('allows offline startup only from an existing mirror owned by the same user', async () => {
  const database = createDatabase();
  await markCompletedMirror(database);
  let finishStart: (() => void) | undefined;
  const starting = new Promise<boolean>((resolve) => { finishStart = () => resolve(false); });
  const syncEngine = engine({ start: vi.fn(() => starting) });

  render(
    <AuthProvider backend={authBackend()}>
      <SyncProvider
        dependencies={dependencies(database, syncEngine, { online: () => false })}
        identity={identity}
      >
        {() => <div>same-user offline mirror</div>}
      </SyncProvider>
    </AuthProvider>,
  );

  expect(await screen.findByText('same-user offline mirror')).toBeInTheDocument();
  expect(syncEngine.start).toHaveBeenCalledTimes(1);
  finishStart?.();
});

test('keeps a same-user offline mirror closed until a completed full sync is verified', async () => {
  const database = createDatabase();
  await database.syncMetadata.put({
    key: 'mirrorOwner',
    value: userId,
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  let finishStart: (() => void) | undefined;
  const starting = new Promise<boolean>((resolve) => { finishStart = () => resolve(false); });
  const syncEngine = engine({ start: vi.fn(() => starting) });

  render(
    <AuthProvider backend={authBackend()}>
      <SyncProvider
        dependencies={dependencies(database, syncEngine, { online: () => false })}
        identity={identity}
      >
        {() => <div>unverified same-user mirror</div>}
      </SyncProvider>
    </AuthProvider>,
  );

  await waitFor(() => expect(syncEngine.start).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status')).toHaveTextContent('正在加载云端数据');
  expect(screen.queryByText('unverified same-user mirror')).not.toBeInTheDocument();

  finishStart?.();
  expect(await screen.findByRole('alert')).toHaveTextContent('云端数据尚未安全加载');
  expect(screen.queryByText('unverified same-user mirror')).not.toBeInTheDocument();
});

test('keeps a different user\'s offline mirror behind the cloud-loading gate', async () => {
  const database = createDatabase();
  await markCompletedMirror(database, 'another-user');
  let finishStart: (() => void) | undefined;
  const starting = new Promise<boolean>((resolve) => { finishStart = () => resolve(false); });
  const syncEngine = engine({ start: vi.fn(() => starting) });
  const syncDependencies = dependencies(database, syncEngine, { online: () => false });

  render(
    <AuthProvider backend={authBackend()}>
      <SyncProvider dependencies={syncDependencies} identity={identity}>
        {() => <div>different-user offline mirror</div>}
      </SyncProvider>
    </AuthProvider>,
  );

  await waitFor(() => expect(syncEngine.start).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status')).toHaveTextContent('正在加载云端数据');
  expect(screen.queryByText('different-user offline mirror')).not.toBeInTheDocument();

  finishStart?.();
  expect(await screen.findByRole('alert')).toHaveTextContent('云端数据尚未安全加载');
  expect(screen.queryByText('different-user offline mirror')).not.toBeInTheDocument();
});

test('keeps online pull failure closed instead of exposing unverified business data', async () => {
  const database = createDatabase();
  const syncEngine = engine({ start: vi.fn(async () => false) });

  render(
    <AuthProvider backend={authBackend()}>
      <SyncProvider
        dependencies={dependencies(database, syncEngine, { online: () => true })}
        identity={identity}
      >
        {() => <div>unverified online data</div>}
      </SyncProvider>
    </AuthProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('云端数据尚未安全加载');
  expect(screen.queryByText('unverified online data')).not.toBeInTheDocument();
});

test('fails closed on owner lookup errors and can retry the complete startup boundary', async () => {
  const database = createDatabase();
  const originalGet = database.syncMetadata.get.bind(database.syncMetadata);
  vi.spyOn(database.syncMetadata, 'get')
    .mockRejectedValueOnce(new Error('owner lookup failed'))
    .mockImplementation(originalGet);
  const firstEngine = engine();
  const secondEngine = engine();
  const createEngine = vi.fn()
    .mockReturnValueOnce(firstEngine)
    .mockReturnValueOnce(secondEngine);

  render(
    <AuthProvider backend={authBackend()}>
      <SyncProvider
        dependencies={dependencies(database, firstEngine, { createEngine })}
        identity={identity}
      >
        {() => <div>owner-verified content</div>}
      </SyncProvider>
    </AuthProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('云端数据尚未安全加载');
  expect(screen.queryByText('owner-verified content')).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole('button', { name: '重试' }));

  expect(await screen.findByText('owner-verified content')).toBeInTheDocument();
  expect(firstEngine.start).not.toHaveBeenCalled();
  expect(firstEngine.stop).toHaveBeenCalledTimes(1);
  expect(secondEngine.start).toHaveBeenCalledTimes(1);
});

test('fails closed when engine ownership setup rejects and retries with a new engine', async () => {
  const database = createDatabase();
  const firstEngine = engine({ start: vi.fn(async () => { throw new Error('owner clear failed'); }) });
  const secondEngine = engine();
  const createEngine = vi.fn()
    .mockReturnValueOnce(firstEngine)
    .mockReturnValueOnce(secondEngine);

  render(
    <AuthProvider backend={authBackend()}>
      <SyncProvider
        dependencies={dependencies(database, firstEngine, { createEngine })}
        identity={identity}
      >
        {() => <div>cleared-owner content</div>}
      </SyncProvider>
    </AuthProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('云端数据尚未安全加载');
  expect(screen.queryByText('cleared-owner content')).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole('button', { name: '重试' }));

  expect(await screen.findByText('cleared-owner content')).toBeInTheDocument();
  expect(firstEngine.stop).toHaveBeenCalledTimes(1);
  expect(secondEngine.start).toHaveBeenCalledTimes(1);
});

test('awaits engine stop and current-user mirror cleanup before revealing anonymous UI', async () => {
  const database = createDatabase();
  await database.teachers.add({
    id: 'teacher-1',
    name: '张老师',
    department: '',
    archivedAt: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  await database.syncMetadata.put({
    key: 'mirrorOwner',
    value: userId,
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  await database.syncOperations.add({
    id: 'operation-1',
    userId,
    entityKind: 'teachers',
    entityId: 'teacher-1',
    type: 'delete',
    localCreate: false,
    record: null,
    clientUpdatedAt: '2026-08-23T00:00:00.000Z',
    retryCount: 0,
    lastError: null,
    createdAt: '2026-08-23T00:00:00.000Z',
  } satisfies SyncOperation);
  const events: string[] = [];
  let finishStop: (() => void) | undefined;
  const stopping = new Promise<void>((resolve) => {
    finishStop = () => {
      events.push('engine stopped');
      resolve();
    };
  });
  const syncEngine = engine({
    stop: vi.fn(() => {
      events.push('stop requested');
      return stopping;
    }),
  });
  const syncDependencies = dependencies(database, syncEngine);
  let emitSession: ((nextSession: Session | null) => void) | undefined;
  const backend = authBackend({
    getSession: async () => session,
    subscribe: (callback) => {
      emitSession = callback;
      return () => undefined;
    },
    signOut: async () => {
      events.push('backend signed out');
      expect(await database.teachers.count()).toBe(0);
      expect(await database.syncOperations.where('userId').equals(userId).count()).toBe(0);
      expect(await database.syncMetadata.get('mirrorOwner')).toBeUndefined();
    },
  });

  render(
    <AuthProvider backend={backend}>
      <AuthGate>
        {(authenticatedIdentity) => (
          <SyncProvider
            dependencies={syncDependencies}
            identity={authenticatedIdentity}
          >
            {() => <><div>protected workbench</div><SignOutButton /></>}
          </SyncProvider>
        )}
      </AuthGate>
    </AuthProvider>,
  );

  await userEvent.setup().click(await screen.findByRole('button', { name: 'end session' }));
  await waitFor(() => expect(events).toEqual(['stop requested']));
  expect(screen.getByText('protected workbench')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '登录' })).not.toBeInTheDocument();
  expect(await database.teachers.count()).toBe(1);
  act(() => { emitSession?.(session); });
  await act(async () => undefined);
  expect(events).toEqual(['stop requested']);

  finishStop?.();

  expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(events).toEqual(['stop requested', 'engine stopped', 'backend signed out']);
  expect(syncEngine.stop).toHaveBeenCalledTimes(1);
  expect(syncEngine.start).toHaveBeenCalledTimes(1);
});
