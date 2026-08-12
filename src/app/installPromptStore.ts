export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let pendingInstallEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function getInstallPromptSnapshot() {
  return pendingInstallEvent;
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function clearInstallPrompt() {
  pendingInstallEvent = null;
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingInstallEvent = event as BeforeInstallPromptEvent;
    listeners.forEach((listener) => listener());
  });
}
