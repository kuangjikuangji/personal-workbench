import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { usernameToInternalEmail } from './authService';

test('normalizes the owner account into the internal Auth email', () => {
  expect(usernameToInternalEmail('  ZhouJingJing ')).toBe('zhoujingjing@users.workbench.invalid');
});

test('uses the bundled campus photo and submits entered credentials', async () => {
  const user = userEvent.setup();
  const submissions: Array<{ username: string; password: string }> = [];
  render(<LoginPage error={null} pending={false} onSubmit={async (credentials) => { submissions.push(credentials); }} />);

  expect(screen.getByTestId('login-page')).toHaveStyle({
    backgroundImage: 'url(/login-background.jpg)',
  });
  await user.type(screen.getByLabelText('账号'), 'zhoujingjing');
  await user.type(screen.getByLabelText('密码'), 'private-password');
  await user.click(screen.getByRole('button', { name: '登录' }));

  expect(submissions).toEqual([{ username: 'zhoujingjing', password: 'private-password' }]);
});

test('lets the user reveal and hide the entered password', async () => {
  const user = userEvent.setup();
  render(<LoginPage error={null} pending={false} onSubmit={async () => undefined} />);
  const password = screen.getByLabelText('密码');

  expect(password).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: '显示密码' }));
  expect(password).toHaveAttribute('type', 'text');
  await user.click(screen.getByRole('button', { name: '隐藏密码' }));
  expect(password).toHaveAttribute('type', 'password');
});
