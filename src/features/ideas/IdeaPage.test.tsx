import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import { createTestRepositories } from '../../test/database';
import { convertIdea } from './ideaConversions';
import { IdeaPage } from './IdeaPage';

function renderIdeaPage(repositories = createTestRepositories()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><IdeaPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);
  return repositories;
}

describe('IdeaPage', () => {
  test('captures an idea, pins it, and archives it', async () => {
    const repositories = renderIdeaPage();
    const user = userEvent.setup();
    await screen.findByText('暂无进行中的灵感');
    await user.type(screen.getByLabelText('灵感内容'), '整理教学评价方案');
    await user.type(screen.getByLabelText('标签'), '教学,评价');
    await user.click(screen.getByRole('button', { name: '记录灵感' }));
    expect(await screen.findByRole('heading', { name: '整理教学评价方案' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '置顶整理教学评价方案' }));
    expect((await repositories.ideas.list())[0]).toMatchObject({ pinned: true });
    await user.click(screen.getByRole('button', { name: '归档整理教学评价方案' }));
    expect((await repositories.ideas.list())[0].archivedAt).not.toBeNull();
    expect(await screen.findByText('暂无进行中的灵感')).toBeVisible();
  });

  test('converts an idea to a todo without deleting the idea', async () => {
    const repositories = createTestRepositories();
    const idea = await repositories.ideas.create({ content: '整理教学评价方案', tags: [], pinned: false, archivedAt: null });
    const todo = await convertIdea(idea, 'todo', repositories);
    expect((await repositories.ideas.get(idea.id))?.id).toBe(idea.id);
    expect(todo).toMatchObject({ title: '整理教学评价方案', sourceType: 'idea', sourceId: idea.id });
  });

  test('uses one repository transaction when converting through the page', async () => {
    const repositories = createTestRepositories();
    const idea = await repositories.ideas.create({ content: '写一份备课提纲', tags: [], pinned: false, archivedAt: null });
    renderIdeaPage(repositories);
    const user = userEvent.setup();
    await screen.findByText('写一份备课提纲');
    await user.click(screen.getByRole('button', { name: '转为待办写一份备课提纲' }));
    expect((await repositories.todos.list())[0]).toMatchObject({ title: '写一份备课提纲', sourceId: idea.id });
  });
});
