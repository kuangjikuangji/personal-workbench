import type { EntityKind, EntityValueByKind } from './types';

type LocalEntityTable =
  | 'todos'
  | 'semesters'
  | 'courses'
  | 'teachers'
  | 'teacherYearSummaries'
  | 'teacherRecords'
  | 'mentorships'
  | 'researchItems'
  | 'learningMethods'
  | 'ideas'
  | 'lessonPlans'
  | 'students'
  | 'studentRecords'
  | 'settings';

type EntityIdentity<K extends EntityKind> = EntityValueByKind[K] extends { key: string }
  ? Pick<EntityValueByKind[K], 'key'>
  : EntityValueByKind[K] extends { id: string }
    ? Pick<EntityValueByKind[K], 'id'>
    : never;

type EntityRegistryEntry<K extends EntityKind> = {
  tableName: K;
  localTable: LocalEntityTable;
  entityId: (value: EntityIdentity<K>) => string;
};

type EntityRegistry = { [K in EntityKind]: EntityRegistryEntry<K> };

const id = (value: { id: string }) => value.id;

export const entityRegistry: EntityRegistry = {
  todos: { tableName: 'todos', localTable: 'todos', entityId: id },
  semesters: { tableName: 'semesters', localTable: 'semesters', entityId: id },
  courses: { tableName: 'courses', localTable: 'courses', entityId: id },
  teachers: { tableName: 'teachers', localTable: 'teachers', entityId: id },
  teacher_year_summaries: { tableName: 'teacher_year_summaries', localTable: 'teacherYearSummaries', entityId: id },
  teacher_records: { tableName: 'teacher_records', localTable: 'teacherRecords', entityId: id },
  mentorships: { tableName: 'mentorships', localTable: 'mentorships', entityId: id },
  research_items: { tableName: 'research_items', localTable: 'researchItems', entityId: id },
  learning_methods: { tableName: 'learning_methods', localTable: 'learningMethods', entityId: id },
  ideas: { tableName: 'ideas', localTable: 'ideas', entityId: id },
  lesson_plans: { tableName: 'lesson_plans', localTable: 'lessonPlans', entityId: id },
  students: { tableName: 'students', localTable: 'students', entityId: id },
  student_records: { tableName: 'student_records', localTable: 'studentRecords', entityId: id },
  app_settings: { tableName: 'app_settings', localTable: 'settings', entityId: (value) => value.key },
};

const serverOnlyColumns = new Set(['user_id', 'deleted_at', 'server_updated_at']);

function toSnakeCase(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function serializeEntity<K extends EntityKind>(kind: K, value: EntityValueByKind[K]): Record<string, unknown> {
  if (!entityRegistry[kind]) throw new Error(`Unknown sync entity kind: ${kind}`);

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [toSnakeCase(key), fieldValue]),
  );
}

export function deserializeEntity<K extends EntityKind>(kind: K, row: object): EntityValueByKind[K] {
  if (!entityRegistry[kind]) throw new Error(`Unknown sync entity kind: ${kind}`);

  return Object.fromEntries(
    Object.entries(row).flatMap(([key, fieldValue]) => (
      serverOnlyColumns.has(key) ? [] : [[toCamelCase(key), fieldValue]]
    )),
  ) as EntityValueByKind[K];
}
