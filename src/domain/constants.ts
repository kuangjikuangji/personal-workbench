import type { Role, TodoStatus } from './entities';

export const roles: readonly Role[] = ['dean', 'head', 'personal'];
export const todoStatuses: readonly TodoStatus[] = ['open', 'done'];
export const todoPriorities = ['low', 'normal', 'high'] as const;
export const teacherYearSummaryStates = ['empty', 'reported'] as const;
