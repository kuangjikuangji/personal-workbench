import { describe, expect, test } from 'vitest';
import type { Course, Semester, Todo } from './entities';
import { expandCourse, findScheduleConflicts, matchesWeek, overlaps } from './scheduling';

const auditFields = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function semesterFixture(overrides: Partial<Semester> = {}): Semester {
  return {
    id: 'semester-1',
    name: '2026 秋季',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    totalWeeks: 18,
    isActive: true,
    ...auditFields,
    ...overrides,
  };
}

function courseFixture(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course-1',
    semesterId: 'semester-1',
    name: '统计学',
    location: 'A201',
    teacher: '张老师',
    weekday: 1,
    startTime: '09:00',
    endTime: '10:30',
    startWeek: 1,
    endWeek: 18,
    weekRule: { kind: 'every' },
    notes: '',
    ...auditFields,
    ...overrides,
  };
}

function todoFixture(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    title: '准备材料',
    description: '',
    role: 'personal',
    startAt: null,
    endAt: null,
    remindAt: null,
    priority: 'normal',
    status: 'open',
    sourceType: null,
    sourceId: null,
    ...auditFields,
    ...overrides,
  };
}

describe('teaching week scheduling', () => {
  test('expands odd teaching weeks when semester starts midweek', () => {
    const semester = semesterFixture({ startDate: '2026-09-03', endDate: '2026-10-31' });
    const course = courseFixture({ weekday: 1, startWeek: 1, endWeek: 5, weekRule: { kind: 'odd' } });

    expect(expandCourse(course, semester).map((occurrence) => occurrence.start.slice(0, 10)))
      .toEqual(['2026-09-14', '2026-09-28']);
  });

  test('excludes lessons before the semester start and after its end', () => {
    const semester = semesterFixture({ startDate: '2026-09-03', endDate: '2026-09-13' });
    const course = courseFixture({ weekday: 2, startWeek: 1, endWeek: 2 });

    expect(expandCourse(course, semester).map((occurrence) => occurrence.start.slice(0, 10)))
      .toEqual(['2026-09-08']);
  });

  test('matches every, odd, even, and explicit week rules', () => {
    expect(matchesWeek({ kind: 'every' }, 2)).toBe(true);
    expect(matchesWeek({ kind: 'odd' }, 3)).toBe(true);
    expect(matchesWeek({ kind: 'odd' }, 2)).toBe(false);
    expect(matchesWeek({ kind: 'even' }, 4)).toBe(true);
    expect(matchesWeek({ kind: 'even' }, 3)).toBe(false);
    expect(matchesWeek({ kind: 'explicit', weeks: [2, 5] }, 5)).toBe(true);
    expect(matchesWeek({ kind: 'explicit', weeks: [2, 5] }, 3)).toBe(false);
  });

  test('reports overlap with both a todo and a course occurrence', () => {
    const candidate = todoFixture({ startAt: '2026-09-07T09:20:00', endAt: '2026-09-07T10:00:00' });
    const result = findScheduleConflicts(
      candidate,
      [todoFixture({ id: 'todo-2', startAt: '2026-09-07T09:00:00', endAt: '2026-09-07T09:30:00' })],
      [{ id: 'course-1@2026-09-07', sourceId: 'course-1', kind: 'course', title: '统计学', start: '2026-09-07T09:45:00', end: '2026-09-07T11:15:00' }],
    );

    expect(result.map((conflict) => conflict.kind)).toEqual(['todo', 'course']);
  });

  test('uses a 30-minute duration for todos without an end time', () => {
    const candidate = todoFixture({ startAt: '2026-09-07T09:00:00', endAt: null });
    const result = findScheduleConflicts(
      candidate,
      [todoFixture({ id: 'todo-2', startAt: '2026-09-07T09:25:00', endAt: '2026-09-07T09:40:00' })],
      [],
    );

    expect(result.map((conflict) => conflict.id)).toEqual(['todo-2']);
  });

  test('does not mark adjacent intervals as conflicting', () => {
    const candidate = todoFixture({ startAt: '2026-09-07T09:00:00', endAt: '2026-09-07T09:30:00' });
    const result = findScheduleConflicts(
      candidate,
      [todoFixture({ id: 'todo-2', startAt: '2026-09-07T09:30:00', endAt: '2026-09-07T10:00:00' })],
      [],
    );

    expect(result).toEqual([]);
    expect(overlaps(
      new Date('2026-09-07T09:00:00'),
      new Date('2026-09-07T09:30:00'),
      new Date('2026-09-07T09:30:00'),
      new Date('2026-09-07T10:00:00'),
    )).toBe(false);
  });
});
