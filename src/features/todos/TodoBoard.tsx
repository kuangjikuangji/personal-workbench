import type { Todo } from '../../domain/entities';
import { RoleBadge } from '../../shared/ui/RoleBadge';
import { TodoActionButtons } from './TodoList';

type TodoBoardProps = {
  todos: Todo[];
  onDelete: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onToggle: (todo: Todo) => void;
};

export function TodoBoard({ todos, ...actions }: TodoBoardProps) {
  return (
    <div className="todo-board">
      <BoardColumn heading="未完成" status="open" todos={todos} {...actions} />
      <BoardColumn heading="已完成" status="done" todos={todos} {...actions} />
    </div>
  );
}

function BoardColumn({ heading, status, todos, ...actions }: TodoBoardProps & { heading: string; status: Todo['status'] }) {
  const rows = todos.filter((todo) => todo.status === status);
  return (
    <section className="todo-board-column">
      <h3>{heading}</h3>
      {rows.length === 0 && <p className="board-empty">暂无项目</p>}
      {rows.map((todo) => (
        <article className="todo-card" key={todo.id}>
          <h4>{todo.title}</h4>
          <RoleBadge role={todo.role} />
          {todo.startAt && <p>{todo.startAt.replace('T', ' ').slice(0, 16)}</p>}
          <TodoActionButtons todo={todo} {...actions} />
        </article>
      ))}
    </section>
  );
}
