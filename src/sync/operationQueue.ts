import type { SyncOperation } from './types';

type PendingOperation = {
  operation: SyncOperation;
  createdLocally: boolean;
  sourceOperationIds: string[];
  firstCreatedAt: string;
};

export type CompactedOperationBatch = {
  operation: SyncOperation;
  sourceOperationIds: string[];
};

export type CompactedOperationPlan = {
  batches: CompactedOperationBatch[];
  canceledOperationIds: string[];
};

function operationKey(operation: SyncOperation): string {
  return `${operation.userId}\u0000${operation.entityKind}\u0000${operation.entityId}`;
}

export function compactOperationBatches(operations: SyncOperation[]): CompactedOperationPlan {
  const pending = new Map<string, PendingOperation>();
  const canceledOperationIds: string[] = [];

  const chronological = [...operations]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  for (const operation of chronological) {
    const key = operationKey(operation);
    const previous = pending.get(key);
    const createdLocally = previous?.createdLocally ?? operation.localCreate;
    const sourceOperationIds = [...(previous?.sourceOperationIds ?? []), operation.id];

    if (operation.type === 'delete' && createdLocally) {
      pending.delete(key);
      canceledOperationIds.push(...sourceOperationIds);
      continue;
    }

    pending.set(key, {
      operation: operation.localCreate === createdLocally
        ? operation
        : { ...operation, localCreate: createdLocally },
      createdLocally,
      sourceOperationIds,
      firstCreatedAt: previous?.firstCreatedAt ?? operation.createdAt,
    });
  }

  const batches = [...pending.values()]
    .sort((left, right) => left.firstCreatedAt.localeCompare(right.firstCreatedAt))
    .map(({ operation, sourceOperationIds }) => ({ operation, sourceOperationIds }));

  return { batches, canceledOperationIds };
}

export function compactOperations(operations: SyncOperation[]): SyncOperation[] {
  return compactOperationBatches(operations).batches.map(({ operation }) => operation);
}
