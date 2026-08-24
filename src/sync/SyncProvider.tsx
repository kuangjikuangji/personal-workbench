import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { WorkbenchDatabase } from '../db/database';
import type { Repositories } from '../db/repositories';
import {
  clearUserMirror,
  createRepositoryWriteLease,
  createSyncedRepositories,
} from '../db/syncedRepositories';
import { useAuth } from '../features/auth/AuthProvider';
import type { AuthIdentity } from '../features/auth/authTypes';
import type { Database } from '../lib/supabase/database.types';
import { createCloudGateway } from './cloudGateway';
import {
  createSyncEngine,
  lastFullSyncMetadataKey,
  type RemoteChangeListener,
  type SyncEngine,
} from './syncEngine';
import { resetSyncState, syncStore } from './syncStore';

export interface SyncProviderDependencies {
  client: SupabaseClient<Database>;
  database: WorkbenchDatabase;
  createGateway?: typeof createCloudGateway;
  createRepositories?: typeof createSyncedRepositories;
  createWriteLease?: typeof createRepositoryWriteLease;
  createEngine?: typeof createSyncEngine;
  clearMirror?: typeof clearUserMirror;
  online?: () => boolean;
}

type SyncContextValue = {
  retry: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function isCompletedMirror(value: unknown, userId: string): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const marker = value as { userId?: unknown; completedAt?: unknown };
  return marker.userId === userId && typeof marker.completedAt === 'string';
}

export function SyncProvider({
  children,
  dependencies,
  identity,
  onRemoteChange,
}: {
  children(repositories: Repositories): ReactNode;
  dependencies: SyncProviderDependencies;
  identity: AuthIdentity;
  onRemoteChange?: RemoteChangeListener;
}) {
  const auth = useAuth();
  const userId = identity.session.user.id;
  const {
    client,
    database,
    createGateway: buildGateway = createCloudGateway,
    createRepositories: buildRepositories = createSyncedRepositories,
    createWriteLease: buildWriteLease = createRepositoryWriteLease,
    createEngine: buildEngine = createSyncEngine,
    clearMirror = clearUserMirror,
    online = browserOnline,
  } = dependencies;
  const engineRef = useRef<SyncEngine | null>(null);
  const signOutRef = useRef(auth.signOut);
  signOutRef.current = auth.signOut;
  const [startup, setStartup] = useState<{
    userId: string;
    status: 'loading' | 'error' | 'ready';
  }>({ userId, status: 'loading' });
  const [startupAttempt, setStartupAttempt] = useState(0);
  const writeLease = useMemo(
    () => buildWriteLease(userId),
    [buildWriteLease, startupAttempt, userId],
  );
  const repositories = useMemo(
    () => buildRepositories(database, userId, writeLease),
    [buildRepositories, database, userId, writeLease],
  );
  const retry = useCallback(async () => {
    await engineRef.current?.retry();
  }, []);
  const handleAuthError = useCallback(() => {
    void signOutRef.current();
  }, []);
  const context = useMemo(() => ({ retry }), [retry]);

  useEffect(() => {
    let active = true;
    let offlineMirrorReady = false;
    let stopPromise: Promise<void> | null = null;
    let cleanupPromise: Promise<void> | null = null;
    const gateway = buildGateway(client, userId);
    const engine = buildEngine({
      db: database,
      gateway,
      userId,
      online,
      onRemoteChange,
      onAuthError: handleAuthError,
    });
    engineRef.current = engine;
    resetSyncState();

    const stop = () => {
      stopPromise ??= engine.stop();
      return stopPromise;
    };
    const cleanup = () => {
      writeLease.revoke();
      if (active) setStartup({ userId, status: 'loading' });
      cleanupPromise ??= (async () => {
        await stop().catch(() => undefined);
        await clearMirror(database, userId);
        resetSyncState();
      })();
      return cleanupPromise;
    };
    const unregisterCleanup = auth.registerSignOutCleanup(cleanup);
    setStartup({ userId, status: 'loading' });

    void (async () => {
      const [owner, completedSync] = await Promise.all([
        database.syncMetadata.get('mirrorOwner'),
        database.syncMetadata.get(lastFullSyncMetadataKey),
      ]);
      if (!active) return;
      offlineMirrorReady = !online()
        && owner?.value === userId
        && isCompletedMirror(completedSync?.value, userId);
      if (offlineMirrorReady) setStartup({ userId, status: 'ready' });

      const reconciled = await engine.start();
      if (!active || offlineMirrorReady) return;
      setStartup({ userId, status: reconciled ? 'ready' : 'error' });
    })().catch(() => {
      if (active && !offlineMirrorReady) setStartup({ userId, status: 'error' });
    });

    return () => {
      active = false;
      writeLease.revoke();
      unregisterCleanup();
      if (engineRef.current === engine) engineRef.current = null;
      void stop().catch(() => undefined);
    };
  }, [
    auth.registerSignOutCleanup,
    buildEngine,
    buildGateway,
    buildWriteLease,
    clearMirror,
    client,
    database,
    handleAuthError,
    online,
    onRemoteChange,
    startupAttempt,
    userId,
    writeLease,
  ]);

  if (startup.userId !== userId || startup.status === 'loading') {
    return <main className="auth-status" role="status">正在加载云端数据…</main>;
  }
  if (startup.status === 'error') {
    return (
      <main className="auth-status auth-error" role="alert">
        <p>云端数据尚未安全加载。</p>
        <button type="button" onClick={() => setStartupAttempt((attempt) => attempt + 1)}>重试</button>
      </main>
    );
  }

  return <SyncContext.Provider value={context}>{children(repositories)}</SyncContext.Provider>;
}

export function useSyncStatus() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSyncStatus must be used within SyncProvider');
  const state = useSyncExternalStore(syncStore.subscribe, syncStore.getState, syncStore.getState);
  return { ...state, retry: context.retry };
}
