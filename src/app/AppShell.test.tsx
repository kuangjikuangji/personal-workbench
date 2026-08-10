import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';

function renderAtRoute(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShell><h2>占位内容</h2></AppShell>
    </MemoryRouter>,
  );
}

test('moves secondary navigation into the mobile management drawer', async () => {
  const user = userEvent.setup();
  renderAtRoute('/');

  expect(screen.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '管理' }));
  expect(screen.getByRole('link', { name: '系室管理' })).toBeVisible();
  expect(screen.getByRole('link', { name: '学生管理' })).toBeVisible();
});

test('renders the desktop navigation with every available route', () => {
  renderAtRoute('/research');

  expect(screen.getByRole('navigation', { name: '主导航' })).toBeVisible();
  expect(screen.getByRole('link', { name: '个人科研' })).toHaveAttribute('href', '/research');
  expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/settings');
});
