import { useMemo, useState } from 'react';
import type { Mentorship, Teacher } from '../../domain/entities';
import { Dialog } from '../../shared/ui/Dialog';
import { Button } from '../../shared/ui/Button';
import { MentorshipForm } from './MentorshipForm';

const statusLabel: Record<Mentorship['status'], string> = { planned: '计划中', active: '进行中', completed: '已完成', paused: '已暂停' };

export function MentorshipPanel({ teacher, mentorships }: { teacher: Teacher; mentorships: Mentorship[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const records = useMemo(() => mentorships.filter((item) => item.teacherId === teacher.id), [mentorships, teacher.id]);
  return <section className="mentorship-panel"><div className="page-actions"><Button onClick={() => setFormOpen(true)}>新增指导学生</Button></div>{records.length ? <ul className="mentorship-list">{records.map((item) => <li key={item.id}><strong>{item.studentName}</strong><span>{item.academicYear} · {item.grade} · {item.major}</span><span>{item.topic} · {statusLabel[item.status]}</span>{item.notes && <span>备注：{item.notes}</span>}</li>)}</ul> : <p>暂无科研指导记录。</p>}<Dialog open={formOpen} onClose={() => setFormOpen(false)} title="新增指导学生"><MentorshipForm teacherId={teacher.id} onSaved={() => setFormOpen(false)} /></Dialog></section>;
}
