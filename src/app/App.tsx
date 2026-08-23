import { AppProviders } from './providers';
import { AppRouter } from './router';
import { AuthGate } from '../features/auth/AuthGate';
import { AuthProvider } from '../features/auth/AuthProvider';
import type { AuthBackend } from '../features/auth/authTypes';
import type { AuthIdentity } from '../features/auth/authTypes';
import { useAuth } from '../features/auth/AuthProvider';

function AuthenticatedWorkbench({ identity }: { identity: AuthIdentity }) {
  const auth = useAuth();
  return <AppProviders><AppRouter profile={identity.profile} onSignOut={auth.signOut} /></AppProviders>;
}

export function App({ authBackend }: { authBackend?: AuthBackend } = {}) {
  return (
    <AuthProvider backend={authBackend}>
      <AuthGate>{(identity) => <AuthenticatedWorkbench identity={identity} />}</AuthGate>
    </AuthProvider>
  );
}
