import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test } from 'vitest';
import type { Database } from '../lib/supabase/database.types';
import { entityRegistry } from './entityRegistry';
import { CloudGatewayError, createCloudGateway } from './cloudGateway';
import type { SyncOperation } from './types';

const userId = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-23T01:02:03.000Z';
const serverTimestamp = '2026-08-23T01:02:04.000Z';
const entityKinds = Object.keys(entityRegistry);

type RealtimeHandler = (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void;

function createFakeClient(options: {
  rowsByTable?: Record<string, Record<string, unknown>[]>;
  rpcError?: { message: string; status?: number; code?: string } | null;
} = {}) {
  const requestedTables: string[] = [];
  const requestedUserIds: string[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const changeRegistrations: Array<{ filter: string; table: string }> = [];
  let statusHandler: ((status: string) => void) | undefined;
  let removedChannel: unknown;
  const handlers = new Map<string, RealtimeHandler>();

  const channel = {
    on: (_type: 'postgres_changes', config: { filter: string; table: string }, handler: RealtimeHandler) => {
      changeRegistrations.push({ filter: config.filter, table: config.table });
      handlers.set(config.table, handler);
      return channel;
    },
    subscribe: (handler: (status: string) => void) => {
      statusHandler = handler;
      return channel;
    },
  };

  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: async (_column: string, value: string) => {
          requestedTables.push(table);
          requestedUserIds.push(value);
          return { data: options.rowsByTable?.[table] ?? [], error: null };
        },
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: null, error: options.rpcError ?? null };
    },
    channel: () => channel,
    removeChannel: async (value: unknown) => {
      removedChannel = value;
      return 'ok';
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    requestedTables,
    requestedUserIds,
    rpcCalls,
    changeRegistrations,
    emitChange: (table: string, row: Record<string, unknown>) => handlers.get(table)?.({ new: row, old: {} }),
    emitStatus: (status: string) => statusHandler?.(status),
    removedChannel: () => removedChannel,
    channel,
  };
}

function todoOperation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: 'operation-1',
    userId,
    entityKind: 'todos',
    entityId: 'todo-1',
    type: 'upsert',
    localCreate: true,
    record: {
      id: 'todo-1',
      createdAt: timestamp,
      updatedAt: timestamp,
      title: 'Review gateway',
      description: '',
      role: 'dean',
      startAt: null,
      endAt: null,
      remindAt: null,
      priority: 'medium',
      status: 'open',
      sourceType: null,
      sourceId: null,
    },
    clientUpdatedAt: timestamp,
    retryCount: 0,
    lastError: null,
    createdAt: timestamp,
    ...overrides,
  };
}

describe('cloud gateway', () => {
  test('pullAll reads every registered table only for the authenticated user and normalizes receipt metadata separately', async () => {
    const fake = createFakeClient({
      rowsByTable: {
        todos: [{
          id: 'todo-1',
          user_id: userId,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
          server_updated_at: serverTimestamp,
          title: 'Review gateway',
          description: '',
          role: 'dean',
          start_at: null,
          end_at: null,
          remind_at: null,
          priority: 'medium',
          status: 'open',
          source_type: null,
          source_id: null,
        }],
      },
    });

    const changes = await createCloudGateway(fake.client, userId).pullAll();

    expect(fake.requestedTables).toEqual(entityKinds);
    expect(fake.requestedUserIds).toEqual(entityKinds.map(() => userId));
    expect(changes).toEqual([{
      entityKind: 'todos',
      entityId: 'todo-1',
      value: {
        id: 'todo-1',
        createdAt: timestamp,
        updatedAt: timestamp,
        title: 'Review gateway',
        description: '',
        role: 'dean',
        startAt: null,
        endAt: null,
        remindAt: null,
        priority: 'medium',
        status: 'open',
        sourceType: null,
        sourceId: null,
      },
      deletedAt: null,
      clientUpdatedAt: timestamp,
      serverUpdatedAt: serverTimestamp,
    }]);
  });

  test('apply serializes an upsert and sends its client timestamp to the conflict-safe RPC', async () => {
    const fake = createFakeClient();

    await createCloudGateway(fake.client, userId).apply(todoOperation());

    expect(fake.rpcCalls).toEqual([{
      name: 'apply_workbench_change',
      args: {
        p_table: 'todos',
        p_record: {
          id: 'todo-1',
          created_at: timestamp,
          updated_at: timestamp,
          title: 'Review gateway',
          description: '',
          role: 'dean',
          start_at: null,
          end_at: null,
          remind_at: null,
          priority: 'medium',
          status: 'open',
          source_type: null,
          source_id: null,
        },
        p_client_updated_at: timestamp,
        p_deleted_at: null,
      },
    }]);
  });

  test('apply supplies the correct identity and tombstone timestamp for deletes', async () => {
    const fake = createFakeClient();

    await createCloudGateway(fake.client, userId).apply(todoOperation({ type: 'delete', record: null }));
    await createCloudGateway(fake.client, userId).apply(todoOperation({
      entityKind: 'app_settings', entityId: 'theme', type: 'delete', record: null,
    }));

    expect(fake.rpcCalls.map(({ args }) => args)).toEqual([
      { p_table: 'todos', p_record: { id: 'todo-1' }, p_client_updated_at: timestamp, p_deleted_at: timestamp },
      { p_table: 'app_settings', p_record: { key: 'theme' }, p_client_updated_at: timestamp, p_deleted_at: timestamp },
    ]);
  });

  test('subscribes to every table with the current-user filter, normalizes events, and removes the channel', async () => {
    const fake = createFakeClient();
    const changes: unknown[] = [];
    const statuses: string[] = [];
    const gateway = createCloudGateway(fake.client, userId);

    const unsubscribe = gateway.subscribe((change) => changes.push(change), (status) => statuses.push(status));
    fake.emitStatus('SUBSCRIBED');
    fake.emitChange('app_settings', {
      key: 'theme', value: 'dark', updated_at: timestamp, deleted_at: null, server_updated_at: serverTimestamp, user_id: userId,
    });
    await unsubscribe();

    expect(fake.changeRegistrations).toEqual(entityKinds.map((table) => ({
      table,
      filter: `user_id=eq.${userId}`,
    })));
    expect(statuses).toEqual(['SUBSCRIBED']);
    expect(changes).toEqual([{
      entityKind: 'app_settings', entityId: 'theme', value: { key: 'theme', value: 'dark', updatedAt: timestamp },
      deletedAt: null, clientUpdatedAt: timestamp, serverUpdatedAt: serverTimestamp,
    }]);
    expect(fake.removedChannel()).toBe(fake.channel);
  });

  test('classifies authorization failures without exposing sensitive remote details', async () => {
    const fake = createFakeClient({
      rpcError: { message: `access denied for ${userId} token=secret`, status: 401 },
    });

    await expect(createCloudGateway(fake.client, userId).apply(todoOperation())).rejects.toEqual(
      new CloudGatewayError('auth'),
    );
  });

  test.each([
    [{ message: 'not allowed', status: 403 }, 'permission'],
    [{ message: 'invalid record', status: 422 }, 'validation'],
    [{ message: 'connection lost' }, 'network'],
  ] as const)('classifies remote failures as %s errors', async (rpcError, kind) => {
    const fake = createFakeClient({ rpcError });

    await expect(createCloudGateway(fake.client, userId).apply(todoOperation())).rejects.toEqual(
      new CloudGatewayError(kind),
    );
  });
});
