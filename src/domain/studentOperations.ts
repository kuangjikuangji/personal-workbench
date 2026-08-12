import type { Repositories } from '../db/repositories';
import type { Student, StudentRecord } from './entities';

export const studentRecordCategoryLabels: Record<StudentRecord['category'], string> = {
  task: '任务推进',
  attendance: '出勤表现',
  research: '科研学习',
  service: '班级服务',
  other: '其他',
};

export const studentRecordRatingLabels: Record<StudentRecord['rating'], string> = {
  positive: '积极',
  normal: '一般',
  attention: '需关注',
};

export type StudentRecordFilters = {
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: StudentRecord['category'];
  rating?: StudentRecord['rating'];
};

export type StudentRecordSummaryRow = StudentRecord & {
  studentName: string;
  categoryLabel: string;
  ratingLabel: string;
};

export async function archiveStudent(id: string, repositories: Repositories) {
  return repositories.students.patch(id, { archivedAt: new Date().toISOString() });
}

export async function deleteStudentWithRecords(id: string, repositories: Repositories) {
  return repositories.transaction(async () => {
    const records = await repositories.studentRecords.list();
    for (const record of records.filter((item) => item.studentId === id)) {
      await repositories.studentRecords.delete(record.id);
    }
    await repositories.students.delete(id);
  });
}

export function summarizeStudentRecords(
  filters: StudentRecordFilters,
  records: StudentRecord[],
  students: Student[],
): StudentRecordSummaryRow[] {
  const studentNames = new Map(students.map((student) => [student.id, student.name]));
  return records
    .filter((record) => (
      (!filters.studentId || record.studentId === filters.studentId)
      && (!filters.dateFrom || record.date >= filters.dateFrom)
      && (!filters.dateTo || record.date <= filters.dateTo)
      && (!filters.category || record.category === filters.category)
      && (!filters.rating || record.rating === filters.rating)
    ))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map((record) => ({
      ...record,
      studentName: studentNames.get(record.studentId) ?? '未知学生',
      categoryLabel: studentRecordCategoryLabels[record.category],
      ratingLabel: studentRecordRatingLabels[record.rating],
    }));
}
