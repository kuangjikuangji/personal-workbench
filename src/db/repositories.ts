import type {
  AppSetting,
  BaseEntity,
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

export type EntityInput<T extends BaseEntity> = Omit<T, keyof BaseEntity>;

export type TodoInput = Omit<Todo, keyof BaseEntity | 'sourceType' | 'sourceId'>
  & Partial<Pick<Todo, 'sourceType' | 'sourceId'>>;
export type ResearchItemInput = Omit<ResearchItem, keyof BaseEntity | 'sourceType' | 'sourceId'>
  & Partial<Pick<ResearchItem, 'sourceType' | 'sourceId'>>;
export type LessonPlanInput = Omit<LessonPlan, keyof BaseEntity | 'sourceType' | 'sourceId'>
  & Partial<Pick<LessonPlan, 'sourceType' | 'sourceId'>>;
export type AppSettingInput = Omit<AppSetting, 'updatedAt'>;

export interface CrudRepository<T extends BaseEntity, TInput> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(input: TInput): Promise<T>;
  put(value: T): Promise<T>;
  patch(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface SettingsRepository {
  list(): Promise<AppSetting[]>;
  get(key: string): Promise<AppSetting | undefined>;
  put(input: AppSettingInput): Promise<AppSetting>;
  delete(key: string): Promise<void>;
}

export interface Repositories {
  todos: CrudRepository<Todo, TodoInput>;
  semesters: CrudRepository<Semester, EntityInput<Semester>>;
  courses: CrudRepository<Course, EntityInput<Course>>;
  teachers: CrudRepository<Teacher, EntityInput<Teacher>>;
  teacherYearSummaries: CrudRepository<TeacherYearSummary, EntityInput<TeacherYearSummary>>;
  teacherRecords: CrudRepository<TeacherRecord, EntityInput<TeacherRecord>>;
  mentorships: CrudRepository<Mentorship, EntityInput<Mentorship>>;
  researchItems: CrudRepository<ResearchItem, ResearchItemInput>;
  learningMethods: CrudRepository<LearningMethod, EntityInput<LearningMethod>>;
  ideas: CrudRepository<Idea, EntityInput<Idea>>;
  lessonPlans: CrudRepository<LessonPlan, LessonPlanInput>;
  students: CrudRepository<Student, EntityInput<Student>>;
  studentRecords: CrudRepository<StudentRecord, EntityInput<StudentRecord>>;
  settings: SettingsRepository;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
