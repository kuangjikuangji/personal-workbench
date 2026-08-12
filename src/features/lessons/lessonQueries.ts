import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { LessonPlanInput } from '../../db/repositories';
import type { LessonPlan } from '../../domain/entities';

export const lessonQueryKeys = { plans: ['lesson-plans'] as const, courses: ['courses'] as const };
function useInvalidateLessons() { const client = useQueryClient(); return () => Promise.all([client.invalidateQueries({ queryKey: lessonQueryKeys.plans }), client.invalidateQueries({ queryKey: lessonQueryKeys.courses })]); }
export function useLessonPlans() { const repositories = useRepositories(); return useQuery({ queryKey: lessonQueryKeys.plans, queryFn: () => repositories.lessonPlans.list() }); }
export function useLessonCourses() { const repositories = useRepositories(); return useQuery({ queryKey: lessonQueryKeys.courses, queryFn: () => repositories.courses.list() }); }
export function useCreateLessonPlan() { const repositories = useRepositories(); const invalidate = useInvalidateLessons(); return useMutation({ mutationFn: (input: LessonPlanInput) => repositories.lessonPlans.create(input), onSuccess: invalidate }); }
export function useUpdateLessonPlan() { const repositories = useRepositories(); const invalidate = useInvalidateLessons(); return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<LessonPlan, 'id' | 'createdAt'>> }) => repositories.lessonPlans.patch(id, patch), onSuccess: invalidate }); }
export function useDeleteLessonPlan() { const repositories = useRepositories(); const invalidate = useInvalidateLessons(); return useMutation({ mutationFn: (id: string) => repositories.lessonPlans.delete(id), onSuccess: invalidate }); }
