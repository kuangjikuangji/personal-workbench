import { type InputHTMLAttributes, useId } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  hint?: string;
  label: string;
};

export function Field({ hint, id, label, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input aria-describedby={hintId} id={inputId} {...inputProps} />
      {hint && <span className="field-hint" id={hintId}>{hint}</span>}
    </label>
  );
}
