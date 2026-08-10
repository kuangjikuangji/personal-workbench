import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

type ConfirmDialogProps = {
  cancelLabel?: string;
  children: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = '取消', children, confirmDisabled = false, confirmLabel = '确认', onClose, onConfirm, open, title,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {children}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>
        <Button disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
