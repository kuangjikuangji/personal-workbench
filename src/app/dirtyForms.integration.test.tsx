import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { CourseForm } from '../features/courses/CourseForm';
import { MentorshipForm } from '../features/mentorships/MentorshipForm';
import { ResearchForm } from '../features/research/ResearchForm';
import { StudentRecordForm } from '../features/students/StudentRecordForm';
import { TeacherRecordForm } from '../features/teachers/TeacherRecordForm';
import { WeChatImportDialog } from '../features/todos/WeChatImportDialog';
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

test('does not mark an unchanged mentorship edit as dirty', async () => {
  const user = userEvent.setup();
  renderForm(<MentorshipForm teacherId="teacher" initial={{
    id: 'mentorship', teacherId: 'teacher', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    studentName: '王同学', academicYear: '2026', grade: '大三', major: '经济学', topic: '数字经济', status: 'active', notes: '',
  }} onSaved={() => undefined} />);
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).toHaveBeenCalledOnce();
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

test('blocks an update for non-empty WeChat source or a preview, then clears after close', async () => {
  const user = userEvent.setup();
  renderForm(<WeChatImportDialog open onClose={() => undefined} />);
  const dialog = screen.getByRole('dialog', { name: '微信文本导入' });

  await user.type(within(dialog).getByLabelText('微信对话文本'), '明天开会');
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole('button', { name: '解析预览' }));
  await user.clear(within(dialog).getByLabelText('微信对话文本'));
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole('button', { name: '关闭' }));
  await user.click(screen.getByRole('button', { name: '立即更新' }));
  expect(updateServiceWorker).toHaveBeenCalledOnce();
});

test('clears WeChat import dirty state after a successful import', async () => {
  const user = userEvent.setup();
  renderForm(<WeChatImportDialog open onClose={() => undefined} />);
  const dialog = screen.getByRole('dialog', { name: '微信文本导入' });

  await user.type(within(dialog).getByLabelText('微信对话文本'), '2026-08-12 10:00-11:00 成功导入');
  await user.click(within(dialog).getByRole('button', { name: '解析预览' }));
  await user.click(within(dialog).getByRole('button', { name: '导入选中' }));
  await waitFor(() => expect(within(dialog).getByLabelText('微信对话文本')).toHaveValue(''));
  await user.click(screen.getByRole('button', { name: '立即更新' }));

  expect(updateServiceWorker).toHaveBeenCalledOnce();
});
