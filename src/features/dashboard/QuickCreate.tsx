import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { IdeaForm } from '../ideas/IdeaForm';
import { StudentRecordForm } from '../students/StudentRecordForm';
import { useStudents } from '../students/studentQueries';
import { TeacherRecordForm } from '../teachers/TeacherRecordForm';
import { useTeachers } from '../teachers/teacherQueries';
import { TodoForm } from '../todos/TodoForm';

type CreateKind = 'todo' | 'idea' | 'teacher' | 'student';
const titles: Record<CreateKind, string> = { todo: '新建待办', idea: '记录灵感', teacher: '记录教师工作', student: '记录学生日常' };

export function QuickCreate() {
  const client = useQueryClient();
  const [kind, setKind] = useState<CreateKind | null>(null);
  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const teachers = useTeachers().data?.filter((teacher) => !teacher.archivedAt) ?? [];
  const students = useStudents().data?.filter((student) => !student.archivedAt) ?? [];
  const close = () => { setKind(null); setTeacherId(''); setStudentId(''); };
  const saved = () => { void client.invalidateQueries({ queryKey: ['dashboard'] }); close(); };
  return <section className="dashboard-panel" aria-labelledby="quick-create-title"><h3 id="quick-create-title">快速新建</h3><div className="quick-create-actions">{(Object.keys(titles) as CreateKind[]).map((item) => <Button key={item} variant="secondary" onClick={() => setKind(item)}>{titles[item]}</Button>)}</div><Dialog open={kind !== null} onClose={close} title={kind ? titles[kind] : '快速新建'}>{kind === 'todo' && <TodoForm onSaved={saved} />}{kind === 'idea' && <IdeaForm onSaved={saved} />}{kind === 'teacher' && <><label className="field"><span className="field-label">选择教师</span><select aria-label="选择教师" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">请选择</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>{teachers.length === 0 && <p role="status">请先在系室管理中新增教师。</p>}{teacherId && <TeacherRecordForm teacherId={teacherId} onSaved={saved} />}</>}{kind === 'student' && <><label className="field"><span className="field-label">选择学生</span><select aria-label="选择学生" value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">请选择</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>{students.length === 0 && <p role="status">请先在学生管理中新增学生。</p>}{studentId && <StudentRecordForm studentId={studentId} onSaved={saved} />}</>}</Dialog></section>;
}
