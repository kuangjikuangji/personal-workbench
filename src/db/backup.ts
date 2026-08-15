import { z } from 'zod';
import type { Repositories } from './repositories';

const uuid = z.string().uuid('必须是有效 UUID');
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const isoDate = z.string().refine(isValidIsoDate, '必须是有效日期（YYYY-MM-DD）');
const isoDateTime = z.string().refine((value) => {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/);
  return Boolean(match && isValidIsoDate(match[1]) && !Number.isNaN(Date.parse(value)));
}, '必须是有效日期时间');
const nullableUuid = uuid.nullable();
const nullableDateTime = isoDateTime.nullable();
const year = z.string().regex(/^\d{4}$/, '年份必须为四位整数');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, '必须是有效时间（HH:mm）');
const baseEntitySchema = z.object({
  id: uuid,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const todoSchema = baseEntitySchema.extend({
  title: z.string(), description: z.string(), role: z.enum(['dean', 'head', 'personal']),
  startAt: nullableDateTime, endAt: nullableDateTime, remindAt: nullableDateTime,
  priority: z.enum(['low', 'normal', 'high']), status: z.enum(['open', 'done']),
  sourceType: z.literal('idea').nullable(), sourceId: nullableUuid,
});
const semesterSchema = baseEntitySchema.extend({
  name: z.string(), startDate: isoDate, endDate: isoDate, totalWeeks: z.number().int('教学周数必须为整数').min(1, '教学周数至少为 1').max(60, '教学周数不能超过 60'), isActive: z.boolean(),
});
const weekRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('every') }), z.object({ kind: z.literal('odd') }),
  z.object({ kind: z.literal('even') }), z.object({ kind: z.literal('explicit'), weeks: z.array(z.number().int('周次必须为整数').min(1, '周次至少为 1')) }),
]);
const courseSchema = baseEntitySchema.extend({
  semesterId: uuid, name: z.string(), location: z.string(), teacher: z.string(), weekday: z.number().int().min(1, '星期必须在 1 到 7 之间').max(7, '星期必须在 1 到 7 之间'),
  startTime: time, endTime: time, startWeek: z.number().int('起始周必须为整数').min(1, '起始周至少为 1'), endWeek: z.number().int('结束周必须为整数').min(1, '结束周至少为 1'),
  weekRule: weekRuleSchema, notes: z.string(),
});
const teacherSchema = baseEntitySchema.extend({ name: z.string(), department: z.string(), archivedAt: z.string().datetime().nullable() });
const teacherYearSummarySchema = baseEntitySchema.extend({ teacherId: uuid, year, state: z.enum(['empty', 'reported']) });
const teacherRecordSchema = baseEntitySchema.extend({
  teacherId: uuid, year, type: z.enum(['work', 'meeting', 'material', 'publicService']),
  date: isoDate, title: z.string(), content: z.string(),
  status: z.enum(['pending', 'attended', 'absent', 'leave', 'submitted', 'completed']), notes: z.string(),
});
const mentorshipSchema = baseEntitySchema.extend({
  teacherId: uuid, academicYear: z.string(), studentName: z.string(), grade: z.string(), major: z.string(),
  topic: z.string(), status: z.enum(['planned', 'active', 'completed', 'paused']), notes: z.string(),
});
const researchItemSchema = baseEntitySchema.extend({
  title: z.string(), authors: z.string(), source: z.string(), year: z.number().int('年份必须为整数').min(0).max(9999).nullable(), urlOrDoi: z.string(),
  tags: z.array(z.string()), status: z.enum(['unread', 'reading', 'read']), rating: z.number().int('评分必须为整数').min(1).max(5).nullable(),
  abstract: z.string(), notes: z.string(), sourceType: z.literal('idea').nullable(), sourceId: nullableUuid,
});
const learningMethodSchema = baseEntitySchema.extend({
  name: z.string(), scenario: z.string(), steps: z.string(), evaluation: z.string(), tags: z.array(z.string()),
});
const ideaSchema = baseEntitySchema.extend({ content: z.string(), tags: z.array(z.string()), pinned: z.boolean(), archivedAt: z.string().datetime().nullable() });
const lessonPlanSchema = baseEntitySchema.extend({
  courseId: nullableUuid, chapter: z.string(), objectives: z.string(), outline: z.string(), resources: z.string(),
  activities: z.string(), plannedDate: isoDate.nullable(), status: z.enum(['notStarted', 'inProgress', 'done']),
  sourceType: z.literal('idea').nullable(), sourceId: nullableUuid,
});
const studentSchema = baseEntitySchema.extend({
  name: z.string(), program: z.string(), cohort: z.string(), contact: z.string(), notes: z.string(), archivedAt: z.string().datetime().nullable(),
});
const studentRecordSchema = baseEntitySchema.extend({
  studentId: uuid, date: isoDate, category: z.enum(['task', 'attendance', 'research', 'service', 'other']),
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
}).superRefine((backup, context) => {
  const { tables } = backup;
  const issue = (message: string, path: (string | number)[]) => context.addIssue({ code: 'custom', message, path });
  const idTables = [
    ['todos', '待办'], ['semesters', '学期'], ['courses', '课程'], ['teachers', '教师'],
    ['teacherYearSummaries', '教师年度汇总'], ['teacherRecords', '教师记录'], ['mentorships', '导师记录'],
    ['researchItems', '科研记录'], ['learningMethods', '学习方法'], ['ideas', '灵感'], ['lessonPlans', '备课记录'],
    ['students', '学生'], ['studentRecords', '学生记录'],
  ] as const;
  for (const [tableName, label] of idTables) {
    const seen = new Set<string>();
    tables[tableName].forEach((entity, index) => {
      if (seen.has(entity.id)) issue(`${label}存在重复 ID`, ['tables', tableName, index, 'id']);
      seen.add(entity.id);
    });
  }
  const settingKeys = new Set<string>();
  tables.settings.forEach((setting, index) => {
    if (settingKeys.has(setting.key)) issue('设置存在重复键', ['tables', 'settings', index, 'key']);
    settingKeys.add(setting.key);
  });
  if (tables.semesters.filter((semester) => semester.isActive).length > 1) issue('只能有一个当前学期', ['tables', 'semesters']);

  const semesters = new Map(tables.semesters.map((semester) => [semester.id, semester]));
  tables.semesters.forEach((semester, index) => {
    if (semester.endDate < semester.startDate) issue('学期结束日期必须晚于或等于开始日期', ['tables', 'semesters', index]);
  });
  tables.courses.forEach((course, index) => {
    const semester = semesters.get(course.semesterId);
    if (!semester) issue('课程引用的学期不存在', ['tables', 'courses', index, 'semesterId']);
    if (course.endTime <= course.startTime) issue('课程结束时间必须晚于开始时间', ['tables', 'courses', index]);
    if (course.endWeek < course.startWeek) issue('课程结束周必须晚于或等于起始周', ['tables', 'courses', index]);
    if (semester && course.endWeek > semester.totalWeeks) issue('课程周次不能超过学期教学周数', ['tables', 'courses', index]);
    if (course.weekRule.kind === 'explicit' && course.weekRule.weeks.some((week) => week < course.startWeek || week > course.endWeek)) issue('指定周次必须位于课程起止周内', ['tables', 'courses', index, 'weekRule']);
  });

  tables.todos.forEach((todo, index) => {
    if (todo.startAt && todo.endAt && new Date(todo.endAt).getTime() <= new Date(todo.startAt).getTime()) issue('待办结束时间必须晚于开始时间', ['tables', 'todos', index]);
  });

  const teachers = new Set(tables.teachers.map((teacher) => teacher.id));
  const summaryKeys = new Set<string>();
  tables.teacherYearSummaries.forEach((summary, index) => {
    if (!teachers.has(summary.teacherId)) issue('教师年度汇总引用的教师不存在', ['tables', 'teacherYearSummaries', index, 'teacherId']);
    const key = `${summary.teacherId}::${summary.year}`;
    if (summaryKeys.has(key)) issue('教师年度汇总重复（同一教师与年份只能有一条）', ['tables', 'teacherYearSummaries', index]);
    summaryKeys.add(key);
  });
  tables.teacherRecords.forEach((record, index) => {
    if (!teachers.has(record.teacherId)) issue('教师记录引用的教师不存在', ['tables', 'teacherRecords', index, 'teacherId']);
  });
  tables.mentorships.forEach((record, index) => {
    if (!teachers.has(record.teacherId)) issue('导师记录引用的教师不存在', ['tables', 'mentorships', index, 'teacherId']);
  });

  const students = new Set(tables.students.map((student) => student.id));
  tables.studentRecords.forEach((record, index) => {
    if (!students.has(record.studentId)) issue('学生记录引用的学生不存在', ['tables', 'studentRecords', index, 'studentId']);
  });
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
