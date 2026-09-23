/* store.js —— 数据层：localStorage 持久化 + 订阅通知 */
(function () {
  'use strict';

  const KEY = 'countdown_app_data_v1';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaults() {
    return {
      version: 1,
      events: [],
      subjects: [
        { id: uid(), name: '高数', color: '#6366f1', targetMinutes: 120 },
        { id: uid(), name: '英语', color: '#0ea5e9', targetMinutes: 60 },
        { id: uid(), name: '编程', color: '#f59e0b', targetMinutes: 90 }
      ],
      sessions: [],
      settings: {
        theme: 'light',
        pomodoro: { enabled: false, focusMin: 25, breakMin: 5 },
        ai: {
          provider: 'deepseek',
          endpoint: 'https://api.deepseek.com/chat/completions',
          apiKey: '',
          model: 'deepseek-chat',
          enabled: false
        }
      }
    };
  }

  /* 旧会话补全字段：保证删除科目后的历史、新统计（占比/高效时段）都能用 */
  function normalizeSessions(sessions, subjects) {
    const subjMap = {};
    (subjects || []).forEach(function (s) { if (s && s.id) subjMap[s.id] = s; });

    return (Array.isArray(sessions) ? sessions : [])
      .filter(function (s) { return s && typeof s === 'object' && typeof s.durationMs === 'number' && s.durationMs >= 0; })
      .map(function (s) {
        const id = s.id || uid();
        const subjectId = s.subjectId || '';
        const meta = subjMap[subjectId];
        const startMs = Date.parse(s.start);
        const start = isNaN(startMs) ? new Date().toISOString() : new Date(startMs).toISOString();
        let end = s.end;
        const endMs = Date.parse(end);
        if (isNaN(endMs)) {
          end = new Date(startMs + (s.durationMs || 0)).toISOString();
        } else {
          end = new Date(endMs).toISOString();
        }
        return {
          id: id,
          subjectId: subjectId,
          subjectName: s.subjectName || (meta ? meta.name : '未知'),
          subjectColor: s.subjectColor || (meta ? meta.color : '#8a90a3'),
          start: start,
          end: end,
          durationMs: Math.round(s.durationMs)
        };
      });
  }

  function mergeSettings(baseSettings, parsedSettings) {
    const ps = parsedSettings || {};
    const out = Object.assign({}, baseSettings, ps);
    out.pomodoro = Object.assign({}, defaults().settings.pomodoro, ps.pomodoro || {});
    out.ai = Object.assign({}, defaults().settings.ai, ps.ai || {});
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 深合并默认值，避免新增字段缺失导致运行错误
        const base = defaults();
        base.events = Array.isArray(parsed.events) ? parsed.events : [];
        base.subjects = Array.isArray(parsed.subjects) && parsed.subjects.length ? parsed.subjects : base.subjects;
        base.sessions = normalizeSessions(parsed.sessions, base.subjects);
        base.settings = mergeSettings(base.settings, parsed.settings);
        return base;
      }
    } catch (e) {
      console.warn('[store] load failed:', e);
    }
    return defaults();
  }

  let data = load();
  const listeners = [];

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[store] save failed:', e);
    }
    listeners.forEach(function (fn) {
      try { fn(data); } catch (e) { console.error(e); }
    });
  }

  const Store = {
    uid: uid,
    getData: function () { return data; },
    subscribe: function (fn) { listeners.push(fn); },

    /* ---------- 事件（纪念日/特殊日子） ---------- */
    addEvent: function (ev) {
      ev.id = uid();
      data.events.push(ev);
      persist();
    },
    updateEvent: function (id, patch) {
      const e = data.events.find(function (x) { return x.id === id; });
      if (e) { Object.assign(e, patch); persist(); }
    },
    removeEvent: function (id) {
      data.events = data.events.filter(function (x) { return x.id !== id; });
      persist();
    },

    /* ---------- 科目 / 专注项 ---------- */
    addSubject: function (s) {
      s.id = uid();
      if (typeof s.targetMinutes !== 'number') s.targetMinutes = 0;
      data.subjects.push(s);
      persist();
    },
    updateSubject: function (id, patch) {
      const s = data.subjects.find(function (x) { return x.id === id; });
      if (s) { Object.assign(s, patch); persist(); }
    },
    /* keepRecords=true 删除科目但保留历史记录；false 连记录一起删除 */
    removeSubject: function (id, keepRecords) {
      data.subjects = data.subjects.filter(function (x) { return x.id !== id; });
      if (!keepRecords) {
        data.sessions = data.sessions.filter(function (x) { return x.subjectId !== id; });
      }
      persist();
    },

    /* ---------- 专注会话 ---------- */
    addSession: function (s) {
      s.id = uid();
      data.sessions.push(s);
      persist();
    },
    removeSession: function (id) {
      data.sessions = data.sessions.filter(function (x) { return x.id !== id; });
      persist();
    },

    /* ---------- 设置 ---------- */
    setSetting: function (patch) {
      Object.assign(data.settings, patch);
      persist();
    },
    setAISetting: function (patch) {
      Object.assign(data.settings.ai, patch);
      persist();
    },

    /* ---------- 导入导出 ---------- */
    exportJSON: function () { return JSON.stringify(data, null, 2); },
    /* 兼容旧版备份：记录全保留、字段补全，导入后新统计可直接出结果 */
    importJSON: function (str) {
      const parsed = JSON.parse(str);
      if (!parsed || typeof parsed !== 'object') throw new Error('bad format');
      const base = defaults();
      base.events = Array.isArray(parsed.events) ? parsed.events : [];
      base.subjects = Array.isArray(parsed.subjects) && parsed.subjects.length ? parsed.subjects : base.subjects;
      base.sessions = normalizeSessions(parsed.sessions, base.subjects);
      base.settings = mergeSettings(base.settings, parsed.settings);
      data = base;
      persist();
    },
    clearAll: function () {
      data = defaults();
      persist();
    }
  };

  window.Store = Store;
})();
