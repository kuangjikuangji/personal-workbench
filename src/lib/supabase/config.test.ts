import { expect, test } from 'vitest';
import { readSupabaseConfig } from './config';

test('fails closed when Supabase browser configuration is absent', () => {
  expect(readSupabaseConfig({})).toEqual({ ok: false, message: '系统尚未配置。' });
});

test('accepts an HTTPS project URL and anon key', () => {
  expect(readSupabaseConfig({
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
  })).toEqual({ ok: true, value: { url: 'https://project.supabase.co', anonKey: 'public-anon-key' } });
});
