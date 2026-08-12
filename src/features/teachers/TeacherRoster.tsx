import type { Teacher } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';

export function TeacherRoster({ teachers, onEdit, onArchive, onView }: { teachers: Teacher[]; onEdit: (teacher: Teacher) => void; onArchive: (teacher: Teacher) => void; onView: (teacher: Teacher) => void }) {
  if (!teachers.length) return <EmptyState title="暂无在岗教师" description="新增教师后可维护年度记录与科研指导。" />;
  return <div className="table-wrapper"><table className="responsive-table"><caption>在岗教师名册</caption><thead><tr><th>姓名</th><th>系室</th><th>操作</th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.id}><td data-label="姓名">{teacher.name}</td><td data-label="系室">{teacher.department}</td><td data-label="操作"><div className="course-actions"><Button aria-label={`查看${teacher.name}`} variant="ghost" onClick={() => onView(teacher)}>查看</Button><Button aria-label={`编辑${teacher.name}`} variant="ghost" onClick={() => onEdit(teacher)}>编辑</Button><Button aria-label={`停用${teacher.name}`} variant="ghost" onClick={() => onArchive(teacher)}>停用</Button></div></td></tr>)}</tbody></table></div>;
}
