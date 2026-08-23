import { liveQuery, type Table } from 'dexie';
import type { WorkbenchDatabase } from '../db/database';
import type { CloudChange, CloudGateway } from './cloudGateway';
import { entityRegistry } from './entityRegistry';
import { setSyncState } from './syncStore';
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
export async function applyRemoteChange(
  db: WorkbenchDatabase,
  change: CloudChange,
  excludedOperationId?: string,
): Promise<boolean> {
  const table = localTable(db, change.entityKind);
  const key = versionKey(change);

  return db.transaction('rw', [table, db.syncOperations, db.syncMetadata], async () => {
    const [current, marker, operations] = await Promise.all([
      table.get(change.entityId),
      db.syncMetadata.get(key),
      db.syncOperations
        .filter(({ id, entityKind, entityId }) => (
          id !== excludedOperationId
          && entityKind === change.entityKind
          && entityId === change.entityId
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
  let stopped = false;
  let connectedOnce = false;
  let channelDisconnected = false;
  let channelReady = false;
  let initialPullComplete = false;
  let synchronizationActive = false;
  let remoteWorkCount = 0;
  let lastError: string | null = null;
  let stateRevision = 0;
  let unsubscribe: (() => Promise<void>) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;
  let syncInFlight: Promise<void> | null = null;
  let synchronizationRequested = false;
  let remoteWork = Promise.resolve();
  let queueSubscription: { unsubscribe: () => void } | null = null;
  let initializationPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let signalStop: (() => void) | undefined;
  const stopRequested = new Promise<void>((resolve) => { signalStop = resolve; });

  async function pendingCount(): Promise<number> {
    return db.syncOperations.where('userId').equals(userId).count();
  }

  function publishKnownCount(count: number): void {
    stateRevision += 1;
    if (!active) return;

    if (!online()) {
      setSyncState({ status: 'offline', pendingCount: count, message: null });
    } else if (lastError) {
      setSyncState({ status: 'error', pendingCount: count, message: lastError });
    } else if (
      synchronizationActive
      || remoteWorkCount > 0
      || !channelReady
      || !initialPullComplete
      || count > 0
    ) {
      setSyncState({ status: 'syncing', pendingCount: count, message: null });
    } else {
      setSyncState({ status: 'synced', pendingCount: 0, message: null });
    }
  }

  async function publishState(): Promise<void> {
    const revision = stateRevision + 1;
    stateRevision = revision;
    const count = await pendingCount();
    if (!active || revision !== stateRevision) return;
    publishKnownCount(count);
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
    lastError = errorMessage(error);
    await publishState();
    scheduleRetry();
  }

  async function ensureMirrorOwner(): Promise<void> {
    const owner = await db.syncMetadata.get('mirrorOwner');
    if (!active || owner?.value === userId) return;

    const businessTables = [...new Set(
      Object.values(entityRegistry).map(({ localTable: tableName }) => db.table(tableName)),
    )];
    await db.transaction(
      'rw',
      [...businessTables, db.syncOperations, db.syncMetadata],
      async () => {
        if (!active) return;
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
    while (active) {
      const operations = await db.syncOperations
        .where('userId')
        .equals(userId)
        .sortBy('createdAt');
      if (operations.length === 0) return;

      for (const operation of operations) {
        if (!active) return;
        try {
          const acknowledgement = await gateway.apply(operation);
          if (!active) return;
          await applyRemoteChange(db, acknowledgement.change, operation.id);
          await db.syncOperations.delete(operation.id);
        } catch (error) {
          await db.syncOperations.update(operation.id, {
            retryCount: operation.retryCount + 1,
            lastError: errorMessage(error),
          });
          throw error;
        }
      }
    }
  }

  async function performSynchronization(): Promise<boolean> {
    if (!active) return false;
    if (!online()) {
      await publishState();
      return false;
    }

    lastError = null;
    await publishState();
    if (!active) return false;
    try {
      const changes = await gateway.pullAll();
      if (!active) return false;
      for (const change of changes) await applyRemoteChange(db, change);
      await flushQueue();
      if (!active) return false;
      retryIndex = 0;
      initialPullComplete = true;
      clearRetryTimer();
      return true;
    } catch (error) {
      await handleFailure(error);
      return false;
    }
  }

  function synchronize(): Promise<void> {
    if (!active) return Promise.resolve();
    if (syncInFlight) {
      synchronizationRequested = true;
      return syncInFlight;
    }

    synchronizationActive = true;
    syncInFlight = (async () => {
      await publishState();
      if (!active) return;
      do {
        synchronizationRequested = false;
        const completed = await performSynchronization();
        if (!completed) synchronizationRequested = false;
      } while (active && synchronizationRequested);
    })().finally(async () => {
      synchronizationActive = false;
      syncInFlight = null;
      await publishState();
    });
    return syncInFlight;
  }

  function observeQueue(): Promise<void> {
    return new Promise((resolve) => {
      let initialObservation = true;
      queueSubscription = liveQuery(() => pendingCount()).subscribe({
        next(count) {
          if (!active) return;
          if (count === 0) {
            // A count emitted from an invalidated live query may already be
            // stale. Recount before publishing the only state that can be
            // interpreted as fully synchronized.
            void publishState();
          } else {
            publishKnownCount(count);
          }
          if (initialObservation) {
            initialObservation = false;
            resolve();
          } else if (count > 0 && online()) {
            // A retry timer owns recovery after an error. Queue observations
            // still wake normal idle/in-flight synchronization, but cannot
            // turn retry metadata writes into a tight retry loop.
            if (lastError !== null && retryTimer !== null) return;
            void synchronize();
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
      remoteWorkCount += 1;
      try {
        await publishState();
        if (!active) return;
        await applyRemoteChange(db, change);
      } catch (error) {
        await handleFailure(error);
      } finally {
        remoteWorkCount -= 1;
        await publishState();
      }
    });
  }

  function handleChannelStatus(status: string): void {
    if (!active) return;
    if (status === 'SUBSCRIBED') {
      channelReady = true;
      void publishState();
      if (connectedOnce && channelDisconnected) void retry();
      connectedOnce = true;
      channelDisconnected = false;
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      channelReady = false;
      channelDisconnected = true;
      void publishState();
    }
  }

  function handleResume(): void {
    if (active && online()) void retry();
  }

  async function initialize(): Promise<void> {
    await ensureMirrorOwner();
    if (!active) return;

    const subscription = gateway.subscribe(handleRemoteChange, handleChannelStatus);
    unsubscribe = subscription.unsubscribe;
    await Promise.race([subscription.ready, stopRequested]);
    if (!active) return;
    channelReady = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleResume);
      window.addEventListener('focus', handleResume);
    }
    await Promise.race([observeQueue(), stopRequested]);
    if (!active) return;
    await synchronize();
  }

  function start(): Promise<void> {
    if (initializationPromise) return initializationPromise;
    if (stopped) return Promise.resolve();
    active = true;
    initializationPromise = initialize();
    return initializationPromise;
  }

  async function retry(): Promise<void> {
    if (!active) return;
    clearRetryTimer();
    retryIndex = 0;
    await synchronize();
  }

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;
    stopped = true;
    active = false;
    stateRevision += 1;
    signalStop?.();
    clearRetryTimer();
    queueSubscription?.unsubscribe();
    queueSubscription = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleResume);
      window.removeEventListener('focus', handleResume);
    }
    const cleanup = unsubscribe;
    unsubscribe = null;
    const cleanupPromise = cleanup?.() ?? Promise.resolve();
    stopPromise = (async () => {
      await Promise.all([initializationPromise ?? Promise.resolve(), cleanupPromise]);
      const inFlight = syncInFlight;
      if (inFlight) await inFlight;
      await remoteWork.catch(() => undefined);
    })();
    return stopPromise;
  }

  return { start, retry, stop };
}
