import type { Student } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';

export function StudentList({ students, onDelete, onEdit, onView }: { students: Student[]; onDelete: (student: Student) => void; onEdit: (student: Student) => void; onView: (student: Student) => void }) {
  if (!students.length) return <EmptyState title="暂无在读学生" description="新增学生后即可单独记录日常表现。" />;
  return <div className="table-wrapper"><table className="responsive-table"><caption>在读学生名册</caption><thead><tr><th>姓名</th><th>培养项目</th><th>年级</th><th>联系方式</th><th>操作</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td data-label="姓名"><a href={`#student-${student.id}`} onClick={(event) => { event.preventDefault(); onView(student); }}>{student.name}</a></td><td data-label="培养项目">{student.program}</td><td data-label="年级">{student.cohort}</td><td data-label="联系方式">{student.contact}</td><td data-label="操作"><div className="course-actions"><Button aria-label={`查看${student.name}`} variant="ghost" onClick={() => onView(student)}>查看</Button><Button aria-label={`编辑${student.name}`} variant="ghost" onClick={() => onEdit(student)}>编辑</Button><Button aria-label={`删除${student.name}`} variant="ghost" onClick={() => onDelete(student)}>删除</Button></div></td></tr>)}</tbody></table></div>;
}
