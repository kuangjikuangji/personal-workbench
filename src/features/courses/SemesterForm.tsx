import { type FormEvent, useState } from 'react';
import type { EntityInput } from '../../db/repositories';
import type { Semester } from '../../domain/entities';
import { Button } from '../../shared/ui/Button';
import { Field } from '../../shared/ui/Field';
import { useCreateSemester, useUpdateSemester } from './courseQueries';

type SemesterFormProps = {
  initial?: Semester;
  onSaved: (semester: Semester) => void;
};

export function SemesterForm({ initial, onSaved }: SemesterFormProps) {
  const [values, setValues] = useState<EntityInput<Semester>>({
    name: initial?.name ?? '',
    startDate: initial?.startDate ?? '',
    endDate: initial?.endDate ?? '',
    totalWeeks: initial?.totalWeeks ?? 18,
    isActive: initial?.isActive ?? false,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const createSemester = useCreateSemester();
  const updateSemester = useUpdateSemester();
  const saving = createSemester.isPending || updateSemester.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationErrors: string[] = [];
    if (!values.name.trim()) validationErrors.push('请填写学期名称');
    if (!values.startDate || !values.endDate) validationErrors.push('请填写学期日期');
    if (values.startDate && values.endDate && values.endDate < values.startDate) validationErrors.push('结束日期不能早于开始日期');
    if (!Number.isInteger(values.totalWeeks) || values.totalWeeks < 1) validationErrors.push('教学周数必须大于 0');
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const input = { ...values, name: values.name.trim() };
    try {
      const saved = initial
        ? await updateSemester.mutateAsync({ id: initial.id, patch: input })
        : await createSemester.mutateAsync(input);
      onSaved(saved);
    } catch {
      setErrors(['保存失败，请重试']);
    }
  };

  return (
    <form className="course-form" onSubmit={submit}>
      <Field label="学期名称" required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
      <div className="course-form-grid">
        <Field label="开始日期" required type="date" value={values.startDate} onChange={(event) => setValues({ ...values, startDate: event.target.value })} />
        <Field label="结束日期" required type="date" value={values.endDate} onChange={(event) => setValues({ ...values, endDate: event.target.value })} />
        <Field label="教学周数" min="1" required type="number" value={values.totalWeeks} onChange={(event) => setValues({ ...values, totalWeeks: Number(event.target.value) })} />
      </div>
      <label className="checkbox-field">
        <input checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} type="checkbox" />
        <span>设为当前学期</span>
      </label>
      {errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      <div className="dialog-actions"><Button disabled={saving} type="submit">保存</Button></div>
    </form>
  );
}
