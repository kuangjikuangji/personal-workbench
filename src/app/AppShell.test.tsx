import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { vi } from 'vitest';
import type { Profile } from '../features/auth/authTypes';

const pwaState = vi.hoisted(() => ({ needRefresh: false, blockedMessage: '', later: vi.fn(), updateNow: vi.fn() }));
vi.mock('./usePwaUpdate', () => ({ usePwaUpdate: () => pwaState }));

const profile: Profile = {
  id: 'user-1',
  username: 'zhoujingjing',
  role: 'admin',
  isActive: true,
  mustChangePassword: false,
};

function renderAtRoute(route = '/', onSignOut = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShell profile={profile} onSignOut={onSignOut}><h2>占位内容</h2></AppShell>
    </MemoryRouter>,
  );
}

test('shows the authenticated account and provides logout on desktop and mobile', async () => {
  const user = userEvent.setup();
  const onSignOut = vi.fn().mockResolvedValue(undefined);
  renderAtRoute('/', onSignOut);

  expect(screen.getByText('zhoujingjing')).toBeInTheDocument();
  expect(screen.getByText('管理员')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '退出登录' }));
  expect(onSignOut).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: '我的' }));
  expect(screen.getByRole('dialog', { name: '我的' })).toHaveTextContent('zhoujingjing');
  expect(screen.getAllByRole('button', { name: '退出登录' })).toHaveLength(2);
});

test('shows the supplied synchronization status beside each account summary', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AppShell
        profile={profile}
        onSignOut={vi.fn()}
        syncStatus={<p role="status">已同步</p>}
      >
        <h2>占位内容</h2>
      </AppShell>
    </MemoryRouter>,
  );

  expect(screen.getByRole('status')).toHaveTextContent('已同步');
  await user.click(screen.getByRole('button', { name: '我的' }));
  expect(screen.getAllByRole('status')).toHaveLength(2);
});

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
