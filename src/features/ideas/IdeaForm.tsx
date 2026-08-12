import { type FormEvent, useState } from 'react';
import { useDirtyForm } from '../../app/usePwaUpdate';
import type { Idea } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Field } from '../../shared/ui/Field';
import { useCreateIdea, useUpdateIdea } from './ideaQueries';

const parseTags = (value: string) => [...new Set(value.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean))];
export function IdeaForm({ initial, onSaved, compact = false }: { initial?: Idea; onSaved: () => void; compact?: boolean }) {
  const [content, setContent] = useState(initial?.content ?? ''); const [tagText, setTagText] = useState(initial?.tags.join(', ') ?? ''); const [pinned, setPinned] = useState(initial?.pinned ?? false); const [error, setError] = useState(''); const create = useCreateIdea(); const update = useUpdateIdea();
  useDirtyForm(content !== (initial?.content ?? '') || tagText !== (initial?.tags.join(', ') ?? '') || pinned !== (initial?.pinned ?? false));
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!content.trim()) { setError('请填写灵感内容'); return; } try { const input = { content: content.trim(), tags: parseTags(tagText), pinned, archivedAt: initial?.archivedAt ?? null }; if (initial) await update.mutateAsync({ id: initial.id, patch: input }); else await create.mutateAsync(input); setContent(''); setTagText(''); setPinned(false); onSaved(); } catch { setError('保存失败，请重试'); } };
  return <form className={compact ? 'idea-capture' : 'idea-form'} onSubmit={submit}><label className="field"><span className="field-label">灵感内容</span><textarea value={content} onChange={(e) => setContent(e.target.value)} /></label><Field label="标签" value={tagText} onChange={(e) => setTagText(e.target.value)} /><label className="checkbox-field"><input checked={pinned} type="checkbox" onChange={(e) => setPinned(e.target.checked)} />置顶</label>{error && <p className="form-errors" role="alert">{error}</p>}<div className="dialog-actions"><Button type="submit">{compact ? '记录灵感' : '保存'}</Button></div></form>;
}
