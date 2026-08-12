import { describe, expect, test } from 'vitest';
import type { Repositories } from '../db/repositories';
import { createTestRepositories } from '../test/database';
import {
  addMaterialForTeachers,
  addTeacherRecord,
  applyMeetingStatus,
  fillMissingTeacherSummaries,
  filterMentorships,
} from './teacherOperations';

async function createTeacher(
  repositories: Repositories,
  name: string,
  archivedAt: string | null = null,
) {
  return repositories.teachers.create({ name, department: '经济系', archivedAt });
}

describe('teacher operations', () => {
  test('persists one empty summary per active teacher and year idempotently without overwriting existing summaries', async () => {
    const repositories = createTestRepositories();
    const first = await createTeacher(repositories, '张老师');
    const second = await createTeacher(repositories, '李老师');
    await createTeacher(repositories, '已离职教师', '2026-01-01T00:00:00.000Z');
    await repositories.teacherYearSummaries.create({ teacherId: first.id, year: '2026', state: 'reported' });

    const firstRun = await fillMissingTeacherSummaries(
      '2026',
      await repositories.teachers.list(),
      await repositories.teacherYearSummaries.list(),
      repositories,
    );
    const secondRun = await fillMissingTeacherSummaries(
      '2026',
      await repositories.teachers.list(),
      await repositories.teacherYearSummaries.list(),
      repositories,
    );

    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]).toMatchObject({ teacherId: second.id, year: '2026', state: 'empty' });
    expect(secondRun).toEqual([]);
    expect((await repositories.teacherYearSummaries.list()).map(({ teacherId, state }) => ({ teacherId, state })))
      .toEqual(expect.arrayContaining([
        { teacherId: first.id, state: 'reported' },
        { teacherId: second.id, state: 'empty' },
      ]));
    expect(await repositories.teacherRecords.list()).toEqual([]);
  });

  test('adds one submitted material record for every selected teacher', async () => {
    const repositories = createTestRepositories();
    const first = await createTeacher(repositories, '张老师');
    const second = await createTeacher(repositories, '李老师');

    await addMaterialForTeachers(
      [first.id, second.id],
      { date: '2026-08-10', title: '课程大纲', status: 'submitted', notes: '纸质版' },
      repositories,
    );

    expect((await repositories.teacherRecords.list()).map((record) => ({
      teacherId: record.teacherId,
      year: record.year,
      type: record.type,
      title: record.title,
      status: record.status,
    }))).toEqual(expect.arrayContaining([
      { teacherId: first.id, year: '2026', type: 'material', title: '课程大纲', status: 'submitted' },
      { teacherId: second.id, year: '2026', type: 'material', title: '课程大纲', status: 'submitted' },
    ]));
  });

  test('rolls back every material record when one selected teacher write fails', async () => {
    const repositories = createTestRepositories();
    const first = await createTeacher(repositories, '张老师');
    const second = await createTeacher(repositories, '李老师');
    const createRecord = repositories.teacherRecords.create.bind(repositories.teacherRecords);
    let writeCount = 0;
    repositories.teacherRecords.create = async (input) => {
      writeCount += 1;
      if (writeCount === 2) throw new Error('second write failed');
      return createRecord(input);
    };

    await expect(addMaterialForTeachers(
      [first.id, second.id],
      { date: '2026-08-10', title: '课程大纲', status: 'submitted', notes: '' },
      repositories,
    )).rejects.toThrow('second write failed');

    expect(await repositories.teacherRecords.list()).toEqual([]);
    expect(await repositories.teacherYearSummaries.list()).toEqual([]);
  });

  test('rejects an archived teacher for a single record without writing a record or summary', async () => {
    const repositories = createTestRepositories();
    const archived = await createTeacher(repositories, '已离职教师', '2026-01-01T00:00:00.000Z');

    await expect(addTeacherRecord({
      teacherId: archived.id, year: '2026', type: 'work', date: '2026-08-10', title: '年度考核',
      content: '', status: 'completed', notes: '',
    }, repositories)).rejects.toThrow('not active');

    expect(await repositories.teacherRecords.list()).toEqual([]);
    expect(await repositories.teacherYearSummaries.list()).toEqual([]);
  });

  test('rejects a batch with archived or missing teachers without writing records or summaries', async () => {
    const repositories = createTestRepositories();
    const active = await createTeacher(repositories, '张老师');
    const archived = await createTeacher(repositories, '已离职教师', '2026-01-01T00:00:00.000Z');
    const material = { date: '2026-08-10', title: '课程大纲', status: 'submitted' as const, notes: '' };

    await expect(addMaterialForTeachers([active.id, archived.id], material, repositories)).rejects.toThrow('not active');
    await expect(applyMeetingStatus([active.id, 'missing-teacher'], { date: '2026-08-10', title: '例会', notes: '' }, 'attended', repositories)).rejects.toThrow('not found');

    expect(await repositories.teacherRecords.list()).toEqual([]);
    expect(await repositories.teacherYearSummaries.list()).toEqual([]);
  });

  test.each([
    ['attended', '参会'],
    ['absent', '缺席'],
    ['leave', '请假'],
  ] as const)('applies meeting status %s to every selected teacher', async (status, _label) => {
    const repositories = createTestRepositories();
    const first = await createTeacher(repositories, '张老师');
    const second = await createTeacher(repositories, '李老师');

    await applyMeetingStatus(
      [first.id, second.id],
      { date: '2026-08-10', title: '八月例会', notes: '' },
      status,
      repositories,
    );

    expect((await repositories.teacherRecords.list()).map((record) => record.status)).toEqual([status, status]);
  });

  test('filters mentorships by academic year, teacher, grade, and progress status', async () => {
    const repositories = createTestRepositories();
    const first = await createTeacher(repositories, '张老师');
    const second = await createTeacher(repositories, '李老师');
    const records = [
      await repositories.mentorships.create({
        teacherId: first.id, academicYear: '2026', studentName: '王同学', grade: '大三',
        major: '经济学', topic: '数字经济', status: 'active', notes: '',
      }),
      await repositories.mentorships.create({
        teacherId: second.id, academicYear: '2026', studentName: '赵同学', grade: '大二',
        major: '金融学', topic: '绿色金融', status: 'planned', notes: '',
      }),
      await repositories.mentorships.create({
        teacherId: first.id, academicYear: '2025', studentName: '钱同学', grade: '大三',
        major: '经济学', topic: '平台治理', status: 'active', notes: '',
      }),
    ];

    expect(filterMentorships(records, {
      academicYear: '2026', teacherId: first.id, grade: '大三', status: 'active',
    })).toEqual([records[0]]);
  });
});
