import { z } from 'zod';
import type { Repositories } from './repositories';

const nullableString = z.string().nullable();
const baseEntitySchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const todoSchema = baseEntitySchema.extend({
  title: z.string(), description: z.string(), role: z.enum(['dean', 'head', 'personal']),
  startAt: nullableString, endAt: nullableString, remindAt: nullableString,
  priority: z.enum(['low', 'normal', 'high']), status: z.enum(['open', 'done']),
  sourceType: z.literal('idea').nullable(), sourceId: nullableString,
});
const semesterSchema = baseEntitySchema.extend({
  name: z.string(), startDate: z.string(), endDate: z.string(), totalWeeks: z.number(), isActive: z.boolean(),
});
const weekRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('every') }), z.object({ kind: z.literal('odd') }),
  z.object({ kind: z.literal('even') }), z.object({ kind: z.literal('explicit'), weeks: z.array(z.number()) }),
]);
const courseSchema = baseEntitySchema.extend({
  semesterId: z.string(), name: z.string(), location: z.string(), teacher: z.string(), weekday: z.number(),
  startTime: z.string(), endTime: z.string(), startWeek: z.number(), endWeek: z.number(),
  weekRule: weekRuleSchema, notes: z.string(),
});
const teacherSchema = baseEntitySchema.extend({ name: z.string(), department: z.string(), archivedAt: nullableString });
const teacherYearSummarySchema = baseEntitySchema.extend({ teacherId: z.string(), year: z.string(), state: z.enum(['empty', 'reported']) });
const teacherRecordSchema = baseEntitySchema.extend({
  teacherId: z.string(), year: z.string(), type: z.enum(['work', 'meeting', 'material', 'publicService']),
  date: z.string(), title: z.string(), content: z.string(),
  status: z.enum(['pending', 'attended', 'absent', 'leave', 'submitted', 'completed']), notes: z.string(),
});
const mentorshipSchema = baseEntitySchema.extend({
  teacherId: z.string(), academicYear: z.string(), studentName: z.string(), grade: z.string(), major: z.string(),
  topic: z.string(), status: z.enum(['planned', 'active', 'completed', 'paused']), notes: z.string(),
});
const researchItemSchema = baseEntitySchema.extend({
  title: z.string(), authors: z.string(), source: z.string(), year: z.number().nullable(), urlOrDoi: z.string(),
  tags: z.array(z.string()), status: z.enum(['unread', 'reading', 'read']), rating: z.number().nullable(),
  abstract: z.string(), notes: z.string(), sourceType: z.literal('idea').nullable(), sourceId: nullableString,
});
const learningMethodSchema = baseEntitySchema.extend({
  name: z.string(), scenario: z.string(), steps: z.string(), evaluation: z.string(), tags: z.array(z.string()),
});
const ideaSchema = baseEntitySchema.extend({ content: z.string(), tags: z.array(z.string()), pinned: z.boolean(), archivedAt: nullableString });
const lessonPlanSchema = baseEntitySchema.extend({
  courseId: nullableString, chapter: z.string(), objectives: z.string(), outline: z.string(), resources: z.string(),
  activities: z.string(), plannedDate: nullableString, status: z.enum(['notStarted', 'inProgress', 'done']),
  sourceType: z.literal('idea').nullable(), sourceId: nullableString,
});
const studentSchema = baseEntitySchema.extend({
  name: z.string(), program: z.string(), cohort: z.string(), contact: z.string(), notes: z.string(), archivedAt: nullableString,
});
const studentRecordSchema = baseEntitySchema.extend({
  studentId: z.string(), date: z.string(), category: z.enum(['task', 'attendance', 'research', 'service', 'other']),
  rating: z.enum(['positive', 'normal', 'attention']), content: z.string(), followUp: z.string(), tags: z.array(z.string()),
});
const appSettingSchema = z.object({ key: z.string(), value: z.unknown(), updatedAt: z.string().datetime() });

export const backupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  tables: z.object({
    todos: z.array(todoSchema), semesters: z.array(semesterSchema), courses: z.array(courseSchema),
    teachers: z.array(teacherSchema), teacherYearSummaries: z.array(teacherYearSummarySchema),
    teacherRecords: z.array(teacherRecordSchema), mentorships: z.array(mentorshipSchema),
    researchItems: z.array(researchItemSchema), learningMethods: z.array(learningMethodSchema),
    ideas: z.array(ideaSchema), lessonPlans: z.array(lessonPlanSchema), students: z.array(studentSchema),
    studentRecords: z.array(studentRecordSchema), settings: z.array(appSettingSchema),
  }),
});

