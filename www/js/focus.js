/* focus.js —— 正计时：专注计时器状态机 */
(function () {
  'use strict';

  let state = null; // { subjectId, startTs, accMs, running, lastTick }
  let timerId = null;

  function now() { return Date.now(); }

  function elapsedMs() {
    if (!state) return 0;
    let e = state.accMs;
    if (state.running) e += now() - state.lastTick;
    return e;
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function start(subjectId, onTick) {
    stopTimer();
    state = { subjectId: subjectId, startTs: now(), accMs: 0, running: true, lastTick: now() };
    timerId = setInterval(function () {
      if (onTick) onTick(format(elapsedMs()), elapsedMs());
    }, 500);
    if (onTick) onTick(format(elapsedMs()), elapsedMs());
  }

  function pause() {
    if (!state || !state.running) return;
    state.accMs += now() - state.lastTick;
    state.running = false;
    stopTimer();
  }

  function resume(onTick) {
    if (!state || state.running) return;
    state.running = true;
    state.lastTick = now();
    timerId = setInterval(function () {
      if (onTick) onTick(format(elapsedMs()), elapsedMs());
    }, 500);
    if (onTick) onTick(format(elapsedMs()), elapsedMs());
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
    return session;
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

  const Focus = {
    start: start, pause: pause, resume: resume, stop: stop,
    isRunning: isRunning, isPaused: isPaused,
    currentSubjectId: currentSubjectId, elapsedMs: elapsedMs,
    format: format, humanize: humanize
  };

  window.Focus = Focus;
})();
