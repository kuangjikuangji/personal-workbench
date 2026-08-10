import type { Todo } from '../../domain/entities';

export type ReminderNotifier = (todo: Todo) => void | Promise<void>;

export function getDueReminders(todos: Todo[], notifiedIds: Set<string>, now: Date): Todo[] {
  return todos.filter((todo) => (
    todo.status === 'open'
      && todo.remindAt !== null
      && !Number.isNaN(new Date(todo.remindAt).getTime())
      && new Date(todo.remindAt) <= now
      && !notifiedIds.has(todo.id)
  ));
}

export async function catchUpDueReminders(
  todos: Todo[],
  notifiedIds: Set<string>,
  now: Date,
  notify: ReminderNotifier,
): Promise<Todo[]> {
  const due = getDueReminders(todos, notifiedIds, now);
  for (const todo of due) {
    await notify(todo);
    notifiedIds.add(todo.id);
  }
  return due;
}
