import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
};

export function Button({ className = '', type = 'button', variant = 'primary', ...props }: ButtonProps) {
  return <button className={`button button-${variant} ${className}`.trim()} type={type} {...props} />;
}
