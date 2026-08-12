import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { EntityInput } from '../../db/repositories';
import type { Idea } from '../../domain/entities';
import { convertIdea, type IdeaConversionTarget } from './ideaConversions';

export const ideaQueryKeys = { all: ['ideas'] as const };
export function useIdeas() { const repositories = useRepositories(); return useQuery({ queryKey: ideaQueryKeys.all, queryFn: () => repositories.ideas.list() }); }
function useInvalidateIdeas() { const client = useQueryClient(); return () => client.invalidateQueries({ queryKey: ideaQueryKeys.all }); }
export function useCreateIdea() { const repositories = useRepositories(); const invalidate = useInvalidateIdeas(); return useMutation({ mutationFn: (input: EntityInput<Idea>) => repositories.ideas.create(input), onSuccess: invalidate }); }
export function useUpdateIdea() { const repositories = useRepositories(); const invalidate = useInvalidateIdeas(); return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Idea, 'id' | 'createdAt'>> }) => repositories.ideas.patch(id, patch), onSuccess: invalidate }); }
export function useConvertIdea() { const repositories = useRepositories(); const client = useQueryClient(); return useMutation({ mutationFn: ({ idea, target }: { idea: Idea; target: IdeaConversionTarget }) => convertIdea(idea, target, repositories), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ideaQueryKeys.all }), client.invalidateQueries({ queryKey: ['todos'] }), client.invalidateQueries({ queryKey: ['research-items'] }), client.invalidateQueries({ queryKey: ['lesson-plans'] })]) }); }
