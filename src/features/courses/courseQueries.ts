import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { EntityInput } from '../../db/repositories';
import type { Course, Semester } from '../../domain/entities';

export const courseQueryKeys = {
  semesters: ['semesters'] as const,
  courses: ['courses'] as const,
};

export function useSemesters() {
  const repositories = useRepositories();
  return useQuery({ queryKey: courseQueryKeys.semesters, queryFn: () => repositories.semesters.list() });
}

export function useCourses() {
  const repositories = useRepositories();
  return useQuery({ queryKey: courseQueryKeys.courses, queryFn: () => repositories.courses.list() });
}

function useInvalidateCourseData() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: courseQueryKeys.semesters }),
      client.invalidateQueries({ queryKey: courseQueryKeys.courses }),
      client.invalidateQueries({ queryKey: ['todos', 'schedule-context'] }),
      client.invalidateQueries({ queryKey: ['calendar'] }),
    ]);
  };
}

export function useCreateSemester() {
  const repositories = useRepositories();
  const invalidate = useInvalidateCourseData();
  return useMutation({
    mutationFn: (input: EntityInput<Semester>) => repositories.transaction(async () => {
      if (input.isActive) {
        const semesters = await repositories.semesters.list();
        await Promise.all(semesters.filter((semester) => semester.isActive).map((semester) => (
          repositories.semesters.patch(semester.id, { isActive: false })
        )));
      }
      return repositories.semesters.create(input);
    }),
    onSuccess: invalidate,
  });
}

export function useUpdateSemester() {
  const repositories = useRepositories();
  const invalidate = useInvalidateCourseData();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Semester, 'id' | 'createdAt'>> }) => (
      repositories.transaction(async () => {
        if (patch.isActive) {
          const semesters = await repositories.semesters.list();
          await Promise.all(semesters.filter((semester) => semester.id !== id && semester.isActive).map((semester) => (
            repositories.semesters.patch(semester.id, { isActive: false })
          )));
        }
        return repositories.semesters.patch(id, patch);
      })
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteSemester() {
  const repositories = useRepositories();
  const invalidate = useInvalidateCourseData();
  return useMutation({
    mutationFn: (id: string) => repositories.transaction(async () => {
      const courses = await repositories.courses.list();
      await Promise.all(courses.filter((course) => course.semesterId === id).map((course) => repositories.courses.delete(course.id)));
      await repositories.semesters.delete(id);
    }),
    onSuccess: invalidate,
  });
}

export function useCreateCourse() {
  const repositories = useRepositories();
  const invalidate = useInvalidateCourseData();
  return useMutation({ mutationFn: (input: EntityInput<Course>) => repositories.courses.create(input), onSuccess: invalidate });
}

export function useUpdateCourse() {
  const repositories = useRepositories();
  const invalidate = useInvalidateCourseData();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Course, 'id' | 'createdAt'>> }) => repositories.courses.patch(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteCourse() {
  const repositories = useRepositories();
  const invalidate = useInvalidateCourseData();
  return useMutation({ mutationFn: (id: string) => repositories.courses.delete(id), onSuccess: invalidate });
}
