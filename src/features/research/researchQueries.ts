import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { EntityInput, ResearchItemInput } from '../../db/repositories';
import type { LearningMethod, ResearchItem } from '../../domain/entities';

export const researchQueryKeys = { items: ['research-items'] as const, methods: ['learning-methods'] as const };

function useInvalidateResearch() {
  const client = useQueryClient();
  return () => Promise.all([client.invalidateQueries({ queryKey: researchQueryKeys.items }), client.invalidateQueries({ queryKey: researchQueryKeys.methods })]);
}

export function useResearchItems() { const repositories = useRepositories(); return useQuery({ queryKey: researchQueryKeys.items, queryFn: () => repositories.researchItems.list() }); }
export function useLearningMethods() { const repositories = useRepositories(); return useQuery({ queryKey: researchQueryKeys.methods, queryFn: () => repositories.learningMethods.list() }); }
export function useCreateResearch() { const repositories = useRepositories(); const invalidate = useInvalidateResearch(); return useMutation({ mutationFn: (input: ResearchItemInput) => repositories.researchItems.create(input), onSuccess: invalidate }); }
export function useUpdateResearch() { const repositories = useRepositories(); const invalidate = useInvalidateResearch(); return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<ResearchItem, 'id' | 'createdAt'>> }) => repositories.researchItems.patch(id, patch), onSuccess: invalidate }); }
export function useDeleteResearch() { const repositories = useRepositories(); const invalidate = useInvalidateResearch(); return useMutation({ mutationFn: (id: string) => repositories.researchItems.delete(id), onSuccess: invalidate }); }
export function useCreateLearningMethod() { const repositories = useRepositories(); const invalidate = useInvalidateResearch(); return useMutation({ mutationFn: (input: EntityInput<LearningMethod>) => repositories.learningMethods.create(input), onSuccess: invalidate }); }
export function useUpdateLearningMethod() { const repositories = useRepositories(); const invalidate = useInvalidateResearch(); return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<LearningMethod, 'id' | 'createdAt'>> }) => repositories.learningMethods.patch(id, patch), onSuccess: invalidate }); }
export function useDeleteLearningMethod() { const repositories = useRepositories(); const invalidate = useInvalidateResearch(); return useMutation({ mutationFn: (id: string) => repositories.learningMethods.delete(id), onSuccess: invalidate }); }
