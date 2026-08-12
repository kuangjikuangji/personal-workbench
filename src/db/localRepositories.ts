import type { Table } from 'dexie';
import { WorkbenchDatabase } from './database';
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
import type {
  CrudRepository,
  EntityInput,
  LessonPlanInput,
  Repositories,
  ResearchItemInput,
  SettingsRepository,
  TodoInput,
} from './repositories';

type AuditFields = Pick<BaseEntity, 'id' | 'createdAt' | 'updatedAt'>;

function auditFields(): AuditFields {
  const timestamp = new Date().toISOString();

  return { id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp };
}

class LocalCrudRepository<T extends BaseEntity, TInput> implements CrudRepository<T, TInput> {
  constructor(
    private readonly table: Table<T, string>,
    private readonly createRecord: (input: TInput, audit: AuditFields) => T,
  ) {}

  list(): Promise<T[]> {
    return this.table.toArray();
  }

  get(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  async create(input: TInput): Promise<T> {
    const record = this.createRecord(input, auditFields());
    await this.table.add(record);

    return record;
  }

  async put(value: T): Promise<T> {
    await this.table.put(value);

    return value;
  }

  async patch(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    const current = await this.table.get(id);
    if (!current) {
      throw new Error(`Cannot patch missing record: ${id}`);
    }

    const updated = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.table.put(updated);

    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }
}

function createEntity<T extends BaseEntity, TInput>(input: TInput, audit: AuditFields): T {
  return { ...input, ...audit } as T;
}

function createCrudRepository<T extends BaseEntity, TInput>(
  table: Table<T, string>,
  createRecord: (input: TInput, audit: AuditFields) => T = createEntity,
): CrudRepository<T, TInput> {
  return new LocalCrudRepository(table, createRecord);
}

function createSettingsRepository(table: Table<AppSetting, string>): SettingsRepository {
  return {
    list: () => table.toArray(),
    get: (key) => table.get(key),
    async put(input) {
      const value = { ...input, updatedAt: 'updatedAt' in input ? input.updatedAt : new Date().toISOString() };
      await table.put(value);
      return value;
    },
    async delete(key) {
      await table.delete(key);
    },
  };
}

export function createLocalRepositories(db: WorkbenchDatabase): Repositories {
  return {
    todos: createCrudRepository<Todo, TodoInput>(
      db.todos,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    semesters: createCrudRepository<Semester, EntityInput<Semester>>(db.semesters),
    courses: createCrudRepository<Course, EntityInput<Course>>(db.courses),
    teachers: createCrudRepository<Teacher, EntityInput<Teacher>>(db.teachers),
    teacherYearSummaries: createCrudRepository<TeacherYearSummary, EntityInput<TeacherYearSummary>>(
      db.teacherYearSummaries,
    ),
    teacherRecords: createCrudRepository<TeacherRecord, EntityInput<TeacherRecord>>(db.teacherRecords),
    mentorships: createCrudRepository<Mentorship, EntityInput<Mentorship>>(db.mentorships),
    researchItems: createCrudRepository<ResearchItem, ResearchItemInput>(
      db.researchItems,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    learningMethods: createCrudRepository<LearningMethod, EntityInput<LearningMethod>>(
      db.learningMethods,
    ),
    ideas: createCrudRepository<Idea, EntityInput<Idea>>(db.ideas),
    lessonPlans: createCrudRepository<LessonPlan, LessonPlanInput>(
      db.lessonPlans,
      (input, audit) => createEntity({ sourceType: null, sourceId: null, ...input }, audit),
    ),
    students: createCrudRepository<Student, EntityInput<Student>>(db.students),
    studentRecords: createCrudRepository<StudentRecord, EntityInput<StudentRecord>>(db.studentRecords),
    settings: createSettingsRepository(db.settings),
    transaction: (work) => db.transaction('rw', db.tables, work),
  };
}
