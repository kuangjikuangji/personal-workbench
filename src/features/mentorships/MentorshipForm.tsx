import { type FormEvent, useState } from 'react';
import type { EntityInput } from '../../db/repositories';
import type { Mentorship } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Field } from '../../shared/ui/Field';
import { useCreateMentorship } from '../teachers/teacherQueries';

export function MentorshipForm({ teacherId, onSaved }: { teacherId: string; onSaved: () => void }) {
  const create = useCreateMentorship();
  const [values, setValues] = useState({ studentName: '', academicYear: new Date().getFullYear().toString(), grade: '', major: '', topic: '', status: 'planned' as Mentorship['status'], notes: '' });
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!values.studentName.trim()) return; await create.mutateAsync({ ...values, teacherId, studentName: values.studentName.trim(), grade: values.grade.trim(), major: values.major.trim(), topic: values.topic.trim(), notes: values.notes.trim() } satisfies EntityInput<Mentorship>); onSaved(); };
  return <form className="course-form" onSubmit={submit}><Field label="学生姓名" required value={values.studentName} onChange={(event) => setValues({ ...values, studentName: event.target.value })} /><Field label="学年" required value={values.academicYear} onChange={(event) => setValues({ ...values, academicYear: event.target.value })} /><Field label="年级" required value={values.grade} onChange={(event) => setValues({ ...values, grade: event.target.value })} /><Field label="专业" required value={values.major} onChange={(event) => setValues({ ...values, major: event.target.value })} /><Field label="指导主题" required value={values.topic} onChange={(event) => setValues({ ...values, topic: event.target.value })} /><label className="field"><span className="field-label">进展状态</span><select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value as Mentorship['status'] })}><option value="planned">计划中</option><option value="active">进行中</option><option value="completed">已完成</option><option value="paused">已暂停</option></select></label><label className="field"><span className="field-label">备注</span><textarea value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></label>{create.isError && <p role="alert">保存失败，请重试。</p>}<div className="dialog-actions"><Button disabled={create.isPending} type="submit">保存</Button></div></form>;
}
