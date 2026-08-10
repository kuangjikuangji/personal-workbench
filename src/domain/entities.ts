export type Role = 'dean' | 'head' | 'personal';
export type TodoStatus = 'open' | 'done';

export type WeekRule =
  | { kind: 'every' }
  | { kind: 'odd' }
  | { kind: 'even' }
  | { kind: 'explicit'; weeks: number[] };

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Todo extends BaseEntity {
  title: string;
  description: string;
  role: Role;
  startAt: string | null;
  endAt: string | null;
  remindAt: string | null;
  priority: 'low' | 'normal' | 'high';
  status: TodoStatus;
  sourceType: 'idea' | null;
  sourceId: string | null;
}

export interface Semester extends BaseEntity {
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  isActive: boolean;
}

export interface Course extends BaseEntity {
  semesterId: string;
  name: string;
  location: string;
  teacher: string;
  weekday: number;
  startTime: string;
  endTime: string;
  startWeek: number;
  endWeek: number;
  weekRule: WeekRule;
  notes: string;
}

export interface Teacher extends BaseEntity {
  name: string;
  department: string;
  archivedAt: string | null;
}

export interface TeacherYearSummary extends BaseEntity {
  teacherId: string;
  year: string;
  state: 'empty' | 'reported';
}

export interface TeacherRecord extends BaseEntity {
  teacherId: string;
  year: string;
  type: 'work' | 'meeting' | 'material' | 'publicService';
  date: string;
  title: string;
  content: string;
  status: 'pending' | 'attended' | 'absent' | 'leave' | 'submitted' | 'completed';
  notes: string;
}

export interface Mentorship extends BaseEntity {
  teacherId: string;
  academicYear: string;
  studentName: string;
  grade: string;
  major: string;
  topic: string;
  status: 'planned' | 'active' | 'completed' | 'paused';
  notes: string;
}

export interface ResearchItem extends BaseEntity {
  title: string;
  authors: string;
  source: string;
  year: number | null;
  urlOrDoi: string;
  tags: string[];
  status: 'unread' | 'reading' | 'read';
  rating: number | null;
  abstract: string;
  notes: string;
  sourceType: 'idea' | null;
  sourceId: string | null;
}

export interface LearningMethod extends BaseEntity {
  name: string;
  scenario: string;
  steps: string;
  evaluation: string;
  tags: string[];
}

export interface Idea extends BaseEntity {
  content: string;
  tags: string[];
  pinned: boolean;
  archivedAt: string | null;
}

export interface LessonPlan extends BaseEntity {
  courseId: string | null;
  chapter: string;
  objectives: string;
  outline: string;
  resources: string;
  activities: string;
  plannedDate: string | null;
  status: 'notStarted' | 'inProgress' | 'done';
  sourceType: 'idea' | null;
  sourceId: string | null;
}

export interface Student extends BaseEntity {
  name: string;
  program: string;
  cohort: string;
  contact: string;
  notes: string;
  archivedAt: string | null;
}

export interface StudentRecord extends BaseEntity {
  studentId: string;
  date: string;
  category: 'task' | 'attendance' | 'research' | 'service' | 'other';
  rating: 'positive' | 'normal' | 'attention';
  content: string;
  followUp: string;
  tags: string[];
}

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}
