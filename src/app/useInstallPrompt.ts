import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let pendingInstallEvent: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingInstallEvent = event as BeforeInstallPromptEvent;
    installListeners.forEach((listener) => listener(pendingInstallEvent));
  });
}

export function useInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(pendingInstallEvent);
  useEffect(() => {
    installListeners.add(setInstallEvent);
    return () => { installListeners.delete(setInstallEvent); };
  }, []);
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    pendingInstallEvent = null;
    installListeners.forEach((listener) => listener(null));
    setInstallEvent(null);
  };
  return { canInstall: installEvent !== null, install };
}
