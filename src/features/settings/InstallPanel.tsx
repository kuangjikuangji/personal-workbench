import { useState } from 'react';
import { useInstallPrompt } from '../../app/useInstallPrompt';
import { useThemeStore, type Theme } from '../../app/themeStore';
import { Button } from '../../shared/ui/Button';

export function InstallPanel() {
  const { canInstall, install } = useInstallPrompt();
  const { theme, setTheme } = useThemeStore();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const requestNotifications = async () => { if (typeof Notification !== 'undefined') setPermission(await Notification.requestPermission()); };
  return <><section className="settings-panel" aria-labelledby="appearance-title"><h3 id="appearance-title">外观与通知</h3><label className="field"><span className="field-label">主题</span><select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label><p>通知权限：{permission === 'unsupported' ? '浏览器不支持' : permission === 'granted' ? '已允许' : permission === 'denied' ? '已拒绝' : '未请求'}</p>{permission === 'default' && <Button variant="secondary" onClick={() => { void requestNotifications(); }}>允许通知</Button>}</section><section className="settings-panel" aria-labelledby="install-title"><h3 id="install-title">安装应用</h3>{canInstall ? <Button onClick={() => { void install(); }}>安装应用</Button> : <p>Chrome/Edge 桌面端可使用地址栏安装图标；iPhone/iPad 请在 Safari 共享菜单选择“添加到主屏幕”；Android 请使用浏览器菜单“安装应用”。</p>}</section></>;
}
