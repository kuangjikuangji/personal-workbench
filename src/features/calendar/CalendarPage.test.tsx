import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import type { Course, Semester, Todo } from '../../domain/entities';
import { createTestRepositories } from '../../test/database';
import { CalendarPage } from './CalendarPage';
import { toCalendarEvents } from './calendarEvents';

function semesterFixture(): Omit<Semester, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '2026 秋季',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    totalWeeks: 18,
    isActive: true,
  };
}

function todoFixture(overrides: Partial<Todo> = {}): Omit<Todo, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: '提交学院预算',
    description: '',
    role: 'dean',
    startAt: '2026-09-07T08:30:00',
    endAt: '2026-09-07T09:00:00',
    remindAt: null,
    priority: 'normal',
    status: 'open',
    sourceType: null,
    sourceId: null,
    ...overrides,
  };
}

function courseFixture(semesterId: string, overrides: Partial<Course> = {}): Omit<Course, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    semesterId,
    name: '统计学',
    location: 'A201',
    teacher: '张老师',
    weekday: 1,
    startTime: '09:00',
    endTime: '10:30',
    startWeek: 2,
    endWeek: 2,
    weekRule: { kind: 'every' },
    notes: '',
    ...overrides,
  };
}

describe('CalendarPage', () => {
  test('allows moving todos without exposing an unpersisted resize operation', async () => {
    const repositories = createTestRepositories();
    const todo = await repositories.todos.create(todoFixture());

    expect(toCalendarEvents([todo], [], [])[0]).toMatchObject({
      editable: true,
      durationEditable: false,
      extendedProps: { kind: 'todo', sourceId: todo.id },
    });
  });

  test('renders todo and course times and titles directly in a month cell', async () => {
    const repositories = createTestRepositories();
    const semester = await repositories.semesters.create(semesterFixture());
    await repositories.todos.create(todoFixture());
    await repositories.courses.create(courseFixture(semester.id));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><CalendarPage initialDate="2026-09-07" /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    expect(await screen.findByText('提交学院预算')).toBeVisible();
    expect(screen.getByText('统计学')).toBeVisible();
    expect(screen.getByText('08:30')).toBeVisible();
    expect(screen.getByText('09:00')).toBeVisible();
  });

  test('switches between month, week, and day views', async () => {
    const repositories = createTestRepositories();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={client}>
          <MemoryRouter><CalendarPage initialDate="2026-09-07" /></MemoryRouter>
        </QueryClientProvider>
      </RepositoryProvider>,
    );

    const weekButton = await screen.findByRole('button', { name: '周' });
    const dayButton = screen.getByRole('button', { name: '日' });
    const monthButton = screen.getByRole('button', { name: '月' });
    await user.click(weekButton);
    expect(document.querySelector('.fc-timeGridWeek-view')).toBeInTheDocument();
    await user.click(dayButton);
    expect(document.querySelector('.fc-timeGridDay-view')).toBeInTheDocument();
    await user.click(monthButton);
    expect(document.querySelector('.fc-dayGridMonth-view')).toBeInTheDocument();
  });
});
