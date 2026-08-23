import { AppProviders } from './providers';
import { AppRouter } from './router';
import { WorkbenchDatabase } from '../db/database';
import { AuthGate } from '../features/auth/AuthGate';
import { AuthProvider } from '../features/auth/AuthProvider';
import type { AuthBackend } from '../features/auth/authTypes';
import type { AuthIdentity } from '../features/auth/authTypes';
import { useAuth } from '../features/auth/AuthProvider';
import { getWorkbenchSupabaseClient } from '../lib/supabase/client';
import { readSupabaseConfig } from '../lib/supabase/config';
import { SyncProvider, type SyncProviderDependencies } from '../sync/SyncProvider';

const defaultConfig = readSupabaseConfig(import.meta.env);
const workbenchDatabase = new WorkbenchDatabase();

function AuthenticatedWorkbench({
  identity,
  syncDependencies,
}: {
  identity: AuthIdentity;
  syncDependencies: SyncProviderDependencies | null;
}) {
  const auth = useAuth();
  if (!syncDependencies) {
    return <main className="auth-status auth-error" role="alert">同步服务尚未配置。</main>;
  }
  return (
    <SyncProvider dependencies={syncDependencies} identity={identity} key={identity.session.user.id}>
      {(repositories) => (
        <AppProviders repositories={repositories}>
          <AppRouter profile={identity.profile} onSignOut={auth.signOut} />
        </AppProviders>
      )}
    </SyncProvider>
  );
}

export function App({
  authBackend,
  syncDependencies: injectedSyncDependencies,
}: {
  authBackend?: AuthBackend;
  syncDependencies?: SyncProviderDependencies;
} = {}) {
  const productionClient = !authBackend && defaultConfig.ok
    ? getWorkbenchSupabaseClient(defaultConfig.value)
    : null;
  const syncDependencies = injectedSyncDependencies ?? (productionClient
    ? { client: productionClient, database: workbenchDatabase }
    : null);

  return (
    <AuthProvider backend={authBackend}>
      <AuthGate>{(identity) => (
        <AuthenticatedWorkbench identity={identity} syncDependencies={syncDependencies} />
      )}</AuthGate>
    </AuthProvider>
  );
}
