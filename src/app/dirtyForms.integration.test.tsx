import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { CourseForm } from '../features/courses/CourseForm';
import { MentorshipForm } from '../features/mentorships/MentorshipForm';
import { ResearchForm } from '../features/research/ResearchForm';
import { StudentRecordForm } from '../features/students/StudentRecordForm';
import { TeacherRecordForm } from '../features/teachers/TeacherRecordForm';
import { RepositoryProvider } from './providers';
import { createTestRepositories } from '../test/database';
import { dirtyForms, usePwaUpdate } from './usePwaUpdate';

const updateServiceWorker = vi.fn();
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [true, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker }),
}));

function UpdateAction() {
  const update = usePwaUpdate();
  return <><button type="button" onClick={() => { void update.updateNow(); }}>立即更新</button>{update.blockedMessage && <p role="alert">{update.blockedMessage}</p>}</>;
}

function renderForm(form: React.ReactNode) {
  const repositories = createTestRepositories();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter>{form}<UpdateAction /></MemoryRouter></QueryClientProvider></RepositoryProvider>);
}

beforeEach(() => { dirtyForms.clear(); updateServiceWorker.mockReset(); });

test('blocks an update after only a course select changes', async () => {
  const user = userEvent.setup();
  renderForm(<CourseForm semesters={[{ id: 's', createdAt: '', updatedAt: '', name: '当前学期', startDate: '2026-09-01', endDate: '2027-01-01', totalWeeks: 18, isActive: true }]} onSaved={() => undefined} />);
  await user.selectOptions(screen.getByLabelText('星期'), '2');
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('未保存');
});

test('blocks an update after only a research select changes', async () => {
  const user = userEvent.setup();
  renderForm(<ResearchForm onSaved={() => undefined} />);
  await user.selectOptions(screen.getByLabelText('阅读状态'), 'reading');
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).not.toHaveBeenCalled();
});

test('blocks an update after only a mentorship status changes', async () => {
  const user = userEvent.setup();
  renderForm(<MentorshipForm teacherId="teacher" onSaved={() => undefined} />);
  await user.selectOptions(screen.getByLabelText('进展状态'), 'active');
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).not.toHaveBeenCalled();
});

test('blocks an update after only a teacher-record date changes', async () => {
  const user = userEvent.setup();
  renderForm(<TeacherRecordForm teacherId="teacher" onSaved={() => undefined} />);
  await user.clear(screen.getByLabelText('日期'));
  await user.type(screen.getByLabelText('日期'), '2026-09-02');
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).not.toHaveBeenCalled();
});

test('blocks an update after only a student-record category changes', async () => {
  const user = userEvent.setup();
  renderForm(<StudentRecordForm studentId="student" onSaved={() => undefined} />);
  await user.selectOptions(screen.getByLabelText('类别'), 'research');
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).not.toHaveBeenCalled();
});
