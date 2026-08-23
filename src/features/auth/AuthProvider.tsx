import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { getWorkbenchSupabaseClient } from '../../lib/supabase/client';
import { readSupabaseConfig } from '../../lib/supabase/config';
import type { SupabaseConfig } from '../../lib/supabase/config';
import {
  createAuthBackend,
  createOfflineProfileCache,
  type OfflineProfileCache,
} from './authService';
import type { AuthBackend, AuthIdentity, AuthState } from './authTypes';

type ConfigResult =
  | { ok: true; value: SupabaseConfig }
  | { ok: false; message: string };

interface AuthContextValue {
  state: AuthState;
  pending: boolean;
  signIn(username: string, password: string): Promise<void>;
  completePasswordChange(currentPassword: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  registerSignOutCleanup(cleanup: () => Promise<void>): () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const defaultConfig = readSupabaseConfig(import.meta.env);

function anonymousError(error: unknown): string {
  if (error instanceof Error && error.message === 'account_inactive') {
    return '账号已停用，请联系管理员。';
  }
  return '账号或密码不正确。';
}

function passwordError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('password_changed_profile_pending')) {
    return '密码已修改，但状态更新失败；请使用新密码重试。';
  }
  if (message.includes('invalid_current_password')) {
    return '当前密码不正确。';
  }
  return '密码修改失败，请稍后重试。';
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function hasUnexpiredSession(session: AuthIdentity['session']): boolean {
  return typeof session.expires_at === 'number' && session.expires_at * 1_000 > Date.now();
}

function createBrowserProfileCache(): OfflineProfileCache | null {
  if (typeof window === 'undefined') return null;
  try {
    return createOfflineProfileCache(window.localStorage);
  } catch {
    return null;
  }
}

export function AuthProvider({
  children,
  backend: injectedBackend,
  config = defaultConfig,
  online = browserOnline,
  profileCache: injectedProfileCache,
}: PropsWithChildren<{
  backend?: AuthBackend;
  config?: ConfigResult;
  online?: () => boolean;
  profileCache?: OfflineProfileCache | null;
}>) {
  const [backend] = useState(() => {
    if (injectedBackend) return injectedBackend;
    if (!config.ok) return null;
    return createAuthBackend(getWorkbenchSupabaseClient(config.value));
  });
  const [profileCache] = useState<OfflineProfileCache | null>(() => {
    if (injectedProfileCache !== undefined) return injectedProfileCache;
    return injectedBackend ? null : createBrowserProfileCache();
  });
  const [state, setState] = useState<AuthState>(
    backend ? { status: 'loading' } : { status: 'misconfigured', message: config.ok ? '系统尚未配置。' : config.message },
  );
  const [pending, setPending] = useState(false);
  const signOutCleanups = useRef(new Set<() => Promise<void>>());
  const transitionEpoch = useRef(0);
  const explicitSignOutInProgress = useRef(false);
  const explicitSignOutPromise = useRef<Promise<void> | null>(null);
  const activeUserId = useRef<string | null>(null);

  const registerSignOutCleanup = useCallback((cleanup: () => Promise<void>) => {
    signOutCleanups.current.add(cleanup);
    return () => { signOutCleanups.current.delete(cleanup); };
  }, []);

  async function runSignOutCleanups(): Promise<void> {
    await Promise.all([...signOutCleanups.current].map((cleanup) => cleanup()));
  }

  function beginTransition(): number {
    transitionEpoch.current += 1;
    return transitionEpoch.current;
  }

  function isCurrentTransition(epoch: number): boolean {
    return transitionEpoch.current === epoch;
  }

  async function applySession(
    session: Awaited<ReturnType<AuthBackend['getSession']>>,
    epoch: number,
  ) {
    if (!backend || explicitSignOutInProgress.current || !isCurrentTransition(epoch)) return;
    if (!session) {
      const previousUserId = activeUserId.current;
      activeUserId.current = null;
      if (previousUserId) profileCache?.remove(previousUserId);
      await runSignOutCleanups();
      if (isCurrentTransition(epoch)) setState({ status: 'anonymous' });
      return;
    }
    const userId = session.user.id;
    const previousUserId = activeUserId.current;
    if (previousUserId && previousUserId !== userId) {
      activeUserId.current = null;
      profileCache?.remove(previousUserId);
      await runSignOutCleanups();
      if (!isCurrentTransition(epoch)) return;
    }

    const requestStartedOnline = online();
    let profile;
    try {
      profile = await backend.getProfile(userId);
    } catch {
      if (!isCurrentTransition(epoch)) return;
      const cachedProfile = !online() && hasUnexpiredSession(session)
        ? profileCache?.read(userId) ?? null
        : null;
      if (cachedProfile?.isActive && !cachedProfile.mustChangePassword) {
        activeUserId.current = userId;
        setState({ status: 'authenticated', identity: { session, profile: cachedProfile } });
        return;
      }

      await runSignOutCleanups();
      if (isCurrentTransition(epoch)) {
        activeUserId.current = null;
        setState({
          status: 'anonymous',
          error: online()
            ? '登录状态验证失败，请稍后重试。'
            : '离线登录状态无法验证，请联网后重试。',
        });
      }
      return;
    }
    if (!isCurrentTransition(epoch)) return;
    if (!profile || profile.id !== userId) {
      profileCache?.remove(userId);
      await runSignOutCleanups();
      if (!isCurrentTransition(epoch)) return;
      await backend.signOut();
      if (isCurrentTransition(epoch)) {
        activeUserId.current = null;
        setState({ status: 'anonymous', error: '账号资料不完整，请联系管理员。' });
      }
      return;
    }
    if (requestStartedOnline) profileCache?.write(profile);
    if (!profile.isActive) {
      profileCache?.remove(userId);
      await runSignOutCleanups();
      if (!isCurrentTransition(epoch)) return;
      await backend.signOut();
      if (isCurrentTransition(epoch)) {
        activeUserId.current = null;
        setState({ status: 'anonymous', error: '账号已停用，请联系管理员。' });
      }
      return;
    }
    const identity: AuthIdentity = { session, profile };
    if (isCurrentTransition(epoch)) {
      activeUserId.current = userId;
      setState(profile.mustChangePassword
        ? { status: 'mustChange', identity }
        : { status: 'authenticated', identity });
    }
  }

  useEffect(() => {
    if (!backend) return;
    let active = true;
    const restoreEpoch = beginTransition();
    void backend.getSession()
      .then((session) => {
        if (active) void applySession(session, restoreEpoch);
      })
      .catch(() => {
        if (active && isCurrentTransition(restoreEpoch)) setState({ status: 'anonymous' });
      });
    const unsubscribe = backend.subscribe((session) => {
      if (active && !explicitSignOutInProgress.current) {
        void applySession(session, beginTransition());
      }
    });
    return () => {
      active = false;
      beginTransition();
      unsubscribe();
    };
  }, [backend, online, profileCache]);

  const value: AuthContextValue = {
    state,
    pending,
    registerSignOutCleanup,
    async signIn(username, password) {
      if (!backend || explicitSignOutInProgress.current) return;
      const epoch = beginTransition();
      setPending(true);
      try {
        await applySession(await backend.signIn(username, password), epoch);
      } catch (error) {
        if (isCurrentTransition(epoch)) {
          setState({ status: 'anonymous', error: anonymousError(error) });
        }
      } finally {
        setPending(false);
      }
    },
    async completePasswordChange(currentPassword, newPassword) {
      if (!backend || explicitSignOutInProgress.current || state.status !== 'mustChange') return;
      const epoch = beginTransition();
      setPending(true);
      try {
        await backend.completePasswordChange(currentPassword, newPassword);
        await applySession(state.identity.session, epoch);
      } catch (error) {
        if (isCurrentTransition(epoch)) setState({ ...state, error: passwordError(error) });
      } finally {
        setPending(false);
      }
    },
    signOut() {
      if (!backend) return Promise.resolve();
      if (explicitSignOutPromise.current) return explicitSignOutPromise.current;

      beginTransition();
      explicitSignOutInProgress.current = true;
      setPending(true);
      const operation = (async () => {
        let failed = false;
        const signingOutUserId = activeUserId.current;
        activeUserId.current = null;
        if (signingOutUserId) profileCache?.remove(signingOutUserId);
        try {
          await runSignOutCleanups();
        } catch {
          failed = true;
        }
        try {
          await backend.signOut();
        } catch {
          failed = true;
        }

        setState(failed
          ? { status: 'anonymous', error: '退出登录未完成，请检查网络后重试。' }
          : { status: 'anonymous' });
        setPending(false);
        explicitSignOutInProgress.current = false;
        explicitSignOutPromise.current = null;
      })();
      explicitSignOutPromise.current = operation;
      return operation;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
