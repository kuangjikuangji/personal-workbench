import type { SyncOperation } from './types';

type PendingOperation = {
  operation: SyncOperation;
  createdLocally: boolean;
};

function operationKey(operation: SyncOperation): string {
  return `${operation.userId}\u0000${operation.entityKind}\u0000${operation.entityId}`;
}

function isUnsyncedCreate(operation: SyncOperation): boolean {
  if (operation.type !== 'upsert' || !operation.record) return false;

  const recordCreatedAt = operation.record.createdAt ?? operation.record.created_at;
  return recordCreatedAt === operation.clientUpdatedAt;
}

export function compactOperations(operations: SyncOperation[]): SyncOperation[] {
  const pending = new Map<string, PendingOperation>();

  const chronological = [...operations]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  for (const operation of chronological) {
    const key = operationKey(operation);
    const previous = pending.get(key);

    if (operation.type === 'delete' && previous?.createdLocally) {
      pending.delete(key);
      continue;
    }

    pending.set(key, {
      operation,
      createdLocally: previous?.createdLocally ?? isUnsyncedCreate(operation),
    });
  }

  return [...pending.values()]
    .map(({ operation }) => operation)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
