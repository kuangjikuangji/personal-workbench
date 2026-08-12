import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
type ThemeState = { theme: Theme; setTheme: (theme: Theme) => void };
let stopSystemListener: (() => void) | null = null;

function applyTheme(theme: Theme) {
  stopSystemListener?.();
  stopSystemListener = null;
  const apply = (dark: boolean) => document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (theme !== 'system') {
    apply(theme === 'dark');
    return;
  }
  if (typeof window.matchMedia !== 'function') {
    apply(false);
    return;
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  apply(media.matches);
  const handle = (event: MediaQueryListEvent) => apply(event.matches);
  media.addEventListener('change', handle);
  stopSystemListener = () => media.removeEventListener('change', handle);
}

export const useThemeStore = create<ThemeState>()(persist(
  (set) => ({ theme: 'system', setTheme: (theme) => { applyTheme(theme); set({ theme }); } }),
  { name: 'workbench-theme', onRehydrateStorage: () => (state) => applyTheme(state?.theme ?? 'system') },
));

export function initializeTheme() {
  applyTheme(useThemeStore.getState().theme);
}
