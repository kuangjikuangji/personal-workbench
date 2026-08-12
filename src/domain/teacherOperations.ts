import type { EntityInput, Repositories } from '../db/repositories';
import type { Mentorship, Teacher, TeacherRecord, TeacherYearSummary } from './entities';

export type MeetingStatus = Extract<TeacherRecord['status'], 'attended' | 'absent' | 'leave'>;

export type MeetingBatchInput = Pick<TeacherRecord, 'date' | 'title' | 'notes'> & {
  content?: string;
};

export type MaterialBatchInput = Pick<TeacherRecord, 'date' | 'title' | 'notes'> & {
  content?: string;
  status: Extract<TeacherRecord['status'], 'pending' | 'submitted'>;
};

export type MentorshipFilters = {
  academicYear?: string;
  teacherId?: string;
  grade?: string;
  status?: Mentorship['status'] | '';
};

function selectedIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

async function markReported(teacherIds: string[], year: string, repositories: Repositories) {
  const summaries = await repositories.teacherYearSummaries.list();
  const byTeacher = new Map(summaries.filter((summary) => summary.year === year).map((summary) => [summary.teacherId, summary]));

  for (const teacherId of teacherIds) {
    const summary = byTeacher.get(teacherId);
    if (!summary) {
      await repositories.teacherYearSummaries.create({ teacherId, year, state: 'reported' });
    } else if (summary.state !== 'reported') {
      await repositories.teacherYearSummaries.patch(summary.id, { state: 'reported' });
    }
  }
}

async function requireActiveTeachers(teacherIds: string[], repositories: Repositories) {
  const teachers = new Map((await repositories.teachers.list()).map((teacher) => [teacher.id, teacher]));
  for (const teacherId of teacherIds) {
    const teacher = teachers.get(teacherId);
    if (!teacher) throw new Error(`Teacher not found: ${teacherId}`);
    if (teacher.archivedAt !== null) throw new Error(`Teacher is not active: ${teacherId}`);
  }
}

export async function fillMissingTeacherSummaries(
  year: string,
  teachers: Teacher[],
  summaries: TeacherYearSummary[],
  repositories: Repositories,
): Promise<TeacherYearSummary[]> {
  return repositories.transaction(async () => {
    const stored = await repositories.teacherYearSummaries.list();
    const existing = new Set([...summaries, ...stored].filter((summary) => summary.year === year).map((summary) => summary.teacherId));
    const created: TeacherYearSummary[] = [];

    for (const teacher of teachers) {
      if (teacher.archivedAt || existing.has(teacher.id)) continue;
      created.push(await repositories.teacherYearSummaries.create({ teacherId: teacher.id, year, state: 'empty' }));
      existing.add(teacher.id);
    }

    return created;
  });
}

export async function addTeacherRecord(input: EntityInput<TeacherRecord>, repositories: Repositories) {
  return repositories.transaction(async () => {
    await requireActiveTeachers([input.teacherId], repositories);
    const record = await repositories.teacherRecords.create(input);
    await markReported([input.teacherId], input.year, repositories);
    return record;
  });
}

async function addRecords(
  ids: string[],
  input: MeetingBatchInput | MaterialBatchInput,
  type: Extract<TeacherRecord['type'], 'meeting' | 'material'>,
  status: TeacherRecord['status'],
  repositories: Repositories,
): Promise<TeacherRecord[]> {
  const teacherIds = selectedIds(ids);
  const year = input.date.slice(0, 4);
  return repositories.transaction(async () => {
    await requireActiveTeachers(teacherIds, repositories);
    const records = await Promise.all(teacherIds.map((teacherId) => repositories.teacherRecords.create({
      teacherId,
      year,
      type,
      date: input.date,
      title: input.title,
      content: input.content ?? '',
      status,
      notes: input.notes,
    })));
    await markReported(teacherIds, year, repositories);
    return records;
  });
}

export function applyMeetingStatus(ids: string[], meeting: MeetingBatchInput, status: MeetingStatus, repositories: Repositories) {
  return addRecords(ids, meeting, 'meeting', status, repositories);
}

export function addMaterialForTeachers(ids: string[], material: MaterialBatchInput, repositories: Repositories) {
  return addRecords(ids, material, 'material', material.status, repositories);
}

export function filterMentorships(mentorships: Mentorship[], filters: MentorshipFilters) {
  return mentorships.filter((mentorship) => (
    (!filters.academicYear || mentorship.academicYear === filters.academicYear)
    && (!filters.teacherId || mentorship.teacherId === filters.teacherId)
    && (!filters.grade || mentorship.grade === filters.grade)
    && (!filters.status || mentorship.status === filters.status)
  ));
}
