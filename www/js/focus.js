/* focus.js —— 正计时：专注计时器状态机（含进程被杀后的持久化恢复） */
(function () {
  'use strict';

  const STATE_KEY = 'shiguang_focus_state_v1';

  let state = null; // { subjectId, startTs, accMs, running, lastTick }
  let timerId = null;
  let persistCount = 0;

  function now() { return Date.now(); }

  function elapsedMs() {
    if (!state) return 0;
    let e = state.accMs;
    if (state.running) e += now() - state.lastTick;
    return e;
  }

  function persist() {
    try {
      if (!state) {
        localStorage.removeItem(STATE_KEY);
        return;
      }
      localStorage.setItem(STATE_KEY, JSON.stringify({
        subjectId: state.subjectId,
        startTs: state.startTs,
        accMs: state.accMs,
        running: state.running,
        lastTick: state.lastTick,
        elapsedMs: elapsedMs(),
        savedAt: now()
      }));
    } catch (e) {
      console.warn('[focus] persist failed:', e);
    }
  }

  function clearPersist() {
    try { localStorage.removeItem(STATE_KEY); } catch (e) { /* ignore */ }
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function beginInterval(onTick) {
    stopTimer();
    timerId = setInterval(function () {
      persistCount++;
      // 运行中每 ~2 秒落盘一次，进程被杀最多丢 2 秒
      if (persistCount % 4 === 0) persist();
      if (onTick) onTick(format(elapsedMs()), elapsedMs());
    }, 500);
    if (onTick) onTick(format(elapsedMs()), elapsedMs());
  }

  function start(subjectId, onTick) {
    stopTimer();
    persistCount = 0;
    state = { subjectId: subjectId, startTs: now(), accMs: 0, running: true, lastTick: now() };
    persist();
    beginInterval(onTick);
  }

  function pause() {
    if (!state || !state.running) return;
    state.accMs += now() - state.lastTick;
    state.running = false;
    stopTimer();
    persist();
  }

  function resume(onTick) {
    if (!state || state.running) return;
    state.running = true;
    state.lastTick = now();
    persistCount = 0;
    persist();
    beginInterval(onTick);
  }

  /* 结束并返回会话记录（未写入存储，由调用方决定） */
  function stop() {
    if (!state) return null;
    const total = elapsedMs();
    stopTimer();
    const session = {
      subjectId: state.subjectId,
      start: new Date(state.startTs).toISOString(),
      end: new Date().toISOString(),
      durationMs: total
    };
    state = null;
    clearPersist();
    return session;
  }

  /**
   * 从本地恢复未正常结束的会话。
   * 一律先恢复为「已暂停」，由用户决定继续或结束，避免误把挂起时间算进专注。
   * @returns {{subjectId:string, elapsedMs:number}|null}
   */
  function restore() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved || !saved.subjectId) {
        clearPersist();
        return null;
      }
      // 以落盘的 elapsed 为准，不把进程死亡期间的挂钟时间算进来
      const elapsed = Math.max(0, saved.elapsedMs || saved.accMs || 0);
      if (elapsed < 5000) {
        clearPersist();
        return null;
      }
      state = {
        subjectId: saved.subjectId,
        startTs: saved.startTs || now(),
        accMs: elapsed,
        running: false,
        lastTick: now()
      };
      persist();
      return { subjectId: state.subjectId, elapsedMs: elapsed };
    } catch (e) {
      console.warn('[focus] restore failed:', e);
      clearPersist();
      return null;
    }
  }

  /* 页面隐藏 / 关闭前强制落盘 */
  function flush() {
    if (state) {
      // 运行中先把墙钟计入 accMs，再存快照
      if (state.running) {
        state.accMs += now() - state.lastTick;
        state.lastTick = now();
      }
      persist();
    }
  }

  function isRunning() { return !!(state && state.running); }
  function isPaused() { return !!(state && !state.running); }
  function currentSubjectId() { return state ? state.subjectId : null; }

  function format(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  /* 人类可读时长，如 "1小时25分" */
  function humanize(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return '不足1分钟';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h === 0) return rem + ' 分钟';
    if (rem === 0) return h + ' 小时';
    return h + ' 小时 ' + rem + ' 分';
  }

  // 系统回收 / 切后台时尽量保住时长
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);

  const Focus = {
    start: start, pause: pause, resume: resume, stop: stop,
    restore: restore, flush: flush,
    isRunning: isRunning, isPaused: isPaused,
    currentSubjectId: currentSubjectId, elapsedMs: elapsedMs,
    format: format, humanize: humanize
  };

  window.Focus = Focus;
})();
