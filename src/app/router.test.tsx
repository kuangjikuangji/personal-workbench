import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { createTestRepositories } from '../test/database';
import { RepositoryProvider } from './providers';
import { AppRouter } from './router';

function renderRoute(route: string) {
  const repositories = createTestRepositories();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><AppRouter /></MemoryRouter></QueryClientProvider></RepositoryProvider>);
}

describe('schedule routes', () => {
  test('routes to course management', async () => {
    renderRoute('/courses');
    expect(await screen.findByRole('heading', { name: '学期与课表' })).toBeVisible();
  });

  test('routes to the interactive calendar', async () => {
    renderRoute('/calendar');
    expect(await screen.findByRole('button', { name: '月' })).toBeVisible();
    expect(screen.getByRole('button', { name: '周' })).toBeVisible();
    expect(screen.getByRole('button', { name: '日' })).toBeVisible();
  });

  test('routes to teacher management', async () => {
    renderRoute('/teachers');
    expect(await screen.findByRole('heading', { name: '系室管理' })).toBeVisible();
  });

  test('routes to student management', async () => {
    renderRoute('/students');
    expect(await screen.findByRole('button', { name: '新增学生' })).toBeVisible();
  });

  test('routes to backup and install settings', async () => {
    renderRoute('/settings');
    expect(await screen.findByRole('heading', { name: '备份与恢复' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '安装应用' })).toBeVisible();
  });

  test('keeps an install event received before the lazy settings route opens', async () => {
    const prompt = vi.fn();
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted', platform: 'test' }) }));
    renderRoute('/settings');
    expect(await screen.findByRole('button', { name: '安装应用' })).toBeVisible();
  });
});
