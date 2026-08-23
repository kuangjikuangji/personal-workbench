import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes, useSearchParams } from 'react-router-dom';
import { AppShell } from './AppShell';
import { navigation } from './navigation';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import type { Profile } from '../features/auth/authTypes';

const TodoPage = lazy(() => import('../features/todos/TodoPage').then((module) => ({ default: module.TodoPage })));
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const CoursePage = lazy(() => import('../features/courses/CoursePage').then((module) => ({ default: module.CoursePage })));
const TeacherPage = lazy(() => import('../features/teachers/TeacherPage').then((module) => ({ default: module.TeacherPage })));
const ResearchPage = lazy(() => import('../features/research/ResearchPage').then((module) => ({ default: module.ResearchPage })));
const IdeaPage = lazy(() => import('../features/ideas/IdeaPage').then((module) => ({ default: module.IdeaPage })));
const LessonPage = lazy(() => import('../features/lessons/LessonPage').then((module) => ({ default: module.LessonPage })));
const StudentPage = lazy(() => import('../features/students/StudentPage').then((module) => ({ default: module.StudentPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));

function CalendarRoute() {
  const [params] = useSearchParams();
  return <CalendarPage initialDate={params.get('date') ?? undefined} initialKind={params.get('kind') === 'course' ? 'course' : undefined} />;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-page" aria-labelledby="page-title">
      <h2 id="page-title">{title}</h2>
      <p>该功能正在建设中。</p>
    </section>
  );
}

export function AppRouter({ profile, onSignOut, syncStatus }: { profile: Profile; onSignOut(): Promise<void>; syncStatus?: ReactNode }) {
  return (
    <AppShell profile={profile} onSignOut={onSignOut} syncStatus={syncStatus}>
      <Suspense fallback={<p role="status">正在加载页面……</p>}><Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<TodoPage />} path="/todos" />
        <Route element={<CalendarRoute />} path="/calendar" />
        <Route element={<CoursePage />} path="/courses" />
        <Route element={<TeacherPage />} path="/teachers" />
        <Route element={<ResearchPage />} path="/research" />
        <Route element={<IdeaPage />} path="/ideas" />
        <Route element={<LessonPage />} path="/lessons" />
        <Route element={<StudentPage />} path="/students" />
        <Route element={<SettingsPage />} path="/settings" />
        {navigation.filter((item) => !['/', '/todos', '/calendar', '/courses', '/teachers', '/research', '/ideas', '/lessons', '/students', '/settings'].includes(item.to)).map((item) => <Route element={<PlaceholderPage title={item.label} />} key={item.to} path={item.to} />)}
        <Route element={<PlaceholderPage title="页面未找到" />} path="*" />
      </Routes></Suspense>
    </AppShell>
  );
}
