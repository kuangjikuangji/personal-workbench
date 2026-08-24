import type { Table } from 'dexie';
import type {
  AppSetting,
  BaseEntity,
  Course,
  Idea,
  LearningMethod,
  LessonPlan,
  Mentorship,
  ResearchItem,
  Semester,
  Student,
  StudentRecord,
  Teacher,
  TeacherRecord,
  TeacherYearSummary,
  Todo,
} from '../domain/entities';
import { entityRegistry } from '../sync/entityRegistry';
import type { EntityKind, SyncOperation } from '../sync/types';
import { WorkbenchDatabase } from './database';
import type {
  AppSettingInput,
  CrudRepository,
  EntityInput,
  LessonPlanInput,
  Repositories,
  ResearchItemInput,
  SettingsRepository,
  TodoInput,
} from './repositories';

type AuditFields = Pick<BaseEntity, 'id' | 'createdAt' | 'updatedAt'>;
type Now = () => Date;

export class RepositoryWriteLeaseExpiredError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super('Repository write lease expired.');
    this.name = 'RepositoryWriteLeaseExpiredError';
    this.userId = userId;
  }
}

export type RepositoryWriteLease = {
  readonly userId: string;
  assertActive: () => void;
  revoke: () => void;
};

export function createRepositoryWriteLease(userId: string): RepositoryWriteLease {
  let active = true;
  return {
    userId,
    assertActive() {
      if (!active) throw new RepositoryWriteLeaseExpiredError(userId);
    },
    revoke() {
      active = false;
    },
  };
}

function timestampValue(timestamp: string): number | null {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? null : value;
}

class MutationClock {
  private lastIssued = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly db: WorkbenchDatabase,
    private readonly userId: string,
    private readonly now: Now,
  ) {}

  async next(
    entityKind: EntityKind,
    entityIdValue: string,
    candidates: Array<string | null | undefined> = [],
  ): Promise<string> {
    const queued = await this.db.syncOperations
      .where('[userId+entityKind+entityId]')
      .equals([this.userId, entityKind, entityIdValue])
      .toArray();
    const previousValues = [
      ...candidates,
      ...queued.map(({ clientUpdatedAt }) => clientUpdatedAt),
    ]
      .map((value) => typeof value === 'string' ? timestampValue(value) : null)
      .filter((value): value is number => value !== null);
    const previous = previousValues.length > 0 ? Math.max(...previousValues) : Number.NEGATIVE_INFINITY;
    const issued = Math.max(this.now().getTime(), this.lastIssued + 1, previous + 1);
    this.lastIssued = issued;
    return new Date(issued).toISOString();
  }
}

function createEntity<T extends BaseEntity, TInput>(input: TInput, audit: AuditFields): T {
  return { ...input, ...audit } as T;
}

function entityId(kind: EntityKind, value: object): string {
  return (entityRegistry[kind].entityId as (identity: object) => string)(value);
}

function recordSnapshot(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}

function createOperation(
  userId: string,
  entityKind: EntityKind,
  entityIdValue: string,
  type: SyncOperation['type'],
  localCreate: boolean,
  record: Record<string, unknown> | null,
  clientUpdatedAt: string,
): SyncOperation {
  return {
    id: crypto.randomUUID(),
    userId,
    entityKind,
    entityId: entityIdValue,
    type,
    localCreate,
    record,
    clientUpdatedAt,
    retryCount: 0,
    lastError: null,
    createdAt: clientUpdatedAt,
  };
}

async function hasQueuedLocalCreate(
  db: WorkbenchDatabase,
  userId: string,
  entityKind: EntityKind,
  entityIdValue: string,
): Promise<boolean> {
  const operation = await db.syncOperations
    .where('[userId+entityKind+entityId]')
    .equals([userId, entityKind, entityIdValue])
    .filter(({ localCreate }) => localCreate === true)
    .first();

  return operation !== undefined;
}

class SyncedCrudRepository<T extends BaseEntity, TInput> implements CrudRepository<T, TInput> {
  constructor(
    private readonly db: WorkbenchDatabase,
    private readonly table: Table<T, string>,
    private readonly entityKind: EntityKind,
    private readonly userId: string,
    private readonly createRecord: (input: TInput, audit: AuditFields) => T,
    private readonly lease: RepositoryWriteLease,
    private readonly clock: MutationClock,
  ) {}

  list(): Promise<T[]> {
    return this.table.toArray();
  }

