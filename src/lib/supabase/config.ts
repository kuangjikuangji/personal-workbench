import { z } from 'zod';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const supabaseConfigSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export function readSupabaseConfig(env: Record<string, unknown>) :
  | { ok: true; value: SupabaseConfig }
  | { ok: false; message: string } {
  const parsed = supabaseConfigSchema.safeParse(env);

  if (!parsed.success) {
    return { ok: false, message: '系统尚未配置。' };
  }

  return {
    ok: true,
    value: {
      url: parsed.data.VITE_SUPABASE_URL,
      anonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
    },
  };
}
