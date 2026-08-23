import { liveQuery, type Table } from 'dexie';
import type { WorkbenchDatabase } from '../db/database';
import type { CloudChange, CloudGateway } from './cloudGateway';
import { entityRegistry } from './entityRegistry';
import { setSyncState, syncStore } from './syncStore';
import type { EntityKind, SyncOperation } from './types';

const retryDelays = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
const versionPrefix = 'remoteVersion:';

type Version = {
  modifiedAt: string;
  deleted: boolean;
};

type SyncEngineOptions = {
  db: WorkbenchDatabase;
  gateway: CloudGateway;
  userId: string;
  now?: () => Date;
  online?: () => boolean;
};

export type SyncEngine = {
  start: () => Promise<void>;
  retry: () => Promise<void>;
  stop: () => Promise<void>;
};

function timestampValue(timestamp: string): number {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function laterTimestamp(left: string, right: string | null): string {
  if (!right) return left;
  return timestampValue(right) >= timestampValue(left) ? right : left;
}

function compareVersions(left: Version, right: Version): number {
  const timeDifference = timestampValue(left.modifiedAt) - timestampValue(right.modifiedAt);
  if (timeDifference !== 0) return timeDifference;
  if (left.deleted === right.deleted) return 0;
  return left.deleted ? 1 : -1;
}

function isVersion(value: unknown): value is Version {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Version>;
  return typeof candidate.modifiedAt === 'string' && typeof candidate.deleted === 'boolean';
}

function recordVersion(value: unknown): Version | null {
  if (typeof value !== 'object' || value === null) return null;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === 'string' ? { modifiedAt: updatedAt, deleted: false } : null;
}

function newestVersion(versions: Array<Version | null>): Version | null {
  return versions.reduce<Version | null>((latest, candidate) => {
    if (!candidate) return latest;
    if (!latest || compareVersions(candidate, latest) > 0) return candidate;
    return latest;
  }, null);
}

function versionKey(change: Pick<CloudChange, 'entityKind' | 'entityId'>): string {
  return `${versionPrefix}${change.entityKind}:${change.entityId}`;
}

function remoteVersion(change: CloudChange): Version {
  const updatedAt = recordVersion(change.value)?.modifiedAt ?? change.clientUpdatedAt;
  const modifiedAt = laterTimestamp(updatedAt, change.deletedAt);
  return {
    modifiedAt,
    deleted: change.deletedAt !== null
      && timestampValue(change.deletedAt) >= timestampValue(updatedAt),
  };
}

function operationVersion(operation: SyncOperation): Version {
  return {
    modifiedAt: operation.clientUpdatedAt,
    deleted: operation.type === 'delete',
  };
}

function localTable(db: WorkbenchDatabase, entityKind: EntityKind): Table<Record<string, unknown>, string> {
  return db.table<Record<string, unknown>, string>(entityRegistry[entityKind].localTable);
}

/**
 * Applies pull, Realtime, and acknowledgement changes through one idempotent
 * last-modified-wins path. Accepted tombstones retain a compact version marker
 * so an older pull cannot resurrect a record that is absent from the mirror.
 */
export async function applyRemoteChange(db: WorkbenchDatabase, change: CloudChange): Promise<boolean> {
  const table = localTable(db, change.entityKind);
  const key = versionKey(change);

  return db.transaction('rw', [table, db.syncOperations, db.syncMetadata], async () => {
    const [current, marker, operations] = await Promise.all([
      table.get(change.entityId),
      db.syncMetadata.get(key),
      db.syncOperations
        .filter(({ entityKind, entityId }) => (
          entityKind === change.entityKind && entityId === change.entityId
        ))
        .toArray(),
    ]);
    const local = newestVersion([
      recordVersion(current),
      isVersion(marker?.value) ? marker.value : null,
      ...operations.map(operationVersion),
    ]);
    const remote = remoteVersion(change);

    if (local && compareVersions(remote, local) < 0) return false;

    if (remote.deleted) {
      await table.delete(change.entityId);
    } else {
      await table.put(change.value as unknown as Record<string, unknown>);
    }
    await db.syncMetadata.put({
      key,
      value: remote,
      updatedAt: change.serverUpdatedAt,
    });
    return true;
  });
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Cloud sync failed.';
}

export function createSyncEngine({
  db,
  gateway,
  userId,
  now = () => new Date(),
  online = browserOnline,
}: SyncEngineOptions): SyncEngine {
  let active = false;
  let started = false;
  let connectedOnce = false;
  let channelDisconnected = false;
  let unsubscribe: (() => Promise<void>) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;
  let syncInFlight: Promise<void> | null = null;
  let synchronizationRequested = false;
  let remoteWork = Promise.resolve();
  let queueSubscription: { unsubscribe: () => void } | null = null;

  async function pendingCount(): Promise<number> {
    return db.syncOperations.where('userId').equals(userId).count();
  }

  async function publish(status: 'syncing' | 'synced' | 'offline' | 'error', message: string | null): Promise<void> {
    if (!active) return;
    setSyncState({ status, pendingCount: await pendingCount(), message });
  }

  function clearRetryTimer(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry(): void {
    if (!active || !online() || retryTimer !== null) return;
    const delay = retryDelays[Math.min(retryIndex, retryDelays.length - 1)];
    retryIndex += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void synchronize();
    }, delay);
  }

  async function handleFailure(error: unknown): Promise<void> {
    await publish(online() ? 'error' : 'offline', online() ? errorMessage(error) : null);
    scheduleRetry();
  }

  async function ensureMirrorOwner(): Promise<void> {
    const owner = await db.syncMetadata.get('mirrorOwner');
    if (owner?.value === userId) return;

    const businessTables = [...new Set(
      Object.values(entityRegistry).map(({ localTable: tableName }) => db.table(tableName)),
    )];
    await db.transaction(
      'rw',
      [...businessTables, db.syncOperations, db.syncMetadata],
      async () => {
        await Promise.all(businessTables.map((table) => table.clear()));
        await db.syncOperations.clear();
        await db.syncMetadata.clear();
        await db.syncMetadata.put({
          key: 'mirrorOwner',
          value: userId,
          updatedAt: now().toISOString(),
        });
      },
    );
  }

  async function flushQueue(): Promise<void> {
    const operations = await db.syncOperations
      .where('userId')
      .equals(userId)
      .sortBy('createdAt');

    for (const operation of operations) {
      if (!active) return;
      try {
        const acknowledgement = await gateway.apply(operation);
        if (!active) return;
        await applyRemoteChange(db, acknowledgement.change);
        await db.syncOperations.delete(operation.id);
        await publish('syncing', null);
      } catch (error) {
        await db.syncOperations.update(operation.id, {
          retryCount: operation.retryCount + 1,
          lastError: errorMessage(error),
        });
        throw error;
      }
    }
  }

  async function performSynchronization(): Promise<void> {
    if (!online()) {
      await publish('offline', null);
      return;
    }

    await publish('syncing', null);
    try {
      const changes = await gateway.pullAll();
      if (!active) return;
      for (const change of changes) await applyRemoteChange(db, change);
      await flushQueue();
      if (!active) return;
      retryIndex = 0;
      clearRetryTimer();
      await publish('synced', null);
    } catch (error) {
      await handleFailure(error);
    }
  }

  function synchronize(): Promise<void> {
    if (!active) return Promise.resolve();
    if (syncInFlight) {
      synchronizationRequested = true;
      return syncInFlight;
    }

    syncInFlight = (async () => {
      do {
        synchronizationRequested = false;
        await performSynchronization();
      } while (active && synchronizationRequested);
    })().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  }

  function observeQueue(): Promise<void> {
    return new Promise((resolve) => {
      let initialObservation = true;
      let observedPending = 0;
      queueSubscription = liveQuery(() => pendingCount()).subscribe({
        next(count) {
          if (!active) return;
          const state = syncStore.getState();
          setSyncState({ ...state, pendingCount: count });
          if (initialObservation) {
            initialObservation = false;
            observedPending = count;
            resolve();
          } else if (count > observedPending && online()) {
            observedPending = count;
            void synchronize();
          } else {
            observedPending = count;
          }
        },
        error(error) {
          initialObservation = false;
          resolve();
          void handleFailure(error);
        },
      });
    });
  }

  function handleRemoteChange(change: CloudChange): void {
    if (!active) return;
    remoteWork = remoteWork.then(async () => {
      if (!active) return;
      await publish('syncing', null);
      try {
        await applyRemoteChange(db, change);
        await publish('synced', null);
      } catch (error) {
        await handleFailure(error);
      }
    });
  }

  function handleChannelStatus(status: string): void {
    if (!active) return;
    if (status === 'SUBSCRIBED') {
      if (connectedOnce && channelDisconnected) void retry();
      connectedOnce = true;
      channelDisconnected = false;
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      channelDisconnected = true;
    }
  }

  function handleResume(): void {
    if (active && online()) void retry();
  }

  async function start(): Promise<void> {
    if (started) return syncInFlight ?? Promise.resolve();
    started = true;
    active = true;
    await ensureMirrorOwner();
    if (!active) return;

    unsubscribe = gateway.subscribe(handleRemoteChange, handleChannelStatus);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleResume);
      window.addEventListener('focus', handleResume);
    }
    await observeQueue();
    if (!active) return;
    await synchronize();
  }

  async function retry(): Promise<void> {
    if (!active) return;
    clearRetryTimer();
    retryIndex = 0;
    await synchronize();
  }

  async function stop(): Promise<void> {
    if (!active && !unsubscribe) return;
    active = false;
    clearRetryTimer();
    queueSubscription?.unsubscribe();
    queueSubscription = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleResume);
      window.removeEventListener('focus', handleResume);
    }
    const cleanup = unsubscribe;
    unsubscribe = null;
    if (cleanup) await cleanup();
    const inFlight = syncInFlight;
    if (inFlight) await inFlight;
    await remoteWork.catch(() => undefined);
  }

  return { start, retry, stop };
}
