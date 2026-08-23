import { beforeEach, describe, expect, test } from 'vitest';
import { resetSyncState, setSyncState, syncStore } from './syncStore';

describe('syncStore', () => {
  beforeEach(() => resetSyncState());

  test('starts idle with no pending operations or message', () => {
    expect(syncStore.getState()).toEqual({
      status: 'idle',
      pendingCount: 0,
      message: null,
    });
  });

  test('publishes engine state transitions as one consistent snapshot', () => {
    setSyncState({
      status: 'offline',
      pendingCount: 3,
      message: 'Changes will sync when the connection returns.',
    });

    expect(syncStore.getState()).toEqual({
      status: 'offline',
      pendingCount: 3,
      message: 'Changes will sync when the connection returns.',
    });
  });
});
