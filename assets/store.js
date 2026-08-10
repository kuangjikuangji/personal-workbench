/* ============ 持久化适配层：localStorage（默认） / Supabase（云端） ============
 * 设计：应用始终操作内存中的 state 对象；Store 负责把该对象持久化。
 * - 本地模式：直接写 localStorage。
 * - 云端模式：整份 state 以 jsonb 存入 Supabase 单行（id = 同步标识），实现跨端共享。
 *   采用「最后写入覆盖」策略，适合单人单账号的个人信息工作台。
 */
const Store = (function () {
  const LS_KEY = 'workbench_state_v2';   // 本地备份键
  const CFG_KEY = 'workbench_sync_cfg';  // 云端配置键

  let cfg = { mode: 'local', url: '', key: '', syncId: 'default' };
  let state = null;
  let remoteExists = false;              // 云端行是否已存在（决定 PATCH/POST）
  let lastError = '';
  let saving = false, pending = false;
  let hooks = {};

  function loadCfg() {
    try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) {}
  }
  function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

  function enc(s) { return encodeURIComponent(s); }

  async function init() {
    loadCfg();
    if (cfg.mode === 'supabase' && cfg.url && cfg.key) {
      try {
        const data = await fetchState();
        remoteExists = !!data;
        state = data || DB.defaults();
        return { ok: true, mode: 'supabase', connected: !!data || true };
      } catch (e) {
        // 云端不可用 → 回退本地，保证应用可用
        lastError = e.message || String(e);
        console.warn('[Store] Supabase 读取失败，回退本地：', lastError);
        state = loadLocal() || DB.defaults();
        return { ok: false, mode: 'local', err: lastError };
      }
    }
    state = loadLocal() || DB.defaults();
    return { ok: true, mode: 'local' };
  }

  function loadLocal() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  async function fetchState() {
    const r = await fetch(`${cfg.url}/rest/v1/workbench_state?id=eq.${enc(cfg.syncId)}`, {
      headers: { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key, 'Accept': 'application/json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const arr = await r.json();
    if (Array.isArray(arr) && arr.length) return arr[0].data;
    return null;
  }

  // 持久化（防抖 + 串行）
  function save() {
    if (saving) { pending = true; return; }
    saving = true;
    Promise.resolve(persist())
      .catch(e => { lastError = e.message || String(e); console.error('[Store] 保存失败：', lastError); })
      .finally(() => {
        saving = false;
        if (pending) { pending = false; save(); }
      });
  }

  async function persist() {
    if (cfg.mode !== 'supabase') {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      return;
    }
    if (!state) return;
    const body = { data: state, updated_at: new Date().toISOString() };
    if (remoteExists) {
      const r = await fetch(`${cfg.url}/rest/v1/workbench_state?id=eq.${enc(cfg.syncId)}`, {
        method: 'PATCH',
        headers: { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('PATCH HTTP ' + r.status);
    } else {
      const r = await fetch(`${cfg.url}/rest/v1/workbench_state`, {
        method: 'POST',
        headers: { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(Object.assign({ id: cfg.syncId }, body))
      });
      if (r.ok) remoteExists = true; else throw new Error('POST HTTP ' + r.status);
    }
  }

  function get() { return state; }
  function set(s) { state = s; save(); }

  async function testConnection() {
    if (!cfg.url || !cfg.key) return { ok: false, err: '请先填写 URL 与 Key' };
    try { await fetchState(); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message || String(e) }; }
  }

  // 用临时参数测试连接（不修改已保存配置）
  async function testWith(url, key, syncId) {
    const u = (url || '').trim().replace(/\/$/, '');
    const k = (key || '').trim();
    const id = (syncId || 'default').trim();
    if (!u || !k) return { ok: false, err: '请先填写 URL 与 Key' };
    try {
      const r = await fetch(`${u}/rest/v1/workbench_state?id=eq.${encodeURIComponent(id)}`, {
        headers: { 'apikey': k, 'Authorization': 'Bearer ' + k, 'Accept': 'application/json' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { ok: true };
    } catch (e) { return { ok: false, err: e.message || String(e) }; }
  }

  // 启用云端：测试连接 → 若云端为空则把当前本地数据推上去
  async function enableSupabase(url, key, syncId) {
    cfg = { mode: 'supabase', url: url.trim().replace(/\/$/, ''), key: key.trim(), syncId: (syncId || 'default').trim() };
    const t = await testConnection();
    if (!t.ok) { cfg.mode = 'local'; saveCfg(); return { ok: false, err: t.err }; }
    const remote = await fetchState();
    remoteExists = !!remote;
    if (!remote) {
      // 云端无数据：把当前（本地）state 推上去
      remoteExists = false;
      state = state || loadLocal() || DB.defaults();
      await persist();
      remoteExists = true;
    } else {
      state = remote; // 云端已有数据，直接采用
    }
    saveCfg();
    return { ok: true, mode: 'supabase', pulled: !!remote };
  }

  function disableSupabase() {
    cfg.mode = 'local';
    saveCfg();
    return { ok: true, mode: 'local' };
  }

  function status() {
    return { mode: cfg.mode, url: cfg.url, syncId: cfg.syncId, connected: cfg.mode === 'supabase', err: lastError };
  }

  function setHooks(h) { hooks = h || {}; }

  return {
    init, get, set, save, testConnection, testWith, enableSupabase, disableSupabase,
    status, setHooks, CFG_KEY
  };
})();
