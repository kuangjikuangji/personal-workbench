import { createStore } from 'zustand/vanilla';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export type SyncState = {
  status: SyncStatus;
  pendingCount: number;
  message: string | null;
};

const initialSyncState: SyncState = {
  status: 'idle',
  pendingCount: 0,
  message: null,
};

export const syncStore = createStore<SyncState>(() => ({ ...initialSyncState }));

export function setSyncState(state: SyncState): void {
  syncStore.setState(state, true);
}

export function resetSyncState(): void {
  setSyncState({ ...initialSyncState });
}
