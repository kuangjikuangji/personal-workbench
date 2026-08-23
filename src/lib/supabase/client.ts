import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { SupabaseConfig } from './config';

export function createWorkbenchSupabaseClient(config: SupabaseConfig) {
  return createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}
