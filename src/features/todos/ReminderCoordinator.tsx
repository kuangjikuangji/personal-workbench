import { useEffect } from 'react';
import type { Repositories } from '../../db/repositories';
import type { Todo } from '../../domain/entities';
import { catchUpDueReminders, type ReminderNotifier } from './reminders';

const DEFAULT_INTERVAL_MS = 60_000;
const STORAGE_KEY = 'personal-workbench:notified-reminder-ids';

export interface ReminderIdStore {
  load(): Set<string>;
  save(ids: Set<string>): void | Promise<void>;
}

type ReminderCoordinatorOptions = {
  repositories: Repositories;
  notify?: ReminderNotifier;
  store?: ReminderIdStore;
  now?: () => Date;
  intervalMs?: number;
  visibilitySource?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  scheduleInterval?: (callback: () => void, intervalMs: number) => unknown;
  cancelInterval?: (handle: unknown) => void;
};

export function createReminderCoordinator({
  repositories,
  notify = deliverReminder,
  store = createBrowserReminderIdStore(),
  now = () => new Date(),
  intervalMs = DEFAULT_INTERVAL_MS,
  visibilitySource = document,
  scheduleInterval = (callback, milliseconds) => window.setInterval(callback, milliseconds),
  cancelInterval = (handle) => window.clearInterval(handle as number),
}: ReminderCoordinatorOptions) {
  const notifiedIds = store.load();
  let interval: unknown = null;
  let running: Promise<void> | null = null;

  const checkNow = (): Promise<void> => {
    if (running) return running;
    running = repositories.todos.list()
      .then((todos) => catchUpDueReminders(
        todos,
        notifiedIds,
        now(),
        notify,
        (nextIds) => store.save(nextIds),
      ))
      .then(() => undefined)
      .finally(() => { running = null; });
    return running;
  };

  const onVisibilityChange = () => {
    if (visibilitySource.visibilityState === 'visible') void checkNow().catch(() => undefined);
  };

  return {
    checkNow,
    start() {
      visibilitySource.addEventListener('visibilitychange', onVisibilityChange);
      interval = scheduleInterval(() => { void checkNow().catch(() => undefined); }, intervalMs);
      return checkNow();
    },
    stop() {
      visibilitySource.removeEventListener('visibilitychange', onVisibilityChange);
      if (interval !== null) cancelInterval(interval);
      interval = null;
    },
  };
}

export function ReminderCoordinator({ repositories }: { repositories: Repositories }) {
  useEffect(() => {
    const coordinator = createReminderCoordinator({ repositories });
    void coordinator.start().catch(() => undefined);
    return () => coordinator.stop();
  }, [repositories]);

  return null;
}

export function createBrowserReminderIdStore(): ReminderIdStore {
  let memoryIds = new Set<string>();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) memoryIds = new Set(JSON.parse(saved) as string[]);
  } catch {
    memoryIds = new Set();
  }

  return {
    load: () => new Set(memoryIds),
    save(ids) {
      memoryIds = new Set(ids);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
      } catch {
        // The in-memory copy still prevents duplicate delivery for this application session.
      }
    },
  };
}

export async function deliverReminder(todo: Todo): Promise<void> {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('待办提醒', { body: todo.title, tag: `todo-${todo.id}` });
      return;
    } catch {
      // Fall through to the in-application delivery interface.
    }
  }

  window.dispatchEvent(new CustomEvent<Todo>('workbench:todo-reminder', { detail: todo }));
}
