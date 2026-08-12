import { useEffect, useId, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

class DirtyFormRegistry {
  private readonly ids = new Set<string>();
  register(id: string) { this.ids.add(id); return () => { this.ids.delete(id); }; }
  clear(id?: string) { if (id) this.ids.delete(id); else this.ids.clear(); }
  get hasDirtyForms() { return this.ids.size > 0; }
}

export const dirtyForms = new DirtyFormRegistry();

export function useDirtyForm(isDirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (!isDirty) return;
    return dirtyForms.register(id);
  }, [id, isDirty]);
}

export function usePwaUpdate() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  const [blockedMessage, setBlockedMessage] = useState('');
  const updateNow = async () => {
    if (dirtyForms.hasDirtyForms) {
      setBlockedMessage('当前有未保存表单，请先保存或关闭表单后再更新。');
      return;
    }
    setBlockedMessage('');
    await updateServiceWorker(true);
  };
  return { needRefresh, blockedMessage, later: () => setNeedRefresh(false), updateNow };
}
