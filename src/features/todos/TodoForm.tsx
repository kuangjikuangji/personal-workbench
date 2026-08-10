import { type FormEvent, useState } from 'react';
import { useRepositories } from '../../app/providers';
import type { TodoInput } from '../../db/repositories';
import type { Role, Todo } from '../../domain/entities';
import { findScheduleConflicts, type ScheduleConflict } from '../../domain/scheduling';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Field } from '../../shared/ui/Field';
import { readTodoConflictSnapshot, useCreateTodo, useUpdateTodo } from './todoQueries';

type TodoFormProps = {
  initial?: Todo;
  defaultStartAt?: string;
  onSaved: (todo: Todo) => void;
};

type FormValues = Omit<TodoInput, 'sourceType' | 'sourceId'>;

export function TodoForm({ initial, defaultStartAt = '', onSaved }: TodoFormProps) {
  const [values, setValues] = useState<FormValues>(() => ({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    role: initial?.role ?? 'personal',
    startAt: initial?.startAt ?? (defaultStartAt || null),
    endAt: initial?.endAt ?? null,
    remindAt: initial?.remindAt ?? null,
    priority: initial?.priority ?? 'normal',
    status: initial?.status ?? 'open',
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [pendingInput, setPendingInput] = useState<TodoInput | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const repositories = useRepositories();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const saving = checkingConflicts || createTodo.isPending || updateTodo.isPending;

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationErrors: string[] = [];
    if (!values.title.trim()) validationErrors.push('请填写标题');
    if (values.startAt && values.endAt && new Date(values.endAt) <= new Date(values.startAt)) {
      validationErrors.push('结束时间必须晚于开始时间');
    }
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const input: TodoInput = {
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      sourceType: initial?.sourceType ?? null,
      sourceId: initial?.sourceId ?? null,
    };
    const now = new Date().toISOString();
    const candidate: Todo = {
      ...input,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      id: initial?.id ?? '__new_todo__',
      createdAt: initial?.createdAt ?? now,
      updatedAt: initial?.updatedAt ?? now,
    };
    setCheckingConflicts(true);
    let snapshot: Awaited<ReturnType<typeof readTodoConflictSnapshot>>;
    try {
      snapshot = await readTodoConflictSnapshot(repositories);
    } catch {
      setErrors(['读取日程失败，未保存待办']);
      setCheckingConflicts(false);
      return;
    }
    setCheckingConflicts(false);
    const detected = findScheduleConflicts(
      candidate,
      snapshot.todos.filter((todo) => todo.status === 'open'),
      snapshot.occurrences,
    );
    if (detected.length > 0) {
      setPendingInput(input);
      setConflicts(detected);
      return;
    }
    await save(input);
  };

  const save = async (input: TodoInput) => {
    try {
      const saved = initial
        ? await updateTodo.mutateAsync({ id: initial.id, patch: input })
        : await createTodo.mutateAsync(input);
      setErrors([]);
      setPendingInput(null);
      setConflicts([]);
      onSaved(saved);
    } catch {
      setErrors(['保存失败，请重试']);
    }
  };

  return (
    <>
      <form className="todo-form" onSubmit={submit}>
        <Field label="标题" required value={values.title} onChange={(event) => update('title', event.target.value)} />
        <label className="field">
          <span className="field-label">说明</span>
          <textarea value={values.description} onChange={(event) => update('description', event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">归属角色</span>
          <select value={values.role} onChange={(event) => update('role', event.target.value as Role)}>
            <option value="dean">院长助理</option>
            <option value="head">系主任</option>
            <option value="personal">个人</option>
          </select>
        </label>
        <div className="todo-form-grid">
          <Field label="开始时间" type="datetime-local" value={values.startAt ?? ''} onChange={(event) => update('startAt', event.target.value || null)} />
          <Field label="结束时间" type="datetime-local" value={values.endAt ?? ''} onChange={(event) => update('endAt', event.target.value || null)} />
          <Field label="提醒时间" type="datetime-local" value={values.remindAt ?? ''} onChange={(event) => update('remindAt', event.target.value || null)} />
          <label className="field">
            <span className="field-label">优先级</span>
            <select value={values.priority} onChange={(event) => update('priority', event.target.value as FormValues['priority'])}>
              <option value="low">低</option>
              <option value="normal">普通</option>
              <option value="high">高</option>
            </select>
          </label>
        </div>
        {errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
        <div className="dialog-actions"><Button disabled={saving} type="submit">保存</Button></div>
      </form>
      <ConfirmDialog
        cancelLabel="取消"
        confirmLabel="仍然保存"
        onClose={() => { setConflicts([]); setPendingInput(null); }}
        onConfirm={() => { if (pendingInput) void save(pendingInput); }}
        open={conflicts.length > 0}
        title="时间冲突"
      >
        <p>与以下日程冲突，是否仍然保存？</p>
        <ul className="conflict-list">
          {conflicts.map((conflict) => (
            <li key={`${conflict.kind}-${conflict.id}`}>
              <strong>{conflict.title}</strong>
              <span>{formatDateTime(conflict.start)} – {formatDateTime(conflict.end)}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}

function formatDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}
