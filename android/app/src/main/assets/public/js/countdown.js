/* countdown.js —— 倒计时 / 正计时计算 */
(function () {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return fmtDate(new Date()); }

  function parseDate(s) {
    const parts = s.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  /* 忽略时间部分的天数差：b - a（天） */
  function dayDiff(a, b) {
    const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((b0 - a0) / 86400000);
  }

  /* 计算单个事件的展示状态 */
  function compute(ev, from) {
    const base = from || new Date();
    const color = ev.color || '#6366f1';

    if (ev.repeat === 'yearly') {
      // 每年重复：取今年月日；若已过则取明年
      const d = parseDate(ev.date);
      let candidate = new Date(base.getFullYear(), d.getMonth(), d.getDate());
      if (dayDiff(base, candidate) < 0) {
        candidate = new Date(base.getFullYear() + 1, d.getMonth(), d.getDate());
      }
      const diff = dayDiff(base, candidate);
      return {
        id: ev.id, name: ev.name, type: ev.type, color: color, repeat: ev.repeat,
        note: ev.note || '', dateText: fmtDate(candidate), diff: diff,
        mode: diff === 0 ? 'today' : 'countdown',
        label: diff === 0 ? '就是今天' : (diff + ' 天')
      };
    }

    const d = parseDate(ev.date);
    const diff = dayDiff(base, d);
    if (diff >= 0) {
      return {
        id: ev.id, name: ev.name, type: ev.type, color: color, repeat: ev.repeat,
        note: ev.note || '', dateText: ev.date, diff: diff,
        mode: diff === 0 ? 'today' : 'countdown',
        label: diff === 0 ? '就是今天' : (diff + ' 天')
      };
    }
    return {
      id: ev.id, name: ev.name, type: ev.type, color: color, repeat: ev.repeat,
      note: ev.note || '', dateText: ev.date, diff: -diff,
      mode: 'elapsed', label: (-diff) + ' 天'
    };
  }

  /* 排序：今天 > 未来倒计时(近→远) > 已过正计时(近→远) */
  function sortKey(c) {
    if (c.mode === 'today') return -1;
    if (c.mode === 'countdown') return c.diff;
    return 100000 - c.diff;
  }

  const TYPE_LABEL = {
    anniversary: '纪念日',
    birthday: '生日',
    exam: '考试',
    festival: '节日',
    custom: '自定义'
  };

  const TYPE_ICON = {
    anniversary: '💞',
    birthday: '🎂',
    exam: '📝',
    festival: '🎉',
    custom: '⭐'
  };

  const Countdown = {
    pad: pad, fmtDate: fmtDate, todayStr: todayStr,
    parseDate: parseDate, dayDiff: dayDiff,
    compute: compute, sortKey: sortKey,
    TYPE_LABEL: TYPE_LABEL, TYPE_ICON: TYPE_ICON
  };

  window.Countdown = Countdown;
})();
