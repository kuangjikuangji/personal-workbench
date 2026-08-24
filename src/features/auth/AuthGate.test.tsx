import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AuthGate } from './AuthGate';
import { AuthProvider, useAuth } from './AuthProvider';
import { createOfflineProfileCache, type OfflineProfileCache } from './authService';
import type { AuthBackend, Profile } from './authTypes';
import { afterEach, vi } from 'vitest';

const session = { user: { id: 'user-1' } } as Session;
const activeProfile: Profile = {
  id: 'user-1',
  username: 'zhoujingjing',
  role: 'admin',
  isActive: true,
  mustChangePassword: false,
};

function persistentSession(userId = 'user-1', expiresAt = 4_102_444_800): Session {
  return { user: { id: userId }, expires_at: expiresAt } as Session;
}

function profileCache(): OfflineProfileCache {
  const values = new Map<string, string>();
  return createOfflineProfileCache({
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  });
}

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

function SignOutControl() {
  const auth = useAuth();
  return (
    <button type="button" onClick={() => { void auth.signOut().catch(() => undefined); }}>
      end session
    </button>
  );
}

function CleanupRegistration({ cleanup }: { cleanup: () => Promise<void> }) {
  const auth = useAuth();
  useEffect(
    () => auth.registerSignOutCleanup(cleanup),
    [auth.registerSignOutCleanup, cleanup],
  );
  return null;
}

afterEach(() => {
  window.localStorage.clear();
});

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

