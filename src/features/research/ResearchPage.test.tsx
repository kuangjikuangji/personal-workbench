import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { RepositoryProvider } from '../../app/providers';
import { createTestRepositories } from '../../test/database';
import { ResearchPage } from './ResearchPage';

function renderResearchPage(repositories = createTestRepositories()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<RepositoryProvider repositories={repositories}><QueryClientProvider client={client}><MemoryRouter><ResearchPage /></MemoryRouter></QueryClientProvider></RepositoryProvider>);
  return repositories;
}

describe('ResearchPage', () => {
  test('filters literature by status, year, tag, and free text', async () => {
    const repositories = createTestRepositories();
    await repositories.researchItems.create({ title: '设计数据密集型应用', authors: 'Martin Kleppmann', source: 'O\'Reilly', year: 2017, urlOrDoi: '', tags: ['架构', '系统'], status: 'reading', rating: 5, abstract: '分布式系统', notes: '' });
    await repositories.researchItems.create({ title: '教学设计导论', authors: '', source: '', year: 2020, urlOrDoi: '', tags: ['教学'], status: 'read', rating: null, abstract: '', notes: '' });
    renderResearchPage(repositories);
    const user = userEvent.setup();

    await screen.findByText('设计数据密集型应用');
    await user.selectOptions(screen.getByLabelText('阅读状态'), 'reading');
    await user.selectOptions(screen.getByLabelText('年份'), '2017');
    await user.selectOptions(screen.getByLabelText('标签'), '架构');
    await user.type(screen.getByLabelText('搜索文献'), '分布式');

    expect(screen.getByText('设计数据密集型应用')).toBeVisible();
    expect(screen.queryByText('教学设计导论')).not.toBeInTheDocument();
  });

  test('finds literature by URL or DOI', async () => {
    const repositories = createTestRepositories();
    await repositories.researchItems.create({ title: '不可见关键词标题', authors: '', source: '', year: 2026, urlOrDoi: 'https://doi.org/10.1234/unique-doi', tags: [], status: 'unread', rating: null, abstract: '', notes: '' });
    renderResearchPage(repositories);
    const user = userEvent.setup();
    await screen.findByText('不可见关键词标题');
    await user.type(screen.getByLabelText('搜索文献'), 'unique-doi');
    expect(screen.getByText('不可见关键词标题')).toBeVisible();
  });

  test('creates and deletes a learning method independently', async () => {
    renderResearchPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '新建学习方法' }));
    const dialog = screen.getByRole('dialog', { name: '新建学习方法' });
    await user.type(within(dialog).getByLabelText('名称'), '费曼学习法');
    await user.type(within(dialog).getByLabelText('适用场景'), '理解复杂概念');
    await user.type(within(dialog).getByLabelText('步骤'), '讲给别人听');
    await user.type(within(dialog).getByLabelText('效果评价'), '发现知识盲区');
    await user.type(within(dialog).getByLabelText('标签'), '理解,复盘');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(await screen.findByText('费曼学习法')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '删除费曼学习法' }));
    await user.click(within(screen.getByRole('dialog', { name: '删除学习方法' })).getByRole('button', { name: '删除' }));
    expect(await screen.findByText('暂无学习方法')).toBeVisible();
  });
});
