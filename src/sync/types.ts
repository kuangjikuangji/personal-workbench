import type {
  AppSetting,
  Course,
  Idea,
  LearningMethod,
  LessonPlan,
  Mentorship,
  ResearchItem,
  Semester,
  Student,
  StudentRecord,
  Teacher,
  TeacherRecord,
  TeacherYearSummary,
  Todo,
} from '../domain/entities';

export interface EntityValueByKind {
  todos: Todo;
  semesters: Semester;
  courses: Course;
  teachers: Teacher;
  teacher_year_summaries: TeacherYearSummary;
  teacher_records: TeacherRecord;
  mentorships: Mentorship;
  research_items: ResearchItem;
  learning_methods: LearningMethod;
  ideas: Idea;
  lesson_plans: LessonPlan;
  students: Student;
  student_records: StudentRecord;
  app_settings: AppSetting;
}

export type EntityKind = keyof EntityValueByKind;
export type SyncOperationType = 'upsert' | 'delete';

export interface SyncOperation {
  id: string;
  userId: string;
  entityKind: EntityKind;
  entityId: string;
  type: SyncOperationType;
  localCreate: boolean;
  record: Record<string, unknown> | null;
  clientUpdatedAt: string;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}

export interface SyncMetadata {
  key: string;
  value: unknown;
  updatedAt: string;
}
