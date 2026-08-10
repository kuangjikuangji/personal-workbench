import type { Todo } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { DataTable } from '../../shared/ui/DataTable';
import { RoleBadge } from '../../shared/ui/RoleBadge';

type TodoActions = {
  onDelete: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onToggle: (todo: Todo) => void;
};

export function TodoList({ todos, ...actions }: { todos: Todo[] } & TodoActions) {
  return (
    <DataTable
      caption="待办列表"
      columns={[
        { key: 'title', label: '标题', render: (todo) => <strong>{todo.title}</strong> },
        { key: 'role', label: '角色', render: (todo) => <RoleBadge role={todo.role} /> },
        { key: 'startAt', label: '开始时间', render: (todo) => formatDateTime(todo.startAt) },
        { key: 'priority', label: '优先级', render: (todo) => priorityLabel(todo.priority) },
        { key: 'status', label: '状态', render: (todo) => todo.status === 'done' ? '已完成' : '未完成' },
        { key: 'id', label: '操作', render: (todo) => <TodoActionButtons todo={todo} {...actions} /> },
      ]}
      rows={todos}
    />
  );
}

export function TodoActionButtons({ todo, onDelete, onEdit, onToggle }: { todo: Todo } & TodoActions) {
  return (
    <div className="todo-actions">
      <Button aria-label={`${todo.status === 'done' ? '恢复' : '完成'}${todo.title}`} variant="ghost" onClick={() => onToggle(todo)}>{todo.status === 'done' ? '恢复' : '完成'}</Button>
      <Button aria-label={`编辑${todo.title}`} variant="ghost" onClick={() => onEdit(todo)}>编辑</Button>
      <Button aria-label={`删除${todo.title}`} variant="ghost" onClick={() => onDelete(todo)}>删除</Button>
    </div>
  );
}

function priorityLabel(priority: Todo['priority']) {
  return { high: '高', normal: '普通', low: '低' }[priority];
}

function formatDateTime(value: string | null): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '未安排';
}
