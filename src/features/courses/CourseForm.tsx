import { type FormEvent, useState } from 'react';
import { useDirtyForm } from '../../app/usePwaUpdate';
import type { EntityInput } from '../../db/repositories';
import type { Course, Semester, WeekRule } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Field } from '../../shared/ui/Field';
import { useCreateCourse, useUpdateCourse } from './courseQueries';

type RuleKind = WeekRule['kind'];
type CourseFormProps = {
  initial?: Course;
  semesters: Semester[];
  onSaved: (course: Course) => void;
};

function explicitWeeksText(rule: WeekRule | undefined): string {
  return rule?.kind === 'explicit' ? rule.weeks.join(',') : '';
}

function parseExplicitWeeks(value: string): number[] {
  return [...new Set(value.split(/[,，\s]+/).map(Number).filter((week) => Number.isInteger(week) && week > 0))].sort((a, b) => a - b);
}

function hasInvalidExplicitWeekToken(value: string): boolean {
  return value.split(/[,，\s]+/).filter(Boolean).some((token) => !/^\d+$/.test(token) || Number(token) < 1);
}

export function CourseForm({ initial, semesters, onSaved }: CourseFormProps) {
  const defaultSemester = semesters.find((semester) => semester.isActive) ?? semesters[0];
  const [values, setValues] = useState<Omit<EntityInput<Course>, 'weekRule'>>({
    semesterId: initial?.semesterId ?? defaultSemester?.id ?? '',
    name: initial?.name ?? '',
    location: initial?.location ?? '',
    teacher: initial?.teacher ?? '',
    weekday: initial?.weekday ?? 1,
    startTime: initial?.startTime ?? '08:00',
    endTime: initial?.endTime ?? '09:30',
    startWeek: initial?.startWeek ?? 1,
    endWeek: initial?.endWeek ?? defaultSemester?.totalWeeks ?? 18,
    notes: initial?.notes ?? '',
  });
  const [ruleKind, setRuleKind] = useState<RuleKind>(initial?.weekRule.kind ?? 'every');
  const [weekText, setWeekText] = useState(explicitWeeksText(initial?.weekRule));
  const [errors, setErrors] = useState<string[]>([]);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const saving = createCourse.isPending || updateCourse.isPending;
  const selectedSemester = semesters.find((semester) => semester.id === values.semesterId);
  const initialValues = { semesterId: initial?.semesterId ?? defaultSemester?.id ?? '', name: initial?.name ?? '', location: initial?.location ?? '', teacher: initial?.teacher ?? '', weekday: initial?.weekday ?? 1, startTime: initial?.startTime ?? '08:00', endTime: initial?.endTime ?? '09:30', startWeek: initial?.startWeek ?? 1, endWeek: initial?.endWeek ?? defaultSemester?.totalWeeks ?? 18, notes: initial?.notes ?? '' };
  useDirtyForm(JSON.stringify({ values, ruleKind, weekText }) !== JSON.stringify({ values: initialValues, ruleKind: initial?.weekRule.kind ?? 'every', weekText: explicitWeeksText(initial?.weekRule) }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const explicitWeeks = parseExplicitWeeks(weekText);
    const validationErrors: string[] = [];
    if (!values.semesterId) validationErrors.push('请选择学期');
    if (!values.name.trim()) validationErrors.push('请填写课程名称');
    if (!values.startTime || !values.endTime || values.endTime <= values.startTime) validationErrors.push('结束时间必须晚于开始时间');
    if (!Number.isInteger(values.startWeek) || !Number.isInteger(values.endWeek) || values.startWeek < 1 || values.endWeek < values.startWeek) {
      validationErrors.push('请填写有效的起止周');
    }
    if (selectedSemester && values.endWeek > selectedSemester.totalWeeks) validationErrors.push('结束周不能超过学期教学周数');
    if (ruleKind === 'explicit' && hasInvalidExplicitWeekToken(weekText)) validationErrors.push('指定周次包含非法内容');
    if (ruleKind === 'explicit' && explicitWeeks.length === 0) validationErrors.push('请填写指定周次');
    if (ruleKind === 'explicit' && explicitWeeks.some((week) => week < values.startWeek || week > values.endWeek)) validationErrors.push('指定周次必须位于起止周内');
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const weekRule: WeekRule = ruleKind === 'explicit' ? { kind: 'explicit', weeks: explicitWeeks } : { kind: ruleKind };
    const input: EntityInput<Course> = {
      ...values,
      name: values.name.trim(),
      location: values.location.trim(),
      teacher: values.teacher.trim(),
      notes: values.notes.trim(),
      weekRule,
    };
    try {
      const saved = initial
        ? await updateCourse.mutateAsync({ id: initial.id, patch: input })
        : await createCourse.mutateAsync(input);
      onSaved(saved);
    } catch {
      setErrors(['保存失败，请重试']);
    }
  };

  return (
    <form className="course-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">学期</span>
        <select required value={values.semesterId} onChange={(event) => {
          const semester = semesters.find((item) => item.id === event.target.value);
          setValues({ ...values, semesterId: event.target.value, endWeek: semester?.totalWeeks ?? values.endWeek });
        }}>
          {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}{semester.isActive ? ' · 当前' : ''}</option>)}
        </select>
      </label>
      <Field label="课程名称" required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
      <div className="course-form-grid">
        <Field label="地点" value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} />
        <Field label="任课教师" value={values.teacher} onChange={(event) => setValues({ ...values, teacher: event.target.value })} />
        <label className="field">
          <span className="field-label">星期</span>
          <select value={values.weekday} onChange={(event) => setValues({ ...values, weekday: Number(event.target.value) })}>
            {['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'].map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
        </label>
        <Field label="开始时间" required type="time" value={values.startTime} onChange={(event) => setValues({ ...values, startTime: event.target.value })} />
        <Field label="结束时间" required type="time" value={values.endTime} onChange={(event) => setValues({ ...values, endTime: event.target.value })} />
        <Field label="起始周" min="1" required type="number" value={values.startWeek} onChange={(event) => setValues({ ...values, startWeek: Number(event.target.value) })} />
        <Field label="结束周" min="1" required type="number" value={values.endWeek} onChange={(event) => setValues({ ...values, endWeek: Number(event.target.value) })} />
        <label className="field">
          <span className="field-label">周次规则</span>
          <select value={ruleKind} onChange={(event) => setRuleKind(event.target.value as RuleKind)}>
            <option value="every">每周</option><option value="odd">单周</option><option value="even">双周</option><option value="explicit">指定周次</option>
          </select>
        </label>
        {ruleKind === 'explicit' && <Field hint="例如：1, 3, 7" label="指定周次" value={weekText} onChange={(event) => setWeekText(event.target.value)} />}
      </div>
      <label className="field"><span className="field-label">备注</span><textarea value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></label>
      {errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      <div className="dialog-actions"><Button disabled={saving} type="submit">保存</Button></div>
    </form>
  );
}
