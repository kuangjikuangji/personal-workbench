import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { WorkbenchDatabase } from '../db/database';
import { createLocalRepositories } from '../db/localRepositories';
import type { Repositories } from '../db/repositories';
import { ReminderCoordinator } from '../features/todos/ReminderCoordinator';

const defaultRepositories = createLocalRepositories(new WorkbenchDatabase());
const RepositoryContext = createContext<Repositories | null>(null);

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
  repositories = defaultRepositories,
}: PropsWithChildren<{ repositories?: Repositories }>) {
  const [client] = useState(() => new QueryClient());

  return (
    <RepositoryProvider repositories={repositories}>
      <ReminderCoordinator repositories={repositories} />
      <QueryClientProvider client={client}><BrowserRouter>{children}</BrowserRouter></QueryClientProvider>
    </RepositoryProvider>
  );
}
