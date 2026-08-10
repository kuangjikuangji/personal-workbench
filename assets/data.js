/* ============ 数据层：基于 Store 适配层（localStorage / Supabase） ============ */
const DB = (function () {
  let state = null;

  function uid() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaults() {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const students = [
      { id: uid(), name: '学生A', role: '科研助理', track: '创新管理', grade: '2024级硕士', contact: '', notes: '' },
      { id: uid(), name: '学生B', role: '行政助理', track: '组织行为', grade: '2024级硕士', contact: '', notes: '' },
      { id: uid(), name: '学生C', role: '科研助理', track: '战略管理', grade: '2023级硕士', contact: '', notes: '' },
      { id: uid(), name: '学生D', role: '值日', track: '运营管理', grade: '2023级硕士', contact: '', notes: '' },
      { id: uid(), name: '学生E', role: '科研助理', track: '市场营销', grade: '2025级硕士', contact: '', notes: '' },
      { id: uid(), name: '学生F', role: '行政助理', track: '人力资源管理', grade: '2022级硕士', contact: '', notes: '' }
    ];
    const exampleAct = { id: uid(), name: '示例：开学第一次组会', date: iso, type: '组会汇报' };
    const perfs = students.map(st => ({ id: uid(), studentId: st.id, activityId: exampleAct.id, score: 85, note: '积极发言，进展顺利' }));
    return {
      todos: [
        { id: uid(), title: '示例：审批学院会议纪要', content: '院长助理示例待办，可删除', role: 'dean', date: iso, time: '09:30', endTime: '10:00', remind: true, done: false },
        { id: uid(), title: '示例：核对本学期排课', content: '系主任示例待办', role: 'head', date: iso, time: '14:00', endTime: '15:00', remind: true, done: false }
      ],
      teachers: [],
      teacherRoster: ['张明', '李华', '王芳', '陈强', '赵丽', '刘伟', '孙静', '周涛'],
      mentorships: [],
      research: [],
      ideas: [],
      lessons: [],
      students,
      studentActivities: [exampleAct],
      studentPerformances: perfs,
      courses: []
    };
  }

  function use(s) { state = s; }
  function get() { return state; }
  function save() { if (typeof Store !== 'undefined' && Store) Store.save(); }

  // 与默认结构对齐：缺字段则补，避免旧数据缺集合
  function ensure() {
    const d = defaults();
    for (const k in d) if (!(k in state)) state[k] = d[k];
  }
  // 整体替换（导入备份 / 重置）
  function replace(data) {
    const merged = Object.assign(defaults(), data || {});
    state = merged;
    if (typeof Store !== 'undefined' && Store) Store.set(merged);
    return merged;
  }
  function reset() {
    state = defaults();
    if (typeof Store !== 'undefined' && Store) Store.set(state);
    else save();
  }

  /* ---------- 通用增删改 ---------- */
  function add(collection, obj) {
    obj.id = obj.id || uid();
    state[collection].push(obj);
    save();
    return obj;
  }
  function update(collection, id, patch) {
    const item = state[collection].find(x => x.id === id);
    if (item) { Object.assign(item, patch); save(); }
    return item;
  }
  function remove(collection, id) {
    state[collection] = state[collection].filter(x => x.id !== id);
    save();
  }
  function removeMany(collection, ids) {
    const set = new Set(ids);
    state[collection] = state[collection].filter(x => !set.has(x.id));
    save();
  }
  function find(collection, id) {
    return state[collection].find(x => x.id === id);
  }

  /* ---------- 待办：时间冲突检测 ---------- */
  function timeToMin(t) {
    if (!t) return null;
    const p = t.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10);
  }
  function findConflicts(todo) {
    if (!todo.date || !todo.time) return [];
    const s = timeToMin(todo.time);
    const e = todo.endTime ? timeToMin(todo.endTime) : (s + 30);
    return state.todos.filter(t => {
      if (t.id === todo.id || t.done) return false;
      if (t.date !== todo.date || !t.time) return false;
      const ts = timeToMin(t.time);
      const te = t.endTime ? timeToMin(t.endTime) : (ts + 30);
      return s < te && ts < e;
    });
  }

  /* ---------- 系室：按年度 + 教师名汇总 ---------- */
  function teacherRecord(name, year) {
    return state.teachers.find(t => t.name === name && String(t.year) === String(year));
  }
  function fillMissingTeachers(year) {
    let added = 0;
    state.teacherRoster.forEach(name => {
      if (!teacherRecord(name, year)) {
        state.teachers.push({
          id: uid(), name, year: String(year),
          work: '', meeting: 'pending', materials: '', publicService: ''
        });
        added++;
      }
    });
    save();
    return added;
  }

  return {
    uid, defaults, use, get, save, ensure, replace, reset,
    add, update, remove, removeMany, find,
    findConflicts, timeToMin,
    teacherRecord, fillMissingTeachers
  };
})();

/* 角色元数据 */
const ROLES = {
  dean:    { key: 'dean',    label: '院长助理', cls: 'dean',    pill: 'pill-dean' },
  head:    { key: 'head',    label: '系主任',   cls: 'head',    pill: 'pill-head' },
  personal:{ key: 'personal',label: '个人待办', cls: 'personal',pill: 'pill-personal' }
};
function roleMeta(r) { return ROLES[r] || ROLES.personal; }
