import { useMemo, useState } from 'react';
import type { Student, StudentRecord } from '../../domain/entities';
import { studentRecordCategoryLabels, studentRecordRatingLabels } from '../../domain/studentOperations';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { StudentRecordForm } from './StudentRecordForm';

export function StudentDetail({ student, records }: { student: Student; records: StudentRecord[] }) {
  const [recordFormOpen, setRecordFormOpen] = useState(false); const studentRecords = useMemo(() => records.filter((record) => record.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [records, student.id]);
  return <section><dl className="course-detail"><div><dt>培养项目</dt><dd>{student.program}</dd></div><div><dt>年级</dt><dd>{student.cohort}</dd></div><div><dt>联系方式</dt><dd>{student.contact}</dd></div><div><dt>备注</dt><dd>{student.notes || '—'}</dd></div></dl><div className="page-actions"><Button onClick={() => setRecordFormOpen(true)}>添加日常记录</Button></div>{studentRecords.length ? <ul className="student-record-list">{studentRecords.map((record) => <li key={record.id}><strong>{record.content}</strong><span>{record.date} · {studentRecordCategoryLabels[record.category]} · {studentRecordRatingLabels[record.rating]}</span>{record.followUp && <p>跟进：{record.followUp}</p>}{record.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</li>)}</ul> : <p>暂无日常记录。</p>}<Dialog open={recordFormOpen} onClose={() => setRecordFormOpen(false)} title="添加日常记录"><StudentRecordForm studentId={student.id} onSaved={() => setRecordFormOpen(false)} /></Dialog></section>;
}
