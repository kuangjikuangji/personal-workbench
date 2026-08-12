import { useSyncExternalStore } from 'react';
import { clearInstallPrompt, getInstallPromptSnapshot, subscribeInstallPrompt } from './installPromptStore';

export function useInstallPrompt() {
  const installEvent = useSyncExternalStore(subscribeInstallPrompt, getInstallPromptSnapshot, getInstallPromptSnapshot);
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    clearInstallPrompt();
  };
  return { canInstall: installEvent !== null, install };
}
