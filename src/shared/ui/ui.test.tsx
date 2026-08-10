import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { RoleBadge } from './RoleBadge';

function DialogExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开对话框</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="确认操作">
        <button type="button">第一个操作</button>
        <button type="button">最后操作</button>
      </Dialog>
    </>
  );
}

test('role badge exposes text in addition to color', () => {
  render(<RoleBadge role="dean" />);

  expect(screen.getByText('院长助理')).toBeVisible();
});

test('dialog returns focus to the trigger after it closes', async () => {
  const user = userEvent.setup();
  render(<DialogExample />);
  const trigger = screen.getByRole('button', { name: '打开对话框' });
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: '关闭' }));

  expect(trigger).toHaveFocus();
});

test('dialog moves focus to its close button when it opens', async () => {
  const user = userEvent.setup();
  render(<DialogExample />);

  await user.click(screen.getByRole('button', { name: '打开对话框' }));

  expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
});

test('dialog cycles focus forward from its last focusable element', async () => {
  const user = userEvent.setup();
  render(<DialogExample />);
  await user.click(screen.getByRole('button', { name: '打开对话框' }));

  await user.tab();
  await user.tab();
  await user.tab();

  expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
});

test('dialog cycles focus backward from its first focusable element', async () => {
  const user = userEvent.setup();
  render(<DialogExample />);
  await user.click(screen.getByRole('button', { name: '打开对话框' }));

  await user.tab({ shift: true });

  expect(screen.getByRole('button', { name: '最后操作' })).toHaveFocus();
});

test('data table provides labels for its mobile card representation', () => {
  render(
    <DataTable
      caption="待办列表"
      columns={[{ key: 'title', label: '事项' }, { key: 'status', label: '状态' }]}
      rows={[{ id: 'todo-1', title: '提交材料', status: '进行中' }]}
    />,
  );

  expect(screen.getByText('提交材料').closest('td')).toHaveAttribute('data-label', '事项');
  expect(screen.getByText('进行中').closest('td')).toHaveAttribute('data-label', '状态');
});
