import type { Todo } from '../../domain/entities';

export type ReminderNotifier = (todo: Todo) => void | Promise<void>;

export function reminderIdentity(todo: Pick<Todo, 'id' | 'remindAt'>): string | null {
  return todo.remindAt === null ? null : `${todo.id}::${todo.remindAt}`;
}

export function getDueReminders(todos: Todo[], notifiedIds: Set<string>, now: Date): Todo[] {
  return todos.filter((todo) => (
    todo.status === 'open'
      && todo.remindAt !== null
      && !Number.isNaN(new Date(todo.remindAt).getTime())
      && new Date(todo.remindAt) <= now
      && !notifiedIds.has(reminderIdentity(todo)!)
  ));
}

export async function catchUpDueReminders(
  todos: Todo[],
  notifiedIds: Set<string>,
  now: Date,
  notify: ReminderNotifier,
  onNotified?: (ids: Set<string>, todo: Todo) => void | Promise<void>,
): Promise<Todo[]> {
  const due = getDueReminders(todos, notifiedIds, now);
  for (const todo of due) {
    await notify(todo);
    const nextIds = new Set(notifiedIds).add(reminderIdentity(todo)!);
    await onNotified?.(nextIds, todo);
    notifiedIds.add(reminderIdentity(todo)!);
  }
  return due;
}
