import { type ChangeEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../../app/providers';
import { backupTableNames, exportBackup, restoreBackup, validateBackup, type WorkbenchBackupV1 } from '../../db/backup';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { downloadBytes, localDateStamp } from '../../shared/export/download';

const tableLabels: Record<(typeof backupTableNames)[number], string> = {
  todos: '待办', semesters: '学期', courses: '课程', teachers: '教师', teacherYearSummaries: '教师年度汇总',
  teacherRecords: '教师记录', mentorships: '导师指导', researchItems: '科研条目', learningMethods: '学习方法',
  ideas: '灵感', lessonPlans: '备课', students: '学生', studentRecords: '学生记录', settings: '设置',
};

function downloadBackup(backup: WorkbenchBackupV1, filename: string) {
  downloadBytes(JSON.stringify(backup, null, 2), filename, 'application/json;charset=utf-8');
}

export function BackupRestorePanel() {
  const repositories = useRepositories();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<WorkbenchBackupV1 | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [restoring, setRestoring] = useState(false);

  const exportCurrent = async () => {
    setError('');
    try {
      downloadBackup(await exportBackup(repositories), `工作台完整备份-${localDateStamp()}.json`);
    } catch {
      setError('备份导出失败，请重试。');
    }
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setPreview(null); setError(''); setStatus('');
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setPreview(validateBackup(JSON.parse(await file.text())));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '备份文件格式无效');
    } finally {
      event.target.value = '';
    }
  };

  const confirmRestore = async () => {
    if (!preview) return;
    setRestoring(true); setError('');
    try {
      const current = await exportBackup(repositories);
      downloadBackup(current, `恢复前完整备份-${localDateStamp()}.json`);
      await restoreBackup(preview, repositories);
      queryClient.clear();
      setPreview(null);
      setStatus('备份恢复成功。');
    } catch (cause) {
      setError(cause instanceof Error ? `恢复失败：${cause.message}` : '恢复失败，已保留原数据。');
    } finally {
      setRestoring(false);
    }
  };

  return <section className="settings-panel" aria-labelledby="backup-title"><h3 id="backup-title">备份与恢复</h3><p>导出包含全部本地数据的 JSON 备份，或先预览再覆盖恢复。</p><div className="page-actions"><Button onClick={exportCurrent}>导出完整备份</Button><label className="button button-secondary" htmlFor="backup-file">选择备份文件</label><input accept="application/json,.json" aria-label="选择备份文件" id="backup-file" hidden type="file" onChange={selectFile} /></div>{error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}<ConfirmDialog cancelDisabled={restoring} confirmDisabled={restoring} confirmLabel="确认覆盖当前数据" onClose={() => setPreview(null)} onConfirm={confirmRestore} open={preview !== null} title="恢复备份预览"><p>确认后将先下载当前完整备份，再以单个事务覆盖全部表。</p>{preview && <table className="responsive-table"><caption>备份表记录统计</caption><thead><tr><th>数据表</th><th>记录数</th></tr></thead><tbody>{backupTableNames.map((name) => <tr key={name}><td>{tableLabels[name]}</td><td>{preview.tables[name].length}</td></tr>)}</tbody></table>}</ConfirmDialog></section>;
}
