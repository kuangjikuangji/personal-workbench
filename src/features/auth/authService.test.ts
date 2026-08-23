import { expect, test } from 'vitest';
import { createOfflineProfileCache } from './authService';
import type { Profile } from './authTypes';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  };
}

const profile: Profile = {
  id: 'user-1',
  username: 'zhoujingjing',
  role: 'admin',
  isActive: true,
  mustChangePassword: false,
};

test('persists only a validated minimal profile under its user-specific cache key', () => {
  const { storage } = memoryStorage();
  const cache = createOfflineProfileCache(storage);

  cache.write(profile);

  expect(cache.read('user-1')).toEqual(profile);
  expect(cache.read('user-2')).toBeNull();
  cache.remove('user-1');
  expect(cache.read('user-1')).toBeNull();
});

test('rejects a cached profile whose payload does not match the requested user', () => {
  const { storage, values } = memoryStorage();
  const cache = createOfflineProfileCache(storage);
  cache.write(profile);
  const [key] = [...values.keys()];
  values.set(key, JSON.stringify({ ...profile, id: 'another-user' }));

  expect(cache.read('user-1')).toBeNull();
});
