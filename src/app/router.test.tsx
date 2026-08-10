import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
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
});
