import { useMemo, useState } from 'react';
import type { Mentorship, Teacher, TeacherRecord } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { MentorshipPanel } from '../mentorships/MentorshipPanel';
import { TeacherRecordForm } from './TeacherRecordForm';

const recordStatus: Partial<Record<TeacherRecord['status'], string>> = { attended: '参会', absent: '缺席', leave: '请假', submitted: '已提交', pending: '待提交', completed: '已完成' };

export function TeacherDetail({ teacher, records, mentorships }: { teacher: Teacher; records: TeacherRecord[]; mentorships: Mentorship[] }) {
  const [tab, setTab] = useState<'records' | 'mentorships'>('records');
  const [recordFormOpen, setRecordFormOpen] = useState(false);
  const teacherRecords = useMemo(() => records.filter((record) => record.teacherId === teacher.id).sort((a, b) => b.date.localeCompare(a.date)), [records, teacher.id]);
  return <section><dl className="course-detail"><div><dt>系室</dt><dd>{teacher.department}</dd></div></dl><div className="view-switch" role="group" aria-label="教师详情标签"><Button aria-pressed={tab === 'records'} variant={tab === 'records' ? 'primary' : 'secondary'} onClick={() => setTab('records')}>年度记录</Button><Button aria-pressed={tab === 'mentorships'} variant={tab === 'mentorships' ? 'primary' : 'secondary'} onClick={() => setTab('mentorships')}>科研导师</Button></div>{tab === 'records' ? <><Button onClick={() => setRecordFormOpen(true)}>新增年度记录</Button>{teacherRecords.length ? <ul className="teacher-record-list">{teacherRecords.map((record) => <li key={record.id}><strong>{record.title}</strong><span>{record.date} · {record.type}</span>{record.content && <p>{record.content}</p>}{recordStatus[record.status] && <span>{recordStatus[record.status]}</span>}</li>)}</ul> : <p>暂无年度记录。</p>}</> : <MentorshipPanel mentorships={mentorships} teacher={teacher} />}<Dialog open={recordFormOpen} onClose={() => setRecordFormOpen(false)} title="新增年度记录"><TeacherRecordForm teacherId={teacher.id} onSaved={() => setRecordFormOpen(false)} /></Dialog></section>;
}
