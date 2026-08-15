import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Todo } from '../../domain/entities';
import { createTestRepositories } from '../../test/database';
import {
  createReminderCoordinator,
  ReminderCoordinator,
  clearBrowserReminderIdStore,
  createBrowserReminderIdStore,
  deliverReminder,
  type ReminderIdStore,
} from './ReminderCoordinator';

function todoInput(overrides: Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
  return {
    title: '补报待办',
    description: '',
    role: 'personal' as const,
    startAt: null,
    endAt: null,
    remindAt: '2026-08-10T09:00:00+08:00',
    priority: 'normal' as const,
    status: 'open' as const,
    sourceType: null,
    sourceId: null,
    ...overrides,
  };
}

function memoryStore(initial: string[] = []): ReminderIdStore & { ids: Set<string> } {
  const store = {
    ids: new Set(initial),
    load: () => new Set(store.ids),
    save: (ids: Set<string>) => { store.ids = new Set(ids); },
  };
  return store;
}

describe('reminder coordinator', () => {
  test('shows a visible Chinese reminder and records its id when system notifications are unavailable', async () => {
    const repositories = createTestRepositories();
    const due = await repositories.todos.create(todoInput({ title: '提交院务会材料' }));
    const store = memoryStore();

    render(
      <ReminderCoordinator
        notificationAdapter={null}
        now={() => new Date('2026-08-10T09:05:00+08:00')}
        repositories={repositories}
        store={store}
      />,
    );

    const reminders = await screen.findByRole('region', { name: '待办提醒' });
    expect(reminders).toHaveTextContent('提交院务会材料');
    await waitFor(() => expect(store.ids.has(`${due.id}::${due.remindAt}`)).toBe(true));
  });

  test('does not record an id when the in-app reminder UI rejects delivery', async () => {
    const repositories = createTestRepositories();
    const due = await repositories.todos.create(todoInput());
    const store = memoryStore();
    const showInApp = vi.fn().mockRejectedValue(new Error('UI unavailable'));

    render(
      <ReminderCoordinator
        inAppDelivery={showInApp}
        notificationAdapter={{ permission: 'denied', show: vi.fn() }}
        now={() => new Date('2026-08-10T09:05:00+08:00')}
        repositories={repositories}
        store={store}
      />,
    );

    await waitFor(() => expect(showInApp).toHaveBeenCalledWith(due));
    expect(store.ids.has(due.id)).toBe(false);
  });

  test('catches up overdue reminders when the application starts', async () => {
    const repositories = createTestRepositories();
    const due = await repositories.todos.create(todoInput());
    const notify = vi.fn().mockResolvedValue(undefined);
    const store = memoryStore();
    const coordinator = createReminderCoordinator({
      repositories,
      notify,
      store,
      now: () => new Date('2026-08-10T09:05:00+08:00'),
    });

    await coordinator.start();

    expect(notify).toHaveBeenCalledWith(due);
    expect(store.ids).toEqual(new Set([`${due.id}::${due.remindAt}`]));
    coordinator.stop();
  });

  test('checks again on visibility restore and at the runtime interval', async () => {
    const repositories = createTestRepositories();
    const listTodos = vi.spyOn(repositories.todos, 'list');
    const notify = vi.fn().mockResolvedValue(undefined);
    const store = memoryStore();
    let now = new Date('2026-08-10T08:55:00+08:00');
    let tick: () => void = () => { throw new Error('interval was not scheduled'); };
    const coordinator = createReminderCoordinator({
      repositories,
      notify,
      store,
      now: () => now,
      intervalMs: 60_000,
      scheduleInterval: (callback) => { tick = callback; return 1; },
      cancelInterval: vi.fn(),
    });
    await coordinator.start();

    const visibleDue = await repositories.todos.create(todoInput({ title: '恢复时补报' }));
    now = new Date('2026-08-10T09:05:00+08:00');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listTodos).toHaveBeenCalledTimes(2);
    await coordinator.checkNow();
    expect(notify).toHaveBeenCalledWith(visibleDue);

    const intervalDue = await repositories.todos.create(todoInput({ title: '定时补报', remindAt: '2026-08-10T09:06:00+08:00' }));
    now = new Date('2026-08-10T09:07:00+08:00');
    tick();
    expect(listTodos).toHaveBeenCalledTimes(3);
    await coordinator.checkNow();
    expect(notify).toHaveBeenCalledWith(intervalDue);
    coordinator.stop();
  });

  test('does not persist an id when reminder delivery fails', async () => {
    const repositories = createTestRepositories();
    const due = await repositories.todos.create(todoInput());
    const store = memoryStore();
    const coordinator = createReminderCoordinator({
      repositories,
      notify: vi.fn().mockRejectedValue(new Error('delivery failed')),
      store,
      now: () => new Date('2026-08-10T09:05:00+08:00'),
    });

    await expect(coordinator.start()).rejects.toThrow('delivery failed');

    expect(store.ids.has(due.id)).toBe(false);
    coordinator.stop();
  });

  test('loads current reminder identities and removes legacy todo-only ids', () => {
    window.localStorage.setItem('personal-workbench:notified-reminder-ids', JSON.stringify([
      'legacy-todo',
      'todo::2026-08-10T09:00:00+08:00',
    ]));

    expect(createBrowserReminderIdStore().load()).toEqual(new Set(['todo::2026-08-10T09:00:00+08:00']));
    expect(window.localStorage.getItem('personal-workbench:notified-reminder-ids')).toBe(JSON.stringify(['todo::2026-08-10T09:00:00+08:00']));
  });

  test('clears persisted reminder identities through the shared store boundary', () => {
    window.localStorage.setItem('personal-workbench:notified-reminder-ids', JSON.stringify(['todo::2026-08-10T09:00:00+08:00']));
    const activeStore = createBrowserReminderIdStore();

    clearBrowserReminderIdStore();

    expect(window.localStorage.getItem('personal-workbench:notified-reminder-ids')).toBeNull();
    expect(activeStore.load()).toEqual(new Set());
  });

  test('clears the identities held by an already-running browser coordinator', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoInput());
    const notify = vi.fn().mockResolvedValue(undefined);
    const coordinator = createReminderCoordinator({
      repositories,
      notify,
      store: createBrowserReminderIdStore(),
      now: () => new Date('2026-08-10T09:05:00+08:00'),
    });

    await coordinator.start();
    clearBrowserReminderIdStore();
    await coordinator.checkNow();

    expect(notify).toHaveBeenCalledTimes(2);
    coordinator.stop();
  });

  test('uses the reminder time in the system notification tag', async () => {
    const todo = { id: 'todo', title: '改期提醒', remindAt: '2026-08-10T09:00:00+08:00' } as Todo;
    const adapter = { permission: 'granted' as NotificationPermission, show: vi.fn() };

    await deliverReminder(todo, vi.fn(), adapter);

    expect(adapter.show).toHaveBeenCalledWith('待办提醒', expect.objectContaining({ tag: 'todo-todo-2026-08-10T09:00:00+08:00' }));
  });
});
