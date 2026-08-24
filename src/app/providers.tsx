import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import type { Repositories } from '../db/repositories';
import { ReminderCoordinator } from '../features/todos/ReminderCoordinator';

const RepositoryContext = createContext<Repositories | null>(null);

export function createWorkbenchQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { networkMode: 'always' },
      queries: { networkMode: 'always' },
    },
  });
}

export function RepositoryProvider({
  children,
  repositories,
}: PropsWithChildren<{ repositories: Repositories }>) {
  return <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoryContext);
  if (!repositories) throw new Error('useRepositories must be used within RepositoryProvider');
  return repositories;
}

export function AppProviders({
  children,
  queryClient,
  repositories,
}: PropsWithChildren<{ queryClient?: QueryClient; repositories: Repositories }>) {
  const [client] = useState(() => queryClient ?? createWorkbenchQueryClient());

  return (
    <RepositoryProvider repositories={repositories}>
      <ReminderCoordinator repositories={repositories} />
      <QueryClientProvider client={client}><HashRouter>{children}</HashRouter></QueryClientProvider>
    </RepositoryProvider>
  );
}
