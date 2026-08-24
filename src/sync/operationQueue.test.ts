import { describe, expect, test } from 'vitest';
import type { SyncOperation } from './types';
import { compactOperationBatches, compactOperations } from './operationQueue';

const firstTime = '2026-08-23T01:00:00.000Z';
const secondTime = '2026-08-23T02:00:00.000Z';
const thirdTime = '2026-08-23T03:00:00.000Z';

function operation(
  overrides: Partial<SyncOperation> = {},
): SyncOperation {
  return {
    id: crypto.randomUUID(),
    userId: 'user-1',
    entityKind: 'teachers',
    entityId: 'teacher-1',
    type: 'upsert',
    record: {
      id: 'teacher-1',
      name: '张老师',
      department: '',
      archivedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: firstTime,
    },
    clientUpdatedAt: firstTime,
    retryCount: 0,
    lastError: null,
    createdAt: firstTime,
    localCreate: false,
    ...overrides,
  };
}

describe('operation queue compaction', () => {
  test('retains every acknowledged source id while submitting the latest id and create provenance', () => {
    const created = operation({ id: 'created-operation', localCreate: true });
    const updated = operation({
      id: 'updated-operation',
      localCreate: false,
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
      record: {
        id: 'teacher-1', name: '李老师', department: '', archivedAt: null,
        createdAt: firstTime, updatedAt: secondTime,
      },
    });

    expect(compactOperationBatches([created, updated])).toEqual({
      batches: [{
        operation: expect.objectContaining({
          id: 'updated-operation',
          localCreate: true,
          clientUpdatedAt: secondTime,
        }),
        sourceOperationIds: ['created-operation', 'updated-operation'],
      }],
      canceledOperationIds: [],
    });
  });

  test('reports every canceled id for an unsynchronized create followed by delete', () => {
    const created = operation({ id: 'created-operation', localCreate: true });
    const deleted = operation({
      id: 'deleted-operation', type: 'delete', record: null,
      clientUpdatedAt: secondTime, createdAt: secondTime,
    });

    expect(compactOperationBatches([created, deleted])).toEqual({
      batches: [],
      canceledOperationIds: ['created-operation', 'deleted-operation'],
    });
  });

  test('preserves the earliest source order when a later snapshot is the submitted operation', () => {
    const parentFirst = operation({ id: 'parent-create', entityId: 'teacher-parent' });
    const child = operation({
      id: 'dependent-create',
      entityId: 'teacher-dependent',
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
    });
    const parentLatest = operation({
      id: 'parent-update',
      entityId: 'teacher-parent',
      clientUpdatedAt: thirdTime,
      createdAt: thirdTime,
    });

    const { batches } = compactOperationBatches([parentFirst, child, parentLatest]);

    expect(batches.map(({ operation: pending }) => pending.id)).toEqual([
      'parent-update',
      'dependent-create',
    ]);
  });

  test('keeps the last snapshot from consecutive updates', () => {
    const latest = operation({
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
      record: {
        id: 'teacher-1',
        name: '李老师',
        department: '计算机学院',
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: secondTime,
      },
    });

    const compacted = compactOperations([operation(), latest]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0]).toMatchObject({
      type: 'upsert',
      clientUpdatedAt: secondTime,
      record: {
        name: '李老师',
        department: '计算机学院',
        updatedAt: secondTime,
      },
    });
  });

  test('compacts operations chronologically when storage returns them out of order', () => {
    const earliest = operation();
    const latest = operation({
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
      record: {
        id: 'teacher-1',
        name: '李老师',
        department: '计算机学院',
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: secondTime,
      },
    });

    const compacted = compactOperations([latest, earliest]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0]).toMatchObject({
      clientUpdatedAt: secondTime,
      record: { name: '李老师', updatedAt: secondTime },
    });
  });

  test('merges an unsynced create and update into one upsert', () => {
    const created = operation({
      localCreate: true,
      record: {
        id: 'teacher-1',
        name: '张老师',
        department: '',
        archivedAt: null,
        createdAt: firstTime,
        updatedAt: firstTime,
      },
    });
    const updated = operation({
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
      record: {
        id: 'teacher-1',
        name: '张老师',
        department: '计算机学院',
        archivedAt: null,
        createdAt: firstTime,
        updatedAt: secondTime,
      },
    });

    const compacted = compactOperations([created, updated]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0]).toMatchObject({
      type: 'upsert',
      localCreate: true,
      record: { department: '计算机学院' },
    });
  });

  test('cancels an unsynced create followed by a delete', () => {
    const created = operation({
      localCreate: true,
      record: {
        id: 'teacher-1',
        name: '张老师',
        department: '',
        archivedAt: null,
        createdAt: '2026-08-22T23:00:00.000Z',
        updatedAt: firstTime,
      },
    });
    const deleted = operation({
      type: 'delete',
      record: null,
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
    });

    expect(compactOperations([created, deleted])).toEqual([]);
  });

  test('keeps a tombstone after updating an existing record whose audit timestamps are equal', () => {
    const existingUpsert = operation({
      localCreate: false,
      record: {
        id: 'teacher-1',
        name: '张老师',
        department: '计算机学院',
        archivedAt: null,
        createdAt: firstTime,
        updatedAt: firstTime,
      },
    });
    const deleted = operation({
      type: 'delete',
      record: null,
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
    });

    expect(compactOperations([existingUpsert, deleted])).toEqual([deleted]);
  });

  test('keeps a delete of an existing record as one tombstone operation', () => {
    const deleted = operation({
      type: 'delete',
      record: null,
      clientUpdatedAt: secondTime,
      createdAt: secondTime,
    });

    expect(compactOperations([deleted])).toEqual([deleted]);
  });
});
