import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { SyncStatus } from './SyncStatus';

const sync = vi.hoisted(() => ({
  value: {
    status: 'synced' as 'synced' | 'syncing' | 'offline' | 'error',
    pendingCount: 0,
    message: null as string | null,
    retry: vi.fn(async () => undefined),
  },
}));

vi.mock('./SyncProvider', () => ({
  useSyncStatus: () => sync.value,
}));

afterEach(() => {
  sync.value = {
    status: 'synced',
    pendingCount: 0,
    message: null,
    retry: vi.fn(async () => undefined),
  };
});

test.each([
  ['synced', 0, '已同步'],
  ['syncing', 0, '正在同步'],
  ['offline', 3, '离线，3 项待同步'],
] as const)('announces %s synchronization state with a status role', (status, pendingCount, label) => {
  sync.value = { ...sync.value, status, pendingCount };

  render(<SyncStatus />);

  expect(screen.getByRole('status')).toHaveTextContent(label);
});

test('announces a safe retryable error without exposing the sync failure detail', () => {
  sync.value = { ...sync.value, status: 'error', message: 'Supabase credential leaked' };

  render(<SyncStatus />);

  expect(screen.getByRole('alert')).toHaveTextContent('同步失败');
  expect(screen.getByRole('alert')).not.toHaveTextContent('Supabase credential leaked');
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
});

test('retries synchronization from the error state', async () => {
  const retry = vi.fn(async () => undefined);
  sync.value = { ...sync.value, status: 'error', retry };
  const user = userEvent.setup();

  render(<SyncStatus />);
  await user.click(screen.getByRole('button', { name: '重试' }));

  expect(retry).toHaveBeenCalledOnce();
});
