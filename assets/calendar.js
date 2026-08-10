/* ============ 日历视图渲染（直接显示待办内容，非小点） ============ */
function renderCalendar(container, year, month, opts) {
  opts = opts || {};
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0=日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const dowLabels = ['日', '一', '二', '三', '四', '五', '六'];
  let html = '<div class="cal-head"><button class="btn btn-sm" id="calPrev">‹ 上月</button>'
    + '<h2>' + year + ' 年 ' + (month + 1) + ' 月</h2>'
    + '<button class="btn btn-sm" id="calNext">下月 ›</button>'
    + '<button class="btn btn-sm btn-primary" id="calAdd" style="margin-left:8px">+ 添加待办</button></div>';
  html += '<div class="cal-grid">';
  dowLabels.forEach(d => html += '<div class="cal-dow">' + d + '</div>');

  const today = new Date();
  const todayIso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  // 收集数据
  const todos = DB.get().todos;
  const courses = DB.get().courses;

  function cellsFor(targetYear, targetMonth, day, isOther) {
    const iso = targetYear + '-' + String(targetMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const cls = 'cal-cell' + (isOther ? ' other' : '') + (iso === todayIso ? ' today' : '');
    let inner = '<div class="cal-date' + (iso === todayIso ? ' t' : '') + '">' + day + '</div><div class="cal-items">';

    // 待办
    const dayTodos = todos.filter(t => t.date === iso && !t.done)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    dayTodos.slice(0, 3).forEach(t => {
      const rm = roleMeta(t.role);
      inner += '<div class="cal-item ' + rm.cls + '" data-todo="' + t.id + '">'
        + (t.time ? t.time + ' ' : '') + escapeHtml(t.title) + '</div>';
    });
    // 课表（按星期）
    const dow = new Date(targetYear, targetMonth, day).getDay();
    const dayCourses = courses.filter(c => Number(c.dayOfWeek) === dow);
    dayCourses.slice(0, 2).forEach(c => {
      inner += '<div class="cal-item course" data-course="' + c.id + '">'
        + (c.start || '') + ' ' + escapeHtml(c.name) + '</div>';
    });
    const total = dayTodos.length + dayCourses.length;
    if (total > 5) inner += '<div class="cal-more">+' + (total - 5) + ' 更多</div>';
    inner += '</div>';
    html += '<div class="' + cls + '" data-date="' + iso + '">' + inner + '</div>';
  }

  // 上月在尾部
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    cellsFor(year, month - 1, d, true);
  }
  // 当月
  for (let d = 1; d <= daysInMonth; d++) cellsFor(year, month, d, false);
  // 下月在头部补齐
  const totalCells = startDow + daysInMonth;
  const remain = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remain; i++) cellsFor(year, month + 1, i, true);

  html += '</div>';
  container.innerHTML = html;

  container.querySelector('#calPrev').onclick = () => opts.onNav(year, month - 1);
  container.querySelector('#calNext').onclick = () => opts.onNav(year, month + 1);
  container.querySelector('#calAdd').onclick = () => opts.onAdd && opts.onAdd();
  container.querySelectorAll('.cal-cell').forEach(cell => {
    cell.onclick = (e) => {
      if (e.target.closest('[data-todo]') || e.target.closest('[data-course]')) return;
      opts.onCell && opts.onCell(cell.dataset.date);
    };
  });
  container.querySelectorAll('[data-todo]').forEach(el => {
    el.onclick = (ev) => { ev.stopPropagation(); opts.onTodo && opts.onTodo(el.dataset.todo); };
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
