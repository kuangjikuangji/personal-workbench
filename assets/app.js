/* ============ 主程序：视图路由 / 弹窗 / 提醒 ============ */
(function () {
  const content = document.getElementById('content');
  const viewTitle = document.getElementById('viewTitle');
  let view = 'dashboard';
  const now = new Date();
  let calYear = now.getFullYear();
  let calMonth = now.getMonth();
  const notified = new Set();

  const TITLES = {
    dashboard: '概览', todos: '待办管理', calendar: '日历', teachers: '系室管理',
    research: '个人科研', ideas: '灵感记录', lessons: '教学备课',
    students: '学生管理', courses: '课表', settings: '设置 / 同步'
  };

  /* ---------- 工具 ---------- */
  function toast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function openModal(title, bodyHtml, footHtml, onMount) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFoot').innerHTML = footHtml || '';
    document.getElementById('modalMask').hidden = false;
    if (onMount) onMount(document.getElementById('modalBody'), document.getElementById('modalFoot'));
  }
  function closeModal() { document.getElementById('modalMask').hidden = true; }
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalMask').onclick = (e) => { if (e.target.id === 'modalMask') closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function rolePill(r) { const m = roleMeta(r); return '<span class="pill ' + m.pill + '">' + m.label + '</span>'; }
  function fmtDate(d) { return d ? d : '—'; }

  /* ---------- 导航 ---------- */
  document.getElementById('nav').addEventListener('click', e => {
    const b = e.target.closest('.nav-item'); if (!b) return;
    view = b.dataset.view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n === b));
    document.getElementById('sidebar').classList.remove('open');
    render();
  });
  document.getElementById('hamburger').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('todayBtn').onclick = () => {
    const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth();
    if (view === 'calendar') render(); else { view = 'calendar'; render(); }
  };

  /* ---------- 渲染入口 ---------- */
  function render() {
    viewTitle.textContent = TITLES[view] || '工作台';
    if (view === 'dashboard') renderDashboard();
    else if (view === 'todos') renderTodos();
    else if (view === 'calendar') renderCalendarView();
    else if (view === 'teachers') renderTeachers();
    else if (view === 'research') renderResearch();
    else if (view === 'ideas') renderIdeas();
    else if (view === 'lessons') renderLessons();
    else if (view === 'students') renderStudents();
    else if (view === 'courses') renderCourses();
    else if (view === 'settings') renderSettings();
  }

  /* ============ 概览 ============ */
  function renderDashboard() {
    const s = DB.get();
    const todayIso = isoToday();
    const todoToday = s.todos.filter(t => t.date === todayIso && !t.done);
    const overdue = s.todos.filter(t => !t.done && t.date && t.date < todayIso);
    const byRole = k => s.todos.filter(t => t.role === k && !t.done).length;
    const html = `
      <div class="stat-row">
        <div class="stat"><div class="num">${todoToday.length}</div><div class="lbl">今日待办</div><div class="bar"><i style="width:${Math.min(100,todoToday.length*12)}%"></i></div></div>
        <div class="stat"><div class="num" style="color:var(--danger)">${overdue.length}</div><div class="lbl">逾期未完成</div><div class="bar"><i style="width:${Math.min(100,overdue.length*15)}%;background:var(--danger)"></i></div></div>
        <div class="stat"><div class="num" style="color:var(--dean)">${byRole('dean')}</div><div class="lbl">院长助理待办</div></div>
        <div class="stat"><div class="num" style="color:var(--head)">${byRole('head')}</div><div class="lbl">系主任待办</div></div>
      </div>
      <div class="grid" style="grid-template-columns:1.3fr 1fr">
        <div class="card">
          <div class="section-head"><h2>今日待办</h2><button class="btn btn-sm btn-primary" onclick="App.go('todos')">管理</button></div>
          <div class="list">${todoToday.length ? todoToday.map(todoRow).join('') : '<div class="empty">今天没有待办 🎉</div>'}</div>
        </div>
        <div class="card">
          <div class="section-head"><h2>快捷入口</h2></div>
          <div class="list">
            <button class="row" style="text-align:left" onclick="App.go('teachers')"><div class="row-main"><div class="row-title">系室管理</div><div class="muted">教师年度工作 / 例会 / 材料汇总</div></div></button>
            <button class="row" style="text-align:left" onclick="App.go('students')"><div class="row-main"><div class="row-title">学生管理</div><div class="muted">团队学生日常表现</div></div></button>
            <button class="row" style="text-align:left" onclick="App.go('research')"><div class="row-main"><div class="row-title">个人科研</div><div class="muted">文献与方法记录</div></div></button>
            <button class="row" style="text-align:left" onclick="App.go('courses')"><div class="row-main"><div class="row-title">课表</div><div class="muted">录入每学期课程</div></div></button>
          </div>
        </div>
      </div>`;
    content.innerHTML = html;
  }

  /* ============ 待办 ============ */
  let todoFilter = 'all';
  function renderTodos() {
    const s = DB.get();
    let list = s.todos.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
    if (todoFilter !== 'all') list = list.filter(t => t.role === todoFilter);
    const chips = [['all', '全部'], ['dean', '院长助理'], ['head', '系主任'], ['personal', '个人待办']];
    const html = `
      <div class="filters">
        ${chips.map(c => `<button class="chip ${todoFilter === c[0] ? 'active' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}
        <input class="search" id="todoSearch" placeholder="搜索待办…" />
        <button class="btn btn-sm" id="wxImport">📥 微信对话导入</button>
        <button class="btn btn-sm btn-primary" id="addTodo">+ 新建待办</button>
      </div>
      <div class="list">
        ${list.length ? list.map(todoRow).join('') : '<div class="empty">暂无待办，点击右上角新建</div>'}
      </div>`;
    content.innerHTML = html;
    content.querySelectorAll('.chip').forEach(c => c.onclick = () => { todoFilter = c.dataset.f; renderTodos(); });
    content.querySelector('#addTodo').onclick = () => openTodoModal(null);
    content.querySelector('#wxImport').onclick = openWeChatImport;
    content.querySelector('#todoSearch').oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      content.querySelectorAll('.row').forEach(r => {
        const txt = r.textContent.toLowerCase();
        r.style.display = !q || txt.includes(q) ? '' : 'none';
      });
    };
  }
  function todoRow(t) {
    const m = roleMeta(t.role);
    return `<div class="row ${t.done ? 'done' : ''}">
      <div class="check ${t.done ? 'on' : ''}" data-done="${t.id}">${t.done ? '✓' : ''}</div>
      <div class="row-main">
        <div class="row-title">${escapeHtml(t.title)}</div>
        <div class="row-meta">
          ${rolePill(t.role)}
          <span>📅 ${fmtDate(t.date)}${t.time ? ' ' + t.time + (t.endTime ? '-' + t.endTime : '') : ''}</span>
          ${t.remind ? '<span>🔔 提醒</span>' : ''}
          ${t.content ? '<span>📝 ' + escapeHtml(t.content.slice(0, 30)) + '</span>' : ''}
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn-sm" data-edit="${t.id}">编辑</button>
        <button class="btn btn-sm btn-danger" data-del="${t.id}">删</button>
      </div>
    </div>`;
  }
  content.addEventListener('click', e => {
    if (view !== 'todos') return;
    const done = e.target.closest('[data-done]');
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (done) { const t = DB.find('todos', done.dataset.done); DB.update('todos', t.id, { done: !t.done }); renderTodos(); checkReminders(); }
    if (edit) { openTodoModal(DB.find('todos', edit.dataset.edit)); }
    if (del) { if (confirm('确定删除该待办？')) { DB.remove('todos', del.dataset.del); renderTodos(); } }
  });

  function openTodoModal(todo) {
    const t = todo || { title: '', content: '', role: 'dean', date: isoToday(), time: '', endTime: '', remind: true };
    const body = `
      <div class="field"><label>标题 *</label><input id="f_title" value="${escapeHtml(t.title)}" placeholder="待办标题" /></div>
      <div class="field"><label>内容 / 备注</label><textarea id="f_content" placeholder="补充说明">${escapeHtml(t.content || '')}</textarea></div>
      <div class="field"><label>归属角色</label>
        <div class="roles-pick">
          <label class="dean"><input type="radio" name="role" value="dean" ${t.role === 'dean' ? 'checked' : ''}/>院长助理</label>
          <label class="head"><input type="radio" name="role" value="head" ${t.role === 'head' ? 'checked' : ''}/>系主任</label>
          <label class="personal"><input type="radio" name="role" value="personal" ${t.role === 'personal' ? 'checked' : ''}/>个人待办</label>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>日期</label><input type="date" id="f_date" value="${t.date || ''}" /></div>
        <div class="field"><label>开始时间</label><input type="time" id="f_time" value="${t.time || ''}" /></div>
        <div class="field"><label>结束时间</label><input type="time" id="f_end" value="${t.endTime || ''}" /></div>
      </div>
      <div class="field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="f_remind" ${t.remind ? 'checked' : ''} style="width:auto"/> 开启提醒（页面打开时弹窗通知）</label></div>`;
    openModal(todo ? '编辑待办' : '新建待办', body,
      '<button class="btn" id="mCancel">取消</button><button class="btn btn-primary" id="mSave">保存</button>',
      () => {
        document.getElementById('mCancel').onclick = closeModal;
        document.getElementById('mSave').onclick = () => {
          const obj = {
            title: document.getElementById('f_title').value.trim(),
            content: document.getElementById('f_content').value.trim(),
            role: document.querySelector('input[name=role]:checked').value,
            date: document.getElementById('f_date').value,
            time: document.getElementById('f_time').value,
            endTime: document.getElementById('f_end').value,
            remind: document.getElementById('f_remind').checked
          };
          if (!obj.title) { toast('请填写标题', 'warn'); return; }
          const candidate = Object.assign({}, t.id ? { id: t.id } : {}, obj);
          const conflicts = DB.findConflicts(candidate);
          if (conflicts.length) {
            const names = conflicts.map(c => (c.time ? c.time + ' ' : '') + c.title).join('；');
            if (!confirm('⚠️ 时间冲突：与以下待办重叠：\n' + names + '\n\n仍要保存？')) return;
          }
          if (todo) DB.update('todos', todo.id, obj);
          else DB.add('todos', obj);
          closeModal(); renderTodos(); if (view === 'dashboard') renderDashboard(); checkReminders();
          toast('已保存', 'ok');
        };
      });
  }

  function openWeChatImport() {
    const body = `
      <p class="muted">粘贴微信对话文本，系统将自动识别日期、时间、角色（@院长助理 / @系主任 / @个人）并生成待办。<br>
      示例：<br><code>3月5日 9:30 提交学院预算表 @院长助理</code><br><code>周五 14:00 系务会 @系主任</code></p>
      <div class="field"><textarea id="wxText" style="min-height:140px" placeholder="在此粘贴对话…"></textarea></div>
      <div id="wxPreview"></div>`;
    openModal('微信对话智能导入', body,
      '<button class="btn" id="wxCancel">关闭</button><button class="btn btn-primary" id="wxParse">解析</button><button class="btn btn-primary" id="wxImport2" style="display:none">导入选中</button>',
      () => {
        document.getElementById('wxCancel').onclick = closeModal;
        document.getElementById('wxParse').onclick = () => {
          const text = document.getElementById('wxText').value;
          const items = Exp.parseWeChatText(text);
          if (!items.length) { toast('未识别到待办', 'warn'); return; }
          const prev = document.getElementById('wxPreview');
          prev.innerHTML = '<div class="muted" style="margin:8px 0">识别到 ' + items.length + ' 条，勾选后导入：</div>'
            + items.map((it, i) => `<label class="row" style="cursor:pointer">
                <input type="checkbox" class="wxchk" data-i="${i}" checked style="width:auto;margin-top:4px"/>
                <div class="row-main"><div class="row-title">${escapeHtml(it.title)}</div>
                <div class="row-meta">${rolePill(it.role)} <span>📅 ${it.date} ${it.time || ''}</span></div></div></label>`).join('');
          document.getElementById('wxImport2').style.display = '';
          window._wxItems = items;
        };
        document.getElementById('wxImport2').onclick = () => {
          const items = window._wxItems || [];
          const sel = [...document.querySelectorAll('.wxchk:checked')].map(c => items[+c.dataset.i]);
          if (!sel.length) { toast('请勾选要导入的待办', 'warn'); return; }
          sel.forEach(it => DB.add('todos', it));
          closeModal(); renderTodos(); toast('已导入 ' + sel.length + ' 条', 'ok');
        };
      });
  }

  /* ============ 日历 ============ */
  function renderCalendarView() {
    renderCalendar(content, calYear, calMonth, {
      onNav: (y, m) => { const d = new Date(y, m, 1); calYear = d.getFullYear(); calMonth = d.getMonth(); renderCalendarView(); },
      onCell: (date) => openTodoModal({ title: '', content: '', role: 'dean', date, time: '', endTime: '', remind: true }),
      onAdd: () => openTodoModal(null),
      onTodo: (id) => openTodoModal(DB.find('todos', id))
    });
  }

  /* ============ 系室管理 ============ */
  let teachYear = now.getFullYear();
  let teachSel = new Set();
  function renderTeachers() {
    const s = DB.get();
    const recs = s.teachers.filter(t => String(t.year) === String(teachYear));
    const html = `
      <div class="filters">
        <label class="muted">年度</label>
        <input class="search" id="tyInput" type="number" value="${teachYear}" style="max-width:110px"/>
        <button class="btn btn-sm" id="tyGo">查看</button>
        <button class="btn btn-sm btn-primary" id="fillMissing">⚡ 一键补全未填报老师</button>
        <button class="btn btn-sm" id="expXls">导出 Excel</button>
        <button class="btn btn-sm" id="expCsv">导出 CSV</button>
        <button class="btn btn-sm" id="addTeach">+ 添加记录</button>
      </div>
      <div id="batchbar"></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="selAll" style="width:auto"/></th>
            <th>姓名</th><th>年度</th><th>主要工作</th><th>例会</th><th>教学材料</th><th>公共服务</th><th></th>
          </tr></thead>
          <tbody>
            ${recs.length ? recs.map(trRow).join('') : '<tr><td colspan="8" class="empty">该年度暂无记录，点击「一键补全」或「添加记录」</td></tr>'}
          </tbody>
        </table>
      </div>`;
    content.innerHTML = html;
    teachSel.clear();
    content.querySelector('#tyGo').onclick = () => { teachYear = +content.querySelector('#tyInput').value || teachYear; renderTeachers(); };
    content.querySelector('#fillMissing').onclick = () => {
      const n = DB.fillMissingTeachers(teachYear);
      toast(n ? '已补全 ' + n + ' 位老师' : '无需补全，全部已填报', n ? 'ok' : '');
      renderTeachers();
    };
    content.querySelector('#addTeach').onclick = () => openTeacherModal(null);
    content.querySelector('#expXls').onclick = () => exportTeachers('xls');
    content.querySelector('#expCsv').onclick = () => exportTeachers('csv');
    content.querySelector('#selAll').onchange = (e) => {
      teachSel.clear();
      if (e.target.checked) recs.forEach(r => teachSel.add(r.id));
      content.querySelectorAll('.trow').forEach(r => r.classList.toggle('sel', e.target.checked));
      content.querySelectorAll('.tchk').forEach(c => c.checked = e.target.checked);
      renderBatchBar();
    };
    content.querySelectorAll('.tchk').forEach(c => c.onchange = () => {
      const id = c.dataset.id;
      if (c.checked) teachSel.add(id); else teachSel.delete(id);
      c.closest('.trow').classList.toggle('sel', c.checked);
      renderBatchBar();
    });
    content.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTeacherModal(DB.find('teachers', b.dataset.edit)));
    content.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('删除该教师记录？')) { DB.remove('teachers', b.dataset.del); renderTeachers(); } });
    content.querySelectorAll('.meet-sel').forEach(sel => sel.onchange = () => { DB.update('teachers', sel.dataset.id, { meeting: sel.value }); renderBatchBar(); });
    content.querySelectorAll('.tin').forEach(inp => inp.onchange = () => { DB.update('teachers', inp.dataset.id, JSON.parse('{"' + inp.dataset.f + '":' + JSON.stringify(inp.value) + '}')); });
    renderBatchBar();
  }
  function trRow(t) {
    const stMap = { attended: ['参会', 'st-attended'], absent: ['缺席', 'st-absent'], leave: ['请假', 'st-leave'], pending: ['未填', ''] };
    const st = stMap[t.meeting] || stMap.pending;
    return `<tr class="trow" data-id="${t.id}">
      <td><input type="checkbox" class="tchk" data-id="${t.id}" style="width:auto"/></td>
      <td><b>${escapeHtml(t.name)}</b></td>
      <td>${escapeHtml(t.year)}</td>
      <td><input class="tbl-input tin" data-id="${t.id}" data-f="work" value="${escapeHtml(t.work || '')}" placeholder="年度主要工作"/></td>
      <td><select class="tbl-input meet-sel" data-id="${t.id}">
        ${['attended', 'absent', 'leave', 'pending'].map(k => `<option value="${k}" ${t.meeting === k ? 'selected' : ''}>${stMap[k][0]}</option>`).join('')}
      </select></td>
      <td><input class="tbl-input tin" data-id="${t.id}" data-f="materials" value="${escapeHtml(t.materials || '')}" placeholder="提交材料"/></td>
      <td><input class="tbl-input tin" data-id="${t.id}" data-f="publicService" value="${escapeHtml(t.publicService || '')}" placeholder="公共服务"/></td>
      <td><button class="btn btn-sm" data-edit="${t.id}">编辑</button> <button class="btn btn-sm btn-danger" data-del="${t.id}">删</button></td>
    </tr>`;
  }
  function renderBatchBar() {
    const bar = content.querySelector('#batchbar');
    if (!bar) return;
    if (!teachSel.size) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<div class="batchbar">
      <span class="count">已选 ${teachSel.size} 人</span>
      <button class="btn btn-sm" id="bAtt">批量参会</button>
      <button class="btn btn-sm" id="bAbs">批量缺席</button>
      <button class="btn btn-sm" id="bLeave">批量请假</button>
      <button class="btn btn-sm" id="bMat">批量加材料</button>
      <button class="btn btn-sm btn-danger" id="bDel">删除选中</button>
    </div>`;
    bar.querySelector('#bAtt').onclick = () => batchUpdate({ meeting: 'attended' });
    bar.querySelector('#bAbs').onclick = () => batchUpdate({ meeting: 'absent' });
    bar.querySelector('#bLeave').onclick = () => batchUpdate({ meeting: 'leave' });
    bar.querySelector('#bMat').onclick = () => {
      const txt = prompt('输入要追加的材料说明：'); if (txt == null) return;
      teachSel.forEach(id => { const r = DB.find('teachers', id); DB.update('teachers', id, { materials: (r.materials ? r.materials + '；' : '') + txt }); });
      toast('已批量添加材料', 'ok'); renderTeachers();
    };
    bar.querySelector('#bDel').onclick = () => { if (confirm('删除选中的 ' + teachSel.size + ' 条记录？')) { DB.removeMany('teachers', [...teachSel]); renderTeachers(); } };
  }
  function batchUpdate(patch) { teachSel.forEach(id => DB.update('teachers', id, patch)); toast('已更新 ' + teachSel.size + ' 人', 'ok'); renderTeachers(); }
  function exportTeachers(type) {
    const recs = DB.get().teachers.filter(t => String(t.year) === String(teachYear));
    const headers = [
      { key: 'name', label: '姓名' }, { key: 'year', label: '年度' },
      { key: 'work', label: '主要工作' }, { key: 'meeting', label: '例会' },
      { key: 'materials', label: '教学材料' }, { key: 'publicService', label: '公共服务' }
    ];
    const map = { attended: '参会', absent: '缺席', leave: '请假', pending: '未填' };
    const rows = recs.map(t => Object.assign({}, t, { meeting: map[t.meeting] || '未填' }));
    const fn = '系室管理_' + teachYear;
    if (type === 'xls') Exp.exportXLS(fn + '.xls', headers, rows); else Exp.exportCSV(fn + '.csv', headers, rows);
    toast('已导出 ' + fn, 'ok');
  }
  function openTeacherModal(t) {
    const obj = t || { name: '', year: String(teachYear), work: '', meeting: 'pending', materials: '', publicService: '' };
    const body = `
      <div class="field-row">
        <div class="field"><label>姓名 *</label><input id="t_name" value="${escapeHtml(obj.name)}" placeholder="教师姓名"/></div>
        <div class="field"><label>年度</label><input id="t_year" value="${escapeHtml(obj.year)}" placeholder="如 2026"/></div>
      </div>
      <div class="field"><label>年度主要工作</label><textarea id="t_work">${escapeHtml(obj.work || '')}</textarea></div>
      <div class="field"><label>例会情况</label>
        <select id="t_meet" class="tbl-input">
          ${[['attended', '参会'], ['absent', '缺席'], ['leave', '请假'], ['pending', '未填']].map(o => `<option value="${o[0]}" ${obj.meeting === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}
        </select></div>
      <div class="field"><label>教学材料提交</label><textarea id="t_mat">${escapeHtml(obj.materials || '')}</textarea></div>
      <div class="field"><label>公共服务</label><textarea id="t_pub">${escapeHtml(obj.publicService || '')}</textarea></div>`;
    openModal(t ? '编辑教师记录' : '添加教师记录', body,
      '<button class="btn" id="tc">取消</button><button class="btn btn-primary" id="ts">保存</button>',
      () => {
        document.getElementById('tc').onclick = closeModal;
        document.getElementById('ts').onclick = () => {
          const name = document.getElementById('t_name').value.trim();
          if (!name) { toast('请填写姓名', 'warn'); return; }
          const data = {
            name, year: document.getElementById('t_year').value.trim() || String(teachYear),
            work: document.getElementById('t_work').value, meeting: document.getElementById('t_meet').value,
            materials: document.getElementById('t_mat').value, publicService: document.getElementById('t_pub').value
          };
          if (t) DB.update('teachers', t.id, data); else DB.add('teachers', data);
          teachYear = +data.year || teachYear; closeModal(); renderTeachers(); toast('已保存', 'ok');
        };
      });
  }

  /* ============ 个人科研 ============ */
  let resFilter = 'all';
  function renderResearch() {
    const s = DB.get();
    let list = s.research.slice().reverse();
    if (resFilter !== 'all') list = list.filter(r => r.type === resFilter);
    const html = `
      <div class="filters">
        <button class="chip ${resFilter === 'all' ? 'active' : ''}" data-r="all">全部</button>
        <button class="chip ${resFilter === 'literature' ? 'active' : ''}" data-r="literature">文献阅读</button>
        <button class="chip ${resFilter === 'method' ? 'active' : ''}" data-r="method">方法/笔记</button>
        <button class="btn btn-sm btn-primary" id="addRes" style="margin-left:auto">+ 新建</button>
      </div>
      <div class="list">${list.length ? list.map(resRow).join('') : '<div class="empty">暂无记录</div>'}</div>`;
    content.innerHTML = html;
    content.querySelectorAll('.chip').forEach(c => c.onclick = () => { resFilter = c.dataset.r; renderResearch(); });
    content.querySelector('#addRes').onclick = () => openResearchModal(null);
    content.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openResearchModal(DB.find('research', b.dataset.edit)));
    content.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('删除该记录？')) { DB.remove('research', b.dataset.del); renderResearch(); } });
  }
  function resRow(r) {
    return `<div class="row">
      <div class="row-main"><div class="row-title">${escapeHtml(r.title)} ${r.type === 'literature' ? '<span class="pill pill-head">文献</span>' : '<span class="pill pill-personal">方法</span>'}</div>
      <div class="row-meta"><span>📅 ${fmtDate(r.date)}</span>${r.link ? '<span>🔗 ' + escapeHtml(r.link) + '</span>' : ''}</div>
      ${r.note ? '<div class="muted" style="margin-top:6px">' + escapeHtml(r.note) + '</div>' : ''}</div>
      <div class="row-actions"><button class="btn btn-sm" data-edit="${r.id}">编辑</button><button class="btn btn-sm btn-danger" data-del="${r.id}">删</button></div>
    </div>`;
  }
  function openResearchModal(r) {
    const o = r || { title: '', type: 'literature', link: '', note: '', date: isoToday() };
    openModal(r ? '编辑记录' : '新建科研记录', `
      <div class="field"><label>标题 *</label><input id="r_title" value="${escapeHtml(o.title)}"/></div>
      <div class="field"><label>类型</label><select id="r_type" class="tbl-input"><option value="literature" ${o.type === 'literature' ? 'selected' : ''}>文献阅读</option><option value="method" ${o.type === 'method' ? 'selected' : ''}>方法/笔记</option></select></div>
      <div class="field"><label>日期</label><input type="date" id="r_date" value="${o.date || ''}"/></div>
      <div class="field"><label>链接</label><input id="r_link" value="${escapeHtml(o.link || '')}" placeholder="DOI / 网址"/></div>
      <div class="field"><label>笔记</label><textarea id="r_note">${escapeHtml(o.note || '')}</textarea></div>`,
      '<button class="btn" id="rc">取消</button><button class="btn btn-primary" id="rs">保存</button>',
      () => {
        document.getElementById('rc').onclick = closeModal;
        document.getElementById('rs').onclick = () => {
          const title = document.getElementById('r_title').value.trim();
          if (!title) { toast('请填写标题', 'warn'); return; }
          const data = { title, type: document.getElementById('r_type').value, date: document.getElementById('r_date').value, link: document.getElementById('r_link').value.trim(), note: document.getElementById('r_note').value };
          if (r) DB.update('research', r.id, data); else DB.add('research', data);
          closeModal(); renderResearch(); toast('已保存', 'ok');
        };
      });
  }

  /* ============ 灵感记录 ============ */
  function renderIdeas() {
    const s = DB.get();
    const list = s.ideas.slice().reverse();
    content.innerHTML = `
      <div class="field"><textarea id="ideaInput" placeholder="随时记录一个灵感…（回车或点击添加）"></textarea>
      <button class="btn btn-sm btn-primary" id="addIdea" style="margin-top:8px">+ 添加灵感</button></div>
      <div class="list">${list.length ? list.map(i => `<div class="row">
        <div class="row-main"><div class="row-title">${escapeHtml(i.text)}</div><div class="row-meta"><span>📅 ${fmtDate(i.date)}</span></div></div>
        <div class="row-actions"><button class="btn btn-sm btn-danger" data-del="${i.id}">删</button></div></div>`).join('') : '<div class="empty">还没有灵感，记下第一个吧 ✨</div>'}</div>`;
    const add = () => { const v = content.querySelector('#ideaInput').value.trim(); if (!v) return; DB.add('ideas', { text: v, date: isoToday() }); renderIdeas(); };
    content.querySelector('#addIdea').onclick = add;
    content.querySelector('#ideaInput').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); };
    content.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { DB.remove('ideas', b.dataset.del); renderIdeas(); });
  }

  /* ============ 教学备课 ============ */
  function renderLessons() {
    const s = DB.get();
    const list = s.lessons.slice().reverse();
    content.innerHTML = `
      <div class="filters"><button class="btn btn-sm btn-primary" id="addL" style="margin-left:auto">+ 新建备课</button></div>
      <div class="list">${list.length ? list.map(l => `<div class="row">
        <div class="row-main"><div class="row-title">${escapeHtml(l.topic)} <span class="pill pill-dean">${escapeHtml(l.course || '未命名课程')}</span></div>
        <div class="row-meta"><span>📅 ${fmtDate(l.date)}</span></div>
        ${l.content ? '<div class="muted" style="margin-top:6px;white-space:pre-wrap">' + escapeHtml(l.content) + '</div>' : ''}</div>
        <div class="row-actions"><button class="btn btn-sm" data-edit="${l.id}">编辑</button><button class="btn btn-sm btn-danger" data-del="${l.id}">删</button></div></div>`).join('') : '<div class="empty">暂无备课内容</div>'}</div>`;
    content.querySelector('#addL').onclick = () => openLessonModal(null);
    content.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openLessonModal(DB.find('lessons', b.dataset.edit)));
    content.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('删除该备课？')) { DB.remove('lessons', b.dataset.del); renderLessons(); } });
  }
  function openLessonModal(l) {
    const o = l || { course: '', topic: '', content: '', date: isoToday() };
    openModal(l ? '编辑备课' : '新建备课', `
      <div class="field-row"><div class="field"><label>课程</label><input id="l_course" value="${escapeHtml(o.course)}" placeholder="如 管理学原理"/></div>
      <div class="field"><label>课题 *</label><input id="l_topic" value="${escapeHtml(o.topic)}"/></div></div>
      <div class="field"><label>日期</label><input type="date" id="l_date" value="${o.date || ''}"/></div>
      <div class="field"><label>内容规划</label><textarea id="l_content" style="min-height:120px">${escapeHtml(o.content || '')}</textarea></div>`,
      '<button class="btn" id="lc">取消</button><button class="btn btn-primary" id="ls">保存</button>',
      () => {
        document.getElementById('lc').onclick = closeModal;
        document.getElementById('ls').onclick = () => {
          const topic = document.getElementById('l_topic').value.trim();
          if (!topic) { toast('请填写课题', 'warn'); return; }
          const data = { course: document.getElementById('l_course').value.trim(), topic, content: document.getElementById('l_content').value, date: document.getElementById('l_date').value };
          if (l) DB.update('lessons', l.id, data); else DB.add('lessons', data);
          closeModal(); renderLessons(); toast('已保存', 'ok');
        };
      });
  }

  /* ============ 学生管理 ============ */
  function renderStudents() {
    const s = DB.get();
    content.innerHTML = `
      <div class="filters">
        <span class="muted">团队学生日常表现管理（共 ${s.students.length} 人）</span>
        <button class="btn btn-sm" id="sXls" style="margin-left:auto">导出 Excel</button>
        <button class="btn btn-sm" id="sCsv">导出 CSV</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>姓名</th><th>分工/角色</th><th>到岗/组会出勤(%)</th><th>任务推进(%)</th><th>综合表现(%)</th><th>综合</th><th>备注</th></tr></thead>
        <tbody>${s.students.map(stRow).join('')}</tbody>
      </table></div>`;
    content.querySelectorAll('.sin').forEach(inp => inp.onchange = () => {
      const f = inp.dataset.f; let v = inp.value;
      if (['attendance', 'task', 'performance'].includes(f)) v = Math.max(0, Math.min(100, +v || 0));
      DB.update('students', inp.dataset.id, JSON.parse('{"' + f + '":' + JSON.stringify(v) + '}'));
    });
    content.querySelector('#sXls').onclick = () => exportStudents('xls');
    content.querySelector('#sCsv').onclick = () => exportStudents('csv');
  }
  function stRow(st) {
    const score = Math.round(((+st.attendance || 0) + (+st.task || 0) + (+st.performance || 0)) / 3);
    return `<tr><td><b>${escapeHtml(st.name)}</b></td>
      <td><input class="tbl-input sin" data-id="${st.id}" data-f="role" value="${escapeHtml(st.role || '')}" placeholder="如 科研助理"/></td>
      <td><input class="tbl-input sin" data-id="${st.id}" data-f="attendance" type="number" min="0" max="100" value="${st.attendance}"/></td>
      <td><input class="tbl-input sin" data-id="${st.id}" data-f="task" type="number" min="0" max="100" value="${st.task}"/></td>
      <td><input class="tbl-input sin" data-id="${st.id}" data-f="performance" type="number" min="0" max="100" value="${st.performance}"/></td>
      <td><b>${score}</b></td>
      <td><input class="tbl-input sin" data-id="${st.id}" data-f="notes" value="${escapeHtml(st.notes || '')}"/></td></tr>`;
  }
  function exportStudents(type) {
    const headers = [{ key: 'name', label: '姓名' }, { key: 'role', label: '分工/角色' }, { key: 'attendance', label: '到岗/组会出勤' }, { key: 'task', label: '任务推进' }, { key: 'performance', label: '综合表现' }, { key: 'notes', label: '备注' }];
    const rows = DB.get().students.map(st => Object.assign({}, st, { score: Math.round(((+st.attendance || 0) + (+st.task || 0) + (+st.performance || 0)) / 3) }));
    if (type === 'xls') Exp.exportXLS('团队学生表现汇总.xls', headers, rows); else Exp.exportCSV('团队学生表现汇总.csv', headers, rows);
    toast('已导出学生汇总', 'ok');
  }

  /* ============ 课表 ============ */
  function renderCourses() {
    const s = DB.get();
    const dows = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    content.innerHTML = `
      <div class="filters"><button class="btn btn-sm btn-primary" id="addC" style="margin-left:auto">+ 录入课程</button></div>
      <div class="list">${s.courses.length ? s.courses.map(c => `<div class="row">
        <div class="row-main"><div class="row-title">${escapeHtml(c.name)}</div>
        <div class="row-meta"><span>📅 ${dows[+c.dayOfWeek]}</span><span>🕒 ${c.start || ''}-${c.end || ''}</span>${c.location ? '<span>📍 ' + escapeHtml(c.location) + '</span>' : ''}${c.weeks ? '<span>周次 ' + escapeHtml(c.weeks) + '</span>' : ''}</div></div>
        <div class="row-actions"><button class="btn btn-sm" data-edit="${c.id}">编辑</button><button class="btn btn-sm btn-danger" data-del="${c.id}">删</button></div></div>`).join('') : '<div class="empty">未录入课程，录入后将在日历中显示</div>'}</div>`;
    content.querySelector('#addC').onclick = () => openCourseModal(null);
    content.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openCourseModal(DB.find('courses', b.dataset.edit)));
    content.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('删除该课程？')) { DB.remove('courses', b.dataset.del); renderCourses(); } });
  }
  function openCourseModal(c) {
    const o = c || { name: '', dayOfWeek: '1', start: '08:00', end: '09:40', location: '', weeks: '' };
    const dows = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    openModal(c ? '编辑课程' : '录入课程', `
      <div class="field"><label>课程名称 *</label><input id="c_name" value="${escapeHtml(o.name)}"/></div>
      <div class="field-row"><div class="field"><label>星期</label><select id="c_dow" class="tbl-input">${dows.map((d, i) => `<option value="${i}" ${+o.dayOfWeek === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="field"><label>开始</label><input type="time" id="c_start" value="${o.start}"/></div>
      <div class="field"><label>结束</label><input type="time" id="c_end" value="${o.end}"/></div></div>
      <div class="field-row"><div class="field"><label>地点</label><input id="c_loc" value="${escapeHtml(o.location)}"/></div>
      <div class="field"><label>周次</label><input id="c_weeks" value="${escapeHtml(o.weeks)}" placeholder="如 1-16"/></div></div>`,
      '<button class="btn" id="cc">取消</button><button class="btn btn-primary" id="cs">保存</button>',
      () => {
        document.getElementById('cc').onclick = closeModal;
        document.getElementById('cs').onclick = () => {
          const name = document.getElementById('c_name').value.trim();
          if (!name) { toast('请填写课程名称', 'warn'); return; }
          const data = { name, dayOfWeek: document.getElementById('c_dow').value, start: document.getElementById('c_start').value, end: document.getElementById('c_end').value, location: document.getElementById('c_loc').value.trim(), weeks: document.getElementById('c_weeks').value.trim() };
          if (c) DB.update('courses', c.id, data); else DB.add('courses', data);
          closeModal(); renderCourses(); if (view === 'calendar') renderCalendarView(); toast('已保存', 'ok');
        };
      });
  }

  /* ============ 设置 / 同步 ============ */
  function renderSettings() {
    content.innerHTML = `
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <div class="section-head"><h2>数据备份与同步</h2></div>
          <p class="muted">数据默认保存在本机浏览器（localStorage）。</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn btn-sm btn-primary" id="expJson">导出备份(JSON)</button>
            <button class="btn btn-sm" id="impJson">导入备份</button>
            <button class="btn btn-sm btn-danger" id="resetAll">清空全部数据</button>
          </div>
          <input type="file" id="fileInput" accept="application/json" style="display:none"/>
          <hr style="border:0;border-top:1px solid var(--line);margin:18px 0"/>
          <h3 style="margin:0 0 8px">关于跨端 / 微信同步</h3>
          <p class="muted" style="font-size:13px;line-height:1.7">
          • <b>手机端查看</b>：本工作台为 PWA，可在手机浏览器打开同一地址并「添加到主屏幕」，体验接近 App。<br>
          • <b>微信实时同步</b>：自动监听微信对话需接入微信公众平台/企业微信 API 并部署后端服务，本机版暂以「微信对话智能导入」替代（粘贴对话即可解析为待办）。<br>
          • <b>真·多端实时同步</b>：需将应用部署到服务器（如 CloudStudio / 自有主机）并接入账号体系；可在此基础上扩展 WebSocket 同步与微信回调。详见项目 README。</p>
        </div>
        <div class="card">
          <div class="section-head"><h2>快速统计</h2></div>
          <div id="statsBox"></div>
        </div>
      </div>`;
    const s = DB.get();
    document.getElementById('expJson').onclick = () => Exp.exportJSON();
    document.getElementById('impJson').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { const data = JSON.parse(rd.result); Object.assign(DB.get(), data); DB.save(); toast('导入成功', 'ok'); render(); } catch (err) { toast('文件格式错误', 'warn'); } };
      rd.readAsText(f);
    };
    document.getElementById('resetAll').onclick = () => { if (confirm('将清空全部数据且不可恢复，确认？')) { DB.reset(); toast('已清空'); render(); } };
    document.getElementById('statsBox').innerHTML = [
      ['待办总数', s.todos.length], ['未完成待办', s.todos.filter(t => !t.done).length],
      ['系室记录', s.teachers.length], ['科研记录', s.research.length],
      ['灵感', s.ideas.length], ['备课', s.lessons.length],
      ['学生', s.students.length], ['课程', s.courses.length]
    ].map(x => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('');
  }

  /* ============ 提醒检查 ============ */
  function checkReminders() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') Notification.requestPermission();
    const now = new Date();
    const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const curMin = now.getHours() * 60 + now.getMinutes();
    DB.get().todos.forEach(t => {
      if (!t.remind || t.done || !t.date || !t.time || t.date !== cur) return;
      const tm = DB.timeToMin(t.time);
      if (tm == null) return;
      const diff = tm - curMin;
      if (diff >= 0 && diff <= 5 && !notified.has(t.id)) {
        notified.add(t.id);
        toast('🔔 ' + t.time + ' ' + t.title, 'ok');
        if (Notification.permission === 'granted') new Notification('待办提醒', { body: t.title + (t.content ? '\n' + t.content : '') });
      }
    });
  }
  setInterval(checkReminders, 30000);
  checkReminders();

  function isoToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* 暴露给内联 onclick */
  window.App = { go: (v) => { view = v; document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === v)); render(); } };

  render();
})();
