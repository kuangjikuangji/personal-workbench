import { liveQuery, type Table } from 'dexie';
import type { WorkbenchDatabase } from '../db/database';
import {
  CloudGatewayError,
  type CloudChange,
  type CloudGateway,
  type CloudSubscription,
} from './cloudGateway';
import { entityRegistry } from './entityRegistry';
import { compactOperationBatches } from './operationQueue';
import { setSyncState } from './syncStore';
import type { EntityKind, SyncOperation } from './types';

const retryDelays = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
const versionPrefix = 'remoteVersion:';
export const lastFullSyncMetadataKey = 'lastFullSyncAt';

type Version = {
  modifiedAt: string;
  deleted: boolean;
};

export type RemoteChangeListener = (entityKinds: ReadonlySet<EntityKind>) => void;

type SyncEngineOptions = {
  db: WorkbenchDatabase;
  gateway: CloudGateway;
  userId: string;
  now?: () => Date;
  online?: () => boolean;
  onRemoteChange?: RemoteChangeListener;
  onAuthError?: () => void;
  realtimeReadyTimeoutMs?: number;
};

export type SyncEngine = {
  start: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  stop: () => Promise<void>;
};

function timestampValue(timestamp: string): bigint | null {
  const match = timestamp.match(/^(.*?)(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;

  const [, seconds, fraction = '', timezone] = match;
  const wholeSecond = Date.parse(`${seconds}${timezone}`);
  if (Number.isNaN(wholeSecond)) return null;

  const nanoseconds = fraction.padEnd(9, '0').slice(0, 9);
  return BigInt(wholeSecond) * 1_000_000n + BigInt(nanoseconds || '0');
}

function laterTimestamp(left: string, right: string | null): string {
  if (!right) return left;
  return compareTimestamps(right, left) >= 0 ? right : left;
}

function compareVersions(left: Version, right: Version): number {
  const timeDifference = compareTimestamps(left.modifiedAt, right.modifiedAt);
  if (timeDifference !== 0) return timeDifference;
  if (left.deleted === right.deleted) return 0;
  return left.deleted ? 1 : -1;
}

function compareTimestamps(left: string, right: string): number {
  const leftValue = timestampValue(left);
  const rightValue = timestampValue(right);
  if (leftValue === null || rightValue === null) return left.localeCompare(right);
  if (leftValue === rightValue) return 0;
  return leftValue > rightValue ? 1 : -1;
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
      && compareTimestamps(change.deletedAt, updatedAt) >= 0,
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
  {
    excludedOperationIds = [],
    acknowledgedOperationIds = [],
  }: {
    excludedOperationIds?: readonly string[];
    acknowledgedOperationIds?: readonly string[];
  } = {},
): Promise<boolean> {
  const table = localTable(db, change.entityKind);
  const key = versionKey(change);
  const excludedIds = new Set(excludedOperationIds);

  return db.transaction('rw', [table, db.syncOperations, db.syncMetadata], async () => {
    const [current, marker, operations] = await Promise.all([
      table.get(change.entityId),
      db.syncMetadata.get(key),
      db.syncOperations
        .filter(({ id, entityKind, entityId }) => (
          !excludedIds.has(id)
          && entityKind === change.entityKind
          && entityId === change.entityId
        ))
        .toArray(),
    ]);
    const mirrored = newestVersion([
      recordVersion(current),
      isVersion(marker?.value) ? marker.value : null,
    ]);
    const pending = newestVersion(operations.map(operationVersion));
    const remote = remoteVersion(change);
    let accepted = true;

    // A non-acknowledged local mutation at the same timestamp still owns the
    // mirror. The server acknowledgement will exclude all of its compacted
    // source operations before applying the authoritative row.
    if (pending && compareTimestamps(pending.modifiedAt, remote.modifiedAt) >= 0) {
      accepted = false;
    }
    if (mirrored && compareTimestamps(remote.modifiedAt, mirrored.modifiedAt) < 0) {
      accepted = false;
    }

    // Equal client timestamps are resolved by server arrival order. Persisting
    // the server timestamp makes pull and Realtime delivery idempotent while
    // allowing a later equal-timestamp row to supersede an earlier one.
    const markerVersion = isVersion(marker?.value) ? marker.value : null;
    if (
      markerVersion
      && marker
      && compareTimestamps(remote.modifiedAt, markerVersion.modifiedAt) === 0
      && compareTimestamps(change.serverUpdatedAt, marker.updatedAt) <= 0
    ) {
      accepted = false;
    }

    if (accepted) {
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
    }

    if (acknowledgedOperationIds.length > 0) {
      await db.syncOperations.bulkDelete([...acknowledgedOperationIds]);
    }
    return accepted;
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
  onRemoteChange,
  onAuthError,
  realtimeReadyTimeoutMs = 10_000,
}: SyncEngineOptions): SyncEngine {
  type ManagedSubscription = CloudSubscription & {
    hasBeenReady: boolean;
    releasePromise: Promise<void> | null;
  };

  const readinessTimeout = Number.isFinite(realtimeReadyTimeoutMs) && realtimeReadyTimeoutMs > 0
    ? realtimeReadyTimeoutMs
    : 10_000;
  let active = false;
  let stopped = false;
  let authBlocked = false;
  let authErrorSignaled = false;
  let connectedOnce = false;
  let channelDisconnected = false;
  let channelReady = false;
  let initialPullComplete = false;
  let synchronizationActive = false;
  let remoteWorkCount = 0;
  let lastError: string | null = null;
  let stateRevision = 0;
  let currentSubscription: ManagedSubscription | null = null;
  let readinessInFlight: Promise<boolean> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;
  let syncInFlight: Promise<boolean> | null = null;
  let synchronizationRequested = false;
  let remoteWork = Promise.resolve();
  let queueSubscription: { unsubscribe: () => void } | null = null;
  let initializationPromise: Promise<boolean> | null = null;
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
      remoteWorkCount > 0
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
    if (!active || authBlocked || !online() || retryTimer !== null) return;
    const delay = retryDelays[Math.min(retryIndex, retryDelays.length - 1)];
    retryIndex += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void synchronize();
    }, delay);
  }

  async function handleFailure(error: unknown): Promise<void> {
    lastError = errorMessage(error);
    if (error instanceof CloudGatewayError && error.kind === 'auth') {
      authBlocked = true;
      clearRetryTimer();
      if (!authErrorSignaled) {
        authErrorSignaled = true;
        try {
          onAuthError?.();
        } catch {
          // The engine remains auth-blocked even if a lifecycle observer fails.
        }
      }
    }
    if (error instanceof CloudGatewayError && error.kind === 'network') scheduleRetry();
    await publishState();
  }

  function notifyRemoteChanges(entityKinds: ReadonlySet<EntityKind>): void {
    if (!active || entityKinds.size === 0) return;
    onRemoteChange?.(new Set(entityKinds));
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

  async function annotateFailedOperations(
    sourceOperationIds: readonly string[],
    error: unknown,
  ): Promise<void> {
    await Promise.all(sourceOperationIds.map(async (id) => {
      const operation = await db.syncOperations.get(id);
      if (!operation) return;
      await db.syncOperations.update(id, {
        retryCount: operation.retryCount + 1,
        lastError: errorMessage(error),
      });
    }));
  }

  async function flushQueue(): Promise<void> {
    const acceptedKinds = new Set<EntityKind>();
    try {
      while (active && !authBlocked) {
        const operations = await db.syncOperations
          .where('userId')
          .equals(userId)
          .sortBy('createdAt');
        if (!active || operations.length === 0) return;

        const { batches, canceledOperationIds } = compactOperationBatches(operations);
        if (canceledOperationIds.length > 0) {
          await db.syncOperations.bulkDelete(canceledOperationIds);
          if (!active) return;
          await publishState();
        }

        for (const { operation, sourceOperationIds } of batches) {
          if (!active || authBlocked) return;
          try {
            const acknowledgement = await gateway.apply(operation);
            if (!active || authBlocked) return;
            const accepted = await applyRemoteChange(db, acknowledgement.change, {
              excludedOperationIds: sourceOperationIds,
              acknowledgedOperationIds: sourceOperationIds,
            });
            if (accepted) acceptedKinds.add(acknowledgement.change.entityKind);
            await publishState();
          } catch (error) {
            if (active) await annotateFailedOperations(sourceOperationIds, error);
            throw error;
          }
        }
      }
    } finally {
      notifyRemoteChanges(acceptedKinds);
    }
  }

  async function releaseSubscription(subscription = currentSubscription): Promise<void> {
    if (!subscription) return;
    if (currentSubscription === subscription) currentSubscription = null;
    if (!subscription.releasePromise) {
      subscription.releasePromise = subscription.unsubscribe();
    }
    await subscription.releasePromise;
  }

  function openSubscription(): ManagedSubscription {
    const subscription = gateway.subscribe(handleRemoteChange, handleChannelStatus);
    const managed: ManagedSubscription = {
      ...subscription,
      hasBeenReady: false,
      releasePromise: null,
    };
    currentSubscription = managed;
    return managed;
  }

  function ensureChannelReady(): Promise<boolean> {
    if (!active || authBlocked) return Promise.resolve(false);
    if (channelReady && currentSubscription) return Promise.resolve(true);
    if (readinessInFlight) return readinessInFlight;

    readinessInFlight = (async () => {
      let subscription = currentSubscription;
      if (subscription?.hasBeenReady && !channelReady) {
        await releaseSubscription(subscription);
        subscription = null;
      }
      if (!subscription) subscription = openSubscription();

      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const outcome = await Promise.race([
          subscription.ready.then(() => 'ready' as const),
          stopRequested.then(() => 'stopped' as const),
          new Promise<'timed-out'>((resolve) => {
            timeout = setTimeout(() => resolve('timed-out'), readinessTimeout);
          }),
        ]);

        if (outcome === 'stopped' || !active) return false;
        if (outcome === 'timed-out') {
          channelReady = false;
          try {
            await releaseSubscription(subscription);
          } catch {
            // The readiness failure remains the actionable error.
          }
          throw new CloudGatewayError('network');
        }

        subscription.hasBeenReady = true;
        channelReady = true;
        connectedOnce = true;
        channelDisconnected = false;
        await publishState();
        return active;
      } catch (error) {
        channelReady = false;
        try {
          await releaseSubscription(subscription);
        } catch {
          // Preserve the original readiness or transport failure.
        }
        throw error;
      } finally {
        if (timeout !== null) clearTimeout(timeout);
      }
    })().finally(() => {
      readinessInFlight = null;
    });
    return readinessInFlight;
  }

  async function performSynchronization(): Promise<boolean> {
    if (!active || authBlocked) return false;
    if (!online()) {
      await publishState();
      return false;
    }

    lastError = null;
    await publishState();
    if (!active) return false;
    try {
      const ready = await ensureChannelReady();
      if (!ready || !active || authBlocked) return false;
      const changes = await gateway.pullAll();
      if (!active) return false;
      const acceptedKinds = new Set<EntityKind>();
      try {
        for (const change of changes) {
          if (!active) return false;
          if (await applyRemoteChange(db, change)) acceptedKinds.add(change.entityKind);
        }
      } finally {
        notifyRemoteChanges(acceptedKinds);
      }
      if (!channelReady) throw new CloudGatewayError('network');
      // The catch-up snapshot is complete only after pullAll has exhausted
      // every deterministic page. Queue state continues to keep the UI in a
      // syncing/error state independently while uploads are flushed.
      initialPullComplete = true;
      await flushQueue();
      if (!active || !channelReady || authBlocked) return false;
      const completedAt = now().toISOString();
      await db.syncMetadata.put({
        key: lastFullSyncMetadataKey,
        value: { userId, completedAt },
        updatedAt: completedAt,
      });
      if (!active) return false;
      retryIndex = 0;
      clearRetryTimer();
      return true;
    } catch (error) {
      await handleFailure(error);
      return false;
    }
  }

  function synchronize(): Promise<boolean> {
    if (!active || authBlocked) return Promise.resolve(false);
    if (syncInFlight) {
      synchronizationRequested = true;
      return syncInFlight;
    }

    synchronizationActive = true;
    syncInFlight = (async () => {
      await publishState();
      if (!active) return false;
      let completed = false;
      do {
        synchronizationRequested = false;
        completed = await performSynchronization();
        if (!completed) synchronizationRequested = false;
      } while (active && synchronizationRequested);
      return completed;
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
            if (lastError !== null || authBlocked) return;
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
    if (!active || authBlocked) return;
    remoteWork = remoteWork.then(async () => {
      if (!active) return;
      remoteWorkCount += 1;
      try {
        await publishState();
        if (!active) return;
        const accepted = await applyRemoteChange(db, change);
        if (active && accepted) notifyRemoteChanges(new Set([change.entityKind]));
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
      const recovering = connectedOnce && channelDisconnected;
      channelReady = true;
      if (currentSubscription) currentSubscription.hasBeenReady = true;
      void publishState();
      connectedOnce = true;
      channelDisconnected = false;
      if (recovering && !synchronizationActive && !authBlocked) void retry();
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      channelReady = false;
      channelDisconnected = true;
      void publishState();
      if (connectedOnce && !synchronizationActive && !authBlocked) {
        void handleFailure(new CloudGatewayError('network'));
      }
    }
  }

  function handleResume(): void {
    if (active && !authBlocked && online()) void retry();
  }

  async function initialize(): Promise<boolean> {
    await ensureMirrorOwner();
    if (!active) return false;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleResume);
      window.addEventListener('focus', handleResume);
    }
    await Promise.race([observeQueue(), stopRequested]);
    if (!active) return false;
    // Install the Realtime observer even while offline. Synchronization still
    // returns immediately offline, while a locally mirrored/approved session
    // can continue to accept already-delivered channel events.
    if (!currentSubscription) {
      try {
        openSubscription();
      } catch (error) {
        await handleFailure(error);
        return false;
      }
    }
    return synchronize();
  }

  function start(): Promise<boolean> {
    if (initializationPromise) return initializationPromise;
    if (stopped) return Promise.resolve(false);
    active = true;
    initializationPromise = initialize();
    return initializationPromise;
  }

  async function retry(): Promise<boolean> {
    if (!active || authBlocked) return false;
    clearRetryTimer();
    retryIndex = 0;
    // Opening synchronously gives a small configured readiness budget its full
    // duration instead of spending it on state publication before subscribe.
    if (online() && !currentSubscription && !readinessInFlight) {
      try {
        openSubscription();
      } catch (error) {
        await handleFailure(error);
        return false;
      }
    }
    return synchronize();
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
    stopPromise = (async () => {
      const cleanupPromise = releaseSubscription().catch(() => undefined);
      const initialization = (initializationPromise ?? Promise.resolve(false)).catch(() => false);
      await Promise.all([initialization, cleanupPromise]);
      const inFlight = syncInFlight;
      if (inFlight) await inFlight;
      await remoteWork.catch(() => undefined);
    })();
    return stopPromise;
  }

  return { start, retry, stop };
}
