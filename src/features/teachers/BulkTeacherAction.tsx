import { type FormEvent, useState } from 'react';
import { useDirtyForm } from '../../app/usePwaUpdate';
import type { TeacherRecord } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Field } from '../../shared/ui/Field';
import { localDateValue } from '../../shared/date';
import { useAddMaterials, useApplyMeeting } from './teacherQueries';

export function BulkTeacherAction({ ids, kind, onSaved }: { ids: string[]; kind: 'meeting' | 'material'; onSaved: () => void }) {
  const meeting = useApplyMeeting();
  const materials = useAddMaterials();
  const [title, setTitle] = useState('');
  const today = localDateValue();
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TeacherRecord['status']>(kind === 'meeting' ? 'attended' : 'submitted');
  const saving = meeting.isPending || materials.isPending;
  useDirtyForm(Boolean(title || notes) || date !== today || status !== (kind === 'meeting' ? 'attended' : 'submitted'));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    if (kind === 'meeting') await meeting.mutateAsync({ ids, meeting: { date, title: title.trim(), notes }, status: status as 'attended' | 'absent' | 'leave' });
    else await materials.mutateAsync({ ids, material: { date, title: title.trim(), notes, status: status as 'pending' | 'submitted' } });
    onSaved();
  };
  return <form className="course-form" onSubmit={submit}><p>将为 {ids.length} 位教师{kind === 'meeting' ? '登记例会' : '登记材料'}</p><Field label={kind === 'meeting' ? '例会名称' : '材料名称'} required value={title} onChange={(event) => setTitle(event.target.value)} /><Field label="日期" required type="date" value={date} onChange={(event) => setDate(event.target.value)} /><fieldset><legend>{kind === 'meeting' ? '出席状态' : '提交状态'}</legend>{(kind === 'meeting' ? [['attended', '参会'], ['absent', '缺席'], ['leave', '请假']] : [['submitted', '已提交'], ['pending', '待提交']]).map(([value, label]) => <label key={value}><input checked={status === value} name="bulk-status" onChange={() => setStatus(value as TeacherRecord['status'])} type="radio" value={value} />{label}</label>)}</fieldset><label className="field"><span className="field-label">备注</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{(meeting.isError || materials.isError) && <p role="alert">保存失败，请重试。</p>}<div className="dialog-actions"><Button disabled={saving} type="submit">保存 {ids.length} 条记录</Button></div></form>;
}
