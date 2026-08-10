# Personal Workbench React PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing local workbench as an installable React + TypeScript PWA covering work, calendar, department, research, teaching, and student workflows with durable local data.

**Architecture:** Feature folders own pages, forms, and query hooks; pure domain services own scheduling and batch rules; repositories are the only code allowed to access Dexie. TanStack Query coordinates repository reads, Zustand holds transient UI state, and the PWA shell remains usable offline while leaving a clean seam for a future Supabase sync adapter.

**Tech Stack:** Vite, React, TypeScript, React Router, Dexie, TanStack Query, Zustand, React Hook Form, Zod, FullCalendar, SheetJS, vite-plugin-pwa, Vitest, React Testing Library, Playwright.

## Global Constraints

- The first release runs locally and does not connect to Supabase or migrate old browser data.
- Chrome/Edge desktop installation and mobile add-to-home-screen are required.
- Course recurrence supports semester date bounds, teaching weeks, odd weeks, even weeks, and explicit weeks.
- Reminders are best-effort while the PWA is running or backgrounded and are caught up when it reopens.
- Calendar month cells display todo and course text, not dots alone.
- Every record uses a UUID plus ISO 8601 `createdAt` and `updatedAt` timestamps.
- Pages never import the Dexie database directly; all persistence goes through repositories.
- Batch writes are atomic, and success feedback is shown only after the transaction commits.
- Chinese UI copy is the default; role meaning must not depend on color alone.
- Preserve the current static implementation in Git history before replacing root application files.

---

## File Structure

```text
workbench/
├── public/
│   ├── icons/                    # PWA icons
│   └── favicon.svg
├── src/
│   ├── app/                      # providers, router, shell, navigation
│   ├── db/                       # Dexie schema, repositories, backup codec
│   ├── domain/                   # shared types and pure business rules
│   ├── features/
│   │   ├── dashboard/            # overview and quick-create
│   │   ├── todos/                # todo CRUD, filters, WeChat text import
│   │   ├── calendar/             # calendar composition and event editing
│   │   ├── courses/              # semesters and recurring courses
│   │   ├── teachers/             # roster, annual records, bulk actions
│   │   ├── mentorships/          # undergraduate advising records
│   │   ├── research/             # literature and learning methods
│   │   ├── ideas/                # capture, archive, conversion
│   │   ├── lessons/              # lesson planning
│   │   ├── students/             # team members and performance records
│   │   └── settings/             # theme, notification, install, import/export
│   ├── shared/                   # reusable UI, date helpers, export helpers
│   ├── test/                     # test setup and repository fixtures
│   ├── main.tsx
│   └── styles.css
├── e2e/                          # Playwright user journeys
├── index.html
├── package.json
├── vite.config.ts
├── playwright.config.ts
└── tsconfig*.json
```

## Task 1: Capture the Legacy Baseline and Scaffold the Tested React PWA

