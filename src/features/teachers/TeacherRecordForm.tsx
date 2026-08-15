import { type FormEvent, useState } from 'react';
import { useDirtyForm } from '../../app/usePwaUpdate';
import type { EntityInput } from '../../db/repositories';
import type { TeacherRecord } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Field } from '../../shared/ui/Field';
import { localDateValue } from '../../shared/date';
import { useCreateRecord, useUpdateRecord } from './teacherQueries';

export function TeacherRecordForm({ teacherId, initial, onSaved }: { teacherId: string; initial?: TeacherRecord; onSaved: () => void }) {
  const create = useCreateRecord(); const update = useUpdateRecord();
  const today = localDateValue();
  const [values, setValues] = useState({ title: initial?.title ?? '', content: initial?.content ?? '', date: initial?.date ?? today, type: initial?.type ?? 'work' as TeacherRecord['type'], status: initial?.status ?? 'completed' as TeacherRecord['status'], notes: initial?.notes ?? '' });
  useDirtyForm(JSON.stringify(values) !== JSON.stringify(initial ? { title: initial.title, content: initial.content, date: initial.date, type: initial.type, status: initial.status, notes: initial.notes } : { title: '', content: '', date: today, type: 'work', status: 'completed', notes: '' }));
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!values.title.trim()) return; const input = { ...values, title: values.title.trim(), content: values.content.trim(), notes: values.notes.trim(), teacherId, year: values.date.slice(0, 4) } satisfies EntityInput<TeacherRecord>; try { if (initial) await update.mutateAsync({ id: initial.id, patch: input }); else await create.mutateAsync(input); onSaved(); } catch {} };
  return <form className="course-form" onSubmit={submit}><Field label="标题" required value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /><Field label="日期" required type="date" value={values.date} onChange={(event) => setValues({ ...values, date: event.target.value })} /><label className="field"><span className="field-label">记录类型</span><select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value as TeacherRecord['type'] })}><option value="work">工作</option><option value="meeting">例会</option><option value="material">材料</option><option value="publicService">公共服务</option></select></label><label className="field"><span className="field-label">内容</span><textarea value={values.content} onChange={(event) => setValues({ ...values, content: event.target.value })} /></label><label className="field"><span className="field-label">备注</span><textarea value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></label>{(create.isError || update.isError) && <p role="alert">保存失败，请重试。</p>}<div className="dialog-actions"><Button disabled={create.isPending || update.isPending} type="submit">保存</Button></div></form>;
}
