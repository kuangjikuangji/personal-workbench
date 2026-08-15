import { useMemo, useState } from 'react';
import type { Mentorship, Teacher } from '../../domain/entities';
import { Dialog } from '../../shared/ui/Dialog';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Button } from '../../shared/ui/Button';
import { MentorshipForm } from './MentorshipForm';
import { useDeleteMentorship } from '../teachers/teacherQueries';

const statusLabel: Record<Mentorship['status'], string> = { planned: '计划中', active: '进行中', completed: '已完成', paused: '已暂停' };

export function MentorshipPanel({ teacher, mentorships }: { teacher: Teacher; mentorships: Mentorship[] }) {
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Mentorship | null>(null); const [deleting, setDeleting] = useState<Mentorship | null>(null); const remove = useDeleteMentorship();
  const records = useMemo(() => mentorships.filter((item) => item.teacherId === teacher.id), [mentorships, teacher.id]);
  return <section className="mentorship-panel"><div className="page-actions"><Button onClick={() => setFormOpen(true)}>新增指导学生</Button></div>{records.length ? <ul className="mentorship-list">{records.map((item) => <li key={item.id}><strong>{item.studentName}</strong><span>{item.academicYear} · {item.grade} · {item.major}</span><span>{item.topic} · {statusLabel[item.status]}</span>{item.notes && <span>备注：{item.notes}</span>}<div className="card-actions"><Button aria-label={`编辑${item.studentName}`} variant="ghost" onClick={() => setEditing(item)}>编辑</Button><Button aria-label={`删除${item.studentName}`} variant="ghost" onClick={() => setDeleting(item)}>删除</Button></div></li>)}</ul> : <p>暂无科研指导记录。</p>}<Dialog open={formOpen} onClose={() => setFormOpen(false)} title="新增指导学生"><MentorshipForm teacherId={teacher.id} onSaved={() => setFormOpen(false)} /></Dialog><Dialog open={editing !== null} onClose={() => setEditing(null)} title="编辑指导学生">{editing && <MentorshipForm initial={editing} teacherId={teacher.id} onSaved={() => setEditing(null)} />}</Dialog><ConfirmDialog confirmLabel="删除" onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) }); }} open={deleting !== null} title="删除指导学生"><p>确定删除“{deleting?.studentName}”吗？</p>{remove.isError && <p role="alert">删除失败，请重试。</p>}</ConfirmDialog></section>;
}
