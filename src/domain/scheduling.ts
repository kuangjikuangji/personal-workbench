import type { Course, Semester, Todo, WeekRule } from './entities';

export interface CalendarOccurrence {
  id: string;
  sourceId: string;
  kind: 'course';
  title: string;
  start: string;
  end: string;
}

export interface ScheduleConflict {
  id: string;
  sourceId: string;
  kind: 'todo' | 'course';
  title: string;
  start: string;
  end: string;
}

const TODO_DEFAULT_DURATION_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function matchesWeek(rule: WeekRule, week: number): boolean {
  if (rule.kind === 'every') return true;
  if (rule.kind === 'odd') return week % 2 === 1;
  if (rule.kind === 'even') return week % 2 === 0;
  return rule.weeks.includes(week);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function expandCourse(course: Course, semester: Semester): CalendarOccurrence[] {
  const semesterStart = parseDateOnly(semester.startDate);
  const semesterEnd = parseDateOnly(semester.endDate);
  if (!semesterStart || !semesterEnd || semesterStart > semesterEnd) return [];

  const weekOneMonday = mondayOf(semesterStart);
  const occurrences: CalendarOccurrence[] = [];

  for (let week = course.startWeek; week <= course.endWeek; week += 1) {
    if (!matchesWeek(course.weekRule, week)) continue;

    const lessonDate = addDays(weekOneMonday, (week - 1) * 7 + course.weekday - 1);
    if (lessonDate < semesterStart || lessonDate > semesterEnd) continue;

    const date = formatDateOnly(lessonDate);
    occurrences.push({
      id: `${course.id}@${date}`,
      sourceId: course.id,
      kind: 'course',
      title: course.name,
      start: `${date}T${course.startTime}`,
      end: `${date}T${course.endTime}`,
    });
  }

  return occurrences;
}

export function findScheduleConflicts(
  candidate: Todo,
  todos: Todo[],
  occurrences: CalendarOccurrence[],
): ScheduleConflict[] {
  const candidateInterval = todoInterval(candidate);
  if (!candidateInterval) return [];

  const conflicts: ScheduleConflict[] = [];

  for (const todo of todos) {
    if (todo.id === candidate.id) continue;
    const interval = todoInterval(todo);
    if (!interval || !overlaps(candidateInterval.start, candidateInterval.end, interval.start, interval.end)) continue;

    conflicts.push({
      id: todo.id,
      sourceId: todo.id,
      kind: 'todo',
      title: todo.title,
      start: interval.startText,
      end: interval.endText,
    });
  }

  for (const occurrence of occurrences) {
    const start = new Date(occurrence.start);
    const end = new Date(occurrence.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (!overlaps(candidateInterval.start, candidateInterval.end, start, end)) continue;

    conflicts.push({ ...occurrence });
  }

  return conflicts;
}

function todoInterval(todo: Todo): { start: Date; end: Date; startText: string; endText: string } | null {
  if (!todo.startAt) return null;

  const start = new Date(todo.startAt);
  const end = todo.endAt ? new Date(todo.endAt) : new Date(start.getTime() + TODO_DEFAULT_DURATION_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return { start, end, startText: todo.startAt, endText: todo.endAt ?? end.toISOString() };
}

function parseDateOnly(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mondayOf(date: Date): Date {
  const weekday = date.getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
