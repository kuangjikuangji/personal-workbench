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

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  commit_timestamp?: string;
};
type RealtimeHandler = (payload: RealtimePayload) => void;

function createFakeClient(options: {
  rowsByTable?: Record<string, Record<string, unknown>[]>;
  rpcError?: { message: string; status?: number; code?: string } | null;
  rpcData?: unknown;
  queryReject?: unknown;
  rpcReject?: unknown;
  channelError?: unknown;
  removeReject?: unknown;
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
          if (options.queryReject) throw options.queryReject;
          return { data: options.rowsByTable?.[table] ?? [], error: null };
        },
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (options.rpcReject) throw options.rpcReject;
      const record = args.p_record as Record<string, unknown>;
      return {
        data: options.rpcData ?? {
          applied: true,
          row: {
            ...record,
            user_id: userId,
            updated_at: args.p_client_updated_at,
            deleted_at: args.p_deleted_at,
            server_updated_at: serverTimestamp,
          },
        },
        error: options.rpcError ?? null,
      };
    },
    channel: () => {
      if (options.channelError) throw options.channelError;
      return channel;
    },
    removeChannel: async (value: unknown) => {
      removedChannel = value;
      if (options.removeReject) throw options.removeReject;
      return 'ok';
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    requestedTables,
    requestedUserIds,
    rpcCalls,
    changeRegistrations,
    emitChange: (table: string, row: Record<string, unknown>) => handlers.get(table)?.({ eventType: 'UPDATE', new: row, old: {} }),
    emitDelete: (table: string, row: Record<string, unknown>, commitTimestamp = serverTimestamp) => handlers.get(table)?.({
      eventType: 'DELETE', new: {}, old: row, commit_timestamp: commitTimestamp,
    }),
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

    const result = await createCloudGateway(fake.client, userId).apply(todoOperation());

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
    expect(result.applied).toBe(true);
    expect(result.change).toMatchObject({
      entityKind: 'todos', entityId: 'todo-1', deletedAt: null,
      clientUpdatedAt: timestamp, serverUpdatedAt: serverTimestamp,
    });
  });

  test('apply returns the authoritative server row when a stale operation is not applied', async () => {
    const fake = createFakeClient({
      rpcData: {
        applied: false,
        row: {
          id: 'todo-1', user_id: userId, created_at: timestamp, updated_at: serverTimestamp,
          deleted_at: null, server_updated_at: serverTimestamp, title: 'Authoritative title', description: '',
          role: 'dean', start_at: null, end_at: null, remind_at: null, priority: 'high', status: 'done',
          source_type: null, source_id: null,
        },
      },
    });

    const result = await createCloudGateway(fake.client, userId).apply(todoOperation());

    expect(result).toEqual({
      applied: false,
      change: {
        entityKind: 'todos', entityId: 'todo-1', deletedAt: null,
        clientUpdatedAt: serverTimestamp, serverUpdatedAt: serverTimestamp,
        value: {
          id: 'todo-1', createdAt: timestamp, updatedAt: serverTimestamp, title: 'Authoritative title',
          description: '', role: 'dean', startAt: null, endAt: null, remindAt: null, priority: 'high',
          status: 'done', sourceType: null, sourceId: null,
        },
      },
    });
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

    const subscription = gateway.subscribe((change) => changes.push(change), (status) => statuses.push(status));
    fake.emitStatus('SUBSCRIBED');
    await subscription.ready;
    fake.emitChange('app_settings', {
      key: 'theme', value: 'dark', updated_at: timestamp, deleted_at: null, server_updated_at: serverTimestamp, user_id: userId,
    });
    await subscription.unsubscribe();

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

  test('uses the old row to normalize physical realtime deletes as tombstones', () => {
    const fake = createFakeClient();
    const changes: unknown[] = [];
    const subscription = createCloudGateway(fake.client, userId).subscribe((change) => changes.push(change), () => {});

    fake.emitDelete('app_settings', {
      key: 'theme', value: 'dark', updated_at: timestamp, deleted_at: null, server_updated_at: serverTimestamp, user_id: userId,
    }, '2026-08-23T01:02:05.000Z');
    void subscription.unsubscribe();

    expect(changes).toEqual([{
      entityKind: 'app_settings', entityId: 'theme', value: { key: 'theme', value: 'dark', updatedAt: timestamp },
      deletedAt: '2026-08-23T01:02:05.000Z', clientUpdatedAt: timestamp, serverUpdatedAt: serverTimestamp,
    }]);
  });

  test('readiness waits through an initial channel error until the channel is actually subscribed', async () => {
    const fake = createFakeClient();
    const statuses: string[] = [];
    const subscription = createCloudGateway(fake.client, userId).subscribe(
      () => {},
      (status) => statuses.push(status),
    );
    let ready = false;
    void subscription.ready.then(() => { ready = true; });

    fake.emitStatus('CHANNEL_ERROR');
    await Promise.resolve();
    expect(ready).toBe(false);

    fake.emitStatus('SUBSCRIBED');
    await subscription.ready;

    expect(ready).toBe(true);
    expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED']);
    await subscription.unsubscribe();
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

  test('classifies SQLSTATE class 23 integrity violations as validation errors', async () => {
    const fake = createFakeClient({ rpcError: { message: 'duplicate key token=secret', code: '23505' } });

    await expect(createCloudGateway(fake.client, userId).apply(todoOperation())).rejects.toEqual(
      new CloudGatewayError('validation'),
    );
  });

  test('sanitizes rejected pull and apply transport promises', async () => {
    const rejected = new Error(`network token=secret user=${userId}`);

    await expect(createCloudGateway(createFakeClient({ queryReject: rejected }).client, userId).pullAll()).rejects.toEqual(
      new CloudGatewayError('network'),
    );
    await expect(createCloudGateway(createFakeClient({ rpcReject: rejected }).client, userId).apply(todoOperation())).rejects.toEqual(
      new CloudGatewayError('network'),
    );
  });

  test('sanitizes channel setup and removal failures', async () => {
    const rejected = new Error('channel failed token=secret');

    expect(() => createCloudGateway(createFakeClient({ channelError: rejected }).client, userId).subscribe(() => {}, () => {}))
      .toThrow(new CloudGatewayError('network'));

    const fake = createFakeClient({ removeReject: rejected });
    const subscription = createCloudGateway(fake.client, userId).subscribe(() => {}, () => {});
    await expect(subscription.unsubscribe()).rejects.toEqual(new CloudGatewayError('network'));
  });
});
