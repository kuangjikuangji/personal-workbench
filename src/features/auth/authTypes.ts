import type { Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  username: string;
  role: 'admin' | 'member';
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface AuthIdentity {
  session: Session;
  profile: Profile;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; error?: string }
  | { status: 'mustChange'; identity: AuthIdentity; error?: string }
  | { status: 'authenticated'; identity: AuthIdentity }
  | { status: 'misconfigured'; message: string };

export interface AuthBackend {
  getSession(): Promise<Session | null>;
  subscribe(callback: (session: Session | null) => void): () => void;
  getProfile(userId: string): Promise<Profile | null>;
  signIn(username: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  completePasswordChange(currentPassword: string, newPassword: string): Promise<void>;
}