test('restores a validated cached profile only after an offline profile fetch failure', async () => {
  const cache = profileCache();
  const restoredSession = persistentSession();
  const online = render(
    <AuthProvider backend={backend({ getSession: async () => restoredSession })} online={() => true} profileCache={cache}>
      <AuthGate>{(identity) => <div>已登录：{identity.profile.username}</div>}</AuthGate>
    </AuthProvider>,
  );
  expect(await screen.findByText('已登录：zhoujingjing')).toBeInTheDocument();
  online.unmount();

  render(
    <AuthProvider
      backend={backend({
        getSession: async () => restoredSession,
        getProfile: async () => { throw new Error('network unavailable'); },
      })}
      online={() => false}
      profileCache={cache}
    >
      <AuthGate>{(identity) => <div>离线恢复：{identity.profile.username}</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByText('离线恢复：zhoujingjing')).toBeInTheDocument();
});

test('freezes behind neutral verification UI when the initial online profile transport fails', async () => {
  const cache = profileCache();
  cache.write(activeProfile);
  const signOut = vi.fn(async () => undefined);
  render(
    <AuthProvider
      backend={backend({
        getSession: async () => persistentSession(),
        getProfile: async () => { throw new Error('service unavailable'); },
        signOut,
      })}
      online={() => true}
      profileCache={cache}
    >
      <AuthGate>{() => <div>protected workbench</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('status')).toHaveTextContent('正在验证登录状态');
  expect(screen.queryByText('protected workbench')).not.toBeInTheDocument();
  expect(cache.read('user-1')).toEqual(activeProfile);
  expect(signOut).not.toHaveBeenCalled();
});

test('does not fall back to cached authority when an online profile request drops offline', async () => {
  const cache = profileCache();
  cache.write(activeProfile);
  let isOnline = true;
  const signOut = vi.fn(async () => undefined);
  const getProfile = vi.fn(async () => {
    isOnline = false;
    throw new Error('transport dropped');
  });
  render(
    <AuthProvider
      backend={backend({
        getSession: async () => persistentSession(),
        getProfile,
        signOut,
      })}
      online={() => isOnline}
      profileCache={cache}
    >
      <AuthGate>{() => <div>protected workbench</div>}</AuthGate>
    </AuthProvider>,
  );

  await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('status')).toHaveTextContent('正在验证登录状态');
  expect(screen.queryByText('protected workbench')).not.toBeInTheDocument();
  expect(cache.read('user-1')).toEqual(activeProfile);
  expect(signOut).not.toHaveBeenCalled();
});

test('hides protected UI but preserves the mirror cleanup lease when online profile revalidation fails', async () => {
  const cache = profileCache();
  const restoredSession = persistentSession();
  let emitSession: ((nextSession: Session | null) => void) | undefined;
  let profileRequests = 0;
  const cleanup = vi.fn(async () => undefined);
  const signOut = vi.fn(async () => undefined);
  render(
    <AuthProvider
      backend={backend({
        getSession: async () => restoredSession,
        subscribe: (callback) => {
          emitSession = callback;
          return () => undefined;
        },
        getProfile: async () => {
          profileRequests += 1;
          if (profileRequests === 1) return activeProfile;
          throw new Error('profile validation unavailable');
        },
        signOut,
      })}
      online={() => true}
      profileCache={cache}
    >
      <AuthGate>{() => (
        <>
          <div>protected workbench</div>
          <CleanupRegistration cleanup={cleanup} />
        </>
      )}</AuthGate>
    </AuthProvider>,
  );
  expect(await screen.findByText('protected workbench')).toBeInTheDocument();
  expect(cache.read('user-1')).toEqual(activeProfile);

  act(() => { emitSession?.(restoredSession); });

  expect(await screen.findByRole('status')).toHaveTextContent('正在验证登录状态');
  expect(screen.queryByText('protected workbench')).not.toBeInTheDocument();
  expect(cleanup).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
  expect(cache.read('user-1')).toEqual(activeProfile);
});

test.each([
  {
    name: 'another user session',
    session: persistentSession('user-2'),
    cached: activeProfile,
  },
  {
    name: 'expired session',
    session: persistentSession('user-1', 1),
    cached: activeProfile,
  },
  {
    name: 'inactive cached profile',
    session: persistentSession(),
    cached: { ...activeProfile, isActive: false },
  },
  {
    name: 'forced-password-change cached profile',
    session: persistentSession(),
    cached: { ...activeProfile, mustChangePassword: true },
  },
])('fails closed offline for $name', async ({ session: restoredSession, cached }) => {
  const cache = profileCache();
  cache.write(cached);
  render(
    <AuthProvider
      backend={backend({
        getSession: async () => restoredSession,
        getProfile: async () => { throw new Error('offline'); },
      })}
      online={() => false}
      profileCache={cache}
    >
      <AuthGate>{() => <div>protected workbench</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('离线登录状态无法验证');
  expect(screen.queryByText('protected workbench')).not.toBeInTheDocument();
});

test('does not consult a cache when no persisted session exists', async () => {
  const cache = profileCache();
  cache.write(activeProfile);
  const getProfile = vi.fn(async () => activeProfile);
  render(
    <AuthProvider
      backend={backend({ getSession: async () => null, getProfile })}
      online={() => false}
      profileCache={cache}
    >
      <AuthGate>{() => <div>protected workbench</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(getProfile).not.toHaveBeenCalled();
});

test('keeps injected backends isolated from the browser profile cache by default', async () => {
  createOfflineProfileCache(window.localStorage).write(activeProfile);
  render(
    <AuthProvider backend={backend({
      getSession: async () => persistentSession(),
      getProfile: async () => { throw new Error('offline'); },
    })} online={() => false}>
      <AuthGate>{() => <div>protected workbench</div>}</AuthGate>
    </AuthProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('离线登录状态无法验证');
  expect(screen.queryByText('protected workbench')).not.toBeInTheDocument();
});

test('removes the cached profile on explicit sign-out', async () => {
  const cache = profileCache();
  render(
    <AuthProvider
      backend={backend({ getSession: async () => persistentSession() })}
      online={() => true}
      profileCache={cache}
    >
      <AuthGate>{() => <><div>protected workbench</div><SignOutControl /></>}</AuthGate>
    </AuthProvider>,
  );
  await screen.findByText('protected workbench');
  expect(cache.read('user-1')).toEqual(activeProfile);

  await userEvent.setup().click(screen.getByRole('button', { name: 'end session' }));

  expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(cache.read('user-1')).toBeNull();
});

test('removes the previous cached profile on a direct account replacement', async () => {
  const cache = profileCache();
  const secondSession = persistentSession('user-2');
  const secondProfile: Profile = { ...activeProfile, id: 'user-2', username: 'second-user' };
  let emitSession: ((nextSession: Session | null) => void) | undefined;
  render(
    <AuthProvider
      backend={backend({
        getSession: async () => persistentSession(),
        subscribe: (callback) => {
          emitSession = callback;
          return () => undefined;
        },
        getProfile: async (userId) => userId === 'user-1' ? activeProfile : secondProfile,
      })}
      online={() => true}
      profileCache={cache}
    >
      <AuthGate>{(identity) => <div>已登录：{identity.profile.username}</div>}</AuthGate>
    </AuthProvider>,
  );
  expect(await screen.findByText('已登录：zhoujingjing')).toBeInTheDocument();
  expect(cache.read('user-1')).toEqual(activeProfile);

  act(() => { emitSession?.(secondSession); });

  expect(await screen.findByText('已登录：second-user')).toBeInTheDocument();
  expect(cache.read('user-1')).toBeNull();
  expect(cache.read('user-2')).toEqual(secondProfile);
});

test('ignores an older deferred profile after a newer anonymous session event', async () => {
  let emitSession: ((nextSession: Session | null) => void) | undefined;
  let finishProfile: ((nextProfile: Profile) => void) | undefined;
  const deferredProfile = new Promise<Profile>((resolve) => { finishProfile = resolve; });
  const getProfile = vi.fn(() => deferredProfile);
  render(
    <AuthProvider backend={backend({
      getSession: async () => session,
      subscribe: (callback) => {
        emitSession = callback;
        return () => undefined;
      },
      getProfile,
    })}>
      <AuthGate>{() => <nav aria-label="主导航" />}</AuthGate>
    </AuthProvider>,
  );

  await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
  act(() => { emitSession?.(null); });
  expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();

  await act(async () => {
    finishProfile?.(activeProfile);
    await deferredProfile;
  });

  expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
});

test('does not sign out a newer identity when an older inactive profile resolves late', async () => {
  const newerSession = { user: { id: 'user-2' } } as Session;
  const newerProfile: Profile = { ...activeProfile, id: 'user-2', username: 'newer-user' };
  let emitSession: ((nextSession: Session | null) => void) | undefined;
  let finishOlderProfile: ((nextProfile: Profile) => void) | undefined;
  const olderProfile = new Promise<Profile>((resolve) => { finishOlderProfile = resolve; });
  const signOut = vi.fn(async () => undefined);
  render(
    <AuthProvider backend={backend({
      getSession: async () => session,
      subscribe: (callback) => {
        emitSession = callback;
        return () => undefined;
      },
      getProfile: async (requestedUserId) => (
        requestedUserId === 'user-1' ? olderProfile : newerProfile
      ),
      signOut,
    })}>
      <AuthGate>{(currentIdentity) => <div>已登录：{currentIdentity.profile.username}</div>}</AuthGate>
    </AuthProvider>,
  );

  await waitFor(() => expect(emitSession).toBeDefined());
  act(() => { emitSession?.(newerSession); });
  expect(await screen.findByText('已登录：newer-user')).toBeInTheDocument();

  await act(async () => {
    finishOlderProfile?.({ ...activeProfile, isActive: false });
    await olderProfile;
  });

  expect(screen.getByText('已登录：newer-user')).toBeInTheDocument();
  expect(signOut).not.toHaveBeenCalled();
});

test('fails closed to anonymous UI when backend sign-out rejects', async () => {
  render(
    <AuthProvider backend={backend({
      getSession: async () => session,
      signOut: async () => { throw new Error('remote sign-out failed'); },
    })}>
      <AuthGate>{() => <><div>protected workbench</div><SignOutControl /></>}</AuthGate>
    </AuthProvider>,
  );

  await userEvent.setup().click(await screen.findByRole('button', { name: 'end session' }));

  expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('退出登录未完成');
  expect(screen.queryByText('protected workbench')).not.toBeInTheDocument();
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
