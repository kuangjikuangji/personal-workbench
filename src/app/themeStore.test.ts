import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { useThemeStore } from './themeStore';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  useThemeStore.setState({ theme: 'system' });
});

test('persists an explicit theme and applies it to the document', () => {
  const { result } = renderHook(() => useThemeStore());
  act(() => result.current.setTheme('dark'));
  expect(JSON.parse(localStorage.getItem('workbench-theme') ?? '{}')).toMatchObject({ state: { theme: 'dark' } });
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
});

test('system theme follows changes to prefers-color-scheme', () => {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: (_name: string, next: (event: MediaQueryListEvent) => void) => { listener = next; }, removeEventListener: vi.fn() })) });
  const { result } = renderHook(() => useThemeStore());
  act(() => result.current.setTheme('system'));
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  act(() => listener?.({ matches: true } as MediaQueryListEvent));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
});
