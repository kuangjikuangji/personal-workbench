import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type PropsWithChildren, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';

export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient());

  return <QueryClientProvider client={client}><BrowserRouter>{children}</BrowserRouter></QueryClientProvider>;
}
