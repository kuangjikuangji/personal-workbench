import { describe, expect, test } from 'vitest';
import type { Repositories } from './repositories';
import { exportBackup, restoreBackup, validateBackup, type WorkbenchBackupV1 } from './backup';
import { createTestRepositories } from '../test/database';
import { WorkbenchDatabase } from './database';
import { createRepositoryWriteLease, createSyncedRepositories } from './syncedRepositories';

const timestamp = '2026-08-10T08:00:00.000Z';
const restoredTodoId = '00000000-0000-4000-8000-000000000001';

function emptyBackup(): WorkbenchBackupV1 {
  return {
    schemaVersion: 1,
    exportedAt: timestamp,
    tables: {
      todos: [], semesters: [], courses: [], teachers: [], teacherYearSummaries: [],
      teacherRecords: [], mentorships: [], researchItems: [], learningMethods: [], ideas: [],
      lessonPlans: [], students: [], studentRecords: [], settings: [],
    },
  };
}

describe('workbench backups', () => {
  test('rejects a backup with an unsupported schema version', () => {
    expect(() => validateBackup({ schemaVersion: 99, exportedAt: '', tables: {} }))
      .toThrow('不支持的备份版本');
  });

  test('exports every repository table including teacher year summaries', async () => {
    const repositories = createTestRepositories();
    const teacher = await repositories.teachers.create({ name: '张老师', department: '经济系', archivedAt: null });
    await repositories.teacherYearSummaries.create({ teacherId: teacher.id, year: '2026', state: 'reported' });

    const backup = await exportBackup(repositories);

    expect(Object.keys(backup.tables)).toEqual([
      'todos', 'semesters', 'courses', 'teachers', 'teacherYearSummaries', 'teacherRecords',
      'mentorships', 'researchItems', 'learningMethods', 'ideas', 'lessonPlans', 'students',
      'studentRecords', 'settings',
    ]);
    expect(backup.tables.teacherYearSummaries).toHaveLength(1);
    expect(validateBackup(backup)).toEqual(backup);
  });

  test('replaces all tables in one restore', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create({ title: '旧待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const backup = emptyBackup();
    backup.tables.todos.push({ id: restoredTodoId, createdAt: timestamp, updatedAt: timestamp, title: '恢复后的待办', description: '', role: 'dean', startAt: null, endAt: null, remindAt: null, priority: 'high', status: 'open', sourceType: null, sourceId: null });

    await restoreBackup(backup, repositories);

    expect(await repositories.todos.list()).toEqual([
      expect.objectContaining({ id: restoredTodoId, title: '恢复后的待办' }),
    ]);
  });

  test('preserves setting timestamps when replacing the settings table', async () => {
    const repositories = createTestRepositories();
    const backup = emptyBackup();
    backup.tables.settings.push({ key: 'theme', value: 'dark', updatedAt: timestamp });

    await restoreBackup(backup, repositories);

    expect(await repositories.settings.list()).toEqual([{ key: 'theme', value: 'dark', updatedAt: timestamp }]);
  });

  test('round-trips a synchronized restore with fresh writes in dependency-safe queue order', async () => {
    const backup = emptyBackup();
    const ideaId = '00000000-0000-4000-8000-000000000101';
    const semesterId = '00000000-0000-4000-8000-000000000102';
    const courseId = '00000000-0000-4000-8000-000000000103';
    const teacherId = '00000000-0000-4000-8000-000000000104';
    const studentId = '00000000-0000-4000-8000-000000000105';
    backup.tables.ideas.push({
      id: ideaId, createdAt: timestamp, updatedAt: timestamp, content: '恢复灵感', tags: [], pinned: false, archivedAt: null,
    });
    backup.tables.semesters.push({
      id: semesterId, createdAt: timestamp, updatedAt: timestamp, name: '恢复学期', startDate: '2026-09-01', endDate: '2027-01-15', totalWeeks: 18, isActive: true,
    });
    backup.tables.courses.push({
      id: courseId, createdAt: timestamp, updatedAt: timestamp, semesterId, name: '恢复课程', location: '', teacher: '', weekday: 1, startTime: '09:00', endTime: '10:00', startWeek: 1, endWeek: 18, weekRule: { kind: 'every' }, notes: '',
    });
    backup.tables.teachers.push({
      id: teacherId, createdAt: timestamp, updatedAt: timestamp, name: '恢复教师', department: '', archivedAt: null,
    });
    backup.tables.teacherYearSummaries.push({
      id: '00000000-0000-4000-8000-000000000106', createdAt: timestamp, updatedAt: timestamp, teacherId, year: '2026', state: 'reported',
    });
    backup.tables.teacherRecords.push({
      id: '00000000-0000-4000-8000-000000000107', createdAt: timestamp, updatedAt: timestamp, teacherId, year: '2026', type: 'work', date: '2026-08-24', title: '记录', content: '', status: 'completed', notes: '',
    });
    backup.tables.mentorships.push({
      id: '00000000-0000-4000-8000-000000000108', createdAt: timestamp, updatedAt: timestamp, teacherId, academicYear: '2026', studentName: '学生', grade: '', major: '', topic: '主题', status: 'active', notes: '',
    });
    backup.tables.students.push({
      id: studentId, createdAt: timestamp, updatedAt: timestamp, name: '恢复学生', program: '', cohort: '', contact: '', notes: '', archivedAt: null,
    });
    backup.tables.studentRecords.push({
      id: '00000000-0000-4000-8000-000000000109', createdAt: timestamp, updatedAt: timestamp, studentId, date: '2026-08-24', category: 'task', rating: 'normal', content: '记录', followUp: '', tags: [],
    });
    backup.tables.todos.push({
      id: '00000000-0000-4000-8000-000000000110', createdAt: timestamp, updatedAt: timestamp, title: '灵感待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open', sourceType: 'idea', sourceId: ideaId,
    });
    backup.tables.researchItems.push({
      id: '00000000-0000-4000-8000-000000000111', createdAt: timestamp, updatedAt: timestamp, title: '灵感研究', authors: '', source: '', year: 2026, urlOrDoi: '', tags: [], status: 'unread', rating: null, abstract: '', notes: '', sourceType: 'idea', sourceId: ideaId,
    });
    backup.tables.lessonPlans.push({
      id: '00000000-0000-4000-8000-000000000112', createdAt: timestamp, updatedAt: timestamp, courseId, chapter: '灵感教案', objectives: '', outline: '', resources: '', activities: '', plannedDate: null, status: 'notStarted', sourceType: 'idea', sourceId: ideaId,
    });
    const db = new WorkbenchDatabase(`synchronized-backup-${crypto.randomUUID()}`);
    const repositories = createSyncedRepositories(
      db,
      'user-1',
      createRepositoryWriteLease('user-1'),
      () => new Date('2026-08-24T12:00:00.000Z'),
    );

    try {
      await restoreBackup(backup, repositories);
      const operations = await db.syncOperations.orderBy('createdAt').toArray();
      const kinds = operations.map(({ entityKind }) => entityKind);
      const position = (kind: typeof kinds[number]) => kinds.indexOf(kind);

      expect(operations.every(({ type, clientUpdatedAt }) => (
        type === 'upsert' && clientUpdatedAt > timestamp
      ))).toBe(true);
      expect(operations.map(({ createdAt }) => createdAt).every((value, index, all) => (
        index === 0 || value > all[index - 1]
      ))).toBe(true);
      expect(position('ideas')).toBeLessThan(position('todos'));
      expect(position('ideas')).toBeLessThan(position('research_items'));
      expect(position('ideas')).toBeLessThan(position('lesson_plans'));
      expect(position('semesters')).toBeLessThan(position('courses'));
      expect(position('courses')).toBeLessThan(position('lesson_plans'));
      expect(position('teachers')).toBeLessThan(position('teacher_year_summaries'));
      expect(position('teachers')).toBeLessThan(position('teacher_records'));
      expect(position('teachers')).toBeLessThan(position('mentorships'));
      expect(position('students')).toBeLessThan(position('student_records'));

      const roundTrip = await exportBackup(repositories);
      expect(roundTrip.tables.todos[0]).toMatchObject({ sourceType: 'idea', sourceId: ideaId });
      expect(roundTrip.tables.courses[0]).toMatchObject({ semesterId });
      expect(roundTrip.tables.lessonPlans[0]).toMatchObject({ courseId, sourceId: ideaId });
      expect(roundTrip.tables.teacherRecords[0]).toMatchObject({ teacherId });
      expect(roundTrip.tables.studentRecords[0]).toMatchObject({ studentId });
    } finally {
      await db.delete();
    }
  });

  test('rolls back every table when any replacement fails', async () => {
    const repositories = createTestRepositories();
    const oldTodo = await repositories.todos.create({ title: '保留待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const oldTeacher = await repositories.teachers.create({ name: '保留教师', department: '经济系', archivedAt: null });
    const backup = emptyBackup();
    backup.tables.todos.push({ ...oldTodo, id: '00000000-0000-4000-8000-000000000002', title: '新待办' });
    backup.tables.teachers.push({ ...oldTeacher, id: '00000000-0000-4000-8000-000000000003', name: '新教师' });
    const originalPut = repositories.teachers.put.bind(repositories.teachers);
    const failingRepositories: Repositories = {
      ...repositories,
      teachers: new Proxy(repositories.teachers, {
        get(target, property) {
          if (property === 'put') return async () => { throw new Error('注入失败'); };
          const member = Reflect.get(target, property);
          return typeof member === 'function' ? member.bind(target) : member;
        },
      }),
    };

    await expect(restoreBackup(backup, failingRepositories)).rejects.toThrow('注入失败');
    repositories.teachers.put = originalPut;
    expect(await repositories.todos.list()).toEqual([expect.objectContaining({ id: oldTodo.id, title: '保留待办' })]);
    expect(await repositories.teachers.list()).toEqual([expect.objectContaining({ id: oldTeacher.id, name: '保留教师' })]);
  });

  test('rejects malformed scalar values and aggregates Chinese validation details', () => {
    const backup = emptyBackup();
    backup.tables.semesters.push({ id: 'not-a-uuid', createdAt: timestamp, updatedAt: timestamp, name: '坏学期', startDate: '2026-02-30', endDate: '2026-01-01', totalWeeks: 0, isActive: true });
    backup.tables.todos.push({ id: restoredTodoId, createdAt: timestamp, updatedAt: timestamp, title: '坏待办', description: '', role: 'dean', startAt: 'not-a-date', endAt: '2026-08-10T08:00', remindAt: null, priority: 'high', status: 'open', sourceType: null, sourceId: null });

    expect(() => validateBackup(backup)).toThrow(/备份文件格式无效.*UUID.*日期.*教学周数|备份文件格式无效.*UUID/s);
  });

  test('rejects normalized-but-impossible calendar dates in local date-times', () => {
    const backup = emptyBackup();
    backup.tables.todos.push({ id: restoredTodoId, createdAt: timestamp, updatedAt: timestamp, title: '坏日期', description: '', role: 'personal', startAt: '2026-02-30T10:00', endAt: null, remindAt: null, priority: 'normal', status: 'open', sourceType: null, sourceId: null });
    expect(() => validateBackup(backup)).toThrow('必须是有效日期时间');
  });

  test('rejects cross-table orphans, duplicate current semesters and invalid course invariants', () => {
    const backup = emptyBackup();
    const semesterOne = '00000000-0000-4000-8000-000000000010';
    const semesterTwo = '00000000-0000-4000-8000-000000000011';
    backup.tables.semesters.push(
      { id: semesterOne, createdAt: timestamp, updatedAt: timestamp, name: '一', startDate: '2026-09-01', endDate: '2027-01-15', totalWeeks: 18, isActive: true },
      { id: semesterTwo, createdAt: timestamp, updatedAt: timestamp, name: '二', startDate: '2026-09-01', endDate: '2027-01-15', totalWeeks: 18, isActive: true },
    );
    backup.tables.courses.push({ id: '00000000-0000-4000-8000-000000000012', createdAt: timestamp, updatedAt: timestamp, semesterId: semesterOne, name: '坏课程', location: '', teacher: '', weekday: 8, startTime: '10:00', endTime: '09:00', startWeek: 0, endWeek: 19, weekRule: { kind: 'explicit', weeks: [20] }, notes: '' });
    backup.tables.teacherRecords.push({ id: '00000000-0000-4000-8000-000000000013', createdAt: timestamp, updatedAt: timestamp, teacherId: '00000000-0000-4000-8000-000000000099', year: '2026', type: 'work', date: '2026-01-01', title: '孤儿', content: '', status: 'completed', notes: '' });

    expect(() => validateBackup(backup)).toThrow(/只能有一个当前学期.*课程.*教师不存在|只能有一个当前学期/s);
  });

  test('rejects duplicate teacher-year summaries and invalid todo ranges without overwriting data', async () => {
    const repositories = createTestRepositories();
    const old = await repositories.todos.create({ title: '必须保留', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const backup = emptyBackup();
    const teacherId = '00000000-0000-4000-8000-000000000020';
    backup.tables.teachers.push({ id: teacherId, createdAt: timestamp, updatedAt: timestamp, name: '教师', department: '系', archivedAt: null });
    backup.tables.teacherYearSummaries.push(
      { id: '00000000-0000-4000-8000-000000000021', createdAt: timestamp, updatedAt: timestamp, teacherId, year: '2026', state: 'empty' },
      { id: '00000000-0000-4000-8000-000000000022', createdAt: timestamp, updatedAt: timestamp, teacherId, year: '2026', state: 'reported' },
    );
    backup.tables.todos.push({ id: restoredTodoId, createdAt: timestamp, updatedAt: timestamp, title: '坏区间', description: '', role: 'dean', startAt: '2026-08-10T10:00', endAt: '2026-08-10T09:00', remindAt: null, priority: 'high', status: 'open', sourceType: null, sourceId: null });

    await expect(restoreBackup(backup, repositories)).rejects.toThrow(/教师年度汇总重复.*结束时间必须晚于开始时间|结束时间必须晚于开始时间/s);
    expect(await repositories.todos.list()).toEqual([expect.objectContaining({ id: old.id, title: '必须保留' })]);
  });

  test('allows deleted idea/course source references while rejecting true child-record orphans', () => {
    const backup = emptyBackup();
    backup.tables.researchItems.push({ id: '00000000-0000-4000-8000-000000000030', createdAt: timestamp, updatedAt: timestamp, title: '历史转换', authors: '', source: '', year: 2026, urlOrDoi: '', tags: [], status: 'unread', rating: null, abstract: '', notes: '', sourceType: 'idea', sourceId: '00000000-0000-4000-8000-000000000099' });
    backup.tables.lessonPlans.push({ id: '00000000-0000-4000-8000-000000000031', createdAt: timestamp, updatedAt: timestamp, courseId: '00000000-0000-4000-8000-000000000098', chapter: '', objectives: '', outline: '', resources: '', activities: '', plannedDate: null, status: 'notStarted', sourceType: null, sourceId: null });
    expect(validateBackup(backup)).toEqual(backup);

    backup.tables.studentRecords.push({ id: '00000000-0000-4000-8000-000000000032', createdAt: timestamp, updatedAt: timestamp, studentId: '00000000-0000-4000-8000-000000000097', date: '2026-08-10', category: 'task', rating: 'normal', content: '孤儿', followUp: '', tags: [] });
    expect(() => validateBackup(backup)).toThrow('学生不存在');
  });

  test('rejects duplicate entity ids before replacing the database', () => {
    const backup = emptyBackup();
    const duplicateId = '00000000-0000-4000-8000-000000000040';
    backup.tables.teachers.push(
      { id: duplicateId, createdAt: timestamp, updatedAt: timestamp, name: '甲', department: '系', archivedAt: null },
      { id: duplicateId, createdAt: timestamp, updatedAt: timestamp, name: '乙', department: '系', archivedAt: null },
    );
    expect(() => validateBackup(backup)).toThrow('教师存在重复 ID');
  });
});
