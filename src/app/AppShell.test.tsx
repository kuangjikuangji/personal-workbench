import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { vi } from 'vitest';

const pwaState = vi.hoisted(() => ({ needRefresh: false, blockedMessage: '', later: vi.fn(), updateNow: vi.fn() }));
vi.mock('./usePwaUpdate', () => ({ usePwaUpdate: () => pwaState }));

function renderAtRoute(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShell><h2>占位内容</h2></AppShell>
    </MemoryRouter>,
  );
}

test('provides the five prescribed mobile destinations and separates management from personal drawers', async () => {
  const user = userEvent.setup();
  renderAtRoute('/');

  const bottomNavigation = screen.getByRole('navigation', { name: '底部导航' });
  expect(bottomNavigation).toHaveTextContent('概览待办日历管理我的');
  expect(bottomNavigation).not.toHaveTextContent('待办管理');
  expect(bottomNavigation).not.toHaveTextContent('课表');
  await user.click(screen.getByRole('button', { name: '管理' }));
  const managementNavigation = screen.getByRole('navigation', { name: '管理导航' });
  expect(managementNavigation).toHaveTextContent('课表系室管理学生管理');
  expect(managementNavigation).not.toHaveTextContent('个人科研');
  await user.click(screen.getByRole('button', { name: '关闭' }));
  await user.click(screen.getByRole('button', { name: '我的' }));
  const personalNavigation = screen.getByRole('navigation', { name: '我的导航' });
  expect(personalNavigation).toHaveTextContent('个人科研灵感记录教学备课设置');
  expect(personalNavigation).not.toHaveTextContent('课表');
});

test('renders the desktop navigation with every available route', () => {
  renderAtRoute('/research');

  expect(screen.getByRole('navigation', { name: '主导航' })).toBeVisible();
  expect(screen.getByRole('link', { name: '个人科研' })).toHaveAttribute('href', '/research');
  expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/settings');
});

test('keeps an available update visible and offers later or immediate update', async () => {
  pwaState.needRefresh = true;
  pwaState.blockedMessage = '当前有未保存表单';
  const user = userEvent.setup();
  renderAtRoute('/');
  expect(screen.getByRole('status')).toHaveTextContent('新版本已准备好');
  expect(screen.getByRole('alert')).toHaveTextContent('未保存');
  await user.click(screen.getByRole('button', { name: '稍后' }));
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(pwaState.later).toHaveBeenCalledOnce();
  expect(pwaState.updateNow).toHaveBeenCalledOnce();
});
