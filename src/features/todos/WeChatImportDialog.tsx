import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRepositories } from '../../app/providers';
import type { Role } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { todoQueryKeys } from './todoQueries';
import { parseWeChatText, type ParsedTodo } from './wechatParser';

type PreviewRow = { checked: boolean; item: ParsedTodo };

export function WeChatImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const repositories = useRepositories();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
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
      await repositories.transaction(async () => {
        for (const { item } of checkedRows) {
          const { needsDateConfirmation: _confirmation, originalText: _original, ...input } = item;
          await repositories.todos.create(input);
        }
      });
      await client.invalidateQueries({ queryKey: todoQueryKeys.all });
      setText('');
      setRows([]);
      onClose();
    } catch {
      setError('导入失败，未写入任何待办');
    } finally {
      setImporting(false);
    }
  };

  return (
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
  );
}
