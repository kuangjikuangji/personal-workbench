import { describe, expect, test } from 'vitest';
import type { Repositories } from '../db/repositories';
import { createTestRepositories } from '../test/database';
import { archiveStudent, deleteStudentWithRecords, summarizeStudentRecords } from './studentOperations';

async function createStudent(repositories: Repositories, name = '林同学') {
  return repositories.students.create({
    name,
    program: '应用经济学',
    cohort: '2024级',
    contact: 'lin@example.com',
    notes: '班委',
    archivedAt: null,
  });
}

async function createRecord(repositories: Repositories, studentId: string, overrides: Partial<{
  date: string;
  category: 'task' | 'attendance' | 'research' | 'service' | 'other';
  rating: 'positive' | 'normal' | 'attention';
  content: string;
}> = {}) {
  return repositories.studentRecords.create({
    studentId,
    date: '2026-08-10',
    category: 'task',
    rating: 'positive',
    content: '按时完成数据清理',
    followUp: '下周回访',
    tags: ['数据'],
    ...overrides,
  });
}

describe('student operations', () => {
  test('archives a student while retaining performance records', async () => {
    const repositories = createTestRepositories();
    const student = await createStudent(repositories);
    await createRecord(repositories, student.id);

    await archiveStudent(student.id, repositories);

    expect((await repositories.students.get(student.id))?.archivedAt).not.toBeNull();
    expect(await repositories.studentRecords.list()).toHaveLength(1);
  });

  test('deletes a student and related records atomically', async () => {
    const repositories = createTestRepositories();
    const student = await createStudent(repositories);
    await createRecord(repositories, student.id);

    await deleteStudentWithRecords(student.id, repositories);

    expect(await repositories.students.get(student.id)).toBeUndefined();
    expect(await repositories.studentRecords.list()).toEqual([]);
  });

  test('rolls back the student deletion when a related-record deletion fails', async () => {
    const repositories = createTestRepositories();
    const student = await createStudent(repositories);
    const first = await createRecord(repositories, student.id);
    const second = await createRecord(repositories, student.id, { content: '第二条记录' });
    const deleteRecord = repositories.studentRecords.delete.bind(repositories.studentRecords);
    let deletionCount = 0;
    repositories.studentRecords.delete = async (id) => {
      deletionCount += 1;
      if (deletionCount === 2) throw new Error('record delete failed');
      await deleteRecord(id);
    };

    await expect(deleteStudentWithRecords(student.id, repositories)).rejects.toThrow('record delete failed');

    expect(await repositories.students.get(student.id)).toMatchObject({ id: student.id });
    expect((await repositories.studentRecords.list()).map((record) => record.id).sort()).toEqual([first.id, second.id].sort());
  });

  test('returns export-ready rows filtered by student, inclusive date range, category, and rating', async () => {
    const repositories = createTestRepositories();
    const lin = await createStudent(repositories, '林同学');
    const zhou = await createStudent(repositories, '周同学');
    const matched = await createRecord(repositories, lin.id, { date: '2026-08-10', category: 'task', rating: 'positive' });
    await createRecord(repositories, lin.id, { date: '2026-08-11', category: 'task', rating: 'positive' });
    await createRecord(repositories, lin.id, { date: '2026-08-10', category: 'attendance', rating: 'positive' });
    await createRecord(repositories, zhou.id, { date: '2026-08-10', category: 'task', rating: 'positive' });

    expect(summarizeStudentRecords({
      studentId: lin.id,
      dateFrom: '2026-08-10',
      dateTo: '2026-08-10',
      category: 'task',
      rating: 'positive',
    }, await repositories.studentRecords.list(), await repositories.students.list())).toEqual([
      expect.objectContaining({
        id: matched.id,
        studentName: '林同学',
        categoryLabel: '任务推进',
        ratingLabel: '积极',
      }),
    ]);
  });
});
