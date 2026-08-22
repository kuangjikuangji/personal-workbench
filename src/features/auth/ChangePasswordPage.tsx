import { type FormEvent, useState } from 'react';
import { Button } from '../../shared/ui/Button';

export function ChangePasswordPage({
  error,
  pending,
  onSubmit,
  onSignOut,
}: {
  error: string | null;
  pending: boolean;
  onSubmit(currentPassword: string, newPassword: string): Promise<void>;
  onSignOut(): Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setValidationError('新密码至少 8 位。');
      return;
    }
    if (newPassword === currentPassword) {
      setValidationError('新密码不能与当前密码相同。');
      return;
    }
    if (newPassword !== confirmation) {
      setValidationError('两次输入的新密码不一致。');
      return;
    }
    setValidationError(null);
    await onSubmit(currentPassword, newPassword);
  }

  return (
    <main className="password-page">
      <section className="login-card" aria-labelledby="password-title">
        <p className="login-eyebrow">首次登录</p>
        <h1 id="password-title">修改初始密码</h1>
        <p>为保护工作数据，请先设置仅你知道的新密码。</p>
        <form className="login-form" onSubmit={(event) => { void submit(event); }}>
          <label className="field"><span>当前密码</span><input autoComplete="current-password" required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label className="field"><span>新密码</span><input autoComplete="new-password" minLength={8} required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label className="field"><span>确认新密码</span><input autoComplete="new-password" minLength={8} required type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          {(validationError || error) && <p className="auth-error" role="alert">{validationError ?? error}</p>}
          <Button disabled={pending} type="submit">{pending ? '正在修改…' : '修改密码并继续'}</Button>
          <Button disabled={pending} type="button" variant="ghost" onClick={() => { void onSignOut(); }}>退出登录</Button>
        </form>
      </section>
    </main>
  );
}
