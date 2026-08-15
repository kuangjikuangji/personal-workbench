import { useMemo, useState } from 'react';
import type { Mentorship, Teacher, TeacherRecord } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { MentorshipPanel } from '../mentorships/MentorshipPanel';
import { TeacherRecordForm } from './TeacherRecordForm';
import { useDeleteRecord } from './teacherQueries';

const recordStatus: Partial<Record<TeacherRecord['status'], string>> = { attended: '参会', absent: '缺席', leave: '请假', submitted: '已提交', pending: '待提交', completed: '已完成' };
const recordType: Record<TeacherRecord['type'], string> = { work: '工作', meeting: '例会', material: '材料', publicService: '公共服务' };

export function TeacherDetail({ teacher, records, mentorships }: { teacher: Teacher; records: TeacherRecord[]; mentorships: Mentorship[] }) {
  const [tab, setTab] = useState<'records' | 'mentorships'>('records');
  const [recordFormOpen, setRecordFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TeacherRecord | null>(null); const [deletingRecord, setDeletingRecord] = useState<TeacherRecord | null>(null); const remove = useDeleteRecord();
  const teacherRecords = useMemo(() => records.filter((record) => record.teacherId === teacher.id).sort((a, b) => b.date.localeCompare(a.date)), [records, teacher.id]);
  return <section><dl className="course-detail"><div><dt>系室</dt><dd>{teacher.department}</dd></div></dl><div className="view-switch" role="group" aria-label="教师详情标签"><Button aria-pressed={tab === 'records'} variant={tab === 'records' ? 'primary' : 'secondary'} onClick={() => setTab('records')}>年度记录</Button><Button aria-pressed={tab === 'mentorships'} variant={tab === 'mentorships' ? 'primary' : 'secondary'} onClick={() => setTab('mentorships')}>科研导师</Button></div>{tab === 'records' ? <><Button onClick={() => setRecordFormOpen(true)}>新增年度记录</Button>{teacherRecords.length ? <ul className="teacher-record-list">{teacherRecords.map((record) => <li key={record.id}><strong>{record.title}</strong><span>{record.date} · {recordType[record.type]}</span>{record.content && <p>{record.content}</p>}{recordStatus[record.status] && <span>{recordStatus[record.status]}</span>}<div className="card-actions"><Button aria-label={`编辑${record.title}`} variant="ghost" onClick={() => setEditingRecord(record)}>编辑</Button><Button aria-label={`删除${record.title}`} variant="ghost" onClick={() => setDeletingRecord(record)}>删除</Button></div></li>)}</ul> : <p>暂无年度记录。</p>}</> : <MentorshipPanel mentorships={mentorships} teacher={teacher} />}<Dialog open={recordFormOpen} onClose={() => setRecordFormOpen(false)} title="新增年度记录"><TeacherRecordForm teacherId={teacher.id} onSaved={() => setRecordFormOpen(false)} /></Dialog><Dialog open={editingRecord !== null} onClose={() => setEditingRecord(null)} title="编辑年度记录">{editingRecord && <TeacherRecordForm initial={editingRecord} teacherId={teacher.id} onSaved={() => setEditingRecord(null)} />}</Dialog><ConfirmDialog confirmLabel="删除" onClose={() => setDeletingRecord(null)} onConfirm={() => { if (deletingRecord) remove.mutate(deletingRecord.id, { onSuccess: () => setDeletingRecord(null) }); }} open={deletingRecord !== null} title="删除年度记录"><p>确定删除“{deletingRecord?.title}”吗？</p>{remove.isError && <p role="alert">删除失败，请重试。</p>}</ConfirmDialog></section>;
}