**Files:**
- Track unchanged: `README.md`, `index.html`, `manifest.webmanifest`, `assets/*`
- Replace: `index.html`, `README.md`
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts`, `playwright.config.ts`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/styles.css`, `src/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Create: `public/favicon.svg`, `public/icons/icon-192.svg`, `public/icons/icon-512.svg`

**Interfaces:**
- Produces: `App(): JSX.Element`, `renderWithProviders(ui: ReactElement): RenderResult`, npm scripts `dev`, `build`, `test`, `test:run`, `test:e2e`, and `typecheck`.

- [ ] **Step 1: Commit the currently untracked static application as the legacy baseline**

```bash
git add README.md index.html manifest.webmanifest assets
git commit -m "chore: capture legacy static workbench"
```

- [ ] **Step 2: Create the package manifest and compiler/test configuration**

```json
{
  "name": "personal-workbench",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@fullcalendar/core": "6.1.21",
    "@fullcalendar/daygrid": "6.1.21",
    "@fullcalendar/interaction": "6.1.21",
    "@fullcalendar/react": "6.1.21",
    "@fullcalendar/timegrid": "6.1.21",
    "@hookform/resolvers": "latest",
    "@tanstack/react-query": "latest",
    "dexie": "latest",
    "lucide-react": "latest",
    "react": "latest",
    "react-dom": "latest",
    "react-hook-form": "latest",
    "react-router-dom": "latest",
    "xlsx": "latest",
    "zod": "latest",
    "zustand": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@testing-library/jest-dom": "latest",
    "@testing-library/dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "fake-indexeddb": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vite-plugin-pwa": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 3: Install dependencies and write the failing shell test**

```tsx
// src/app/App.test.tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the Chinese workbench shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '个人工作学习工作台' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
});
```

Run: `npm install && npm run test:run -- src/app/App.test.tsx`
Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 4: Implement the minimal typed application shell**

```tsx
// src/app/App.tsx
export function App() {
  return (
    <div className="app-shell">
      <aside><h1>个人工作学习工作台</h1><nav aria-label="主导航">概览</nav></aside>
      <main><h2>今日概览</h2></main>
    </div>
  );
}
```

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```

- [ ] **Step 5: Configure Vitest, PWA metadata, and responsive base styles**

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'prompt', manifest: {
    name: '个人工作学习工作台', short_name: '工作台', start_url: './',
    display: 'standalone', theme_color: '#173b67', background_color: '#f5f7fb',
    icons: [
      { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
  } })],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
```

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: all commands exit 0 and `dist/manifest.webmanifest` exists.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig*.json vite.config.ts playwright.config.ts index.html public src README.md
git commit -m "feat: scaffold tested React PWA"
```

## Task 2: Define Domain Types, Dexie Schema, and Repository Boundaries

**Files:**
- Create: `src/domain/entities.ts`, `src/domain/constants.ts`
- Create: `src/db/database.ts`, `src/db/repositories.ts`, `src/db/localRepositories.ts`
- Create: `src/db/localRepositories.test.ts`, `src/test/database.ts`

**Interfaces:**
- Produces: `BaseEntity`, `Todo`, `Semester`, `Course`, `Teacher`, `TeacherYearSummary`, `TeacherRecord`, `Mentorship`, `ResearchItem`, `LearningMethod`, `Idea`, `LessonPlan`, `Student`, `StudentRecord`.
- Produces: `CrudRepository<T, TInput>` with `list()`, `get(id)`, `create(input)`, `put(value)`, `patch(id, patch)`, `delete(id)`; `Repositories` with `transaction(work)`; `createLocalRepositories(db)`.
- Produces: `WorkbenchDatabase` with versioned tables matching the design specification.

- [ ] **Step 1: Write failing repository contract tests**

```ts
test('stores independent records with generated audit fields', async () => {
  const repos = createTestRepositories();
  const saved = await repos.todos.create({
    title: '审核培养方案', description: '', role: 'dean', startAt: null,
    endAt: null, remindAt: null, priority: 'normal', status: 'open',
  });
  expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(saved.createdAt).toEqual(saved.updatedAt);
  expect(await repos.todos.get(saved.id)).toEqual(saved);
});

test('rolls back an atomic batch when one write fails', async () => {
  const repos = createTestRepositories();
  await expect(repos.transaction(async () => {
    await repos.teachers.create({ name: '张老师', department: '', archivedAt: null });
    throw new Error('stop');
  })).rejects.toThrow('stop');
  expect(await repos.teachers.list()).toEqual([]);
});
```

Run: `npm run test:run -- src/db/localRepositories.test.ts`
Expected: FAIL because database and repository factories are missing.

- [ ] **Step 2: Define discriminated unions and entity types**

```ts
export type Role = 'dean' | 'head' | 'personal';
export type TodoStatus = 'open' | 'done';
export type WeekRule =
  | { kind: 'every' }
  | { kind: 'odd' }
  | { kind: 'even' }
  | { kind: 'explicit'; weeks: number[] };

export interface BaseEntity { id: string; createdAt: string; updatedAt: string }
export interface Todo extends BaseEntity {
  title: string; description: string; role: Role; startAt: string | null;
  endAt: string | null; remindAt: string | null; priority: 'low' | 'normal' | 'high';
  status: TodoStatus; sourceType: 'idea' | null; sourceId: string | null;
}
export interface Semester extends BaseEntity {
  name: string; startDate: string; endDate: string; totalWeeks: number; isActive: boolean;
}
export interface Course extends BaseEntity {
  semesterId: string; name: string; location: string; teacher: string;
  weekday: number; startTime: string; endTime: string; startWeek: number;
  endWeek: number; weekRule: WeekRule; notes: string;
}
export interface Teacher extends BaseEntity {
  name: string; department: string; archivedAt: string | null;
}
export interface TeacherYearSummary extends BaseEntity {
  teacherId: string; year: string; state: 'empty' | 'reported';
}
export interface TeacherRecord extends BaseEntity {
  teacherId: string; year: string; type: 'work' | 'meeting' | 'material' | 'publicService';
  date: string; title: string; content: string;
  status: 'pending' | 'attended' | 'absent' | 'leave' | 'submitted' | 'completed'; notes: string;
}
export interface Mentorship extends BaseEntity {
  teacherId: string; academicYear: string; studentName: string; grade: string;
  major: string; topic: string; status: 'planned' | 'active' | 'completed' | 'paused'; notes: string;
}
export interface ResearchItem extends BaseEntity {
  title: string; authors: string; source: string; year: number | null; urlOrDoi: string;
  tags: string[]; status: 'unread' | 'reading' | 'read'; rating: number | null;
  abstract: string; notes: string; sourceType: 'idea' | null; sourceId: string | null;
}
export interface LearningMethod extends BaseEntity {
  name: string; scenario: string; steps: string; evaluation: string; tags: string[];
}
export interface Idea extends BaseEntity {
  content: string; tags: string[]; pinned: boolean; archivedAt: string | null;
}
export interface LessonPlan extends BaseEntity {
  courseId: string | null; chapter: string; objectives: string; outline: string;
  resources: string; activities: string; plannedDate: string | null;
  status: 'notStarted' | 'inProgress' | 'done'; sourceType: 'idea' | null; sourceId: string | null;
}
export interface Student extends BaseEntity {
  name: string; program: string; cohort: string; contact: string; notes: string; archivedAt: string | null;
}
export interface StudentRecord extends BaseEntity {
  studentId: string; date: string;
  category: 'task' | 'attendance' | 'research' | 'service' | 'other';
  rating: 'positive' | 'normal' | 'attention'; content: string; followUp: string; tags: string[];
}
export interface AppSetting { key: string; value: unknown; updatedAt: string }
```

```ts
export interface CrudRepository<T extends BaseEntity, TInput> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(input: TInput): Promise<T>;
  put(value: T): Promise<T>;
  patch(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

- [ ] **Step 3: Implement Dexie schema and repository adapters**

```ts
export class WorkbenchDatabase extends Dexie {
  todos!: Table<Todo, string>;
  semesters!: Table<Semester, string>;
  courses!: Table<Course, string>;
  teachers!: Table<Teacher, string>;
  teacherYearSummaries!: Table<TeacherYearSummary, string>;
  teacherRecords!: Table<TeacherRecord, string>;
  mentorships!: Table<Mentorship, string>;
  researchItems!: Table<ResearchItem, string>;
  learningMethods!: Table<LearningMethod, string>;
  ideas!: Table<Idea, string>;
  lessonPlans!: Table<LessonPlan, string>;
  students!: Table<Student, string>;
  studentRecords!: Table<StudentRecord, string>;
  settings!: Table<AppSetting, string>;

  constructor(name = 'personal-workbench') {
    super(name);
    this.version(1).stores({
      todos: 'id, role, status, startAt, updatedAt', semesters: 'id, isActive',
      courses: 'id, semesterId, weekday, updatedAt', teachers: 'id, name, archivedAt',
      teacherYearSummaries: 'id, &[teacherId+year], state, updatedAt',
      teacherRecords: 'id, [teacherId+year], type, date',
      mentorships: 'id, [teacherId+academicYear], grade, status',
      researchItems: 'id, status, year, updatedAt', learningMethods: 'id, updatedAt',
      ideas: 'id, pinned, archivedAt, updatedAt', lessonPlans: 'id, courseId, status',
      students: 'id, name, archivedAt', studentRecords: 'id, studentId, date, category',
      settings: 'key',
    });
  }
}
```

- [ ] **Step 4: Run repository tests and commit**

Run: `npm run test:run -- src/db/localRepositories.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/domain src/db src/test
git commit -m "feat: add local domain repositories"
```

## Task 3: Implement Scheduling, Conflict, and Teaching-Week Rules

**Files:**
- Create: `src/domain/scheduling.ts`, `src/domain/scheduling.test.ts`

**Interfaces:**
- Consumes: `Todo`, `Semester`, `Course`, `WeekRule`.
- Produces: `expandCourse(course, semester): CalendarOccurrence[]`.
- Produces: `findScheduleConflicts(candidate, todos, occurrences): ScheduleConflict[]`.

- [ ] **Step 1: Write failing recurrence and overlap tests**

```ts
test('expands odd teaching weeks when semester starts midweek', () => {
  const semester = semesterFixture({ startDate: '2026-09-03', endDate: '2026-10-31' });
  const course = courseFixture({ weekday: 1, startWeek: 1, endWeek: 5, weekRule: { kind: 'odd' } });
  expect(expandCourse(course, semester).map(x => x.start.slice(0, 10)))
    .toEqual(['2026-09-14', '2026-09-28']);
});

test('reports overlap with both a todo and a course occurrence', () => {
  const candidate = todoFixture({ startAt: '2026-09-07T09:20:00', endAt: '2026-09-07T10:00:00' });
  const result = findScheduleConflicts(candidate,
    [todoFixture({ id: 'todo-2', startAt: '2026-09-07T09:00:00', endAt: '2026-09-07T09:30:00' })],
    [{ id: 'course-1@2026-09-07', sourceId: 'course-1', kind: 'course', title: '统计学', start: '2026-09-07T09:45:00', end: '2026-09-07T11:15:00' }],
  );
  expect(result.map(x => x.kind)).toEqual(['todo', 'course']);
});
```

Run: `npm run test:run -- src/domain/scheduling.test.ts`
Expected: FAIL because scheduling functions are missing.

- [ ] **Step 2: Implement calendar-week expansion and interval overlap**

```ts
export function matchesWeek(rule: WeekRule, week: number): boolean {
  if (rule.kind === 'every') return true;
  if (rule.kind === 'odd') return week % 2 === 1;
  if (rule.kind === 'even') return week % 2 === 0;
  return rule.weeks.includes(week);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}
```

Compute teaching week 1 from the Monday of the week containing `semester.startDate`, discard generated dates before the actual start date or after the end date, and default a todo without `endAt` to 30 minutes.

- [ ] **Step 3: Verify and commit**

Run: `npm run test:run -- src/domain/scheduling.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/domain/scheduling.ts src/domain/scheduling.test.ts
git commit -m "feat: add teaching week scheduling rules"
```

## Task 4: Build Providers, Responsive Navigation, and Reusable UI

**Files:**
- Create: `src/app/providers.tsx`, `src/app/router.tsx`, `src/app/AppShell.tsx`, `src/app/navigation.ts`
- Create: `src/shared/ui/{Button,Dialog,Field,EmptyState,ConfirmDialog,RoleBadge,DataTable}.tsx`
- Create: `src/shared/ui/ui.test.tsx`, `src/app/AppShell.test.tsx`
- Modify: `src/app/App.tsx`, `src/styles.css`

**Interfaces:**
- Produces: `AppProviders`, route paths `/`, `/todos`, `/calendar`, `/courses`, `/teachers`, `/research`, `/ideas`, `/lessons`, `/students`, `/settings`.
- Produces: accessible `Dialog`, `ConfirmDialog`, `RoleBadge`, and responsive `DataTable` primitives.

- [ ] **Step 1: Write failing navigation and accessibility tests**

```tsx
test('moves secondary navigation into the mobile management drawer', async () => {
  renderAtRoute('/', { viewport: 'mobile' });
  expect(screen.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '管理' }));
  expect(screen.getByRole('link', { name: '系室管理' })).toBeVisible();
  expect(screen.getByRole('link', { name: '学生管理' })).toBeVisible();
});

test('role badge exposes text in addition to color', () => {
  render(<RoleBadge role="dean" />);
  expect(screen.getByText('院长助理')).toBeVisible();
});
```

Run: `npm run test:run -- src/app/AppShell.test.tsx src/shared/ui/ui.test.tsx`
Expected: FAIL because shell and primitives are missing.

- [ ] **Step 2: Implement providers and route shell**

```tsx
export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><BrowserRouter>{children}</BrowserRouter></QueryClientProvider>;
}

export const navigation = [
  { to: '/', label: '概览', group: '首页' },
  { to: '/todos', label: '待办管理', group: '日程' },
  { to: '/calendar', label: '日历', group: '日程' },
  { to: '/courses', label: '课表', group: '日程' },
  { to: '/teachers', label: '系室管理', group: '组织管理' },
  { to: '/students', label: '学生管理', group: '组织管理' },
  { to: '/research', label: '个人科研', group: '学习' },
  { to: '/ideas', label: '灵感记录', group: '学习' },
  { to: '/lessons', label: '教学备课', group: '学习' },
  { to: '/settings', label: '设置', group: '设置' },
] as const;
```

- [ ] **Step 3: Implement the selected efficiency layout and mobile breakpoints**

Use CSS grid for a `240px` desktop sidebar and content area, switch below `768px` to a fixed five-item bottom bar, and render `DataTable` rows as labeled cards below the same breakpoint. Dialogs must restore focus to their trigger on close.

```css
.app-shell { min-height: 100dvh; display: grid; grid-template-columns: 240px minmax(0, 1fr); }
.mobile-nav { display: none; }
@media (max-width: 767px) {
  .app-shell { display: block; padding-bottom: 72px; }
  .desktop-sidebar { display: none; }
  .mobile-nav { position: fixed; inset: auto 0 0; display: grid; grid-template-columns: repeat(5, 1fr); }
  .responsive-table thead { display: none; }
  .responsive-table tr { display: grid; gap: .5rem; margin: .75rem; padding: 1rem; border-radius: 14px; }
  .responsive-table td::before { content: attr(data-label); font-weight: 600; }
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/app src/shared/ui && npm run typecheck`
Expected: PASS.

```bash
git add src/app src/shared/ui src/styles.css
git commit -m "feat: add responsive workbench shell"
```

## Task 5: Deliver Todo CRUD, Filters, WeChat Parsing, and Reminder Catch-Up

**Files:**
- Create: `src/features/todos/{TodoPage,TodoForm,TodoList,TodoBoard,TodoFilters,WeChatImportDialog}.tsx`
- Create: `src/features/todos/todoQueries.ts`, `src/features/todos/wechatParser.ts`, `src/features/todos/reminders.ts`
- Create: `src/features/todos/{TodoPage,wechatParser,reminders}.test.tsx`

**Interfaces:**
- Consumes: `repositories.todos`, `findScheduleConflicts`, shared form/dialog primitives.
- Produces: `parseWeChatText(text, now): ParsedTodo[]`, `getDueReminders(todos, notifiedIds, now): Todo[]`.
- Produces: `/todos` page and reusable `TodoForm({ initial, defaultStartAt, onSaved })`.

- [ ] **Step 1: Write failing parser and reminder tests**

```ts
test('marks an unresolved date for confirmation', () => {
  const [item] = parseWeChatText('下次开会提交预算表 @院长助理', new Date('2026-08-10T08:00:00+08:00'));
  expect(item).toMatchObject({ title: '下次开会提交预算表', role: 'dean', needsDateConfirmation: true });
  expect(item.startAt).toBeNull();
});

test('returns overdue reminders that have not been notified', () => {
  const due = getDueReminders([
    todoFixture({ id: 'a', remindAt: '2026-08-10T09:00:00+08:00', status: 'open' }),
    todoFixture({ id: 'b', remindAt: '2026-08-10T09:00:00+08:00', status: 'done' }),
  ], new Set(), new Date('2026-08-10T09:05:00+08:00'));
  expect(due.map(x => x.id)).toEqual(['a']);
});
```

- [ ] **Step 2: Write failing page flow test**

```tsx
test('creates a dean todo and confirms a detected conflict', async () => {
  renderTodoPageWithFixtures({ todos: [todoFixture({ startAt: '2026-08-10T09:00:00', endAt: '2026-08-10T10:00:00' })] });
  await userEvent.click(screen.getByRole('button', { name: '新建待办' }));
  await fillTodoForm({ title: '审核预算', role: '院长助理', start: '2026-08-10T09:30', end: '2026-08-10T10:30' });
  await userEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByText(/与以下日程冲突/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '仍然保存' }));
  expect(await screen.findByText('审核预算')).toBeVisible();
});
```

Run: `npm run test:run -- src/features/todos`
Expected: FAIL because the feature is missing.

- [ ] **Step 3: Implement parsing, reminder service, query hooks, and todo views**

```ts
export function getDueReminders(todos: Todo[], notified: Set<string>, now: Date) {
  return todos.filter(todo => todo.status === 'open' && todo.remindAt !== null &&
    new Date(todo.remindAt) <= now && !notified.has(todo.id));
}
```

The import dialog must render every parsed line with a checkbox and editable date/role fields. Disable “导入选中” while any checked row still has `needsDateConfirmation`.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/features/todos && npm run typecheck`
Expected: PASS.

```bash
git add src/features/todos
git commit -m "feat: add todo workflows and local reminders"
```

## Task 6: Deliver Semester Courses and Text-Rich Calendar Views

**Files:**
- Create: `src/features/courses/{CoursePage,SemesterForm,CourseForm,CourseList}.tsx`
- Create: `src/features/courses/courseQueries.ts`, `src/features/courses/CoursePage.test.tsx`
- Create: `src/features/calendar/{CalendarPage,calendarEvents}.tsx`, `src/features/calendar/CalendarPage.test.tsx`
- Modify: `src/app/router.tsx`

**Interfaces:**
- Consumes: `expandCourse`, `findScheduleConflicts`, semester/course/todo repositories.
- Produces: `toCalendarEvents(todos, courses, semesters): EventInput[]` and routes `/courses`, `/calendar`.

- [ ] **Step 1: Write failing semester/course test**

```tsx
test('creates an odd-week course inside an active semester', async () => {
  renderCoursePage();
  await createSemester({ name: '2026 秋季', startDate: '2026-09-03', endDate: '2027-01-15', weeks: 20 });
  await createCourse({ name: '统计学', weekday: '星期一', weeks: '单周', startWeek: 1, endWeek: 17 });
  expect(await screen.findByText('统计学')).toBeVisible();
  expect(screen.getByText('第 1–17 周 · 单周')).toBeVisible();
});
```

- [ ] **Step 2: Write failing calendar test**

```tsx
test('renders todo and course titles directly in a month cell', async () => {
  renderCalendarPage({
    todos: [todoFixture({ title: '提交学院预算', startAt: '2026-09-07T08:30:00' })],
    courses: [courseFixture({ name: '统计学' })],
    semesters: [semesterFixture()],
  });
  expect(await screen.findByText('提交学院预算')).toBeVisible();
  expect(screen.getByText('统计学')).toBeVisible();
});
```

Run: `npm run test:run -- src/features/courses src/features/calendar`
Expected: FAIL.

- [ ] **Step 3: Implement course forms, recurrence labels, and FullCalendar composition**

```ts
export function toCalendarEvents(todos: Todo[], courses: Course[], semesters: Semester[]): EventInput[] {
  const todoEvents = todos.filter(x => x.startAt && x.status === 'open').map(x => ({
    id: x.id, title: x.title, start: x.startAt!, end: x.endAt ?? undefined,
    classNames: [`role-${x.role}`], extendedProps: { kind: 'todo', sourceId: x.id },
  }));
  const courseEvents = courses.flatMap(course => {
    const semester = semesters.find(x => x.id === course.semesterId);
    return semester ? expandCourse(course, semester).map(x => ({ ...x, classNames: ['course-event'] })) : [];
  });
  return [...todoEvents, ...courseEvents];
}
```

Enable `dayGridMonth`, `timeGridWeek`, and `timeGridDay`; set event display to include time and title; implement date-click creation and event-drop conflict confirmation.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/features/courses src/features/calendar && npm run typecheck`
Expected: PASS.

```bash
git add src/features/courses src/features/calendar src/app/router.tsx
git commit -m "feat: add semester courses and calendar"
```

## Task 7: Deliver Teacher Roster, Annual Records, Bulk Actions, and Mentorships

**Files:**
- Create: `src/domain/teacherOperations.ts`, `src/domain/teacherOperations.test.ts`
- Create: `src/features/teachers/{TeacherPage,TeacherRoster,TeacherDetail,TeacherRecordForm,BulkTeacherAction}.tsx`
- Create: `src/features/teachers/teacherQueries.ts`, `src/features/teachers/TeacherPage.test.tsx`
- Create: `src/features/mentorships/{MentorshipPanel,MentorshipForm,MentorshipSummary}.tsx`

**Interfaces:**
- Produces: `fillMissingTeacherSummaries(year, teachers, summaries, repos): Promise<TeacherYearSummary[]>`.
- Produces: `applyMeetingStatus(ids, meeting, status, repos)` and `addMaterialForTeachers(ids, material, repos)` as atomic operations.
- Produces: teacher and mentorship exports via Task 10 export helpers.

- [ ] **Step 1: Write failing idempotency and atomic batch tests**

```ts
test('persists one summary per teacher and year idempotently', async () => {
  const repos = createTestRepositories();
  await repos.teachers.create(teacherInput({ id: 'a' }));
  await repos.teachers.create(teacherInput({ id: 'b' }));
  await fillMissingTeacherSummaries('2026', await repos.teachers.list(), [], repos);
  await fillMissingTeacherSummaries('2026', await repos.teachers.list(), await repos.teacherYearSummaries.list(), repos);
  expect((await repos.teacherYearSummaries.list()).map(x => x.teacherId).sort()).toEqual(['a', 'b']);
});

test('adds one material record for every selected teacher in one transaction', async () => {
  const repos = createTestRepositories();
  await addMaterialForTeachers(['a', 'b'], { date: '2026-08-10', title: '课程大纲', status: 'submitted', notes: '' }, repos);
  expect((await repos.teacherRecords.list()).map(x => x.teacherId).sort()).toEqual(['a', 'b']);
});
```

- [ ] **Step 2: Write failing user-flow test**

```tsx
test('fills missing teachers then applies meeting attendance in bulk', async () => {
  renderTeacherPage({ teachers: [teacherFixture({ name: '张老师' }), teacherFixture({ name: '李老师' })] });
  await userEvent.click(screen.getByRole('button', { name: '一键补全未填报教师' }));
  expect(await screen.findByText('将补全 2 位教师')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '确认补全' }));
  await selectTeacherRows(['张老师', '李老师']);
  await userEvent.click(screen.getByRole('button', { name: '批量登记例会' }));
  await userEvent.click(screen.getByLabelText('参会'));
  await userEvent.click(screen.getByRole('button', { name: '保存 2 条记录' }));
  expect(await screen.findAllByText('参会')).toHaveLength(2);
});
```

Run: `npm run test:run -- src/domain/teacherOperations.test.ts src/features/teachers`
Expected: FAIL.

- [ ] **Step 3: Implement teacher tabs, selection mode, transactions, and mentorship panel**

Use record type values `work`, `meeting`, `material`, `publicService`. The mentorship form fields are student name, grade, major, topic, progress status, and notes; filters are academic year, teacher, grade, and status.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/domain/teacherOperations.test.ts src/features/teachers src/features/mentorships && npm run typecheck`
Expected: PASS.

```bash
git add src/domain/teacherOperations* src/features/teachers src/features/mentorships
git commit -m "feat: add department and mentorship management"
```

## Task 8: Deliver Research, Learning Methods, Ideas, and Lesson Planning

**Files:**
- Create: `src/features/research/{ResearchPage,ResearchForm,LearningMethodPanel}.tsx`
- Create: `src/features/ideas/{IdeaPage,IdeaForm,ideaConversions}.tsx`
- Create: `src/features/lessons/{LessonPage,LessonForm}.tsx`
- Create: `src/features/research/ResearchPage.test.tsx`, `src/features/ideas/IdeaPage.test.tsx`, `src/features/lessons/LessonPage.test.tsx`

**Interfaces:**
- Consumes: research, learning-method, idea, lesson-plan, todo, and course repositories.
- Produces: `convertIdea(idea, target, repos): Promise<BaseEntity>` where target is `todo | research | lesson`.

- [ ] **Step 1: Write failing persistence and conversion tests**

```tsx
test('creates a literature item and filters by reading status', async () => {
  renderResearchPage();
  await createResearchItem({ title: 'Designing Data-Intensive Applications', status: 'reading', rating: 5 });
  await userEvent.selectOptions(screen.getByLabelText('阅读状态'), 'reading');
  expect(await screen.findByText('Designing Data-Intensive Applications')).toBeVisible();
});

test('converts an idea to a todo without deleting the idea', async () => {
  const repos = createTestRepositories();
  const idea = await repos.ideas.create(ideaInput({ content: '整理教学评价方案' }));
  const todo = await convertIdea(idea, 'todo', repos);
  expect((await repos.ideas.get(idea.id))?.id).toBe(idea.id);
  expect(todo).toMatchObject({ title: '整理教学评价方案', sourceType: 'idea', sourceId: idea.id });
});
```

- [ ] **Step 2: Write failing lesson-plan relationship test**

```ts
test('keeps lesson text when its linked course is deleted', async () => {
  const repos = createTestRepositories();
  const course = await repos.courses.create(courseInput());
  const lesson = await repos.lessonPlans.create(lessonInput({ courseId: course.id, outline: '第一章提纲' }));
  await repos.courses.delete(course.id);
  expect(await repos.lessonPlans.get(lesson.id)).toMatchObject({ outline: '第一章提纲' });
});
```

Run: `npm run test:run -- src/features/research src/features/ideas src/features/lessons`
Expected: FAIL.

- [ ] **Step 3: Implement the three feature groups**

Research filters cover status, year, tags, and free text. Ideas support pinned and archived states. Lesson plans group by course and expose status `notStarted`, `inProgress`, `done`; a missing linked course renders as “原课程已删除” without deleting lesson content.

```ts
export async function convertIdea(idea: Idea, target: 'todo' | 'research' | 'lesson', repos: Repositories) {
  if (target === 'todo') return repos.todos.create(todoInput({ title: idea.content, sourceType: 'idea', sourceId: idea.id }));
  if (target === 'research') return repos.researchItems.create(researchInput({ title: idea.content, sourceType: 'idea', sourceId: idea.id }));
  return repos.lessonPlans.create(lessonInput({ outline: idea.content, sourceType: 'idea', sourceId: idea.id }));
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/features/research src/features/ideas src/features/lessons && npm run typecheck`
Expected: PASS.

```bash
git add src/features/research src/features/ideas src/features/lessons
git commit -m "feat: add research ideas and lesson planning"
```

## Task 9: Deliver Student Management and Safe Archive/Delete Behavior

**Files:**
- Create: `src/domain/studentOperations.ts`, `src/domain/studentOperations.test.ts`
- Create: `src/features/students/{StudentPage,StudentList,StudentDetail,StudentRecordForm,StudentSummary}.tsx`
- Create: `src/features/students/StudentPage.test.tsx`

**Interfaces:**
- Produces: `archiveStudent(id, repos)`, `deleteStudentWithRecords(id, repos)`, `summarizeStudentRecords(filters, records, students)`.

- [ ] **Step 1: Write failing archive and cascading-delete tests**

```ts
test('archives a student while retaining performance records', async () => {
  const repos = createTestRepositories();
  const student = await repos.students.create(studentInput({ name: '林同学' }));
  await repos.studentRecords.create(studentRecordInput({ studentId: student.id }));
  await archiveStudent(student.id, repos);
  expect((await repos.students.get(student.id))?.archivedAt).not.toBeNull();
  expect(await repos.studentRecords.list()).toHaveLength(1);
});

test('deletes a student and related records atomically after explicit choice', async () => {
  const repos = createTestRepositories();
  const student = await repos.students.create(studentInput());
  await repos.studentRecords.create(studentRecordInput({ studentId: student.id }));
  await deleteStudentWithRecords(student.id, repos);
  expect(await repos.students.get(student.id)).toBeUndefined();
  expect(await repos.studentRecords.list()).toEqual([]);
});
```

- [ ] **Step 2: Write failing student-detail flow test**

```tsx
test('adds an individual performance record and filters the summary', async () => {
  renderStudentPage({ students: [studentFixture({ name: '林同学' })] });
  await userEvent.click(screen.getByRole('link', { name: '林同学' }));
  await userEvent.click(screen.getByRole('button', { name: '添加日常记录' }));
  await fillStudentRecord({ category: '任务推进', rating: '积极', content: '按时完成数据清理' });
  await userEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByText('按时完成数据清理')).toBeVisible();
});
```

Run: `npm run test:run -- src/domain/studentOperations.test.ts src/features/students`
Expected: FAIL.

- [ ] **Step 3: Implement student master/detail, filters, and three-way delete dialog**

The delete dialog shows the associated record count and actions “取消”, “归档学生”, and “删除学生及记录”. Default keyboard focus must be “归档学生”.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/domain/studentOperations.test.ts src/features/students && npm run typecheck`
Expected: PASS.

```bash
git add src/domain/studentOperations* src/features/students
git commit -m "feat: add student performance management"
```

## Task 10: Add Real XLSX/CSV Exports and Versioned JSON Backup/Restore

**Files:**
- Create: `src/shared/export/{csv,xlsx}.ts`, `src/shared/export/export.test.ts`
- Create: `src/db/backup.ts`, `src/db/backup.test.ts`
- Create: `src/features/settings/{SettingsPage,BackupRestorePanel,InstallPanel}.tsx`
- Create: `src/features/settings/SettingsPage.test.tsx`

**Interfaces:**
- Produces: `makeCsv(columns, rows): Uint8Array`, `makeXlsx(sheetName, columns, rows): ArrayBuffer`.
- Produces: `exportBackup(repos): Promise<WorkbenchBackupV1>`, `validateBackup(value): WorkbenchBackupV1`, `restoreBackup(backup, repos): Promise<void>`.

- [ ] **Step 1: Write failing file-content tests**

```ts
test('adds a UTF-8 BOM and quotes Chinese CSV cells safely', () => {
  const bytes = makeCsv([{ key: 'name', label: '姓名' }, { key: 'note', label: '备注' }],
    [{ name: '张老师', note: '参会,正常' }]);
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(new TextDecoder().decode(bytes)).toContain('张老师,"参会,正常"');
});

test('creates a readable xlsx workbook', () => {
  const buffer = makeXlsx('教师汇总', [{ key: 'name', label: '教师姓名' }], [{ name: '张老师' }]);
  const workbook = XLSX.read(buffer);
  expect(XLSX.utils.sheet_to_json(workbook.Sheets['教师汇总'])).toEqual([{ 教师姓名: '张老师' }]);
});
```

- [ ] **Step 2: Write failing backup validation and rollback tests**

```ts
test('rejects a backup with an unsupported schema version', () => {
  expect(() => validateBackup({ schemaVersion: 99, exportedAt: '', tables: {} })).toThrow('不支持的备份版本');
});

test('restores all tables in a single transaction', async () => {
  const repos = createTestRepositories();
  const backup = backupFixture({ todos: [todoFixture({ title: '恢复后的待办' })] });
  await restoreBackup(backup, repos);
  expect(await repos.todos.list()).toEqual(expect.arrayContaining([expect.objectContaining({ title: '恢复后的待办' })]));
});
```

Run: `npm run test:run -- src/shared/export src/db/backup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement exporters and versioned codec**

```ts
export const backupSchema = z.object({
  schemaVersion: z.literal(1), exportedAt: z.string().datetime(),
  tables: z.object({
    todos: z.array(todoSchema), semesters: z.array(semesterSchema), courses: z.array(courseSchema),
    teachers: z.array(teacherSchema), teacherYearSummaries: z.array(teacherYearSummarySchema),
    teacherRecords: z.array(teacherRecordSchema),
    mentorships: z.array(mentorshipSchema), researchItems: z.array(researchItemSchema),
    learningMethods: z.array(learningMethodSchema), ideas: z.array(ideaSchema),
    lessonPlans: z.array(lessonPlanSchema), students: z.array(studentSchema),
    studentRecords: z.array(studentRecordSchema), settings: z.array(appSettingSchema),
  }),
});
```

Before restore, create and trigger download of a current backup, show table counts, require explicit confirmation, then replace all tables in one transaction.

- [ ] **Step 4: Wire exports into teacher, mentorship, and student summaries**

Use stable Chinese column labels and export exactly the currently filtered rows. Filenames include module and local date, for example `教师年度汇总-2026-20260810.xlsx`.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:run -- src/shared/export src/db/backup.test.ts src/features/settings && npm run typecheck`
Expected: PASS.

```bash
git add src/shared/export src/db/backup* src/features/settings src/features/teachers src/features/mentorships src/features/students
git commit -m "feat: add exports and validated backups"
```

## Task 11: Finish Dashboard, Quick Create, Theme, Install Prompt, and PWA Update UX

**Files:**
- Create: `src/features/dashboard/{DashboardPage,TodayTimeline,QuickCreate}.tsx`
- Create: `src/features/dashboard/dashboardQueries.ts`, `src/features/dashboard/DashboardPage.test.tsx`
- Create: `src/app/useInstallPrompt.ts`, `src/app/usePwaUpdate.ts`, `src/app/themeStore.ts`
- Modify: `src/features/settings/InstallPanel.tsx`, `src/app/AppShell.tsx`, `src/styles.css`, `README.md`

**Interfaces:**
- Produces: `buildDashboardSummary(now, todos, occurrences)`.
- Produces: `useInstallPrompt()` and `usePwaUpdate()` hooks.

- [ ] **Step 1: Write failing dashboard aggregation test**

```ts
test('separates today, overdue, course, and role counts', () => {
  const summary = buildDashboardSummary(new Date('2026-08-10T12:00:00+08:00'),
    [
      todoFixture({ role: 'dean', startAt: '2026-08-10T09:00:00+08:00' }),
      todoFixture({ role: 'head', startAt: '2026-08-09T09:00:00+08:00' }),
    ],
    [{ id: 'c', sourceId: 'c', kind: 'course', title: '统计学', start: '2026-08-10T14:00:00+08:00', end: '2026-08-10T15:00:00+08:00' }]);
  expect(summary).toMatchObject({ todayTodos: 1, overdueTodos: 1, todayCourses: 1, byRole: { dean: 1, head: 1, personal: 0 } });
});
```

- [ ] **Step 2: Write failing install/update UI test**

```tsx
test('shows install action only after beforeinstallprompt is available', async () => {
  render(<InstallPanel />);
  expect(screen.queryByRole('button', { name: '安装应用' })).not.toBeInTheDocument();
  dispatchInstallPromptEvent();
  expect(await screen.findByRole('button', { name: '安装应用' })).toBeVisible();
});
```

Run: `npm run test:run -- src/features/dashboard src/features/settings/SettingsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the selected overview layout and PWA lifecycle hooks**

Quick create options are “待办”, “灵感”, “教师记录”, and “学生记录”. PWA updates render a persistent banner with “稍后” and “立即更新”; updating must not occur while any registered form is dirty. Theme values are `light`, `dark`, and `system`.

```ts
export function buildDashboardSummary(now: Date, todos: Todo[], occurrences: CalendarOccurrence[]) {
  const day = now.toISOString().slice(0, 10);
  const open = todos.filter(x => x.status === 'open');
  return {
    todayTodos: open.filter(x => x.startAt?.slice(0, 10) === day).length,
    overdueTodos: open.filter(x => x.startAt !== null && new Date(x.startAt) < now && x.startAt.slice(0, 10) < day).length,
    todayCourses: occurrences.filter(x => x.kind === 'course' && x.start.slice(0, 10) === day).length,
    byRole: Object.fromEntries(['dean', 'head', 'personal'].map(role => [role, open.filter(x => x.role === role).length])),
  };
}
```

- [ ] **Step 4: Document local operation**

````markdown
## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址。生产预览使用 `npm run build && npm run preview`。Chrome/Edge 地址栏出现安装图标后可安装为独立应用；手机端使用浏览器“添加到主屏幕”。
````

- [ ] **Step 5: Verify and commit**

Run: `npm run test:run && npm run typecheck && npm run build`
Expected: PASS.

```bash
git add src/features/dashboard src/features/settings src/app src/styles.css README.md
git commit -m "feat: finish dashboard and install experience"
```

## Task 12: Add End-to-End Coverage and Final Offline Verification

**Files:**
- Create: `e2e/helpers.ts`, `e2e/todos-calendar.spec.ts`, `e2e/teachers.spec.ts`, `e2e/students-learning.spec.ts`, `e2e/pwa.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: complete application routes and user-visible Chinese labels.
- Produces: repeatable Chromium desktop and mobile-web test projects.

- [ ] **Step 1: Write end-to-end tests for todo/calendar and courses**

```ts
test('todo and odd-week course appear as text and conflict on overlap', async ({ page }) => {
  await page.goto('/');
  await createSemesterAndOddWeekCourse(page);
  await createTodo(page, { title: '提交预算', role: '院长助理', start: '2026-09-07T09:30' });
  await expect(page.getByText('与以下日程冲突')).toBeVisible();
  await page.getByRole('button', { name: '仍然保存' }).click();
  await page.getByRole('link', { name: '日历' }).click();
  await expect(page.getByText('提交预算')).toBeVisible();
  await expect(page.getByText('统计学')).toBeVisible();
});
```

- [ ] **Step 2: Write end-to-end tests for department and mentorship workflows**

```ts
test('fills teachers, records attendance, and exports mentorship summary', async ({ page }) => {
  await seedTeacherRoster(page, ['张老师', '李老师']);
  await page.getByRole('button', { name: '一键补全未填报教师' }).click();
  await page.getByRole('button', { name: '确认补全' }).click();
  await bulkRecordAttendance(page, ['张老师', '李老师'], '参会');
  await addMentorship(page, { teacher: '张老师', student: '王同学', grade: '大三' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/科研导师汇总.*\.xlsx$/);
});
```

- [ ] **Step 3: Write mobile, persistence, and offline tests**

```ts
test('keeps data after reload and exposes mobile navigation', async ({ page, context }) => {
  await createIdea(page, '课程思政案例');
  await page.reload();
  await expect(page.getByText('课程思政案例')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '个人工作学习工作台' })).toBeVisible();
});
```

- [ ] **Step 4: Run the full quality gate**

Run: `npm run test:run && npm run typecheck && npm run build && npm run test:e2e`
Expected: unit/component tests pass, TypeScript reports no errors, Vite builds, and all Chromium desktop/mobile Playwright tests pass.

- [ ] **Step 5: Inspect the production build manually**

Run: `npm run dev -- --host 127.0.0.1`
Expected checks: all navigation links work; month cells show full labels; table-to-card breakpoint is usable; install guidance is present; notification denial falls back to the in-app center; no browser console errors occur during one CRUD flow in each module.

- [ ] **Step 6: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: cover core workbench journeys"
```

## Final Verification Checklist

- [ ] `npm run test:run` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` exits 0 and emits the web manifest plus service worker.
- [ ] `npm run test:e2e` passes desktop and mobile projects.
- [ ] `git status --short` contains no unintended files.
- [ ] Compare every completion criterion in `docs/superpowers/specs/2026-08-10-personal-workbench-design.md` against a passing automated test or documented manual check.
