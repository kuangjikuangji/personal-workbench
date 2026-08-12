import { BackupRestorePanel } from './BackupRestorePanel';
import { InstallPanel } from './InstallPanel';

export function SettingsPage() {
  return <section className="settings-page" aria-labelledby="settings-title"><header className="page-header"><div><h2 id="settings-title">设置</h2><p>管理工作台数据与安装方式。</p></div></header><p>主题与通知设置将在后续任务中提供。</p><BackupRestorePanel /><InstallPanel /></section>;
}
