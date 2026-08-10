import { useMemo, useState } from 'react';
import type { Todo } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Dialog } from '../../shared/ui/Dialog';
import { EmptyState } from '../../shared/ui/EmptyState';
import { TodoBoard } from './TodoBoard';
import { TodoFilters, emptyTodoFilters, type TodoFilterValues } from './TodoFilters';
import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useDeleteTodo, useTodos, useUpdateTodo } from './todoQueries';
import { WeChatImportDialog } from './WeChatImportDialog';

export function TodoPage() {
  const todosQuery = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [filters, setFilters] = useState<TodoFilterValues>(emptyTodoFilters);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [editing, setEditing] = useState<Todo | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [wechatOpen, setWechatOpen] = useState(false);
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const todos = useMemo(() => filterTodos(todosQuery.data ?? [], filters), [filters, todosQuery.data]);
  const actions = {
    onEdit: (todo: Todo) => { setEditing(todo); setFormOpen(true); },
    onDelete: setDeleting,
    onToggle: (todo: Todo) => updateTodo.mutate({ id: todo.id, patch: { status: todo.status === 'done' ? 'open' : 'done' } }),
  };

  const closeForm = () => { setFormOpen(false); setEditing(null); };

  return (
    <section className="todo-page" aria-labelledby="todo-page-title">
      <header className="page-header">
        <div><h2 id="todo-page-title">待办管理</h2><p>管理三类角色待办、时间冲突与提醒。</p></div>
        <div className="page-actions">
          <Button variant="secondary" onClick={() => setWechatOpen(true)}>微信文本导入</Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>新建待办</Button>
        </div>
      </header>
      <TodoFilters value={filters} onChange={setFilters} />
      <div className="view-switch" role="group" aria-label="待办视图">
        <Button aria-pressed={view === 'list'} variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}>列表视图</Button>
        <Button aria-pressed={view === 'board'} variant={view === 'board' ? 'primary' : 'secondary'} onClick={() => setView('board')}>看板视图</Button>
      </div>
      {todosQuery.isPending && <p role="status">正在加载待办……</p>}
      {todosQuery.isError && <p role="alert">待办加载失败，请刷新后重试。</p>}
      {updateTodo.isError && <p role="alert">待办状态更新失败，请重试。</p>}
      {!todosQuery.isPending && !todosQuery.isError && todos.length === 0 && (
        <EmptyState
          description={todosQuery.data?.length ? '请调整筛选条件。' : '创建第一条待办，或从微信对话文本导入。'}
          title={todosQuery.data?.length ? '没有匹配结果' : '暂无待办'}
        />
      )}
      {todos.length > 0 && (view === 'list' ? <TodoList todos={todos} {...actions} /> : <TodoBoard todos={todos} {...actions} />)}
      <Dialog open={formOpen} onClose={closeForm} title={editing ? '编辑待办' : '新建待办'}>
        <TodoForm key={editing?.id ?? 'new'} initial={editing ?? undefined} onSaved={closeForm} />
      </Dialog>
      <WeChatImportDialog open={wechatOpen} onClose={() => setWechatOpen(false)} />
      <ConfirmDialog
        confirmLabel="删除"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteTodo.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        open={deleting !== null}
        title="删除待办"
      >
        <p>确定删除“{deleting?.title}”吗？此操作无法撤销。</p>
        {deleteTodo.isError && <p role="alert">删除失败，请重试。</p>}
      </ConfirmDialog>
    </section>
  );
}

function filterTodos(todos: Todo[], filters: TodoFilterValues): Todo[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return todos
    .filter((todo) => !search || `${todo.title} ${todo.description}`.toLocaleLowerCase().includes(search))
    .filter((todo) => filters.role === 'all' || todo.role === filters.role)
    .filter((todo) => filters.status === 'all' || todo.status === filters.status)
    .filter((todo) => filters.priority === 'all' || todo.priority === filters.priority)
    .filter((todo) => !filters.date || todo.startAt?.slice(0, 10) === filters.date)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return (a.startAt ?? '9999').localeCompare(b.startAt ?? '9999');
    });
}
