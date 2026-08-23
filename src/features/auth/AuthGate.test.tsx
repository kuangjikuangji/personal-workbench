import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { AuthGate } from './AuthGate';
import { AuthProvider } from './AuthProvider';
import type { AuthBackend, Profile } from './authTypes';

const session = { user: { id: 'user-1' } } as Session;
const activeProfile: Profile = {
  id: 'user-1',
  username: 'zhoujingjing',
  role: 'admin',
  isActive: true,
  mustChangePassword: false,
};

function backend(overrides: Partial<AuthBackend> = {}): AuthBackend {
  return {
    getSession: async () => null,
    subscribe: () => () => undefined,
    getProfile: async () => activeProfile,
    signIn: async () => session,
    signOut: async () => undefined,
    completePasswordChange: async () => undefined,
    ...overrides,
  };
}

test('shows only the login page for an anonymous visitor', async () => {
  render(
    <AuthProvider backend={backend()}>
      <AuthGate>{() => <nav aria-label="主导航" />}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('heading', { name: '个人工作学习工作台' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
});

test('maps rejected credentials to a stable Chinese message', async () => {
  const user = userEvent.setup();
  render(
    <AuthProvider backend={backend({ signIn: async () => { throw new Error('invalid_credentials'); } })}>
      <AuthGate>{() => <div>工作台</div>}</AuthGate>
    </AuthProvider>,
  );

  await user.type(await screen.findByLabelText('账号'), 'zhoujingjing');
  await user.type(screen.getByLabelText('密码'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: '登录' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码不正确');
});

test('forces password change before rendering protected navigation', async () => {
  const mustChange = { ...activeProfile, mustChangePassword: true };
  render(
    <AuthProvider backend={backend({ getSession: async () => session, getProfile: async () => mustChange })}>
      <AuthGate>{() => <nav aria-label="主导航" />}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('heading', { name: '修改初始密码' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
});

test('enters the protected workbench after a successful password change', async () => {
  const user = userEvent.setup();
  let passwordChanged = false;
  const mustChange = { ...activeProfile, mustChangePassword: true };
  const authBackend = backend({
    getSession: async () => session,
    getProfile: async () => passwordChanged ? activeProfile : mustChange,
    completePasswordChange: async (currentPassword, newPassword) => {
      expect(currentPassword).toBe('initial-password');
      expect(newPassword).toBe('new-private-password');
      passwordChanged = true;
    },
  });
  render(
    <AuthProvider backend={authBackend}>
      <AuthGate>{() => <nav aria-label="主导航" />}</AuthGate>
    </AuthProvider>,
  );

  await user.type(await screen.findByLabelText('当前密码'), 'initial-password');
  await user.type(screen.getByLabelText('新密码'), 'new-private-password');
  await user.type(screen.getByLabelText('确认新密码'), 'new-private-password');
  await user.click(screen.getByRole('button', { name: '修改密码并继续' }));

  expect(await screen.findByRole('navigation', { name: '主导航' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '修改初始密码' })).not.toBeInTheDocument();
});

test('renders protected content after restoring an authenticated profile', async () => {
  render(
    <AuthProvider backend={backend({ getSession: async () => session })}>
      <AuthGate>{(identity) => <div>已登录：{identity.profile.username}</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByText('已登录：zhoujingjing')).toBeInTheDocument();
});

test('fails closed when Supabase configuration is absent', async () => {
  render(
    <AuthProvider config={{ ok: false, message: '系统尚未配置。' }}>
      <AuthGate>{() => <div>工作台</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('系统尚未配置。');
  expect(screen.queryByText('工作台')).not.toBeInTheDocument();
});

test('signs out an inactive restored profile', async () => {
  let signOutCalls = 0;
  render(
    <AuthProvider backend={backend({
      getSession: async () => session,
      getProfile: async () => ({ ...activeProfile, isActive: false }),
      signOut: async () => { signOutCalls += 1; },
    })}>
      <AuthGate>{() => <div>工作台</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('账号已停用，请联系管理员');
  await waitFor(() => expect(signOutCalls).toBe(1));
});
