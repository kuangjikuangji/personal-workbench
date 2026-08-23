import type { SyncOperation } from './types';

type PendingOperation = {
  operation: SyncOperation;
  createdLocally: boolean;
};

function operationKey(operation: SyncOperation): string {
  return `${operation.userId}\u0000${operation.entityKind}\u0000${operation.entityId}`;
}

export function compactOperations(operations: SyncOperation[]): SyncOperation[] {
  const pending = new Map<string, PendingOperation>();

  const chronological = [...operations]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  for (const operation of chronological) {
    const key = operationKey(operation);
    const previous = pending.get(key);
    const createdLocally = previous?.createdLocally ?? operation.localCreate;

    if (operation.type === 'delete' && createdLocally) {
      pending.delete(key);
      continue;
    }

    pending.set(key, {
      operation: operation.localCreate === createdLocally
        ? operation
        : { ...operation, localCreate: createdLocally },
      createdLocally,
    });
  }

  return [...pending.values()]
    .map(({ operation }) => operation)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
