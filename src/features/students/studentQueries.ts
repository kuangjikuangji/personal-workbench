import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { EntityInput } from '../../db/repositories';
import type { Student, StudentRecord } from '../../domain/entities';
import { archiveStudent, deleteStudentWithRecords } from '../../domain/studentOperations';

export const studentQueryKeys = { students: ['students'] as const, records: ['student-records'] as const };
function useInvalidateStudents() { const client = useQueryClient(); return () => Promise.all(Object.values(studentQueryKeys).map((queryKey) => client.invalidateQueries({ queryKey }))); }
export function useStudents() { const repositories = useRepositories(); return useQuery({ queryKey: studentQueryKeys.students, queryFn: () => repositories.students.list() }); }
export function useStudentRecords() { const repositories = useRepositories(); return useQuery({ queryKey: studentQueryKeys.records, queryFn: () => repositories.studentRecords.list() }); }
export function useCreateStudent() { const repositories = useRepositories(); const invalidate = useInvalidateStudents(); return useMutation({ mutationFn: (input: EntityInput<Student>) => repositories.students.create(input), onSuccess: invalidate }); }
export function useUpdateStudent() { const repositories = useRepositories(); const invalidate = useInvalidateStudents(); return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Student, 'id' | 'createdAt'>> }) => repositories.students.patch(id, patch), onSuccess: invalidate }); }
export function useCreateStudentRecord() { const repositories = useRepositories(); const invalidate = useInvalidateStudents(); return useMutation({ mutationFn: (input: EntityInput<StudentRecord>) => repositories.studentRecords.create(input), onSuccess: invalidate }); }
export function useArchiveStudent() { const repositories = useRepositories(); const invalidate = useInvalidateStudents(); return useMutation({ mutationFn: (id: string) => archiveStudent(id, repositories), onSuccess: invalidate }); }
export function useDeleteStudentWithRecords() { const repositories = useRepositories(); const invalidate = useInvalidateStudents(); return useMutation({ mutationFn: (id: string) => deleteStudentWithRecords(id, repositories), onSuccess: invalidate }); }
