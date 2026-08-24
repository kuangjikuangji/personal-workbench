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
  const deliveryUnprovableKeys = new Set<string>();
  const locallyCreatedKeys = new Set<string>();

  for (const operation of chronological) {
    const key = operationKey(operation);
    if (operation.localCreate) locallyCreatedKeys.add(key);
    if (operation.type === 'delete' && locallyCreatedKeys.has(key)) {
      deliveryUnprovableKeys.add(key);
    }
  }
  const orderedUncompacted: PendingOperation[] = [];

  for (const operation of chronological) {
    const key = operationKey(operation);
    if (deliveryUnprovableKeys.has(key)) {
      orderedUncompacted.push({
        operation,
        createdLocally: operation.localCreate,
        sourceOperationIds: [operation.id],
        firstCreatedAt: operation.createdAt,
      });
      continue;
    }
    const previous = pending.get(key);
    const createdLocally = previous?.createdLocally ?? operation.localCreate;
    const sourceOperationIds = [...(previous?.sourceOperationIds ?? []), operation.id];

    pending.set(key, {
      operation: operation.localCreate === createdLocally
        ? operation
        : { ...operation, localCreate: createdLocally },
      createdLocally,
      sourceOperationIds,
      firstCreatedAt: previous?.firstCreatedAt ?? operation.createdAt,
    });
  }

  const batches = [...pending.values(), ...orderedUncompacted]
    .sort((left, right) => left.firstCreatedAt.localeCompare(right.firstCreatedAt))
    .map(({ operation, sourceOperationIds }) => ({ operation, sourceOperationIds }));

  return { batches, canceledOperationIds };
}

export function compactOperations(operations: SyncOperation[]): SyncOperation[] {
  return compactOperationBatches(operations).batches.map(({ operation }) => operation);
}
