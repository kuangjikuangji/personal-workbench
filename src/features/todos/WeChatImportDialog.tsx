import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useRepositories } from '../../app/providers';
import type { Role } from '../../domain/entities';
import type { Todo } from '../../domain/entities';
import { findScheduleConflicts, type ScheduleConflict } from '../../domain/scheduling';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Dialog } from '../../shared/ui/Dialog';
import { readTodoConflictSnapshot, todoQueryKeys } from './todoQueries';
import { parseWeChatText, type ParsedTodo } from './wechatParser';

type PreviewRow = { checked: boolean; item: ParsedTodo };
type ImportConflict = { candidateTitle: string; conflict: ScheduleConflict };

export function WeChatImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const repositories = useRepositories();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [pendingItems, setPendingItems] = useState<ParsedTodo[]>([]);
  const commitInFlight = useRef(false);
  const checkedRows = rows.filter((row) => row.checked);
  const hasUnconfirmed = checkedRows.some((row) => row.item.needsDateConfirmation);

  const parse = () => {
    setRows(parseWeChatText(text, new Date()).map((item) => ({ checked: true, item })));
    setError('');
  };

  const updateItem = (index: number, patch: Partial<ParsedTodo>) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, item: { ...row.item, ...patch } }
      : row));
  };

  const importSelected = async () => {
    if (checkedRows.length === 0 || hasUnconfirmed) return;
    setImporting(true);
    setError('');
    try {
      const snapshot = await readTodoConflictSnapshot(repositories);
      const items = checkedRows.map((row) => row.item);
      const detected = findImportConflicts(items, snapshot.todos, snapshot.occurrences);
      if (detected.length > 0) {
        setPendingItems(items);
        setConflicts(detected);
        return;
      }
      await commitSelected(items);
    } catch {
      setError('读取日程或导入失败，未写入任何待办');
    } finally {
      setImporting(false);
    }
  };

  const commitSelected = async (items: ParsedTodo[]) => {
    if (commitInFlight.current) return;
    commitInFlight.current = true;
    setImporting(true);
    setError('');
    try {
      await repositories.transaction(async () => {
        for (const item of items) await repositories.todos.create(toTodoInput(item));
      });
      await client.invalidateQueries({ queryKey: todoQueryKeys.all });
      setText('');
      setRows([]);
      setPendingItems([]);
      setConflicts([]);
      onClose();
    } catch {
      setError('导入失败，未写入任何待办');
    } finally {
      commitInFlight.current = false;
      setImporting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onClose={onClose} title="微信文本导入">
      <label className="field" htmlFor="wechat-import-text">
        <span className="field-label">微信对话文本</span>
        <textarea aria-label="微信对话文本" id="wechat-import-text" rows={5} value={text} onChange={(event) => setText(event.target.value)} />
        <span className="field-hint">每行一条待办；可使用 @院长助理、@系主任 或 @个人。</span>
      </label>
      <div className="dialog-actions"><Button disabled={!text.trim()} variant="secondary" onClick={parse}>解析预览</Button></div>
      {rows.length > 0 && (
        <div className="wechat-preview" aria-label="导入预览">
          {rows.map((row, index) => (
            <article className="wechat-preview-row" key={`${row.item.originalText}-${index}`}>
              <label className="preview-check">
                <input
                  aria-label={`选择${row.item.title}`}
                  checked={row.checked}
                  type="checkbox"
                  onChange={(event) => setRows((current) => current.map((candidate, rowIndex) => rowIndex === index ? { ...candidate, checked: event.target.checked } : candidate))}
                />
                <strong>{row.item.title}</strong>
              </label>
              <label className="field">
                <span className="field-label">第 {index + 1} 行角色</span>
                <select value={row.item.role} onChange={(event) => updateItem(index, { role: event.target.value as Role })}>
                  <option value="dean">院长助理</option><option value="head">系主任</option><option value="personal">个人</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">第 {index + 1} 行开始时间</span>
                <input
                  type="datetime-local"
                  value={row.item.startAt ?? ''}
                  onChange={(event) => updateItem(index, {
                    startAt: event.target.value || null,
                    needsDateConfirmation: !event.target.value,
                  })}
                />
              </label>
              <label className="field">
                <span className="field-label">第 {index + 1} 行结束时间</span>
                <input type="datetime-local" value={row.item.endAt ?? ''} onChange={(event) => updateItem(index, { endAt: event.target.value || null })} />
              </label>
              {row.item.needsDateConfirmation && <p className="confirmation-needed">请确认日期</p>}
            </article>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button disabled={checkedRows.length === 0 || hasUnconfirmed || importing} onClick={() => void importSelected()}>导入选中</Button>
      </div>
    </Dialog>
    <ConfirmDialog
      cancelLabel="取消"
      confirmLabel="仍然导入"
      confirmDisabled={importing}
      onClose={() => { setConflicts([]); setPendingItems([]); }}
      onConfirm={() => { void commitSelected(pendingItems); }}
      open={conflicts.length > 0}
      title="导入时间冲突"
    >
      <p>选中待办与以下日程冲突，是否仍然导入？</p>
      <ul className="conflict-list">
        {conflicts.map(({ candidateTitle, conflict }, index) => (
          <li key={`${candidateTitle}-${conflict.kind}-${conflict.id}-${index}`}>
            <strong>{conflict.title}</strong>
            <span>与“{candidateTitle}”冲突：{formatDateTime(conflict.start)} – {formatDateTime(conflict.end)}</span>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
    </>
  );
}

function findImportConflicts(
  items: ParsedTodo[],
  todos: Todo[],
  occurrences: Parameters<typeof findScheduleConflicts>[2],
): ImportConflict[] {
  const existingOpen = todos.filter((todo) => todo.status === 'open');
  const priorCandidates: Todo[] = [];
  const conflicts: ImportConflict[] = [];
  const timestamp = new Date().toISOString();

  items.forEach((item, index) => {
    const input = toTodoInput(item);
    const candidate: Todo = {
      ...input,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      id: `__wechat_import_${index}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const detected = findScheduleConflicts(candidate, [...existingOpen, ...priorCandidates], occurrences);
    conflicts.push(...detected.map((conflict) => ({ candidateTitle: candidate.title, conflict })));
    priorCandidates.push(candidate);
  });

  return conflicts;
}

function toTodoInput(item: ParsedTodo) {
  const { needsDateConfirmation: _confirmation, originalText: _original, ...input } = item;
  return input;
}

function formatDateTime(value: string) {
  return value.replace('T', ' ').slice(0, 16);
}
