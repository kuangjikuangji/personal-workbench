import { afterEach, describe, expect, test, vi } from 'vitest';
import { WorkbenchDatabase } from './database';
import type { Repositories } from './repositories';
import type { SyncOperation } from '../sync/types';
import { clearUserMirror, createSyncedRepositories } from './syncedRepositories';

const userId = 'user-1';
const createdAt = '2026-01-01T00:00:00.000Z';
const updatedAt = '2026-08-23T01:00:00.000Z';

const databases: WorkbenchDatabase[] = [];

function createDatabase(): WorkbenchDatabase {
  const db = new WorkbenchDatabase(`synced-repositories-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

function teacher(overrides: Record<string, unknown> = {}) {
  return {
    id: 'teacher-1',
    name: '张老师',
    department: '',
    archivedAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function tombstone(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: crypto.randomUUID(),
    userId,
    entityKind: 'teachers',
    entityId: 'teacher-1',
    type: 'delete',
    localCreate: false,
    record: null,
    clientUpdatedAt: updatedAt,
    retryCount: 0,
    lastError: null,
    createdAt: updatedAt,
    ...overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe('synchronized repositories', () => {
  test('create writes the generated record and its upsert operation', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);

    const saved = await repositories.teachers.create({
      name: '张老师',
      department: '',
      archivedAt: null,
    });

    expect(await db.teachers.get(saved.id)).toEqual(saved);
    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        userId,
        entityKind: 'teachers',
        entityId: saved.id,
        type: 'upsert',
        record: saved,
        clientUpdatedAt: saved.updatedAt,
        retryCount: 0,
        lastError: null,
        localCreate: true,
      }),
    ]);
  });

  test('put replaces the mirror record and queues its full snapshot', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);
    await db.teachers.add(teacher());

    const saved = await repositories.teachers.put(teacher({ department: '计算机学院' }));

    expect(await db.teachers.get('teacher-1')).toEqual(saved);
    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        entityKind: 'teachers',
        entityId: 'teacher-1',
        type: 'upsert',
        record: teacher({ department: '计算机学院' }),
        clientUpdatedAt: updatedAt,
        localCreate: false,
      }),
    ]);
  });

  test('patch preserves immutable audit fields and queues the updated snapshot', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);
    await db.teachers.add(teacher());

    const saved = await repositories.teachers.patch('teacher-1', {
      name: '李老师',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });

    expect(saved).toMatchObject({ id: 'teacher-1', name: '李老师', createdAt });
    expect(saved.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(await db.teachers.get('teacher-1')).toEqual(saved);
    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        entityKind: 'teachers',
        entityId: 'teacher-1',
        type: 'upsert',
        record: saved,
        clientUpdatedAt: saved.updatedAt,
        localCreate: false,
      }),
    ]);
  });

  test('settings put uses the key as identity and queues its full snapshot', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);

    const saved = await repositories.settings.put({ key: 'dashboard-layout', value: ['todos'] });

    expect(await db.settings.get('dashboard-layout')).toEqual(saved);
    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        entityKind: 'app_settings',
        entityId: 'dashboard-layout',
        type: 'upsert',
        record: saved,
        clientUpdatedAt: saved.updatedAt,
        localCreate: true,
      }),
    ]);
  });

  test('delete removes the mirror record and queues a tombstone', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);
    await db.teachers.add(teacher());

    await repositories.teachers.delete('teacher-1');

    expect(await db.teachers.get('teacher-1')).toBeUndefined();
    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        userId,
        entityKind: 'teachers',
        entityId: 'teacher-1',
        type: 'delete',
        record: null,
        retryCount: 0,
        lastError: null,
        localCreate: false,
      }),
    ]);
  });

  test('settings put over an existing mirror record is not a local create', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);
    await db.settings.add({ key: 'dashboard-layout', value: ['todos'], updatedAt });

    await repositories.settings.put({ key: 'dashboard-layout', value: ['ideas'] });

    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        entityKind: 'app_settings',
        entityId: 'dashboard-layout',
        localCreate: false,
      }),
    ]);
  });

  test('settings preserve local-create provenance through later puts', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);

    await repositories.settings.put({ key: 'dashboard-layout', value: ['todos'] });
    await repositories.settings.put({ key: 'dashboard-layout', value: ['ideas'] });

    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({ localCreate: true }),
      expect.objectContaining({ localCreate: true }),
    ]);
  });

  test('rolls the mirror write back when queue insertion fails', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);
    vi.spyOn(db.syncOperations, 'add').mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(repositories.teachers.create({
      name: '张老师',
      department: '',
      archivedAt: null,
    })).rejects.toThrow('queue unavailable');

    expect(await db.teachers.toArray()).toEqual([]);
    expect(await db.syncOperations.toArray()).toEqual([]);
  });

  test('keeps the Repositories list and get read contract without enqueueing', async () => {
    const db = createDatabase();
    const repositories: Repositories = createSyncedRepositories(db, userId);
    await db.teachers.add(teacher());

    expect(await repositories.teachers.list()).toEqual([teacher()]);
    expect(await repositories.teachers.get('teacher-1')).toEqual(teacher());
    expect(await db.syncOperations.count()).toBe(0);
  });

  test('preserves local-create provenance through later put and patch operations', async () => {
    const db = createDatabase();
    const repositories = createSyncedRepositories(db, userId);
    const created = await repositories.teachers.create({
      name: '张老师',
      department: '',
      archivedAt: null,
    });

    await repositories.teachers.put({ ...created, department: '计算机学院' });
    await repositories.teachers.patch(created.id, { name: '李老师' });

    expect(await db.syncOperations.orderBy('createdAt').toArray()).toEqual([
      expect.objectContaining({ type: 'upsert', localCreate: true }),
      expect.objectContaining({ type: 'upsert', localCreate: true }),
      expect.objectContaining({ type: 'upsert', localCreate: true }),
    ]);
  });
});

describe('clearUserMirror', () => {
  test('atomically clears every business table, the user queue, and mirror owner metadata', async () => {
    const db = createDatabase();
    const businessTables = [
      'todos',
      'semesters',
      'courses',
      'teachers',
      'teacherYearSummaries',
      'teacherRecords',
      'mentorships',
      'researchItems',
      'learningMethods',
      'ideas',
      'lessonPlans',
      'students',
      'studentRecords',
      'settings',
    ] as const;

    for (const tableName of businessTables) {
      const identity = tableName === 'settings' ? { key: 'setting-1' } : { id: `${tableName}-1` };
      await db.table(tableName).put(identity);
    }
    await db.syncOperations.bulkAdd([
      tombstone(),
      tombstone({ id: crypto.randomUUID(), userId: 'user-2' }),
    ]);
    await db.syncMetadata.bulkAdd([
      { key: 'mirrorOwner', value: userId, updatedAt },
      { key: 'lastFullPull', value: updatedAt, updatedAt },
    ]);

    await clearUserMirror(db, userId);

    expect(await Promise.all(businessTables.map((tableName) => db.table(tableName).count())))
      .toEqual(businessTables.map(() => 0));
    expect(await db.syncOperations.toArray()).toEqual([
      expect.objectContaining({ userId: 'user-2' }),
    ]);
    expect(await db.syncMetadata.get('mirrorOwner')).toBeUndefined();
    expect(await db.syncMetadata.get('lastFullPull')).toEqual({
      key: 'lastFullPull',
      value: updatedAt,
      updatedAt,
    });
  });
});
