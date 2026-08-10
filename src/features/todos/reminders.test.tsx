import { describe, expect, test, vi } from 'vitest';
import type { Todo } from '../../domain/entities';
import { catchUpDueReminders, getDueReminders } from './reminders';

function todoFixture(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo',
    title: '待办',
    description: '',
    role: 'personal',
    startAt: null,
    endAt: null,
    remindAt: null,
    priority: 'normal',
    status: 'open',
    sourceType: null,
    sourceId: null,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('todo reminders', () => {
  test('returns overdue reminders that have not been notified', () => {
    const due = getDueReminders([
      todoFixture({ id: 'a', remindAt: '2026-08-10T09:00:00+08:00', status: 'open' }),
      todoFixture({ id: 'b', remindAt: '2026-08-10T09:00:00+08:00', status: 'done' }),
      todoFixture({ id: 'c', remindAt: '2026-08-10T09:10:00+08:00', status: 'open' }),
    ], new Set(), new Date('2026-08-10T09:05:00+08:00'));

    expect(due.map((item) => item.id)).toEqual(['a']);
  });

  test('notifies each missed reminder once during catch-up', async () => {
    const notified = new Set<string>();
    const notify = vi.fn().mockResolvedValue(undefined);
    const todos = [todoFixture({ id: 'a', remindAt: '2026-08-10T09:00:00+08:00' })];

    await catchUpDueReminders(todos, notified, new Date('2026-08-10T09:05:00+08:00'), notify);
    await catchUpDueReminders(todos, notified, new Date('2026-08-10T09:06:00+08:00'), notify);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notified).toEqual(new Set(['a']));
  });
});
