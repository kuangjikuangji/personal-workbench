import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import { createTestRepositories } from '../../test/database';
import { CoursePage } from './CoursePage';

function renderCoursePage(repositories = createTestRepositories()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <RepositoryProvider repositories={repositories}>
      <QueryClientProvider client={client}>
        <MemoryRouter><CoursePage /></MemoryRouter>
      </QueryClientProvider>
    </RepositoryProvider>,
  );

  return { repositories };
}

describe('CoursePage', () => {
  test('creates an odd-week course inside an active semester', async () => {
    const user = userEvent.setup();
    const { repositories } = renderCoursePage();

    await user.click(screen.getByRole('button', { name: '新建学期' }));
    const semesterDialog = screen.getByRole('dialog', { name: '新建学期' });
    await user.type(within(semesterDialog).getByLabelText('学期名称'), '2026 秋季');
    await user.type(within(semesterDialog).getByLabelText('开始日期'), '2026-09-03');
    await user.type(within(semesterDialog).getByLabelText('结束日期'), '2027-01-15');
    await user.clear(within(semesterDialog).getByLabelText('教学周数'));
    await user.type(within(semesterDialog).getByLabelText('教学周数'), '20');
    await user.click(within(semesterDialog).getByLabelText('设为当前学期'));
    await user.click(within(semesterDialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByText('2026 秋季', { selector: 'strong' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '新建课程' }));
    const courseDialog = screen.getByRole('dialog', { name: '新建课程' });
    await user.type(within(courseDialog).getByLabelText('课程名称'), '统计学');
    await user.selectOptions(within(courseDialog).getByLabelText('星期'), '1');
    await user.selectOptions(within(courseDialog).getByLabelText('周次规则'), 'odd');
    await user.clear(within(courseDialog).getByLabelText('起始周'));
    await user.type(within(courseDialog).getByLabelText('起始周'), '1');
    await user.clear(within(courseDialog).getByLabelText('结束周'));
    await user.type(within(courseDialog).getByLabelText('结束周'), '17');
    await user.click(within(courseDialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByText('统计学')).toBeVisible();
    expect(screen.getByText('第 1–17 周 · 单周')).toBeVisible();
    expect((await repositories.semesters.list())[0]).toMatchObject({ totalWeeks: 20, isActive: true });
    expect((await repositories.courses.list())[0]).toMatchObject({
      name: '统计学',
      semesterId: (await repositories.semesters.list())[0].id,
      weekRule: { kind: 'odd' },
    });
  });

  test('edits and deletes courses and cascades semester deletion', async () => {
    const repositories = createTestRepositories();
    const semester = await repositories.semesters.create({
      name: '2026 秋季', startDate: '2026-09-01', endDate: '2027-01-15', totalWeeks: 20, isActive: true,
    });
    const courseInput = {
      semesterId: semester.id, name: '统计学', location: 'A201', teacher: '张老师', weekday: 1,
      startTime: '09:00', endTime: '10:30', startWeek: 1, endWeek: 17, weekRule: { kind: 'odd' } as const, notes: '',
    };
    const firstCourse = await repositories.courses.create(courseInput);
    const user = userEvent.setup();
    renderCoursePage(repositories);

    await screen.findByText('统计学');
    await user.click(screen.getByRole('button', { name: '编辑统计学' }));
    const editDialog = screen.getByRole('dialog', { name: '编辑课程' });
    await user.clear(within(editDialog).getByLabelText('课程名称'));
    await user.type(within(editDialog).getByLabelText('课程名称'), '应用统计');
    await user.click(within(editDialog).getByRole('button', { name: '保存' }));
    expect(await screen.findByText('应用统计')).toBeVisible();
    expect((await repositories.courses.get(firstCourse.id))?.name).toBe('应用统计');

    await user.click(screen.getByRole('button', { name: '删除应用统计' }));
    await user.click(within(screen.getByRole('dialog', { name: '删除课程' })).getByRole('button', { name: '删除' }));
    expect(await screen.findByText('暂无课程')).toBeVisible();
    expect(await repositories.courses.list()).toEqual([]);

    await repositories.courses.create({ ...courseInput, name: '线性代数' });
    await user.click(screen.getByRole('button', { name: '删除2026 秋季' }));
    const deleteSemesterDialog = screen.getByRole('dialog', { name: '删除学期' });
    await user.click(within(deleteSemesterDialog).getByRole('button', { name: '删除学期及课程' }));
    expect(await screen.findByText('暂无学期')).toBeVisible();
    expect(await repositories.semesters.list()).toEqual([]);
    expect(await repositories.courses.list()).toEqual([]);
  });

  test('rejects an invalid token in explicit teaching weeks without writing a course', async () => {
    const repositories = createTestRepositories();
    await repositories.semesters.create({ name: '2026 秋季', startDate: '2026-09-01', endDate: '2027-01-15', totalWeeks: 20, isActive: true });
    renderCoursePage(repositories);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '新建课程' }));
    const dialog = screen.getByRole('dialog', { name: '新建课程' });
    await user.type(within(dialog).getByLabelText('课程名称'), '统计学');
    await user.selectOptions(within(dialog).getByLabelText('周次规则'), 'explicit');
    await user.type(await within(dialog).findByRole('textbox', { name: /^指定周次/ }), '1, x, 3');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('指定周次包含非法内容');
    expect(await repositories.courses.list()).toEqual([]);
  });
});
