import { Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { navigation } from './navigation';
import { TodoPage } from '../features/todos/TodoPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { CoursePage } from '../features/courses/CoursePage';
import { TeacherPage } from '../features/teachers/TeacherPage';
import { ResearchPage } from '../features/research/ResearchPage';
import { IdeaPage } from '../features/ideas/IdeaPage';
import { LessonPage } from '../features/lessons/LessonPage';
import { StudentPage } from '../features/students/StudentPage';
import { SettingsPage } from '../features/settings/SettingsPage';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-page" aria-labelledby="page-title">
      <h2 id="page-title">{title}</h2>
      <p>该功能正在建设中。</p>
    </section>
  );
}

export function AppRouter() {
  return (
    <AppShell>
      <Routes>
        <Route element={<TodoPage />} path="/todos" />
        <Route element={<CalendarPage />} path="/calendar" />
        <Route element={<CoursePage />} path="/courses" />
        <Route element={<TeacherPage />} path="/teachers" />
        <Route element={<ResearchPage />} path="/research" />
        <Route element={<IdeaPage />} path="/ideas" />
        <Route element={<LessonPage />} path="/lessons" />
        <Route element={<StudentPage />} path="/students" />
        <Route element={<SettingsPage />} path="/settings" />
        {navigation.filter((item) => !['/todos', '/calendar', '/courses', '/teachers', '/research', '/ideas', '/lessons', '/students', '/settings'].includes(item.to)).map((item) => <Route element={<PlaceholderPage title={item.label} />} key={item.to} path={item.to} />)}
        <Route element={<PlaceholderPage title="页面未找到" />} path="*" />
      </Routes>
    </AppShell>
  );
}
