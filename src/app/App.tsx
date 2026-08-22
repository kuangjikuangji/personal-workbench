import { AppProviders } from './providers';
import { AppRouter } from './router';
import { AuthGate } from '../features/auth/AuthGate';
import { AuthProvider } from '../features/auth/AuthProvider';
import type { AuthBackend } from '../features/auth/authTypes';

export function App({ authBackend }: { authBackend?: AuthBackend } = {}) {
  return (
    <AuthProvider backend={authBackend}>
      <AuthGate>{() => <AppProviders><AppRouter /></AppProviders>}</AuthGate>
    </AuthProvider>
  );
}
