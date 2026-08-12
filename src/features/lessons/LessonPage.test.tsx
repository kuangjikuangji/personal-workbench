import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import { createTestRepositories } from '../../test/database';
import { LessonPage } from './LessonPage';

function renderLessonPage(repositories = createTestRepositories()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><LessonPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);
  return repositories;
}

describe('LessonPage', () => {
  test('creates a lesson plan with all teaching fields under its course', async () => {
    const repositories = createTestRepositories();
    const semester = await repositories.semesters.create({ name: '2026 秋季', startDate: '2026-09-01', endDate: '2027-01-15', totalWeeks: 20, isActive: true });
    await repositories.courses.create({ semesterId: semester.id, name: '统计学', location: '', teacher: '', weekday: 1, startTime: '08:00', endTime: '09:30', startWeek: 1, endWeek: 18, weekRule: { kind: 'every' }, notes: '' });
    renderLessonPage(repositories);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新建备课' }));
    const dialog = screen.getByRole('dialog', { name: '新建备课' });
    await user.selectOptions(within(dialog).getByLabelText('课程'), (await repositories.courses.list())[0].id);
    await user.type(within(dialog).getByLabelText('章节'), '第一章');
    await user.type(within(dialog).getByLabelText('教学目标'), '理解平均数');
    await user.type(within(dialog).getByLabelText('内容提纲'), '集中趋势');
    await user.type(within(dialog).getByLabelText('教学资源'), '课件');
    await user.type(within(dialog).getByLabelText('课堂活动'), '分组讨论');
    await user.type(within(dialog).getByLabelText('计划日期'), '2026-09-02');
    await user.selectOptions(within(dialog).getByLabelText('进度'), 'inProgress');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(await screen.findByText('第一章')).toBeVisible();
    expect(screen.getByText('统计学')).toBeVisible();
  });

  test('keeps lesson text and labels the group when its linked course is deleted', async () => {
    const repositories = createTestRepositories();
    const course = await repositories.courses.create({ semesterId: 'semester', name: '统计学', location: '', teacher: '', weekday: 1, startTime: '08:00', endTime: '09:30', startWeek: 1, endWeek: 18, weekRule: { kind: 'every' }, notes: '' });
    const lesson = await repositories.lessonPlans.create({ courseId: course.id, chapter: '第一章', objectives: '', outline: '第一章提纲', resources: '', activities: '', plannedDate: null, status: 'notStarted' });
    await repositories.courses.delete(course.id);
    expect(await repositories.lessonPlans.get(lesson.id)).toMatchObject({ outline: '第一章提纲' });
    renderLessonPage(repositories);
    expect(await screen.findByText('原课程已删除')).toBeVisible();
    expect(screen.getByText('第一章提纲')).toBeVisible();
  });
});
