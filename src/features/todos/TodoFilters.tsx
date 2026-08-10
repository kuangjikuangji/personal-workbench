import type { Role, TodoStatus } from '../../domain/entities';

export type TodoFilterValues = {
  search: string;
  role: Role | 'all';
  status: TodoStatus | 'all';
  priority: 'low' | 'normal' | 'high' | 'all';
  date: string;
};

type TodoFiltersProps = {
  value: TodoFilterValues;
  onChange: (value: TodoFilterValues) => void;
};

export const emptyTodoFilters: TodoFilterValues = {
  search: '',
  role: 'all',
  status: 'all',
  priority: 'all',
  date: '',
};

export function TodoFilters({ value, onChange }: TodoFiltersProps) {
  const update = <K extends keyof TodoFilterValues>(key: K, next: TodoFilterValues[K]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <section aria-label="待办筛选" className="todo-filters">
      <label className="field">
        <span className="field-label">搜索待办</span>
        <input type="search" value={value.search} onChange={(event) => update('search', event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">角色筛选</span>
        <select value={value.role} onChange={(event) => update('role', event.target.value as TodoFilterValues['role'])}>
          <option value="all">全部角色</option><option value="dean">院长助理</option><option value="head">系主任</option><option value="personal">个人</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">状态筛选</span>
        <select value={value.status} onChange={(event) => update('status', event.target.value as TodoFilterValues['status'])}>
          <option value="all">全部状态</option><option value="open">未完成</option><option value="done">已完成</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">优先级筛选</span>
        <select value={value.priority} onChange={(event) => update('priority', event.target.value as TodoFilterValues['priority'])}>
          <option value="all">全部优先级</option><option value="high">高</option><option value="normal">普通</option><option value="low">低</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">日期筛选</span>
        <input type="date" value={value.date} onChange={(event) => update('date', event.target.value)} />
      </label>
    </section>
  );
}
