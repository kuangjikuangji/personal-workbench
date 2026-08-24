import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import type { AuthBackend, Profile } from './authTypes';

type ProfileStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export interface OfflineProfileCache {
  read(userId: string): Profile | null;
  remove(userId: string): void;
  write(profile: Profile): void;
}

const offlineProfileCachePrefix = 'personal-workbench:offline-profile:';

function offlineProfileCacheKey(userId: string): string {
  return `${offlineProfileCachePrefix}${userId}`;
}

function isProfile(value: unknown, userId: string): value is Profile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Partial<Profile>;
  return profile.id === userId
    && typeof profile.username === 'string'
    && (profile.role === 'admin' || profile.role === 'member')
    && typeof profile.isActive === 'boolean'
    && typeof profile.mustChangePassword === 'boolean';
}

export function createOfflineProfileCache(storage: ProfileStorage): OfflineProfileCache {
  return {
    read(userId) {
      const key = offlineProfileCacheKey(userId);
      try {
        const serialized = storage.getItem(key);
        if (!serialized) return null;
        const value: unknown = JSON.parse(serialized);
        if (isProfile(value, userId)) return value;
        storage.removeItem(key);
        return null;
      } catch {
        return null;
      }
    },
    remove(userId) {
      try {
        storage.removeItem(offlineProfileCacheKey(userId));
      } catch {
        // Storage cleanup is best-effort; authentication still fails closed.
      }
    },
    write(profile) {
      try {
        storage.setItem(offlineProfileCacheKey(profile.id), JSON.stringify({
          id: profile.id,
          username: profile.username,
          role: profile.role,
          isActive: profile.isActive,
          mustChangePassword: profile.mustChangePassword,
        }));
      } catch {
        // The online identity remains valid even when browser storage is unavailable.
      }
    },
  };
}

export function usernameToInternalEmail(username: string): string {
  return `${username.trim().toLowerCase()}@users.workbench.invalid`;
}

type ProfileAuthRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'role' | 'is_active' | 'must_change_password'
>;

function profileFromRow(row: ProfileAuthRow): Profile {
  if (row.role !== 'admin' && row.role !== 'member') {
    throw new Error('invalid_profile');
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
  };
}

export function createAuthBackend(client: SupabaseClient<Database>): AuthBackend {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    subscribe(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
      return () => data.subscription.unsubscribe();
    },
    async getProfile(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('id,username,role,is_active,must_change_password')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ? profileFromRow(data) : null;
    },
    async signIn(username, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email: usernameToInternalEmail(username),
        password,
      });
      if (error || !data.session) throw error ?? new Error('invalid_credentials');
      return data.session;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async completePasswordChange(currentPassword, newPassword) {
      const { error } = await client.functions.invoke('admin-users', {
        body: { action: 'completePasswordChange', currentPassword, newPassword },
      });
      if (error) throw error;
    },
  };
}
