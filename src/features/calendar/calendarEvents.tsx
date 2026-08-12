import type { EventContentArg, EventInput } from '@fullcalendar/core';
import type { Course, Semester, Todo } from '../../domain/entities';
import { expandCourse } from '../../domain/scheduling';

export type WorkbenchCalendarEvent = EventInput & {
  extendedProps: { kind: 'todo' | 'course'; sourceId: string };
};

export function toCalendarEvents(todos: Todo[], courses: Course[], semesters: Semester[]): WorkbenchCalendarEvent[] {
  const todoEvents: WorkbenchCalendarEvent[] = todos
    .filter((todo) => todo.startAt && todo.status === 'open')
    .map((todo) => ({
      id: todo.id,
      title: todo.title,
      start: todo.startAt!,
      end: todo.endAt ?? undefined,
      classNames: [`role-${todo.role}`],
      durationEditable: false,
      editable: true,
      extendedProps: { kind: 'todo', sourceId: todo.id },
    }));
  const courseEvents: WorkbenchCalendarEvent[] = courses.flatMap((course) => {
    const semester = semesters.find((item) => item.id === course.semesterId);
    return semester
      && semester.isActive ? expandCourse(course, semester).map((occurrence) => ({
        ...occurrence,
        classNames: ['course-event'],
        editable: false,
        extendedProps: { kind: 'course' as const, sourceId: course.id },
      }))
      : [];
  });
  return [...todoEvents, ...courseEvents];
}

export function CalendarEventContent({ event, timeText }: EventContentArg) {
  return (
    <span className="calendar-event-content">
      {timeText && <span className="calendar-event-time">{timeText}</span>}
      <span className="calendar-event-title">{event.title}</span>
    </span>
  );
}
