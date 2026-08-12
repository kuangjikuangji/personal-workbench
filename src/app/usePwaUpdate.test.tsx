import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { dirtyForms, usePwaUpdate } from './usePwaUpdate';

const updateServiceWorker = vi.fn();
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [true, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker }),
}));

beforeEach(() => { dirtyForms.clear(); updateServiceWorker.mockReset(); });

test('refuses immediate refresh while a registered form is dirty', async () => {
  dirtyForms.register('todo');
  const { result } = renderHook(() => usePwaUpdate());
  await act(() => result.current.updateNow());
  expect(updateServiceWorker).not.toHaveBeenCalled();
  expect(result.current.blockedMessage).toMatch(/未保存/);
});

test('updates immediately when no registered form is dirty', async () => {
  const { result } = renderHook(() => usePwaUpdate());
  await act(() => result.current.updateNow());
  expect(updateServiceWorker).toHaveBeenCalledWith(true);
});
