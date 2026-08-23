import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordPage } from './ChangePasswordPage';

test('does not submit when the two new passwords differ', async () => {
  const user = userEvent.setup();
  let submissions = 0;
  render(
    <ChangePasswordPage
      error={null}
      pending={false}
      onSignOut={async () => undefined}
      onSubmit={async () => { submissions += 1; }}
    />,
  );

  await user.type(screen.getByLabelText('当前密码'), 'initial-password');
  await user.type(screen.getByLabelText('新密码'), 'new-private-password');
  await user.type(screen.getByLabelText('确认新密码'), 'different-password');
  await user.click(screen.getByRole('button', { name: '修改密码并继续' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('两次输入的新密码不一致');
  expect(submissions).toBe(0);
});
