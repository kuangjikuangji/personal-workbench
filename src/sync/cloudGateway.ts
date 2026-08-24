import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../lib/supabase/database.types';
import { deserializeEntity, entityRegistry, serializeEntity } from './entityRegistry';
import type { EntityKind, EntityValueByKind, SyncOperation } from './types';

export type CloudGatewayErrorKind = 'network' | 'auth' | 'permission' | 'validation';

const errorMessages: Record<CloudGatewayErrorKind, string> = {
  network: 'Cloud sync is temporarily unavailable.',
  auth: 'Cloud sync requires authentication.',
  permission: 'Cloud sync is not permitted for this account.',
  validation: 'Cloud sync rejected this change.',
};

export class CloudGatewayError extends Error {
  readonly kind: CloudGatewayErrorKind;

  constructor(kind: CloudGatewayErrorKind) {
    super(errorMessages[kind]);
    this.name = 'CloudGatewayError';
    this.kind = kind;
  }
}

export type CloudChange = {
  entityKind: EntityKind;
  entityId: string;
  value: EntityValueByKind[EntityKind];
  deletedAt: string | null;
  clientUpdatedAt: string;
  serverUpdatedAt: string;
};

export type CloudGateway = {
  pullAll: () => Promise<CloudChange[]>;
  apply: (operation: SyncOperation) => Promise<CloudApplyResult>;
  subscribe: (
    onChange: (change: CloudChange) => void,
    onStatus: (status: string) => void,
  ) => CloudSubscription;
};

export type CloudApplyResult = { applied: boolean; change: CloudChange };
export type CloudSubscription = {
  ready: Promise<void>;
  unsubscribe: () => Promise<void>;
};

type RemoteError = { code?: unknown; message?: unknown; status?: unknown };
type QueryResult = { data: Record<string, unknown>[] | null; error: RemoteError | null };
type CloudGatewayOptions = { pageSize?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function classifyError(error: unknown): CloudGatewayErrorKind {
  const remoteError: RemoteError = isRecord(error)
    ? { status: error.status, code: error.code, message: error.message }
    : {};

  if (remoteError.code === '42501' && remoteError.message === 'expected_user_mismatch') return 'auth';
  if (remoteError.status === 401 || remoteError.code === 'PGRST301') return 'auth';
  if (remoteError.status === 403 || remoteError.code === '42501') return 'permission';
  if (
    (typeof remoteError.status === 'number' && remoteError.status >= 400 && remoteError.status < 500)
    || (typeof remoteError.code === 'string' && /^(22|23)/.test(remoteError.code))
  ) return 'validation';
  return 'network';
}

function throwGatewayError(error: unknown): never {
  if (error instanceof CloudGatewayError) throw error;
  throw new CloudGatewayError(classifyError(error));
}

function normalizeChange(entityKind: EntityKind, row: Record<string, unknown>): CloudChange {
  const value = deserializeEntity(entityKind, row);
  const entityId = (entityRegistry[entityKind].entityId as (identity: object) => string)(value);

  return {
    entityKind,
    entityId,
    value,
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    clientUpdatedAt: String(row.updated_at),
    serverUpdatedAt: String(row.server_updated_at),
  };
}

function operationRecord(operation: SyncOperation): Record<string, unknown> {
  if (operation.type === 'delete') {
    return operation.entityKind === 'app_settings'
      ? { key: operation.entityId }
      : { id: operation.entityId };
  }

  if (!operation.record) throw new CloudGatewayError('validation');
  return serializeEntity(
    operation.entityKind,
    operation.record as unknown as EntityValueByKind[typeof operation.entityKind],
  );
}

function rowsFor(
  client: SupabaseClient<Database>,
  entityKind: EntityKind,
  userId: string,
  from: number,
  to: number,
): Promise<QueryResult> {
  const identityColumn = entityKind === 'app_settings' ? 'key' : 'id';
  return client
    .from(entityKind)
    .select('*')
    .eq('user_id', userId)
    .order(identityColumn, { ascending: true })
    .range(from, to) as unknown as Promise<QueryResult>;
}

function normalizeApplyResult(entityKind: EntityKind, data: unknown): CloudApplyResult {
  if (!isRecord(data) || typeof data.applied !== 'boolean' || !isRecord(data.row)) {
    throw new CloudGatewayError('validation');
  }

  return { applied: data.applied, change: normalizeChange(entityKind, data.row) };
}

export function createCloudGateway(
  client: SupabaseClient<Database>,
  userId: string,
  { pageSize = 1_000 }: CloudGatewayOptions = {},
): CloudGateway {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new CloudGatewayError('validation');
  const entityKinds = Object.keys(entityRegistry) as EntityKind[];

  return {
    async pullAll() {
      try {
        const results = await Promise.all(entityKinds.map(async (entityKind) => {
          const changes: CloudChange[] = [];
          let from = 0;
          while (true) {
            const { data, error } = await rowsFor(
              client,
              entityKind,
              userId,
              from,
              from + pageSize - 1,
            );
            if (error) throwGatewayError(error);
            const page = data ?? [];
            changes.push(...page.map((row) => normalizeChange(entityKind, row)));
            if (page.length < pageSize) break;
            from += pageSize;
          }
          return changes;
        }));

        return results.flat();
      } catch (error) {
        return throwGatewayError(error);
      }
    },

    async apply(operation) {
      try {
        if (operation.userId !== userId) throw new CloudGatewayError('auth');
        const { data, error } = await client.rpc('apply_workbench_change', {
          p_table: operation.entityKind,
          p_record: operationRecord(operation) as unknown as Json,
          p_client_updated_at: operation.clientUpdatedAt,
          p_deleted_at: operation.type === 'delete' ? operation.clientUpdatedAt : null,
          p_expected_user_id: userId,
        });
        if (error) throwGatewayError(error);
        return normalizeApplyResult(operation.entityKind, data);
      } catch (error) {
        return throwGatewayError(error);
      }
    },

    subscribe(onChange, onStatus) {
      try {
        let active = true;
        let markReady: (() => void) | undefined;
        const ready = new Promise<void>((resolve) => { markReady = resolve; });
        const channel = entityKinds.reduce<RealtimeChannel>((current, entityKind) => current.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: entityKind, filter: `user_id=eq.${userId}` },
          (payload) => {
            if (!active) return;
            const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
            const change = normalizeChange(entityKind, row as Record<string, unknown>);
            onChange(payload.eventType === 'DELETE'
              ? { ...change, deletedAt: payload.commit_timestamp ?? change.serverUpdatedAt }
              : change);
          },
        ), client.channel(`workbench-sync-${userId}`));

        channel.subscribe((status) => {
          if (!active) return;
          onStatus(status);
          if (status === 'SUBSCRIBED') markReady?.();
        });

        return {
          ready,
          unsubscribe: async () => {
            active = false;
            try {
              await client.removeChannel(channel);
            } catch (error) {
              return throwGatewayError(error);
            }
          },
        };
      } catch (error) {
        return throwGatewayError(error);
      }
    },
  };
}
