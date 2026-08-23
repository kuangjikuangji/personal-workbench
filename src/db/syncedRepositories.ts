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
import { createAuditFields } from './localRepositories';
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
    createdAt: new Date().toISOString(),
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
  ) {}

  list(): Promise<T[]> {
    return this.table.toArray();
  }

  get(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  async create(input: TInput): Promise<T> {
    const record = this.createRecord(input, createAuditFields());
    await this.writeUpsert(record, () => this.table.add(record), true);
    return record;
  }

  async put(value: T): Promise<T> {
    await this.writeUpsert(
      value,
      () => this.table.put(value),
      async () => !(await this.table.get(value.id)) || this.hasQueuedLocalCreate(value.id),
    );
    return value;
  }

  async patch(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    return this.db.transaction('rw', [this.table, this.db.syncOperations], async () => {
      const current = await this.table.get(id);
      if (!current) throw new Error(`Cannot patch missing record: ${id}`);

      const updated = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await this.table.put(updated);
      await this.enqueueUpsert(updated, await this.hasQueuedLocalCreate(id));
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db.transaction('rw', [this.table, this.db.syncOperations], async () => {
      const localCreate = await this.hasQueuedLocalCreate(id);
      await this.table.delete(id);
      await this.db.syncOperations.add(createOperation(
        this.userId,
        this.entityKind,
        id,
        'delete',
        localCreate,
        null,
        timestamp,
      ));
    });
  }

  private async writeUpsert(
    record: T,
    write: () => Promise<unknown>,
    localCreate: boolean | (() => Promise<boolean>),
  ): Promise<void> {
    await this.db.transaction('rw', [this.table, this.db.syncOperations], async () => {
      const provenance = typeof localCreate === 'boolean' ? localCreate : await localCreate();
      await write();
      await this.enqueueUpsert(record, provenance);
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
  createRecord: (input: TInput, audit: AuditFields) => T = createEntity,
): CrudRepository<T, TInput> {
  return new SyncedCrudRepository(db, table, entityKind, userId, createRecord);
}

function createSettingsRepository(db: WorkbenchDatabase, userId: string): SettingsRepository {
  const table = db.settings;

  return {
    list: () => table.toArray(),
    get: (key) => table.get(key),
    async put(input: AppSettingInput | AppSetting) {
      const value = {
        ...input,
        updatedAt: 'updatedAt' in input ? input.updatedAt : new Date().toISOString(),
      };
      await db.transaction('rw', [table, db.syncOperations], async () => {
        const existing = await table.get(value.key);
        const queuedLocalCreate = await hasQueuedLocalCreate(db, userId, 'app_settings', value.key);
        await table.put(value);
        await db.syncOperations.add(createOperation(
          userId,
          'app_settings',
          entityId('app_settings', value),
          'upsert',
          existing === undefined || queuedLocalCreate,
          recordSnapshot(value),
          value.updatedAt,
        ));
      });
      return value;
    },
    async delete(key) {
      const timestamp = new Date().toISOString();
      await db.transaction('rw', [table, db.syncOperations], async () => {
        const localCreate = await hasQueuedLocalCreate(db, userId, 'app_settings', key);
        await table.delete(key);
        await db.syncOperations.add(createOperation(
          userId,
          'app_settings',
          key,
          'delete',
          localCreate,
          null,
          timestamp,
        ));
      });
    },
  };
}

export function createSyncedRepositories(db: WorkbenchDatabase, userId: string): Repositories {
  return {
    todos: createCrudRepository<Todo, TodoInput>(
      db,
      db.todos,
      'todos',
      userId,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    semesters: createCrudRepository<Semester, EntityInput<Semester>>(db, db.semesters, 'semesters', userId),
    courses: createCrudRepository<Course, EntityInput<Course>>(db, db.courses, 'courses', userId),
    teachers: createCrudRepository<Teacher, EntityInput<Teacher>>(db, db.teachers, 'teachers', userId),
    teacherYearSummaries: createCrudRepository<TeacherYearSummary, EntityInput<TeacherYearSummary>>(
      db,
      db.teacherYearSummaries,
      'teacher_year_summaries',
      userId,
    ),
    teacherRecords: createCrudRepository<TeacherRecord, EntityInput<TeacherRecord>>(
      db,
      db.teacherRecords,
      'teacher_records',
      userId,
    ),
    mentorships: createCrudRepository<Mentorship, EntityInput<Mentorship>>(
      db,
      db.mentorships,
      'mentorships',
      userId,
    ),
    researchItems: createCrudRepository<ResearchItem, ResearchItemInput>(
      db,
      db.researchItems,
      'research_items',
      userId,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    learningMethods: createCrudRepository<LearningMethod, EntityInput<LearningMethod>>(
      db,
      db.learningMethods,
      'learning_methods',
      userId,
    ),
    ideas: createCrudRepository<Idea, EntityInput<Idea>>(db, db.ideas, 'ideas', userId),
    lessonPlans: createCrudRepository<LessonPlan, LessonPlanInput>(
      db,
      db.lessonPlans,
      'lesson_plans',
      userId,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    students: createCrudRepository<Student, EntityInput<Student>>(db, db.students, 'students', userId),
    studentRecords: createCrudRepository<StudentRecord, EntityInput<StudentRecord>>(
      db,
      db.studentRecords,
      'student_records',
      userId,
    ),
    settings: createSettingsRepository(db, userId),
    transaction: (work) => db.transaction('rw', db.tables, work),
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
