import { type PropsWithChildren, useEffect, useId, useRef } from 'react';

type DialogProps = PropsWithChildren<{
  className?: string;
  open: boolean;
  onClose: () => void;
  title: string;
}>;

export function Dialog({ children, className = '', open, onClose, title }: DialogProps) {
  const titleId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby={titleId} aria-modal="true" className={`dialog ${className}`.trim()} role="dialog">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button aria-label="关闭" className="dialog-close" onClick={onClose} type="button">×</button>
        </header>
        <div className="dialog-content">{children}</div>
      </section>
    </div>
  );
}
