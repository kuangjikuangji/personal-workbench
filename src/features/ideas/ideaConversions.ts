import type { Repositories } from '../../db/repositories';
import type { BaseEntity, Idea } from '../../domain/entities';

export type IdeaConversionTarget = 'todo' | 'research' | 'lesson';

export function convertIdea(idea: Idea, target: IdeaConversionTarget, repositories: Repositories): Promise<BaseEntity> {
  return repositories.transaction(async () => {
    if (target === 'todo') return repositories.todos.create({ title: idea.content, description: '', role: 'personal', startAt: null, endAt: null, remindAt: null, priority: 'normal', status: 'open', sourceType: 'idea', sourceId: idea.id });
    if (target === 'research') return repositories.researchItems.create({ title: idea.content, authors: '', source: '', year: null, urlOrDoi: '', tags: idea.tags, status: 'unread', rating: null, abstract: '', notes: '', sourceType: 'idea', sourceId: idea.id });
    return repositories.lessonPlans.create({ courseId: null, chapter: '', objectives: '', outline: idea.content, resources: '', activities: '', plannedDate: null, status: 'notStarted', sourceType: 'idea', sourceId: idea.id });
  });
}
