import type { ReactNode } from 'react';
import { ChangePasswordPage } from './ChangePasswordPage';
import { LoginPage } from './LoginPage';
import { useAuth } from './AuthProvider';
import type { AuthIdentity } from './authTypes';

export function AuthGate({ children }: { children(identity: AuthIdentity): ReactNode }) {
  const auth = useAuth();
  if (auth.state.status === 'loading') {
    return <main className="auth-status" role="status">正在验证登录状态…</main>;
  }
  if (auth.state.status === 'misconfigured') {
    return <main className="auth-status auth-error" role="alert">{auth.state.message}</main>;
  }
  if (auth.state.status === 'anonymous') {
    return <LoginPage error={auth.state.error ?? null} pending={auth.pending} onSubmit={({ username, password }) => auth.signIn(username, password)} />;
  }
  if (auth.state.status === 'mustChange') {
    return <ChangePasswordPage error={auth.state.error ?? null} pending={auth.pending} onSubmit={auth.completePasswordChange} onSignOut={auth.signOut} />;
  }
  return children(auth.state.identity);
}
