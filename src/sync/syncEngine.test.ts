import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkbenchDatabase } from '../db/database';
import type { CloudApplyResult, CloudChange, CloudGateway } from './cloudGateway';
import { applyRemoteChange, createSyncEngine as buildSyncEngine, type SyncEngine } from './syncEngine';
import { resetSyncState, syncStore } from './syncStore';
import type { SyncOperation } from './types';

const userId = 'user-1';
const now = () => new Date('2026-08-23T12:00:00.000Z');
const firstTime = '2026-08-23T08:00:00.000Z';
const secondTime = '2026-08-23T09:00:00.000Z';
const thirdTime = '2026-08-23T10:00:00.000Z';

const databases: WorkbenchDatabase[] = [];
const engines: SyncEngine[] = [];

function createDatabase(): WorkbenchDatabase {
  const db = new WorkbenchDatabase(`sync-engine-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

async function markCurrentOwner(db: WorkbenchDatabase): Promise<void> {
  await db.syncMetadata.put({ key: 'mirrorOwner', value: userId, updatedAt: firstTime });
}

function createSyncEngine(options: Parameters<typeof buildSyncEngine>[0]): SyncEngine {
  const engine = buildSyncEngine(options);
  engines.push(engine);
  return engine;
}

function teacher(updatedAt = secondTime, name = '张老师', id = 'teacher-1') {
  return {
    id,
    name,
    department: '',
    archivedAt: null,
    createdAt: firstTime,
    updatedAt,
  };
}

function teacherChange(overrides: Partial<CloudChange> = {}): CloudChange {
  return {
    entityKind: 'teachers',
    entityId: 'teacher-1',
    value: teacher(),
    deletedAt: null,
    clientUpdatedAt: secondTime,
    serverUpdatedAt: secondTime,
    ...overrides,
  } as CloudChange;
}

function settingChange(): CloudChange {
  return {
    entityKind: 'app_settings',
    entityId: 'dashboard-layout',
    value: {
      key: 'dashboard-layout',
      value: ['todos', 'ideas'],
      updatedAt: secondTime,
    },
    deletedAt: null,
    clientUpdatedAt: secondTime,
    serverUpdatedAt: secondTime,
  };
}

function operation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: crypto.randomUUID(),
    userId,
    entityKind: 'teachers',
    entityId: 'teacher-1',
    type: 'upsert',
    localCreate: false,
    record: teacher(),
    clientUpdatedAt: secondTime,
    retryCount: 0,
    lastError: null,
    createdAt: secondTime,
    ...overrides,
  };
}

type GatewayControls = {
  gateway: CloudGateway;
  emit: (change: CloudChange) => void;
  status: (status: string) => void;
  unsubscribed: () => number;
};

function createGateway(options: {
  pullAll?: () => Promise<CloudChange[]>;
  apply?: (operation: SyncOperation) => Promise<CloudApplyResult>;
  events?: string[];
  readiness?: 'immediate' | 'manual';
} = {}): GatewayControls {
  let onChange: ((change: CloudChange) => void) | undefined;
  let onStatus: ((status: string) => void) | undefined;
  let unsubscribeCount = 0;
  let markReady: (() => void) | undefined;
  const ready = options.readiness === 'manual'
    ? new Promise<void>((resolve) => { markReady = resolve; })
    : Promise.resolve();

  return {
    gateway: {
      async pullAll() {
        options.events?.push('pull');
        return options.pullAll?.() ?? [];
      },
      async apply(pending) {
        return options.apply?.(pending) ?? { applied: true, change: teacherChange() };
      },
      subscribe(changeHandler, statusHandler) {
        options.events?.push('subscribe');
        onChange = changeHandler;
        onStatus = statusHandler;
        const unsubscribe = async () => { unsubscribeCount += 1; };
        return { ready, unsubscribe };
      },
    },
    emit(change) {
      if (!onChange) throw new Error('Gateway has not been subscribed');
      onChange(change);
    },
    status(status) {
      if (!onStatus) throw new Error('Gateway has not been subscribed');
      onStatus(status);
      if (status === 'SUBSCRIBED') markReady?.();
    },
    unsubscribed: () => unsubscribeCount,
  };
}

async function waitForValue<T>(read: () => Promise<T>, expected: T): Promise<void> {
  await vi.waitFor(async () => expect(await read()).toEqual(expected));
}

async function settleIndexedDb(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitForAsyncCondition(condition: () => boolean): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  expect(condition()).toBe(true);
}

beforeEach(() => {
  resetSyncState();
  vi.useRealTimers();
});

afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.stop()));
  vi.restoreAllMocks();
  vi.useRealTimers();
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe('sync engine startup and remote merge', () => {
  test('subscribes before pulling so a newer realtime event cannot be lost during the pull', async () => {
    const db = createDatabase();
    const events: string[] = [];
    let releasePull: ((changes: CloudChange[]) => void) | undefined;
    const pull = new Promise<CloudChange[]>((resolve) => { releasePull = resolve; });
    const controls = createGateway({ events, pullAll: () => pull, readiness: 'manual' });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    const starting = engine.start();
    await vi.waitFor(() => expect(events[0]).toBe('subscribe'));
    if (events.includes('pull')) releasePull?.([]);
    expect(events).toEqual(['subscribe']);
    controls.status('SUBSCRIBED');
    await vi.waitFor(() => expect(events).toEqual(['subscribe', 'pull']));

    controls.emit(teacherChange({
      value: teacher(thirdTime, '实时老师'),
      clientUpdatedAt: thirdTime,
      serverUpdatedAt: thirdTime,
    }));
    await waitForValue(() => db.teachers.get('teacher-1'), teacher(thirdTime, '实时老师'));
    releasePull?.([teacherChange({
      value: teacher(firstTime, '拉取老师'),
      clientUpdatedAt: firstTime,
      serverUpdatedAt: firstTime,
    })]);
    await starting;

    expect(await db.teachers.get('teacher-1')).toEqual(teacher(thirdTime, '实时老师'));
    await engine.stop();
  });

  test('waits through an initial channel error and performs catch-up only after readiness', async () => {
    const db = createDatabase();
    let pulls = 0;
    const events: string[] = [];
    const controls = createGateway({
      events,
      readiness: 'manual',
      pullAll: async () => { pulls += 1; return []; },
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    const starting = engine.start();
    await vi.waitFor(() => expect(events).toEqual(['subscribe']));
    controls.status('CHANNEL_ERROR');
    await Promise.resolve();
    expect(pulls).toBe(0);
    controls.status('SUBSCRIBED');
    await starting;

    expect(pulls).toBe(1);
    await engine.stop();
  });

  test('returns the same initialization promise to concurrent start callers', async () => {
    const db = createDatabase();
    let releaseOwnerLookup: (() => void) | undefined;
    const ownerLookup = new Promise<void>((resolve) => { releaseOwnerLookup = resolve; });
    vi.spyOn(db.syncMetadata, 'get').mockImplementationOnce((async () => {
      await ownerLookup;
      return undefined;
    }) as never);
    const events: string[] = [];
    const controls = createGateway({ events });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    const firstStart = engine.start();
    const secondStart = engine.start();
    const sharedPromise = firstStart === secondStart;
    releaseOwnerLookup?.();
    await Promise.all([firstStart, secondStart]);

    expect(sharedPromise).toBe(true);
    expect(events).toEqual(['subscribe', 'pull']);
    await engine.stop();
  });

  test('stop waits for owner initialization and prevents a late mirror reset', async () => {
    const db = createDatabase();
    await db.teachers.add(teacher());
    let releaseOwnerLookup: (() => void) | undefined;
    const ownerLookup = new Promise<void>((resolve) => { releaseOwnerLookup = resolve; });
    vi.spyOn(db.syncMetadata, 'get').mockImplementationOnce((async () => {
      await ownerLookup;
      return { key: 'mirrorOwner', value: 'old-user', updatedAt: firstTime };
    }) as never);
    const events: string[] = [];
    const controls = createGateway({ events });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    const starting = engine.start();
    await vi.waitFor(() => expect(db.syncMetadata.get).toHaveBeenCalled());
    let stopSettled = false;
    const stopping = engine.stop().then(() => { stopSettled = true; });
    await Promise.resolve();
    const settledBeforeOwnerLookup = stopSettled;
    releaseOwnerLookup?.();
    await Promise.all([starting, stopping]);

    expect(settledBeforeOwnerLookup).toBe(false);
    expect(await db.teachers.get('teacher-1')).toEqual(teacher());
    expect(events).toEqual([]);
  });

  test('stop cancels an unresolved readiness wait and awaits the shared startup promise', async () => {
    const db = createDatabase();
    const events: string[] = [];
    const controls = createGateway({ events, readiness: 'manual' });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    const starting = engine.start();
    await vi.waitFor(() => expect(events).toEqual(['subscribe']));
    let startSettled = false;
    void starting.then(() => { startSettled = true; });
    await engine.stop();
    await Promise.resolve();
    const settledWithoutReadiness = startSettled;
    controls.status('SUBSCRIBED');
    await starting;

    expect(settledWithoutReadiness).toBe(true);
    expect(events).toEqual(['subscribe']);
    expect(controls.unsubscribed()).toBe(1);
  });

  test('merges pulled records into their registered Dexie tables using setting keys as identity', async () => {
    const db = createDatabase();
    const controls = createGateway({ pullAll: async () => [teacherChange(), settingChange()] });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();

    expect(await db.teachers.get('teacher-1')).toEqual(teacher());
    expect(await db.settings.get('dashboard-layout')).toEqual(settingChange().value);
    expect(syncStore.getState()).toEqual({ status: 'synced', pendingCount: 0, message: null });
    await engine.stop();
  });

  test('clears a different user mirror and queue before installing the authenticated owner', async () => {
    const db = createDatabase();
    await db.teachers.add(teacher());
    await db.syncOperations.add(operation({ userId: 'old-user' }));
    await db.syncMetadata.put({ key: 'mirrorOwner', value: 'old-user', updatedAt: firstTime });
    const controls = createGateway();
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();

    expect(await db.teachers.count()).toBe(0);
    expect(await db.syncOperations.count()).toBe(0);
    expect(await db.syncMetadata.get('mirrorOwner')).toEqual({
      key: 'mirrorOwner',
      value: userId,
      updatedAt: now().toISOString(),
    });
    await engine.stop();
  });

  test('uses last-modified-wins for live values, tombstones, restoration, and duplicate events', async () => {
    const db = createDatabase();
    await db.teachers.add(teacher(secondTime, '本地老师'));

    await applyRemoteChange(db, teacherChange({
      value: teacher(firstTime, '过期老师'),
      clientUpdatedAt: firstTime,
      serverUpdatedAt: firstTime,
    }));
    expect(await db.teachers.get('teacher-1')).toEqual(teacher(secondTime, '本地老师'));

    const deletion = teacherChange({ deletedAt: thirdTime, serverUpdatedAt: thirdTime });
    await applyRemoteChange(db, deletion);
    await applyRemoteChange(db, deletion);
    expect(await db.teachers.get('teacher-1')).toBeUndefined();

    await applyRemoteChange(db, teacherChange({
      value: teacher(secondTime, '过期恢复'),
      clientUpdatedAt: secondTime,
      serverUpdatedAt: secondTime,
    }));
    expect(await db.teachers.get('teacher-1')).toBeUndefined();

    const restoredAt = '2026-08-23T11:00:00.000Z';
    await applyRemoteChange(db, teacherChange({
      value: teacher(restoredAt, '新恢复'),
      clientUpdatedAt: restoredAt,
      serverUpdatedAt: restoredAt,
    }));
    expect(await db.teachers.get('teacher-1')).toEqual(teacher(restoredAt, '新恢复'));
  });
});

describe('queue acknowledgement', () => {
  test('automatically flushes an operation created after the session is already synchronized', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    const appliedIds: string[] = [];
    const controls = createGateway({
      apply: async (pending) => {
        appliedIds.push(pending.id);
        return { applied: true, change: teacherChange() };
      },
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });
    await engine.start();

    await db.syncOperations.add(operation({ id: 'created-after-start' }));

    await waitForValue(() => db.syncOperations.count(), 0);
    expect(appliedIds).toEqual(['created-after-start']);
    expect(syncStore.getState().pendingCount).toBe(0);
    await engine.stop();
  });

  test('flushes operations sequentially by creation time and merges each acknowledgement before dequeueing', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    const later = operation({ id: 'later', entityId: 'teacher-2', createdAt: thirdTime });
    const earlier = operation({ id: 'earlier', createdAt: firstTime });
    await db.syncOperations.bulkAdd([later, earlier]);
    const appliedIds: string[] = [];
    const controls = createGateway({
      apply: async (pending) => {
        appliedIds.push(pending.id);
        expect(await db.syncOperations.get(pending.id)).toBeDefined();
        return {
          applied: true,
          change: teacherChange({
            entityId: pending.entityId,
            value: teacher(thirdTime, pending.id, pending.entityId),
            clientUpdatedAt: thirdTime,
            serverUpdatedAt: thirdTime,
          }),
        };
      },
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();

    expect(appliedIds).toEqual(['earlier', 'later']);
    expect(await db.syncOperations.count()).toBe(0);
    expect(syncStore.getState().pendingCount).toBe(0);
    await engine.stop();
  });

  test('re-queries until empty when one queued operation is atomically replaced by another', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.teachers.put(teacher(thirdTime, '替换后的本地教师'));
    await db.syncOperations.add(operation({ id: 'first-operation', createdAt: firstTime }));
    const appliedIds: string[] = [];
    let releaseFirstApply: ((result: CloudApplyResult) => void) | undefined;
    const firstApply = new Promise<CloudApplyResult>((resolve) => { releaseFirstApply = resolve; });
    const controls = createGateway({
      apply: async (pending) => {
        appliedIds.push(pending.id);
        if (pending.id === 'first-operation') return firstApply;
        return {
          applied: true,
          change: teacherChange({
            value: teacher(thirdTime, '替换后的本地教师'),
            clientUpdatedAt: thirdTime,
            serverUpdatedAt: thirdTime,
          }),
        };
      },
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    const starting = engine.start();
    await vi.waitFor(() => expect(appliedIds).toEqual(['first-operation']));
    await db.transaction('rw', db.syncOperations, async () => {
      await db.syncOperations.delete('first-operation');
      await db.syncOperations.add(operation({
        id: 'replacement-operation',
        record: teacher(thirdTime, '替换后的本地教师'),
        clientUpdatedAt: thirdTime,
        createdAt: thirdTime,
      }));
    });
    releaseFirstApply?.({ applied: true, change: teacherChange() });
    await starting;

    expect(appliedIds).toEqual(['first-operation', 'replacement-operation']);
    expect(await db.syncOperations.count()).toBe(0);
    expect(syncStore.getState().status).toBe('synced');
    await engine.stop();
  });

  test('merges the authoritative server change even when the submitted operation was stale', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.teachers.put(teacher(secondTime, '本地编辑'));
    await db.syncOperations.add(operation());
    const controls = createGateway({
      apply: async () => ({
        applied: false,
        change: teacherChange({
          value: teacher(thirdTime, '服务器权威值'),
          clientUpdatedAt: thirdTime,
          serverUpdatedAt: thirdTime,
        }),
      }),
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();

    expect(await db.teachers.get('teacher-1')).toEqual(teacher(thirdTime, '服务器权威值'));
    expect(await db.syncOperations.count()).toBe(0);
    await engine.stop();
  });

  test('excludes the acknowledged delete so an equal-timestamp authoritative live row is restored', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.syncOperations.add(operation({
      id: 'equal-delete',
      type: 'delete',
      record: null,
      clientUpdatedAt: secondTime,
    }));
    const controls = createGateway({
      apply: async () => ({
        applied: false,
        change: teacherChange({
          value: teacher(secondTime, '服务器保留的教师'),
          clientUpdatedAt: secondTime,
          serverUpdatedAt: thirdTime,
        }),
      }),
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();

    expect(await db.teachers.get('teacher-1')).toEqual(teacher(secondTime, '服务器保留的教师'));
    expect(await db.syncOperations.count()).toBe(0);
    await engine.stop();
  });

  test('keeps a distinct newer queued operation ahead of an older acknowledgement for the same entity', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.teachers.put(teacher(thirdTime, '更新的本地教师'));
    await db.syncOperations.bulkAdd([
      operation({ id: 'acknowledged-delete', type: 'delete', record: null, createdAt: firstTime }),
      operation({
        id: 'newer-upsert',
        record: teacher(thirdTime, '更新的本地教师'),
        clientUpdatedAt: thirdTime,
        createdAt: thirdTime,
      }),
    ]);
    const controls = createGateway({
      apply: async (pending) => {
        if (pending.id === 'newer-upsert') throw new Error('leave newer operation queued');
        return {
          applied: false,
          change: teacherChange({
            value: teacher(secondTime, '较早的服务器教师'),
            clientUpdatedAt: secondTime,
            serverUpdatedAt: thirdTime,
          }),
        };
      },
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();

    expect(await db.teachers.get('teacher-1')).toEqual(teacher(thirdTime, '更新的本地教师'));
    expect((await db.syncOperations.toArray()).map(({ id }) => id)).toEqual(['newer-upsert']);
    await engine.stop();
  });

  test('retains and annotates an operation when the cloud request fails', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    const pending = operation({ id: 'pending-1' });
    await db.syncOperations.add(pending);
    const controls = createGateway({ apply: async () => { throw new Error('connection lost'); } });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();

    expect(await db.syncOperations.get('pending-1')).toEqual({
      ...pending,
      retryCount: 1,
      lastError: 'connection lost',
    });
    expect(syncStore.getState()).toEqual({
      status: 'error',
      pendingCount: 1,
      message: 'connection lost',
    });
    await engine.stop();
  });

  test('does not dequeue when the authoritative merge fails after cloud acknowledgement', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.syncOperations.add(operation({ id: 'pending-merge' }));
    const controls = createGateway();
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });
    vi.spyOn(db.table('teachers'), 'put').mockRejectedValueOnce(new Error('mirror unavailable'));

    await engine.start();

    expect(await db.syncOperations.get('pending-merge')).toBeDefined();
    expect(syncStore.getState().status).toBe('error');
    await engine.stop();
  });
});

describe('retry triggers and lifecycle', () => {
  test('stays offline with its queue intact and retries immediately after the online event', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.syncOperations.add(operation({ id: 'offline-change' }));
    let isOnline = false;
    const controls = createGateway();
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => isOnline });

    await engine.start();
    expect(syncStore.getState()).toEqual({ status: 'offline', pendingCount: 1, message: null });
    expect(await db.syncOperations.count()).toBe(1);

    isOnline = true;
    window.dispatchEvent(new Event('online'));
    await waitForValue(() => db.syncOperations.count(), 0);
    expect(syncStore.getState().status).toBe('synced');

    await db.syncOperations.add(operation({ id: 'created-after-recovery' }));
    await waitForValue(() => db.syncOperations.count(), 0);
    await engine.stop();
  });

  test('reconciles on focus and after a channel reconnect, but not on the initial subscribed status', async () => {
    const db = createDatabase();
    let pulls = 0;
    const controls = createGateway({ pullAll: async () => { pulls += 1; return []; } });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    await engine.start();
    expect(pulls).toBe(1);

    controls.status('SUBSCRIBED');
    await Promise.resolve();
    expect(pulls).toBe(1);

    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(pulls).toBe(2));
    controls.status('CHANNEL_ERROR');
    controls.status('SUBSCRIBED');
    await vi.waitFor(() => expect(pulls).toBe(3));
    await engine.stop();
  });

  test('backs off failed retries at 1, 2, 4, 8, and 16 seconds and cancels its timer on stop', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.syncOperations.add(operation({ id: 'retry-change' }));
    let attempts = 0;
    let rejectFirstAttempt: ((error: Error) => void) | undefined;
    const controls = createGateway({
      apply: async () => {
        attempts += 1;
        if (attempts === 1) {
          await new Promise<never>((_resolve, reject) => { rejectFirstAttempt = reject; });
        }
        throw new Error('temporary outage');
      },
    });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });

    const starting = engine.start();
    await vi.waitFor(() => expect(attempts).toBe(1));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    rejectFirstAttempt?.(new Error('temporary outage'));
    await settleIndexedDb();
    await starting;
    expect(attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    for (const [delay, expectedAttempts] of [[1_000, 2], [2_000, 3], [4_000, 4], [8_000, 5]] as const) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(attempts).toBe(expectedAttempts - 1);
      await vi.advanceTimersByTimeAsync(1);
      await waitForAsyncCondition(() => attempts === expectedAttempts && vi.getTimerCount() === 1);
      expect(attempts).toBe(expectedAttempts);
    }
    await vi.advanceTimersByTimeAsync(15_999);
    expect(attempts).toBe(5);
    await vi.advanceTimersByTimeAsync(1);
    await waitForAsyncCondition(() => attempts === 6 && vi.getTimerCount() === 1);
    expect(attempts).toBe(6);

    await engine.stop();
    expect(controls.unsubscribed()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('unsubscribes once and ignores remote events after stop', async () => {
    const db = createDatabase();
    const controls = createGateway();
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });
    await engine.start();

    await engine.stop();
    await engine.stop();
    controls.emit(teacherChange());
    await Promise.resolve();

    expect(controls.unsubscribed()).toBe(1);
    expect(await db.teachers.count()).toBe(0);
  });

  test('keeps the queued error state when a realtime event is merged after a failed flush', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.syncOperations.add(operation({ id: 'failed-operation' }));
    const controls = createGateway({ apply: async () => { throw new Error('connection lost'); } });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });
    await engine.start();

    controls.emit(teacherChange({
      value: teacher(thirdTime, '实时权威教师'),
      clientUpdatedAt: thirdTime,
      serverUpdatedAt: thirdTime,
    }));
    await waitForValue(() => db.teachers.get('teacher-1'), teacher(thirdTime, '实时权威教师'));
    await settleIndexedDb();

    expect(syncStore.getState()).toEqual({
      status: 'error',
      pendingCount: 1,
      message: 'connection lost',
    });
    await engine.stop();
  });

  test('keeps offline state and pending count when a realtime event is merged offline', async () => {
    const db = createDatabase();
    await markCurrentOwner(db);
    await db.syncOperations.add(operation({ id: 'offline-pending' }));
    const controls = createGateway();
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => false });
    await engine.start();

    controls.emit(teacherChange({
      value: teacher(thirdTime, '离线收到的教师'),
      clientUpdatedAt: thirdTime,
      serverUpdatedAt: thirdTime,
    }));
    await waitForValue(() => db.teachers.get('teacher-1'), teacher(thirdTime, '离线收到的教师'));
    await settleIndexedDb();

    expect(syncStore.getState()).toEqual({ status: 'offline', pendingCount: 1, message: null });
    await engine.stop();
  });

  test('stop prevents a delayed state count and realtime merge from committing late work', async () => {
    const db = createDatabase();
    const controls = createGateway();
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });
    await engine.start();
    const stateAtStop = syncStore.getState();
    const originalWhere = db.syncOperations.where.bind(db.syncOperations);
    let releaseCount: (() => void) | undefined;
    let countStarted = false;
    let delayedCount = false;
    vi.spyOn(db.syncOperations, 'where').mockImplementation(((index: string) => {
      const whereClause = originalWhere(index);
      const originalEquals = whereClause.equals.bind(whereClause);
      if (delayedCount) return whereClause;
      delayedCount = true;
      vi.spyOn(whereClause, 'equals').mockImplementationOnce(((value: string) => {
        const collection = originalEquals(value);
        const originalCount = collection.count.bind(collection);
        vi.spyOn(collection, 'count').mockImplementationOnce((async () => {
          countStarted = true;
          await new Promise<void>((resolve) => { releaseCount = resolve; });
          return originalCount();
        }) as never);
        return collection;
      }) as typeof whereClause.equals);
      return whereClause;
    }) as typeof db.syncOperations.where);

    controls.emit(teacherChange());
    await vi.waitFor(() => expect(countStarted).toBe(true));
    const stopping = engine.stop();
    releaseCount?.();
    await stopping;
    await settleIndexedDb();

    expect(syncStore.getState()).toEqual(stateAtStop);
    expect(await db.teachers.get('teacher-1')).toBeUndefined();
  });

  test('stop prevents a retry delayed in state publication from pulling afterward', async () => {
    const db = createDatabase();
    let pulls = 0;
    const controls = createGateway({ pullAll: async () => { pulls += 1; return []; } });
    const engine = createSyncEngine({ db, gateway: controls.gateway, userId, now, online: () => true });
    await engine.start();
    const originalWhere = db.syncOperations.where.bind(db.syncOperations);
    let releaseCount: (() => void) | undefined;
    let countStarted = false;
    let delayedCount = false;
    vi.spyOn(db.syncOperations, 'where').mockImplementation(((index: string) => {
      const whereClause = originalWhere(index);
      const originalEquals = whereClause.equals.bind(whereClause);
      if (delayedCount) return whereClause;
      delayedCount = true;
      vi.spyOn(whereClause, 'equals').mockImplementationOnce(((value: string) => {
        const collection = originalEquals(value);
        const originalCount = collection.count.bind(collection);
        vi.spyOn(collection, 'count').mockImplementationOnce((async () => {
          countStarted = true;
          await new Promise<void>((resolve) => { releaseCount = resolve; });
          return originalCount();
        }) as never);
        return collection;
      }) as typeof whereClause.equals);
      return whereClause;
    }) as typeof db.syncOperations.where);

    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(countStarted).toBe(true));
    const stopping = engine.stop();
    releaseCount?.();
    await stopping;

    expect(pulls).toBe(1);
  });
});
