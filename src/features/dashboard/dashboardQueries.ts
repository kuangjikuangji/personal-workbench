import { useQuery } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { Todo } from '../../domain/entities';
import { expandCourse, type CalendarOccurrence } from '../../domain/scheduling';

export type DashboardSummary = {
  todayTodos: number;
  overdueTodos: number;
  todayCourses: number;
  byRole: Record<Todo['role'], number>;
};

export type TimelineItem = {
  id: string;
  kind: 'todo' | 'course';
  title: string;
  start: string;
  end: string | null;
  role?: Todo['role'];
};

export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildDashboardSummary(now: Date, todos: Todo[], occurrences: CalendarOccurrence[]): DashboardSummary {
  const day = localDay(now);
  const open = todos.filter((todo) => todo.status === 'open');
  return {
    todayTodos: open.filter((todo) => todo.startAt?.slice(0, 10) === day).length,
    overdueTodos: open.filter((todo) => todo.startAt && todo.startAt.slice(0, 10) < day).length,
    todayCourses: occurrences.filter((occurrence) => occurrence.start.slice(0, 10) === day).length,
    byRole: {
      dean: open.filter((todo) => todo.role === 'dean').length,
      head: open.filter((todo) => todo.role === 'head').length,
      personal: open.filter((todo) => todo.role === 'personal').length,
    },
  };
}

export function buildTodayTimeline(now: Date, todos: Todo[], occurrences: CalendarOccurrence[]): TimelineItem[] {
  const day = localDay(now);
  return [
    ...todos.filter((todo) => todo.status === 'open' && todo.startAt?.slice(0, 10) === day).map((todo) => ({
      id: todo.id, kind: 'todo' as const, title: todo.title, start: todo.startAt!, end: todo.endAt, role: todo.role,
    })),
    ...occurrences.filter((occurrence) => occurrence.start.slice(0, 10) === day).map((occurrence) => ({
      id: occurrence.id, kind: 'course' as const, title: occurrence.title, start: occurrence.start, end: occurrence.end,
    })),
  ].sort((left, right) => left.start.localeCompare(right.start));
}

export function useDashboardData() {
  const repositories = useRepositories();
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [todos, semesters, courses] = await Promise.all([
        repositories.todos.list(), repositories.semesters.list(), repositories.courses.list(),
      ]);
      const active = new Map(semesters.filter((semester) => semester.isActive).map((semester) => [semester.id, semester]));
      const occurrences = courses.flatMap((course) => {
        const semester = active.get(course.semesterId);
        return semester ? expandCourse(course, semester) : [];
      });
      return { todos, occurrences };
    },
  });
}
