import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { SupabaseConfig } from './config';

const clients = new Map<string, SupabaseClient<Database>>();

function configKey(config: SupabaseConfig): string {
  return `${config.url}\u0000${config.anonKey}`;
}

export function createWorkbenchSupabaseClient(config: SupabaseConfig) {
  return createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

export function getWorkbenchSupabaseClient(config: SupabaseConfig): SupabaseClient<Database> {
  const key = configKey(config);
  const existing = clients.get(key);
  if (existing) return existing;

  const client = createWorkbenchSupabaseClient(config);
  clients.set(key, client);
  return client;
}
