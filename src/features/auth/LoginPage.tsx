import { type FormEvent, useState } from 'react';
import { Button } from '../../shared/ui/Button';

export interface LoginCredentials {
  username: string;
  password: string;
}

export function LoginPage({
  error,
  pending,
  onSubmit,
}: {
  error: string | null;
  pending: boolean;
  onSubmit(credentials: LoginCredentials): Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ username, password });
  }

  return (
    <main
      className="login-page"
      data-testid="login-page"
      style={{ backgroundImage: `url(${import.meta.env.BASE_URL}login-background.jpg)` }}
    >
      <div className="login-overlay" />
      <section className="login-card" aria-labelledby="login-title">
        <p className="login-eyebrow">安全登录</p>
        <h1 id="login-title">个人工作学习工作台</h1>
        <p>登录后管理教学、科研与日常工作。</p>
        <form className="login-form" onSubmit={(event) => { void submit(event); }}>
          <label className="field">
            <span>账号</span>
            <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <div className="field">
            <label htmlFor="login-password">密码</label>
            <div className="password-input">
              <input id="login-password" autoComplete="current-password" required type={passwordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" onClick={() => setPasswordVisible((visible) => !visible)}>
                {passwordVisible ? '隐藏密码' : '显示密码'}
              </button>
            </div>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <Button disabled={pending} type="submit">{pending ? '正在登录…' : '登录'}</Button>
        </form>
      </section>
    </main>
  );
}
