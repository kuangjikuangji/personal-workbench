import { render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { createTestRepositories } from '../test/database';
import { AppProviders } from './providers';

afterEach(() => {
  window.location.hash = '';
});

test('reads application routes from the URL hash', async () => {
  window.location.hash = '#/todos';

  render(
    <AppProviders repositories={createTestRepositories()}>
      <Routes>
        <Route path="/todos" element={<h1>待办路由</h1>} />
      </Routes>
    </AppProviders>,
  );

  expect(await screen.findByRole('heading', { name: '待办路由' })).toBeVisible();
});
