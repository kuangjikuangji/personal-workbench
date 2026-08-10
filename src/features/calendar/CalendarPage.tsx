import type { DateClickArg } from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg } from '@fullcalendar/core';
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMemo, useRef, useState } from 'react';
import { useRepositories } from '../../app/providers';
import type { Course, Todo } from '../../domain/entities';
import { findScheduleConflicts, type ScheduleConflict } from '../../domain/scheduling';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Dialog } from '../../shared/ui/Dialog';
import { TodoForm } from '../todos/TodoForm';
import { readTodoConflictSnapshot, useTodos, useUpdateTodo } from '../todos/todoQueries';
import { useCourses, useSemesters } from '../courses/courseQueries';
import { CalendarEventContent, toCalendarEvents } from './calendarEvents';

type CalendarPageProps = { initialDate?: string };

type PendingDrop = {
  conflicts: ScheduleConflict[];
  patch: Pick<Todo, 'startAt' | 'endAt'>;
  revert: () => void;
  todo: Todo;
};

export function CalendarPage({ initialDate }: CalendarPageProps) {
  const repositories = useRepositories();
  const todosQuery = useTodos();
  const coursesQuery = useCourses();
  const semestersQuery = useSemesters();
  const updateTodo = useUpdateTodo();
  const [todoFormOpen, setTodoFormOpen] = useState(false);
  const [defaultStartAt, setDefaultStartAt] = useState('');
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [viewingCourse, setViewingCourse] = useState<Course | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [dropError, setDropError] = useState('');
  const [dropSaving, setDropSaving] = useState(false);
  const dropSaveLock = useRef(false);
  const todos = todosQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const semesters = semestersQuery.data ?? [];
  const events = useMemo(() => toCalendarEvents(todos, courses, semesters), [courses, semesters, todos]);
  const loading = todosQuery.isPending || coursesQuery.isPending || semestersQuery.isPending;
  const loadError = todosQuery.isError || coursesQuery.isError || semestersQuery.isError;

  const closeTodoForm = () => { setTodoFormOpen(false); setEditingTodo(null); setDefaultStartAt(''); };

  const handleDateClick = (info: DateClickArg) => {
    setEditingTodo(null);
    setDefaultStartAt(info.allDay ? `${info.dateStr.slice(0, 10)}T09:00` : formatLocalDateTime(info.date));
    setTodoFormOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const kind = info.event.extendedProps.kind as 'todo' | 'course' | undefined;
    const sourceId = String(info.event.extendedProps.sourceId ?? '');
    if (kind === 'todo') {
      const todo = todos.find((item) => item.id === sourceId);
      if (todo) { setEditingTodo(todo); setTodoFormOpen(true); }
    } else if (kind === 'course') {
      setViewingCourse(courses.find((course) => course.id === sourceId) ?? null);
    }
  };

  const handleEventDrop = async (info: EventDropArg) => {
    if (info.event.extendedProps.kind !== 'todo') { info.revert(); return; }
    const sourceId = String(info.event.extendedProps.sourceId ?? '');
    let todo: Todo | undefined;
    try {
      todo = await repositories.todos.get(sourceId);
    } catch {
      info.revert();
      setDropError('读取待办失败，已恢复原时间。');
      return;
    }
    if (!todo || !info.event.start) { info.revert(); return; }
    const patch = {
      startAt: formatLocalDateTime(info.event.start),
      endAt: todo.endAt && info.event.end ? formatLocalDateTime(info.event.end) : null,
    };
    const candidate = { ...todo, ...patch };
    let snapshot: Awaited<ReturnType<typeof readTodoConflictSnapshot>>;
    try {
      snapshot = await readTodoConflictSnapshot(repositories);
    } catch {
      info.revert();
      setDropError('读取日程失败，已恢复原时间。');
      return;
    }
    const conflicts = findScheduleConflicts(candidate, snapshot.todos.filter((item) => item.status === 'open'), snapshot.occurrences);
    if (conflicts.length > 0) {
      setPendingDrop({ conflicts, patch, revert: info.revert, todo });
      return;
    }
    try {
      await updateTodo.mutateAsync({ id: todo.id, patch });
      setDropError('');
    } catch {
      info.revert();
      setDropError('保存时间失败，已恢复原时间。');
    }
  };

  const cancelDrop = () => {
    if (dropSaveLock.current) return;
    pendingDrop?.revert();
    setPendingDrop(null);
  };

  const confirmDrop = async () => {
    if (!pendingDrop || dropSaveLock.current) return;
    const current = pendingDrop;
    dropSaveLock.current = true;
    setDropSaving(true);
    try {
      await updateTodo.mutateAsync({ id: current.todo.id, patch: current.patch });
      setPendingDrop(null);
      setDropError('');
    } catch {
      current.revert();
      setPendingDrop(null);
      setDropError('保存时间失败，已恢复原时间。');
    } finally {
      dropSaveLock.current = false;
      setDropSaving(false);
    }
  };

  return (
    <section className="calendar-page" aria-labelledby="calendar-page-title">
      <header className="page-header"><div><h2 id="calendar-page-title">日历</h2><p>月、周、日视图直接展示时间、待办和有效课程。</p></div></header>
      {loading && <p role="status">正在加载日历……</p>}
      {loadError && <p role="alert">日历加载失败，请刷新后重试。</p>}
      {dropError && <p className="calendar-error" role="alert">{dropError}</p>}
      {!loading && !loadError && (
        <div className="calendar-surface">
          <FullCalendar
            buttonText={{ today: '今天', month: '月', week: '周', day: '日' }}
            dateClick={handleDateClick}
            editable
            eventClick={handleEventClick}
            eventContent={CalendarEventContent}
            eventDisplay="block"
            eventDrop={(info) => { void handleEventDrop(info); }}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            events={events}
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
            initialDate={initialDate}
            initialView="dayGridMonth"
            locale={zhCnLocale}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          />
        </div>
      )}
      <Dialog open={todoFormOpen} onClose={closeTodoForm} title={editingTodo ? '编辑待办' : '新建待办'}><TodoForm key={editingTodo?.id ?? (defaultStartAt || 'new')} defaultStartAt={defaultStartAt} initial={editingTodo ?? undefined} onSaved={closeTodoForm} /></Dialog>
      <Dialog open={viewingCourse !== null} onClose={() => setViewingCourse(null)} title={viewingCourse?.name ?? '课程详情'}>
        {viewingCourse && <dl className="course-detail"><div><dt>时间</dt><dd>{weekdayLabel(viewingCourse.weekday)} {viewingCourse.startTime}–{viewingCourse.endTime}</dd></div><div><dt>地点</dt><dd>{viewingCourse.location || '未填写'}</dd></div><div><dt>任课教师</dt><dd>{viewingCourse.teacher || '未填写'}</dd></div><div><dt>备注</dt><dd>{viewingCourse.notes || '无'}</dd></div></dl>}
      </Dialog>
      <ConfirmDialog cancelDisabled={dropSaving} confirmDisabled={dropSaving} confirmLabel="覆盖并保存" onClose={cancelDrop} onConfirm={() => { void confirmDrop(); }} open={pendingDrop !== null} title="拖动后时间冲突">
        <p>新时间与以下日程冲突。取消将恢复原时间，只有明确覆盖才会保存。</p>
        <ul className="conflict-list">{pendingDrop?.conflicts.map((conflict) => <li key={`${conflict.kind}-${conflict.id}`}><strong>{conflict.title}</strong><span>{formatDisplayDateTime(conflict.start)} – {formatDisplayDateTime(conflict.end)}</span></li>)}</ul>
      </ConfirmDialog>
    </section>
  );
}

function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplayDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

function weekdayLabel(weekday: number): string {
  return ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'][weekday - 1] ?? '';
}
