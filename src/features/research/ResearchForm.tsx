import { type FormEvent, useState } from 'react';
import type { ResearchItemInput } from '../../db/repositories';
import type { ResearchItem } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Field } from '../../shared/ui/Field';
import { useCreateResearch, useUpdateResearch } from './researchQueries';

const splitTags = (value: string) => [...new Set(value.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean))];
type Props = { initial?: ResearchItem; onSaved: (item: ResearchItem) => void };

export function ResearchForm({ initial, onSaved }: Props) {
  const [values, setValues] = useState({ title: initial?.title ?? '', authors: initial?.authors ?? '', source: initial?.source ?? '', year: initial?.year?.toString() ?? '', urlOrDoi: initial?.urlOrDoi ?? '', tags: initial?.tags.join(', ') ?? '', status: initial?.status ?? 'unread' as ResearchItem['status'], rating: initial?.rating?.toString() ?? '', abstract: initial?.abstract ?? '', notes: initial?.notes ?? '' });
  const [error, setError] = useState('');
  const create = useCreateResearch(); const update = useUpdateResearch(); const saving = create.isPending || update.isPending;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.title.trim()) { setError('请填写题目'); return; }
    const year = values.year ? Number(values.year) : null;
    const rating = values.rating ? Number(values.rating) : null;
    if ((year !== null && (!Number.isInteger(year) || year < 0)) || (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))) { setError('请填写有效的年份和评分'); return; }
    const input: ResearchItemInput = { title: values.title.trim(), authors: values.authors.trim(), source: values.source.trim(), year, urlOrDoi: values.urlOrDoi.trim(), tags: splitTags(values.tags), status: values.status, rating, abstract: values.abstract.trim(), notes: values.notes.trim(), sourceType: initial?.sourceType ?? null, sourceId: initial?.sourceId ?? null };
    try { onSaved(initial ? await update.mutateAsync({ id: initial.id, patch: input }) : await create.mutateAsync(input)); } catch { setError('保存失败，请重试'); }
  };
  return <form className="research-form" onSubmit={submit}>
    <Field label="题目" required value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} />
    <div className="research-form-grid"><Field label="作者" value={values.authors} onChange={(e) => setValues({ ...values, authors: e.target.value })} /><Field label="来源" value={values.source} onChange={(e) => setValues({ ...values, source: e.target.value })} /><Field label="年份" min="0" type="number" value={values.year} onChange={(e) => setValues({ ...values, year: e.target.value })} /><Field label="链接或 DOI" value={values.urlOrDoi} onChange={(e) => setValues({ ...values, urlOrDoi: e.target.value })} /><Field label="标签" value={values.tags} onChange={(e) => setValues({ ...values, tags: e.target.value })} /><label className="field"><span className="field-label">阅读状态</span><select value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value as ResearchItem['status'] })}><option value="unread">待读</option><option value="reading">阅读中</option><option value="read">已读</option></select></label><Field label="评分（1–5）" max="5" min="1" type="number" value={values.rating} onChange={(e) => setValues({ ...values, rating: e.target.value })} /></div>
    <label className="field"><span className="field-label">摘要</span><textarea value={values.abstract} onChange={(e) => setValues({ ...values, abstract: e.target.value })} /></label><label className="field"><span className="field-label">阅读笔记</span><textarea value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} /></label>
    {error && <p className="form-errors" role="alert">{error}</p>}<div className="dialog-actions"><Button disabled={saving} type="submit">保存</Button></div>
  </form>;
}
