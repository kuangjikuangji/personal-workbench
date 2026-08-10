/* ============ 导出工具：CSV / Excel(.xls) / JSON ============ */
const Exp = (function () {
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  // CSV（带 BOM，Excel 中文不乱码）
  function toCSV(headers, rows) {
    const esc = v => {
      const s = (v == null ? '' : String(v));
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(',')];
    rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
    return '﻿' + lines.join('\n');
  }
  function exportCSV(filename, headers, rows) {
    download(filename, toCSV(headers, rows), 'text/csv');
  }

  // Excel 兼容的 .xls（HTML 表格，SpreadsheetML 风格）
  function exportXLS(filename, headers, rows) {
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="utf-8"></head><body><table border="1">';
    html += '<tr>' + headers.map(h => '<td><b>' + (h.label || h) + '</b></td>').join('') + '</tr>';
    rows.forEach(r => {
      html += '<tr>' + headers.map(h => '<td>' + escapeCell(r[h.key || h]) + '</td>').join('') + '</tr>';
    });
    html += '</table></body></html>';
    download(filename, html, 'application/vnd.ms-excel');
  }
  function escapeCell(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function exportJSON() {
    const data = JSON.stringify(DB.get(), null, 2);
    download('workbench-backup-' + stamp() + '.json', data, 'application/json');
  }
  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /* ---------- 微信对话文本智能解析（同步替代方案） ----------
     识别形如：
     [日期] 时间 待办内容 @角色
     例：
     3月5日 9:30 提交学院预算表 @院长助理
     周五 14:00 系务会 @系主任
     明天 提醒 交材料
     无角色默认归为“个人待办”。返回可批量导入的待办数组。 */
  function parseWeChatText(text) {
    const out = [];
    const lines = text.split(/\r?\n/);
    const now = new Date();
    const monthNames = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
    lines.forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      // 去掉常见前缀
      const cleaned = line.replace(/^[-*\u2022]\s*/, '').replace(/^\[?微信\]?/i, '');
      const roleMatch = cleaned.match(/@(院长助理|系主任|个人|个人待办)/);
      let role = 'personal';
      if (roleMatch) {
        const r = roleMatch[1];
        if (r.includes('院长')) role = 'dean';
        else if (r.includes('系主任')) role = 'head';
        else role = 'personal';
      }
      let date = null, time = null, endTime = null;
      // 月日
      let m = cleaned.match(/(\d{1,2})月(\d{1,2})[日号]?/);
      if (m) { date = mkDate(now.getFullYear(), +m[1], +m[2]); }
      // 明天/今天/后天
      if (/明天/.test(cleaned)) date = shiftDay(now, 1);
      else if (/后天/.test(cleaned)) date = shiftDay(now, 2);
      else if (/今天|今日/.test(cleaned)) date = iso(now);
      // 周几
      const wmap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      const wm = cleaned.match(/周([一二三四五六日天])/);
      if (wm && !date) date = nextWeekday(now, wmap[wm[1]]);
      // 时间
      const tm = cleaned.match(/(\d{1,2}):(\d{2})/);
      if (tm) { time = pad(tm[1]) + ':' + tm[2]; }
      else {
        const tm2 = cleaned.match(/(\d{1,2})\s*[:点](\d{0,2})\s*(?:分|点)?/);
        if (tm2) { time = pad(tm2[1]) + ':' + (tm2[2] ? pad(tm2[2]) : '00'); }
      }
      // 时间段
      const range = cleaned.match(/(\d{1,2}):(\d{2})\s*[-~到]\s*(\d{1,2}):(\d{2})/);
      if (range) { time = pad(range[1]) + ':' + range[2]; endTime = pad(range[3]) + ':' + range[4]; }
      // 内容：去掉日期/时间/@角色/提醒 等标记
      let title = cleaned
        .replace(/@(院长助理|系主任|个人|个人待办)/g, '')
        .replace(/(\d{1,2}):(\d{2})\s*[-~到]\s*(\d{1,2}):(\d{2})/g, '')
        .replace(/(\d{1,2}):(\d{2})/g, '')
        .replace(/(\d{1,2})\s*[:点](\d{0,2})\s*(?:分|点)?/g, '')
        .replace(/(\d{1,2})月(\d{1,2})[日号]?/g, '')
        .replace(/周[一二三四五六日天]/g, '')
        .replace(/(明天|后天|今天|今日|提醒|交|请|帮我|记得)/g, '')
        .replace(/[\[\]【】]/g, '').trim();
      if (!title) title = cleaned;
      if (title.length > 60) title = title.slice(0, 60);
      out.push({ title, content: '', role, date: date || iso(now), time: time || '', endTime: endTime || '', remind: /提醒/.test(cleaned), done: false });
    });
    return out;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mkDate(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function shiftDay(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return iso(x); }
  function nextWeekday(d, target) {
    const x = new Date(d);
    let diff = (target - x.getDay() + 7) % 7; if (diff === 0) diff = 7;
    x.setDate(x.getDate() + diff); return iso(x);
  }

  return { exportCSV, exportXLS, exportJSON, parseWeChatText };
})();
