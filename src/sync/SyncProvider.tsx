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
import { clearUserMirror, createSyncedRepositories } from '../db/syncedRepositories';
import { useAuth } from '../features/auth/AuthProvider';
import type { AuthIdentity } from '../features/auth/authTypes';
import type { Database } from '../lib/supabase/database.types';
import { createCloudGateway } from './cloudGateway';
import { createSyncEngine, type SyncEngine } from './syncEngine';
import { resetSyncState, syncStore } from './syncStore';

export interface SyncProviderDependencies {
  client: SupabaseClient<Database>;
  database: WorkbenchDatabase;
  createGateway?: typeof createCloudGateway;
  createRepositories?: typeof createSyncedRepositories;
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

export function SyncProvider({
  children,
  dependencies,
  identity,
}: {
  children(repositories: Repositories): ReactNode;
  dependencies: SyncProviderDependencies;
  identity: AuthIdentity;
}) {
  const auth = useAuth();
  const userId = identity.session.user.id;
  const {
    client,
    database,
    createGateway: buildGateway = createCloudGateway,
    createRepositories: buildRepositories = createSyncedRepositories,
    createEngine: buildEngine = createSyncEngine,
    clearMirror = clearUserMirror,
    online = browserOnline,
  } = dependencies;
  const repositories = useMemo(
    () => buildRepositories(database, userId),
    [buildRepositories, database, userId],
  );
  const engineRef = useRef<SyncEngine | null>(null);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const retry = useCallback(async () => {
    await engineRef.current?.retry();
  }, []);
  const context = useMemo(() => ({ retry }), [retry]);

  useEffect(() => {
    let active = true;
    let stopPromise: Promise<void> | null = null;
    let cleanupPromise: Promise<void> | null = null;
    const gateway = buildGateway(client, userId);
    const engine = buildEngine({ db: database, gateway, userId, online });
    engineRef.current = engine;
    resetSyncState();

    const stop = () => {
      stopPromise ??= engine.stop();
      return stopPromise;
    };
    const cleanup = () => {
      cleanupPromise ??= (async () => {
        await stop();
        await clearMirror(database, userId);
        resetSyncState();
      })();
      return cleanupPromise;
    };
    const unregisterCleanup = auth.registerSignOutCleanup(cleanup);

    void (async () => {
      const owner = await database.syncMetadata.get('mirrorOwner');
      if (!active) return;
      if (!online() && owner?.value === userId) setReadyUserId(userId);
      await engine.start();
      if (active) setReadyUserId(userId);
    })().catch(() => {
      if (active) setReadyUserId(userId);
    });

    return () => {
      active = false;
      unregisterCleanup();
      if (engineRef.current === engine) engineRef.current = null;
      void stop();
    };
  }, [auth.registerSignOutCleanup, buildEngine, buildGateway, clearMirror, client, database, online, userId]);

  if (readyUserId !== userId) {
    return <main className="auth-status" role="status">正在加载云端数据…</main>;
  }

  return <SyncContext.Provider value={context}>{children(repositories)}</SyncContext.Provider>;
}

export function useSyncStatus() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSyncStatus must be used within SyncProvider');
  const state = useSyncExternalStore(syncStore.subscribe, syncStore.getState, syncStore.getState);
  return { ...state, retry: context.retry };
}
