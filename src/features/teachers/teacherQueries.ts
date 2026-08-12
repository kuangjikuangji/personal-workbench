import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { EntityInput } from '../../db/repositories';
import type { Mentorship, Teacher, TeacherRecord } from '../../domain/entities';
import { addMaterialForTeachers, addTeacherRecord, applyMeetingStatus, fillMissingTeacherSummaries, type MaterialBatchInput, type MeetingBatchInput, type MeetingStatus } from '../../domain/teacherOperations';

export const teacherQueryKeys = {
  teachers: ['teachers'] as const,
  summaries: ['teacher-year-summaries'] as const,
  records: ['teacher-records'] as const,
  mentorships: ['mentorships'] as const,
};

export function useTeachers() { const repositories = useRepositories(); return useQuery({ queryKey: teacherQueryKeys.teachers, queryFn: () => repositories.teachers.list() }); }
export function useTeacherSummaries() { const repositories = useRepositories(); return useQuery({ queryKey: teacherQueryKeys.summaries, queryFn: () => repositories.teacherYearSummaries.list() }); }
export function useTeacherRecords() { const repositories = useRepositories(); return useQuery({ queryKey: teacherQueryKeys.records, queryFn: () => repositories.teacherRecords.list() }); }
export function useMentorships() { const repositories = useRepositories(); return useQuery({ queryKey: teacherQueryKeys.mentorships, queryFn: () => repositories.mentorships.list() }); }

function useInvalidateTeacherData() {
  const client = useQueryClient();
  return () => Promise.all(Object.values(teacherQueryKeys).map((queryKey) => client.invalidateQueries({ queryKey })));
}

export function useCreateTeacher() { const repositories = useRepositories(); const invalidate = useInvalidateTeacherData(); return useMutation({ mutationFn: (input: EntityInput<Teacher>) => repositories.teachers.create(input), onSuccess: invalidate }); }
export function useUpdateTeacher() { const repositories = useRepositories(); const invalidate = useInvalidateTeacherData(); return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Teacher, 'id' | 'createdAt'>> }) => repositories.teachers.patch(id, patch), onSuccess: invalidate }); }
export function useCreateRecord() { const repositories = useRepositories(); const invalidate = useInvalidateTeacherData(); return useMutation({ mutationFn: (input: EntityInput<TeacherRecord>) => addTeacherRecord(input, repositories), onSuccess: invalidate }); }
export function useFillSummaries() { const repositories = useRepositories(); const invalidate = useInvalidateTeacherData(); return useMutation({ mutationFn: ({ year, teachers, summaries }: { year: string; teachers: Teacher[]; summaries: Awaited<ReturnType<typeof repositories.teacherYearSummaries.list>> }) => fillMissingTeacherSummaries(year, teachers, summaries, repositories), onSuccess: invalidate }); }
export function useApplyMeeting() { const repositories = useRepositories(); const client = useQueryClient(); const invalidate = useInvalidateTeacherData(); return useMutation({ mutationFn: ({ ids, meeting, status }: { ids: string[]; meeting: MeetingBatchInput; status: MeetingStatus }) => applyMeetingStatus(ids, meeting, status, repositories), onSuccess: async (records) => { client.setQueryData<TeacherRecord[]>(teacherQueryKeys.records, (current = []) => [...current, ...records]); await invalidate(); } }); }
export function useAddMaterials() { const repositories = useRepositories(); const client = useQueryClient(); const invalidate = useInvalidateTeacherData(); return useMutation({ mutationFn: ({ ids, material }: { ids: string[]; material: MaterialBatchInput }) => addMaterialForTeachers(ids, material, repositories), onSuccess: async (records) => { client.setQueryData<TeacherRecord[]>(teacherQueryKeys.records, (current = []) => [...current, ...records]); await invalidate(); } }); }
export function useCreateMentorship() { const repositories = useRepositories(); const invalidate = useInvalidateTeacherData(); return useMutation({ mutationFn: (input: EntityInput<Mentorship>) => repositories.mentorships.create(input), onSuccess: invalidate }); }
