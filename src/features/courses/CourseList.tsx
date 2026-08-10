import type { Course, Semester, WeekRule } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { DataTable } from '../../shared/ui/DataTable';

type CourseListProps = {
  courses: Course[];
  semesters: Semester[];
  onDelete: (course: Course) => void;
  onEdit: (course: Course) => void;
};

const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

export function formatWeekRule(rule: WeekRule): string {
  if (rule.kind === 'every') return '每周';
  if (rule.kind === 'odd') return '单周';
  if (rule.kind === 'even') return '双周';
  return `指定周：${rule.weeks.join('、')}`;
}

export function CourseList({ courses, semesters, onDelete, onEdit }: CourseListProps) {
  const semesterNames = new Map(semesters.map((semester) => [semester.id, semester.name]));
  return (
    <DataTable
      caption="课程列表"
      columns={[
        { key: 'name', label: '课程' },
        { key: 'semesterId', label: '学期', render: (course) => semesterNames.get(course.semesterId) ?? '学期已删除' },
        { key: 'weekday', label: '上课时间', render: (course) => `${weekdays[course.weekday - 1]} ${course.startTime}–${course.endTime}` },
        { key: 'weekRule', label: '教学周', render: (course) => `第 ${course.startWeek}–${course.endWeek} 周 · ${formatWeekRule(course.weekRule)}` },
        { key: 'location', label: '地点' },
        { key: 'teacher', label: '任课教师' },
        { key: 'notes', label: '操作', render: (course) => <div className="course-actions"><Button aria-label={`编辑${course.name}`} variant="ghost" onClick={() => onEdit(course)}>编辑</Button><Button aria-label={`删除${course.name}`} variant="ghost" onClick={() => onDelete(course)}>删除</Button></div> },
      ]}
      rows={courses}
    />
  );
}