export type WorkbenchBackupV1 = z.infer<typeof backupSchema>;
export type BackupTables = WorkbenchBackupV1['tables'];
export type BackupTableName = keyof BackupTables;

export const backupTableNames: BackupTableName[] = [
  'todos', 'semesters', 'courses', 'teachers', 'teacherYearSummaries', 'teacherRecords',
  'mentorships', 'researchItems', 'learningMethods', 'ideas', 'lessonPlans', 'students',
  'studentRecords', 'settings',
];

export function validateBackup(value: unknown): WorkbenchBackupV1 {
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || value.schemaVersion !== 1) {
    throw new Error('不支持的备份版本');
  }
  const result = backupSchema.safeParse(value);
  if (!result.success) throw new Error(`备份文件格式无效：${z.prettifyError(result.error)}`);
  return result.data;
}

export async function exportBackup(repositories: Repositories): Promise<WorkbenchBackupV1> {
  const [todos, semesters, courses, teachers, teacherYearSummaries, teacherRecords, mentorships,
    researchItems, learningMethods, ideas, lessonPlans, students, studentRecords, settings] = await Promise.all([
    repositories.todos.list(), repositories.semesters.list(), repositories.courses.list(),
    repositories.teachers.list(), repositories.teacherYearSummaries.list(), repositories.teacherRecords.list(),
    repositories.mentorships.list(), repositories.researchItems.list(), repositories.learningMethods.list(),
    repositories.ideas.list(), repositories.lessonPlans.list(), repositories.students.list(),
    repositories.studentRecords.list(), repositories.settings.list(),
  ]);
  return validateBackup({
    schemaVersion: 1, exportedAt: new Date().toISOString(),
    tables: { todos, semesters, courses, teachers, teacherYearSummaries, teacherRecords, mentorships,
      researchItems, learningMethods, ideas, lessonPlans, students, studentRecords, settings },
  });
}

async function clearRepository(repository: { list(): Promise<Array<{ id?: string; key?: string }>>; delete(id: string): Promise<void> }) {
  for (const value of await repository.list()) await repository.delete(value.id ?? value.key ?? '');
}

export async function restoreBackup(backup: WorkbenchBackupV1, repositories: Repositories): Promise<void> {
  const value = validateBackup(backup);
  await repositories.transaction(async () => {
    await clearRepository(repositories.todos);
    await clearRepository(repositories.semesters);
    await clearRepository(repositories.courses);
    await clearRepository(repositories.teachers);
    await clearRepository(repositories.teacherYearSummaries);
    await clearRepository(repositories.teacherRecords);
    await clearRepository(repositories.mentorships);
    await clearRepository(repositories.researchItems);
    await clearRepository(repositories.learningMethods);
    await clearRepository(repositories.ideas);
    await clearRepository(repositories.lessonPlans);
    await clearRepository(repositories.students);
    await clearRepository(repositories.studentRecords);
    await clearRepository(repositories.settings);

    for (const item of value.tables.todos) await repositories.todos.put(item);
    for (const item of value.tables.semesters) await repositories.semesters.put(item);
    for (const item of value.tables.courses) await repositories.courses.put(item);
    for (const item of value.tables.teachers) await repositories.teachers.put(item);
    for (const item of value.tables.teacherYearSummaries) await repositories.teacherYearSummaries.put(item);
    for (const item of value.tables.teacherRecords) await repositories.teacherRecords.put(item);
    for (const item of value.tables.mentorships) await repositories.mentorships.put(item);
    for (const item of value.tables.researchItems) await repositories.researchItems.put(item);
    for (const item of value.tables.learningMethods) await repositories.learningMethods.put(item);
    for (const item of value.tables.ideas) await repositories.ideas.put(item);
    for (const item of value.tables.lessonPlans) await repositories.lessonPlans.put(item);
    for (const item of value.tables.students) await repositories.students.put(item);
    for (const item of value.tables.studentRecords) await repositories.studentRecords.put(item);
    for (const item of value.tables.settings) await repositories.settings.put(item);
  });
}
