import Dexie, { type Table } from 'dexie';
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
import type { SyncMetadata, SyncOperation } from '../sync/types';

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
  syncOperations!: Table<SyncOperation, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor(name = 'personal-workbench') {
    super(name);

    this.version(1).stores({
      todos: 'id, role, status, startAt, updatedAt',
      semesters: 'id, isActive',
      courses: 'id, semesterId, weekday, updatedAt',
      teachers: 'id, name, archivedAt',
      teacherYearSummaries: 'id, &[teacherId+year], state, updatedAt',
      teacherRecords: 'id, [teacherId+year], type, date',
      mentorships: 'id, [teacherId+academicYear], grade, status',
      researchItems: 'id, status, year, updatedAt',
      learningMethods: 'id, updatedAt',
      ideas: 'id, pinned, archivedAt, updatedAt',
      lessonPlans: 'id, courseId, status',
      students: 'id, name, archivedAt',
      studentRecords: 'id, studentId, date, category',
      settings: 'key',
    });

    this.version(2).stores({
      syncOperations: 'id, userId, [userId+entityKind+entityId], createdAt',
      syncMetadata: 'key',
    });
  }
}
