import { type KeyboardEvent as ReactKeyboardEvent, type PropsWithChildren, type RefObject, useEffect, useId, useRef } from 'react';

type DialogProps = PropsWithChildren<{
  className?: string;
  closeDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  title: string;
}>;

export function Dialog({ children, className = '', closeDisabled = false, initialFocusRef, open, onClose, title }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabledRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    (initialFocusRef?.current ?? closeButtonRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus.current?.focus();
    };
  }, [open]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (!closeDisabled && event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby={titleId} aria-modal="true" className={`dialog ${className}`.trim()} onKeyDown={trapFocus} ref={dialogRef} role="dialog">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button aria-label="关闭" className="dialog-close" disabled={closeDisabled} onClick={onClose} ref={closeButtonRef} type="button">×</button>
        </header>
        <div className="dialog-content">{children}</div>
      </section>
    </div>
  );
}
