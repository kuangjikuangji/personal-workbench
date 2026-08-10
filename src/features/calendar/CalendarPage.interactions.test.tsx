import type { EventApi, EventDropArg, EventInput } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import type { Todo } from '../../domain/entities';
import { createTestRepositories } from '../../test/database';
import { CalendarPage } from './CalendarPage';

const calendarSpies = vi.hoisted(() => ({ revert: vi.fn() }));

type FakeCalendarProps = {
  dateClick?: (info: DateClickArg) => void;
  eventDrop?: (info: EventDropArg) => void;
  events?: EventInput[];
};

vi.mock('@fullcalendar/react', () => ({
  default: ({ dateClick, eventDrop, events = [] }: FakeCalendarProps) => {
    const todoEvent = events.find((event) => event.extendedProps?.kind === 'todo' && event.title === '原待办');
    return (
      <div aria-label="测试日历">
        {events.map((event) => <span key={String(event.id)}>{String(event.title)}</span>)}
        <button type="button" onClick={() => dateClick?.({
          allDay: true,
          date: new Date('2026-09-08T00:00:00'),
          dateStr: '2026-09-08',
        } as DateClickArg)}>模拟点击日期</button>
        <button type="button" onClick={() => {
          if (!todoEvent) return;
          const event = {
            id: String(todoEvent.id),
            title: String(todoEvent.title),
            start: new Date('2026-09-07T10:00:00'),
            end: new Date('2026-09-07T11:00:00'),
            extendedProps: todoEvent.extendedProps ?? {},
          } as EventApi;
          eventDrop?.({ event, oldEvent: event, revert: calendarSpies.revert } as unknown as EventDropArg);
        }}>模拟拖动待办</button>
      </div>
    );
  },
}));

function todoFixture(overrides: Partial<Todo> = {}): Omit<Todo, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: '原待办',
    description: '',
    role: 'personal',
    startAt: '2026-09-07T08:00',
    endAt: '2026-09-07T09:00',
    remindAt: null,
    priority: 'normal',
    status: 'open',
    sourceType: null,
    sourceId: null,
    ...overrides,
  };
}

describe('CalendarPage interactions', () => {
  beforeEach(() => calendarSpies.revert.mockReset());

  test('prefills a todo from a clicked date', async () => {
    const repositories = createTestRepositories();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><CalendarPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);

    await user.click(await screen.findByRole('button', { name: '模拟点击日期' }));
    const dialog = screen.getByRole('dialog', { name: '新建待办' });
    expect(within(dialog).getByLabelText('开始时间')).toHaveValue('2026-09-08T09:00');
  });

  test('reverts a conflicting drop on cancel and saves it only after explicit override', async () => {
    const repositories = createTestRepositories();
    const moved = await repositories.todos.create(todoFixture());
    await repositories.todos.create(todoFixture({ title: '冲突会议', startAt: '2026-09-07T10:30', endAt: '2026-09-07T11:30' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><CalendarPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);

    await user.click(await screen.findByRole('button', { name: '模拟拖动待办' }));
    const firstConflict = await screen.findByRole('dialog', { name: '拖动后时间冲突' });
    expect(within(firstConflict).getByText('冲突会议')).toBeVisible();
    await user.click(within(firstConflict).getByRole('button', { name: '取消' }));
    expect(calendarSpies.revert).toHaveBeenCalledTimes(1);
    expect((await repositories.todos.get(moved.id))?.startAt).toBe('2026-09-07T08:00');

    await user.click(screen.getByRole('button', { name: '模拟拖动待办' }));
    const secondConflict = await screen.findByRole('dialog', { name: '拖动后时间冲突' });
    await user.click(within(secondConflict).getByRole('button', { name: '覆盖并保存' }));
    await waitFor(async () => expect((await repositories.todos.get(moved.id))?.startAt).toBe('2026-09-07T10:00'));
    expect(calendarSpies.revert).toHaveBeenCalledTimes(1);
  });

  test('checks dragged todos against courses only in the active semester', async () => {
    const repositories = createTestRepositories();
    const moved = await repositories.todos.create(todoFixture());
    const semester = await repositories.semesters.create({
      name: '2026 秋季', startDate: '2026-09-01', endDate: '2026-12-31', totalWeeks: 18, isActive: false,
    });
    await repositories.courses.create({
      semesterId: semester.id, name: '统计学', location: '', teacher: '', weekday: 1,
      startTime: '10:30', endTime: '11:30', startWeek: 2, endWeek: 2, weekRule: { kind: 'every' }, notes: '',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><CalendarPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);

    await user.click(await screen.findByRole('button', { name: '模拟拖动待办' }));
    await waitFor(async () => expect((await repositories.todos.get(moved.id))?.startAt).toBe('2026-09-07T10:00'));
    expect(screen.queryByRole('dialog', { name: '拖动后时间冲突' })).not.toBeInTheDocument();

    await repositories.todos.patch(moved.id, { startAt: '2026-09-07T08:00', endAt: '2026-09-07T09:00' });
    await repositories.semesters.patch(semester.id, { isActive: true });
    await user.click(screen.getByRole('button', { name: '模拟拖动待办' }));
    const conflictDialog = await screen.findByRole('dialog', { name: '拖动后时间冲突' });
    expect(within(conflictDialog).getByText('统计学')).toBeVisible();
  });

  test('reverts when the dragged todo cannot be read', async () => {
    const repositories = createTestRepositories();
    await repositories.todos.create(todoFixture());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><CalendarPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);

    await screen.findByRole('button', { name: '模拟拖动待办' });
    vi.spyOn(repositories.todos, 'get').mockRejectedValueOnce(new Error('read failed'));
    await user.click(screen.getByRole('button', { name: '模拟拖动待办' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('读取待办失败，已恢复原时间。');
    expect(calendarSpies.revert).toHaveBeenCalledTimes(1);
  });

  test('locks cancel and close paths while an override save is pending', async () => {
    const repositories = createTestRepositories();
    const moved = await repositories.todos.create(todoFixture());
    await repositories.todos.create(todoFixture({ title: '冲突会议', startAt: '2026-09-07T10:30', endAt: '2026-09-07T11:30' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><CalendarPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);

    await user.click(await screen.findByRole('button', { name: '模拟拖动待办' }));
    const dialog = await screen.findByRole('dialog', { name: '拖动后时间冲突' });
    const realPatch = repositories.todos.patch.bind(repositories.todos);
    let releaseSave: (() => void) | undefined;
    vi.spyOn(repositories.todos, 'patch').mockImplementation((id, patch) => new Promise((resolve) => {
      releaseSave = () => { void realPatch(id, patch).then(resolve); };
    }));
    await user.click(within(dialog).getByRole('button', { name: '覆盖并保存' }));

    expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '关闭' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '拖动后时间冲突' })).toBeVisible();
    expect(calendarSpies.revert).not.toHaveBeenCalled();

    releaseSave?.();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '拖动后时间冲突' })).not.toBeInTheDocument());
    expect((await repositories.todos.get(moved.id))?.startAt).toBe('2026-09-07T10:00');
  });
});
