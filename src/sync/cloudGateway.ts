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
  apply: (operation: SyncOperation) => Promise<void>;
  subscribe: (
    onChange: (change: CloudChange) => void,
    onStatus: (status: string) => void,
  ) => () => Promise<void>;
};

type RemoteError = { code?: unknown; status?: unknown };
type QueryResult = { data: Record<string, unknown>[] | null; error: RemoteError | null };

function classifyError(error: RemoteError): CloudGatewayErrorKind {
  if (error.status === 401 || error.code === 'PGRST301') return 'auth';
  if (error.status === 403 || error.code === '42501') return 'permission';
  if (
    (typeof error.status === 'number' && error.status >= 400 && error.status < 500)
    || (typeof error.code === 'string' && error.code.startsWith('22'))
  ) return 'validation';
  return 'network';
}

function throwGatewayError(error: RemoteError): never {
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
): Promise<QueryResult> {
  return client.from(entityKind).select('*').eq('user_id', userId) as unknown as Promise<QueryResult>;
}

export function createCloudGateway(client: SupabaseClient<Database>, userId: string): CloudGateway {
  const entityKinds = Object.keys(entityRegistry) as EntityKind[];

  return {
    async pullAll() {
      const results = await Promise.all(entityKinds.map(async (entityKind) => {
        const { data, error } = await rowsFor(client, entityKind, userId);
        if (error) throwGatewayError(error);
        return (data ?? []).map((row) => normalizeChange(entityKind, row));
      }));

      return results.flat();
    },

    async apply(operation) {
      const { error } = await client.rpc('apply_workbench_change', {
        p_table: operation.entityKind,
        p_record: operationRecord(operation) as unknown as Json,
        p_client_updated_at: operation.clientUpdatedAt,
        p_deleted_at: operation.type === 'delete' ? operation.clientUpdatedAt : null,
      });
      if (error) throwGatewayError(error);
    },

    subscribe(onChange, onStatus) {
      let active = true;
      const channel = entityKinds.reduce<RealtimeChannel>((current, entityKind) => current.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: entityKind, filter: `user_id=eq.${userId}` },
        (payload) => {
          if (active) onChange(normalizeChange(entityKind, payload.new as Record<string, unknown>));
        },
      ), client.channel(`workbench-sync-${userId}`));

      channel.subscribe((status) => {
        if (active) onStatus(status);
      });

      return async () => {
        active = false;
        await client.removeChannel(channel);
      };
    },
  };
}
