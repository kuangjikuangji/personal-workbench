import { useSyncStatus } from './SyncProvider';

export function SyncStatus() {
  const { status, pendingCount, retry } = useSyncStatus();

  if (status === 'error') {
    return (
      <div className="sync-status sync-status-error" role="alert">
        <span>同步失败</span>
        <button type="button" onClick={() => { void retry(); }}>重试</button>
      </div>
    );
  }

  const label = status === 'synced'
    ? '已同步'
    : status === 'offline'
      ? `离线，${pendingCount} 项待同步`
      : '正在同步';

  return <div className={`sync-status sync-status-${status}`} role="status">{label}</div>;
}
