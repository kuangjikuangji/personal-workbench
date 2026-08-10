import { useCallback, useEffect, useState } from 'react';
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
  notify: ReminderNotifier;
  store?: ReminderIdStore;
  now?: () => Date;
  intervalMs?: number;
  visibilitySource?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  scheduleInterval?: (callback: () => void, intervalMs: number) => unknown;
  cancelInterval?: (handle: unknown) => void;
};

export function createReminderCoordinator({
  repositories,
  notify,
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

export interface BrowserNotificationAdapter {
  permission: NotificationPermission;
  show(title: string, options: NotificationOptions): void;
}

export type InAppReminderDelivery = (todo: Todo) => boolean | void | Promise<boolean | void>;

type ReminderCoordinatorProps = {
  repositories: Repositories;
  store?: ReminderIdStore;
  now?: () => Date;
  notificationAdapter?: BrowserNotificationAdapter | null;
  inAppDelivery?: InAppReminderDelivery;
};

const currentTime = () => new Date();

export function ReminderCoordinator({
  repositories,
  store,
  now = currentTime,
  notificationAdapter,
  inAppDelivery,
}: ReminderCoordinatorProps) {
  const [defaultStore] = useState(createBrowserReminderIdStore);
  const [defaultNotificationAdapter] = useState(createBrowserNotificationAdapter);
  const [visibleReminders, setVisibleReminders] = useState<Todo[]>([]);
  const showInApp = useCallback<InAppReminderDelivery>((todo) => {
    setVisibleReminders((current) => current.some((item) => item.id === todo.id) ? current : [...current, todo]);
    return true;
  }, []);
  const effectiveNotificationAdapter = notificationAdapter === undefined
    ? defaultNotificationAdapter
    : notificationAdapter;
  const notify = useCallback<ReminderNotifier>(
    (todo) => deliverReminder(todo, inAppDelivery ?? showInApp, effectiveNotificationAdapter),
    [effectiveNotificationAdapter, inAppDelivery, showInApp],
  );

  useEffect(() => {
    const coordinator = createReminderCoordinator({
      repositories,
      notify,
      store: store ?? defaultStore,
      now,
    });
    void coordinator.start().catch(() => undefined);
    return () => coordinator.stop();
  }, [defaultStore, notify, now, repositories, store]);

  if (visibleReminders.length === 0) return null;

  return (
    <section aria-label="待办提醒" aria-live="assertive" className="reminder-toasts" role="region">
      {visibleReminders.map((todo) => (
        <article className="reminder-toast" key={todo.id} role="status">
          <div><strong>待办提醒</strong><p>{todo.title}</p></div>
          <button aria-label={`关闭提醒：${todo.title}`} type="button" onClick={() => setVisibleReminders((current) => current.filter((item) => item.id !== todo.id))}>知道了</button>
        </article>
      ))}
    </section>
  );
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

export function createBrowserNotificationAdapter(): BrowserNotificationAdapter | null {
  if (typeof Notification === 'undefined') return null;
  return {
    permission: Notification.permission,
    show: (title, options) => { new Notification(title, options); },
  };
}

export async function deliverReminder(
  todo: Todo,
  showInApp: InAppReminderDelivery,
  notificationAdapter = createBrowserNotificationAdapter(),
): Promise<void> {
  if (notificationAdapter?.permission === 'granted') {
    try {
      notificationAdapter.show('待办提醒', { body: todo.title, tag: `todo-${todo.id}` });
      return;
    } catch {
      // Fall through to the in-application delivery interface.
    }
  }

  const accepted = await showInApp(todo);
  if (accepted === false) throw new Error('In-app reminder delivery was rejected');
}
