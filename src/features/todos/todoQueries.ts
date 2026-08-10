import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import type { TodoInput } from '../../db/repositories';
import type { Repositories } from '../../db/repositories';
import { expandCourse } from '../../domain/scheduling';
import type { Todo } from '../../domain/entities';

export const todoQueryKeys = {
  all: ['todos'] as const,
  schedule: ['todos', 'schedule-context'] as const,
};

export function useTodos() {
  const repositories = useRepositories();
  return useQuery({ queryKey: todoQueryKeys.all, queryFn: () => repositories.todos.list() });
}

export function useTodoSchedule() {
  const repositories = useRepositories();
  return useQuery({
    queryKey: todoQueryKeys.schedule,
    queryFn: async () => {
      const [semesters, courses] = await Promise.all([
        repositories.semesters.list(),
        repositories.courses.list(),
      ]);
      const activeSemesters = new Map(semesters.filter((semester) => semester.isActive).map((semester) => [semester.id, semester]));
      return courses.flatMap((course) => {
        const semester = activeSemesters.get(course.semesterId);
        return semester ? expandCourse(course, semester) : [];
      });
    },
  });
}

export async function readTodoConflictSnapshot(repositories: Repositories) {
  return repositories.transaction(async () => {
    const [todos, semesters, courses] = await Promise.all([
      repositories.todos.list(),
      repositories.semesters.list(),
      repositories.courses.list(),
    ]);
    const activeSemesters = new Map(
      semesters.filter((semester) => semester.isActive).map((semester) => [semester.id, semester]),
    );
    const occurrences = courses.flatMap((course) => {
      const semester = activeSemesters.get(course.semesterId);
      return semester ? expandCourse(course, semester) : [];
    });
    return { todos, occurrences };
  });
}

export function useCreateTodo() {
  const repositories = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TodoInput) => repositories.todos.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: todoQueryKeys.all }),
  });
}

export function useUpdateTodo() {
  const repositories = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Todo, 'id' | 'createdAt'>> }) => repositories.todos.patch(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: todoQueryKeys.all }),
  });
}

export function useDeleteTodo() {
  const repositories = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repositories.todos.delete(id),
    onSuccess: () => client.invalidateQueries({ queryKey: todoQueryKeys.all }),
  });
}
