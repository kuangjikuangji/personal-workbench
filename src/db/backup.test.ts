import { describe, expect, test } from 'vitest';
import type { Repositories } from './repositories';
import { exportBackup, restoreBackup, validateBackup, type WorkbenchBackupV1 } from './backup';
import { createTestRepositories } from '../test/database';

const timestamp = '2026-08-10T08:00:00.000Z';

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
    backup.tables.todos.push({ id: 'restored-todo', createdAt: timestamp, updatedAt: timestamp, title: '恢复后的待办', description: '', role: 'dean', startAt: null, endAt: null, remindAt: null, priority: 'high', status: 'open', sourceType: null, sourceId: null });

    await restoreBackup(backup, repositories);

    expect(await repositories.todos.list()).toEqual([
      expect.objectContaining({ id: 'restored-todo', title: '恢复后的待办' }),
    ]);
  });

  test('preserves setting timestamps when replacing the settings table', async () => {
    const repositories = createTestRepositories();
    const backup = emptyBackup();
    backup.tables.settings.push({ key: 'theme', value: 'dark', updatedAt: timestamp });

    await restoreBackup(backup, repositories);

    expect(await repositories.settings.list()).toEqual([{ key: 'theme', value: 'dark', updatedAt: timestamp }]);
  });

  test('rolls back every table when any replacement fails', async () => {
    const repositories = createTestRepositories();
    const oldTodo = await repositories.todos.create({ title: '保留待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open' });
    const oldTeacher = await repositories.teachers.create({ name: '保留教师', department: '经济系', archivedAt: null });
    const backup = emptyBackup();
    backup.tables.todos.push({ ...oldTodo, id: 'new-todo', title: '新待办' });
    backup.tables.teachers.push({ ...oldTeacher, id: 'new-teacher', name: '新教师' });
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
});
