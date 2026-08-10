import { useEffect, useMemo, useState } from 'react';
import type { Course, Semester } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Dialog } from '../../shared/ui/Dialog';
import { EmptyState } from '../../shared/ui/EmptyState';
import { CourseForm } from './CourseForm';
import { CourseList } from './CourseList';
import { SemesterForm } from './SemesterForm';
import { useCourses, useDeleteCourse, useDeleteSemester, useSemesters } from './courseQueries';

export function CoursePage() {
  const semestersQuery = useSemesters();
  const coursesQuery = useCourses();
  const deleteSemester = useDeleteSemester();
  const deleteCourse = useDeleteCourse();
  const semesters = useMemo(() => [...(semestersQuery.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)), [semestersQuery.data]);
  const courses = useMemo(() => [...(coursesQuery.data ?? [])].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)), [coursesQuery.data]);
  const [semesterFormOpen, setSemesterFormOpen] = useState(false);
  const [courseFormOpen, setCourseFormOpen] = useState(false);
  const [editingSemester, setEditingSemester] = useState<Semester | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingSemester, setDeletingSemester] = useState<Semester | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [selectedSemesterId, setSelectedSemesterId] = useState('all');

  useEffect(() => {
    if (selectedSemesterId !== 'all' && !semesters.some((semester) => semester.id === selectedSemesterId)) setSelectedSemesterId('all');
  }, [selectedSemesterId, semesters]);

  const visibleCourses = selectedSemesterId === 'all' ? courses : courses.filter((course) => course.semesterId === selectedSemesterId);
  const loading = semestersQuery.isPending || coursesQuery.isPending;
  const loadError = semestersQuery.isError || coursesQuery.isError;

  const closeSemesterForm = () => { setSemesterFormOpen(false); setEditingSemester(null); };
  const closeCourseForm = () => { setCourseFormOpen(false); setEditingCourse(null); };

  return (
    <section className="course-page" aria-labelledby="course-page-title">
      <header className="page-header">
        <div><h2 id="course-page-title">学期与课表</h2><p>管理学期、教学周规则和课程时间。</p></div>
        <div className="page-actions"><Button variant="secondary" onClick={() => { setEditingSemester(null); setSemesterFormOpen(true); }}>新建学期</Button><Button disabled={semesters.length === 0} onClick={() => { setEditingCourse(null); setCourseFormOpen(true); }}>新建课程</Button></div>
      </header>

      {loading && <p role="status">正在加载课表……</p>}
      {loadError && <p role="alert">课表加载失败，请刷新后重试。</p>}
      {!loading && !loadError && (
        <>
          {semesters.length === 0 ? <EmptyState title="暂无学期" description="请先创建学期，再录入课程。" /> : (
            <div className="semester-section">
              <div className="semester-toolbar">
                <label className="field"><span className="field-label">查看学期</span><select value={selectedSemesterId} onChange={(event) => setSelectedSemesterId(event.target.value)}><option value="all">全部学期</option>{semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}</select></label>
              </div>
              <ul className="semester-list">
                {semesters.map((semester) => <li key={semester.id}><div><strong>{semester.name}</strong>{semester.isActive && <span className="active-semester-badge">当前学期</span>}<p>{semester.startDate} – {semester.endDate} · {semester.totalWeeks} 周</p></div><div className="course-actions"><Button aria-label={`编辑${semester.name}`} variant="ghost" onClick={() => { setEditingSemester(semester); setSemesterFormOpen(true); }}>编辑</Button><Button aria-label={`删除${semester.name}`} variant="ghost" onClick={() => setDeletingSemester(semester)}>删除</Button></div></li>)}
              </ul>
              {visibleCourses.length === 0 ? <EmptyState title="暂无课程" description="创建课程后，实际上课日期会在运行时展开到日历。" /> : <CourseList courses={visibleCourses} semesters={semesters} onDelete={setDeletingCourse} onEdit={(course) => { setEditingCourse(course); setCourseFormOpen(true); }} />}
            </div>
          )}
        </>
      )}

      <Dialog open={semesterFormOpen} onClose={closeSemesterForm} title={editingSemester ? '编辑学期' : '新建学期'}><SemesterForm key={editingSemester?.id ?? 'new'} initial={editingSemester ?? undefined} onSaved={closeSemesterForm} /></Dialog>
      <Dialog open={courseFormOpen} onClose={closeCourseForm} title={editingCourse ? '编辑课程' : '新建课程'}><CourseForm key={editingCourse?.id ?? 'new'} initial={editingCourse ?? undefined} semesters={semesters} onSaved={closeCourseForm} /></Dialog>
      <ConfirmDialog confirmLabel="删除" onClose={() => setDeletingCourse(null)} onConfirm={() => { if (deletingCourse) deleteCourse.mutate(deletingCourse.id, { onSuccess: () => setDeletingCourse(null) }); }} open={deletingCourse !== null} title="删除课程"><p>确定删除“{deletingCourse?.name}”吗？</p>{deleteCourse.isError && <p role="alert">删除失败，请重试。</p>}</ConfirmDialog>
      <ConfirmDialog confirmLabel="删除学期及课程" onClose={() => setDeletingSemester(null)} onConfirm={() => { if (deletingSemester) deleteSemester.mutate(deletingSemester.id, { onSuccess: () => setDeletingSemester(null) }); }} open={deletingSemester !== null} title="删除学期"><p>删除“{deletingSemester?.name}”将同时删除该学期的所有课程。</p>{deleteSemester.isError && <p role="alert">删除失败，请重试。</p>}</ConfirmDialog>
    </section>
  );
}