  get(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  async create(input: TInput): Promise<T> {
    this.lease.assertActive();
    const id = crypto.randomUUID();
    return this.db.transaction('rw', [this.table, this.db.syncOperations], async () => {
      this.lease.assertActive();
      const timestamp = await this.clock.next(this.entityKind, id);
      this.lease.assertActive();
      const record = this.createRecord(input, { id, createdAt: timestamp, updatedAt: timestamp });
      await this.table.add(record);
      this.lease.assertActive();
      await this.enqueueUpsert(record, true);
      this.lease.assertActive();
      return record;
    });
  }

  async put(value: T): Promise<T> {
    this.lease.assertActive();
    return this.db.transaction('rw', [this.table, this.db.syncOperations], async () => {
      this.lease.assertActive();
      const current = await this.table.get(value.id);
      this.lease.assertActive();
      const localCreate = !current || await this.hasQueuedLocalCreate(value.id);
      this.lease.assertActive();
      const updatedAt = await this.clock.next(
        this.entityKind,
        value.id,
        [current?.updatedAt, value.updatedAt],
      );
      this.lease.assertActive();
      const updated = { ...value, updatedAt };
      await this.table.put(updated);
      this.lease.assertActive();
      await this.enqueueUpsert(updated, localCreate);
      this.lease.assertActive();
      return updated;
    });
  }

  async patch(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    this.lease.assertActive();
    return this.db.transaction('rw', [this.table, this.db.syncOperations], async () => {
      this.lease.assertActive();
      const current = await this.table.get(id);
      this.lease.assertActive();
      if (!current) throw new Error(`Cannot patch missing record: ${id}`);
      const localCreate = await this.hasQueuedLocalCreate(id);
      this.lease.assertActive();
      const updatedAt = await this.clock.next(this.entityKind, id, [current.updatedAt]);
      this.lease.assertActive();

      const updated = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt,
      };
      await this.table.put(updated);
      this.lease.assertActive();
      await this.enqueueUpsert(updated, localCreate);
      this.lease.assertActive();
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    this.lease.assertActive();
    await this.db.transaction('rw', [this.table, this.db.syncOperations], async () => {
      this.lease.assertActive();
      const current = await this.table.get(id);
      this.lease.assertActive();
      const localCreate = await this.hasQueuedLocalCreate(id);
      this.lease.assertActive();
      const timestamp = await this.clock.next(this.entityKind, id, [current?.updatedAt]);
      this.lease.assertActive();
      await this.table.delete(id);
      this.lease.assertActive();
      await this.db.syncOperations.add(createOperation(
        this.userId,
        this.entityKind,
        id,
        'delete',
        localCreate,
        null,
        timestamp,
      ));
      this.lease.assertActive();
    });
  }

  private async enqueueUpsert(record: T, localCreate: boolean): Promise<void> {
    await this.db.syncOperations.add(createOperation(
      this.userId,
      this.entityKind,
      entityId(this.entityKind, record),
      'upsert',
      localCreate,
      recordSnapshot(record),
      record.updatedAt,
    ));
  }

  private async hasQueuedLocalCreate(id: string): Promise<boolean> {
    return hasQueuedLocalCreate(this.db, this.userId, this.entityKind, id);
  }
}

function createCrudRepository<T extends BaseEntity, TInput>(
  db: WorkbenchDatabase,
  table: Table<T, string>,
  entityKind: EntityKind,
  userId: string,
  lease: RepositoryWriteLease,
  clock: MutationClock,
  createRecord: (input: TInput, audit: AuditFields) => T = createEntity,
): CrudRepository<T, TInput> {
  return new SyncedCrudRepository(db, table, entityKind, userId, createRecord, lease, clock);
}

function createSettingsRepository(
  db: WorkbenchDatabase,
  userId: string,
  lease: RepositoryWriteLease,
  clock: MutationClock,
): SettingsRepository {
  const table = db.settings;

  return {
    list: () => table.toArray(),
    get: (key) => table.get(key),
    async put(input: AppSettingInput | AppSetting) {
      lease.assertActive();
      return db.transaction('rw', [table, db.syncOperations], async () => {
        lease.assertActive();
        const existing = await table.get(input.key);
        lease.assertActive();
        const queuedLocalCreate = await hasQueuedLocalCreate(db, userId, 'app_settings', input.key);
        lease.assertActive();
        const updatedAt = await clock.next('app_settings', input.key, [
          existing?.updatedAt,
          'updatedAt' in input ? input.updatedAt : null,
        ]);
        lease.assertActive();
        const value = { ...input, updatedAt };
        await table.put(value);
        lease.assertActive();
        await db.syncOperations.add(createOperation(
          userId,
          'app_settings',
          entityId('app_settings', value),
          'upsert',
          existing === undefined || queuedLocalCreate,
          recordSnapshot(value),
          value.updatedAt,
        ));
        lease.assertActive();
        return value;
      });
    },
    async delete(key) {
      lease.assertActive();
      await db.transaction('rw', [table, db.syncOperations], async () => {
        lease.assertActive();
        const current = await table.get(key);
        lease.assertActive();
        const localCreate = await hasQueuedLocalCreate(db, userId, 'app_settings', key);
        lease.assertActive();
        const timestamp = await clock.next('app_settings', key, [current?.updatedAt]);
        lease.assertActive();
        await table.delete(key);
        lease.assertActive();
        await db.syncOperations.add(createOperation(
          userId,
          'app_settings',
          key,
          'delete',
          localCreate,
          null,
          timestamp,
        ));
        lease.assertActive();
      });
    },
  };
}

export function createSyncedRepositories(
  db: WorkbenchDatabase,
  userId: string,
  lease: RepositoryWriteLease = createRepositoryWriteLease(userId),
  now: Now = () => new Date(),
): Repositories {
  if (lease.userId !== userId) throw new RepositoryWriteLeaseExpiredError(userId);
  const clock = new MutationClock(db, userId, now);
  return {
    todos: createCrudRepository<Todo, TodoInput>(
      db,
      db.todos,
      'todos',
      userId,
      lease,
      clock,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    semesters: createCrudRepository<Semester, EntityInput<Semester>>(db, db.semesters, 'semesters', userId, lease, clock),
    courses: createCrudRepository<Course, EntityInput<Course>>(db, db.courses, 'courses', userId, lease, clock),
    teachers: createCrudRepository<Teacher, EntityInput<Teacher>>(db, db.teachers, 'teachers', userId, lease, clock),
    teacherYearSummaries: createCrudRepository<TeacherYearSummary, EntityInput<TeacherYearSummary>>(
      db,
      db.teacherYearSummaries,
      'teacher_year_summaries',
      userId,
      lease,
      clock,
    ),
    teacherRecords: createCrudRepository<TeacherRecord, EntityInput<TeacherRecord>>(
      db,
      db.teacherRecords,
      'teacher_records',
      userId,
      lease,
      clock,
    ),
    mentorships: createCrudRepository<Mentorship, EntityInput<Mentorship>>(
      db,
      db.mentorships,
      'mentorships',
      userId,
      lease,
      clock,
    ),
    researchItems: createCrudRepository<ResearchItem, ResearchItemInput>(
      db,
      db.researchItems,
      'research_items',
      userId,
      lease,
      clock,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    learningMethods: createCrudRepository<LearningMethod, EntityInput<LearningMethod>>(
      db,
      db.learningMethods,
      'learning_methods',
      userId,
      lease,
      clock,
    ),
    ideas: createCrudRepository<Idea, EntityInput<Idea>>(db, db.ideas, 'ideas', userId, lease, clock),
    lessonPlans: createCrudRepository<LessonPlan, LessonPlanInput>(
      db,
      db.lessonPlans,
      'lesson_plans',
      userId,
      lease,
      clock,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    students: createCrudRepository<Student, EntityInput<Student>>(db, db.students, 'students', userId, lease, clock),
    studentRecords: createCrudRepository<StudentRecord, EntityInput<StudentRecord>>(
      db,
      db.studentRecords,
      'student_records',
      userId,
      lease,
      clock,
    ),
    settings: createSettingsRepository(db, userId, lease, clock),
    transaction: async (work) => {
      lease.assertActive();
      return db.transaction('rw', db.tables, async () => {
        lease.assertActive();
        const result = await work();
        lease.assertActive();
        return result;
      });
    },
  };
}

const businessTableNames = [...new Set(
  Object.values(entityRegistry).map(({ localTable }) => localTable),
)];

export async function clearUserMirror(db: WorkbenchDatabase, userId: string): Promise<void> {
  const businessTables = businessTableNames.map((tableName) => db.table(tableName));

  await db.transaction(
    'rw',
    [...businessTables, db.syncOperations, db.syncMetadata],
    async () => {
      await Promise.all(businessTables.map((table) => table.clear()));
      await db.syncOperations.where('userId').equals(userId).delete();
      await db.syncMetadata.delete('mirrorOwner');
    },
  );
}
