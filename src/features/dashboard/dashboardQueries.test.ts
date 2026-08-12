import type { Todo } from '../../domain/entities';
import type { CalendarOccurrence } from '../../domain/scheduling';
import { buildDashboardSummary, buildTodayTimeline } from './dashboardQueries';

function todoFixture(overrides: Partial<Todo>): Todo {
  return {
    id: 'todo', createdAt: '2026-08-01T00:00:00+08:00', updatedAt: '2026-08-01T00:00:00+08:00',
    title: '待办', description: '', role: 'personal', startAt: null, endAt: null, remindAt: null,
    priority: 'normal', status: 'open', sourceType: null, sourceId: null, ...overrides,
  };
}

test('separates today, overdue, course, and role counts in the local day', () => {
  const summary = buildDashboardSummary(new Date('2026-08-10T00:30:00+08:00'), [
    todoFixture({ id: 'today', role: 'dean', startAt: '2026-08-10T09:00:00+08:00' }),
    todoFixture({ id: 'overdue', role: 'head', startAt: '2026-08-09T09:00:00+08:00' }),
    todoFixture({ id: 'done', role: 'personal', status: 'done', startAt: '2026-08-10T10:00:00+08:00' }),
  ], [{ id: 'c', sourceId: 'c', kind: 'course', title: '统计学', start: '2026-08-10T14:00:00+08:00', end: '2026-08-10T15:00:00+08:00' }]);

  expect(summary).toEqual({ todayTodos: 1, overdueTodos: 1, todayCourses: 1, byRole: { dean: 1, head: 1, personal: 0 } });
});

test('sorts todays todo and course occurrences into one timeline', () => {
  const occurrences: CalendarOccurrence[] = [
    { id: 'course', sourceId: 'course', kind: 'course', title: '统计学', start: '2026-08-10T09:00:00+08:00', end: '2026-08-10T10:00:00+08:00' },
  ];
  const timeline = buildTodayTimeline(new Date('2026-08-10T12:00:00+08:00'), [
    todoFixture({ id: 'later', title: '写报告', startAt: '2026-08-10T14:00:00+08:00' }),
    todoFixture({ id: 'done', title: '已完成', status: 'done', startAt: '2026-08-10T08:00:00+08:00' }),
  ], occurrences);

  expect(timeline.map((item) => `${item.kind}:${item.title}`)).toEqual(['course:统计学', 'todo:写报告']);
});
