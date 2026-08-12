import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = '', type = 'button', variant = 'primary', ...props }, ref) {
  return <button className={`button button-${variant} ${className}`.trim()} ref={ref} type={type} {...props} />;
});
