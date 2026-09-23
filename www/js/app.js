/* app.js —— 主控制器：UI 渲染、事件绑定、模块串联 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981',
    '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#84cc16'];
  const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  let currentPage = 'countdown';
  let selectedSubjectId = null;
  let pomodoroNotified = 0;   // 番茄钟提醒计数（闭包变量，避免污染持久化数据）
  let detailEventId = null;   // 正在查看详情的事件 id
  let lastToday = null;       // 用于零点跨天检测
  let pieRange = 'month';     // 扇形图范围：day | week | month

  /* ================= 工具 ================= */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.add('hidden'); }, 2200);
  }
  function showModal(title, bodyHtml, onMount) {
    $('modalBox').innerHTML = '<h3>' + esc(title) + '</h3>' + bodyHtml;
    $('modal').classList.remove('hidden');
    if (onMount) onMount();
  }
  function closeModal() { $('modal').classList.add('hidden'); }

  /* 颜色加深（用于默认渐变背景） */
  function shadeHex(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    const num = parseInt(h, 16);
    const r = Math.round(((num >> 16) & 255) * 0.5);
    const g = Math.round(((num >> 8) & 255) * 0.5);
    const b = Math.round((num & 255) * 0.5);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ================= 主题 ================= */
  function resolveTheme(theme) {
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    const resolved = resolveTheme(theme);
    document.documentElement.setAttribute('data-theme', resolved);
    $('themeToggle').textContent = resolved === 'dark' ? '☀️' : '🌙';
    document.querySelectorAll('#themeSeg button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
  }

  /* ================= 页面切换 ================= */
  function showPage(name) {
    currentPage = name;
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    $('page-' + name).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.page === name);
    });
    if (name === 'stats') renderStats();
    if (name === 'focus') { renderFocus(); updateRing(); }
    if (name === 'settings') renderSettings();
    if (name === 'countdown') renderCountdownList();
  }

  /* ================= 倒计时列表 ================= */
  function renderCountdownList() {
    // 只显示倒计时（未来/今天）；已过日期的事件不在此页展示（正计时由专注模块承担）
    const items = Store.getData().events
      .map(function (ev) { return Countdown.compute(ev, new Date()); })
      .filter(function (c) { return c.mode !== 'elapsed'; })
      .sort(function (a, b) { return Countdown.sortKey(a) - Countdown.sortKey(b); });

    if (!items.length) {
      $('countdownList').innerHTML = '<div class="chart-empty">还没有倒计时，点击右上角「＋ 添加」</div>';
      return;
    }
    $('countdownList').innerHTML = items.map(function (c) {
      const icon = Countdown.TYPE_ICON[c.type] || '⭐';
      const typeLabel = Countdown.TYPE_LABEL[c.type] || '自定义';
      const repeatTag = c.repeat === 'yearly' ? ' · 每年' : '';
      const modeTag = c.mode === 'today' ? '今天' : '倒计时';
      return '<div class="cd-item" data-id="' + c.id + '" style="--cd-color:' + c.color + '">' +
        '<div class="cd-emoji">' + icon + '</div>' +
        '<div class="cd-info">' +
          '<div class="cd-name">' + esc(c.name) + '</div>' +
          '<div class="cd-meta">' + typeLabel + repeatTag + ' · ' + c.dateText +
            (c.note ? ' · ' + esc(c.note) : '') + '</div>' +
        '</div>' +
        '<div class="cd-num">' +
          '<div class="big">' + c.label + '</div>' +
          '<div class="mode-tag">' + modeTag + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    $('countdownList').querySelectorAll('.cd-item').forEach(function (el) {
      el.onclick = function () { openDetail(el.dataset.id); };
    });
  }

  /* ================= 事件弹窗（添加/编辑） ================= */
  function openEventModal(ev) {
    const isEdit = !!ev;
    const e = ev || { name: '', date: Countdown.todayStr(), type: 'anniversary', repeat: 'none', color: COLORS[0], note: '' };
    let color = e.color || COLORS[0];
    const today = Countdown.todayStr();

    const typeOpts = Object.keys(Countdown.TYPE_LABEL).map(function (k) {
      return '<option value="' + k + '"' + (e.type === k ? ' selected' : '') + '>' + Countdown.TYPE_LABEL[k] + '</option>';
    }).join('');

    const colorDots = COLORS.map(function (c) {
      return '<span class="color-dot' + (c === color ? ' active' : '') + '" data-color="' + c + '" style="background:' + c + '"></span>';
    }).join('');

    const html =
      '<div class="form-row"><label>名称</label><input id="evName" type="text" value="' + esc(e.name) + '" placeholder="如：考研初试" /></div>' +
      '<div class="form-row"><label>日期</label><input id="evDate" type="date" value="' + e.date + '" min="' + today + '" /></div>' +
      '<div class="form-row"><label>类型</label><select id="evType">' + typeOpts + '</select></div>' +
      '<div class="form-row"><label>重复</label><select id="evRepeat">' +
        '<option value="none"' + (e.repeat !== 'yearly' ? ' selected' : '') + '>不重复</option>' +
        '<option value="yearly"' + (e.repeat === 'yearly' ? ' selected' : '') + '>每年重复（生日/纪念日）</option>' +
      '</select></div>' +
      '<div class="form-row"><label>颜色</label><div class="color-picker">' + colorDots + '</div></div>' +
      '<div class="form-row"><label>备注（可选）</label><textarea id="evNote">' + esc(e.note) + '</textarea></div>' +
      '<div class="form-actions">' +
        (isEdit ? '<button id="evDelete" class="btn danger">删除</button>' : '') +
        '<button id="evCancel" class="btn">取消</button>' +
        '<button id="evSave" class="btn primary">保存</button>' +
      '</div>';

    showModal(isEdit ? '编辑事件' : '添加事件', html, function () {
      $('modalBox').querySelectorAll('.color-dot').forEach(function (dot) {
        dot.onclick = function () {
          color = dot.dataset.color;
          $('modalBox').querySelectorAll('.color-dot').forEach(function (d) { d.classList.remove('active'); });
          dot.classList.add('active');
        };
      });
      $('evCancel').onclick = closeModal;
      $('evSave').onclick = function () {
        const name = $('evName').value.trim();
        const date = $('evDate').value;
        if (!name) { toast('请填写名称'); return; }
        if (!date) { toast('请选择日期'); return; }
        if (date < today) { toast('日期不能早于今天'); return; }
        const patch = {
          name: name, date: date,
          type: $('evType').value,
          repeat: $('evRepeat').value,
          color: color,
          note: $('evNote').value.trim()
        };
        if (isEdit) Store.updateEvent(e.id, patch);
        else Store.addEvent(patch);
        closeModal();
        renderCountdownList();
        if (detailEventId) renderDetail();
        toast('已保存');
      };
      if (isEdit) {
        $('evDelete').onclick = function () {
          Store.removeEvent(e.id);
          closeModal();
          if (detailEventId === e.id) closeDetail();
          renderCountdownList();
          toast('已删除');
        };
      }
    });
  }

  /* ================= 倒计时详情（沉浸模式） ================= */
  function openDetail(id) {
    detailEventId = id;
    renderDetail();
    $('page-detail').classList.remove('hidden');
  }
  function closeDetail() {
    $('page-detail').classList.add('hidden');
    detailEventId = null;
  }
  function renderDetail() {
    const ev = Store.getData().events.find(function (x) { return x.id === detailEventId; });
    const detail = $('page-detail');
    if (!ev) { closeDetail(); return; }
    const c = Countdown.compute(ev, new Date());
    const color = ev.color || '#6366f1';
    if (ev.bgImage) {
      detail.style.background = '#000 url(' + ev.bgImage + ') center / cover no-repeat';
    } else {
      detail.style.background = 'linear-gradient(150deg, ' + color + ' 0%, ' + shadeHex(color) + ' 100%)';
    }
    $('detailType').textContent = (Countdown.TYPE_LABEL[c.type] || '自定义') + (c.repeat === 'yearly' ? ' · 每年' : '');
    if (c.mode === 'today') {
      $('detailNum').textContent = '今天';
      $('detailUnit').textContent = '';
    } else {
      $('detailNum').textContent = c.diff;
      $('detailUnit').textContent = '天';
    }
    $('detailName').textContent = c.name;
    $('detailDate').textContent = c.dateText + (c.note ? ' · ' + c.note : '');
  }

  /* 背景弹窗：预设渐变 + 上传自定义图片 */
  function openBgModal() {
    const ev = Store.getData().events.find(function (x) { return x.id === detailEventId; });
    if (!ev) return;
    const color = ev.color || '#6366f1';
    const swatches = COLORS.map(function (c) {
      return '<span class="color-dot' + (c === color ? ' active' : '') + '" data-color="' + c +
        '" style="background:linear-gradient(150deg,' + c + ',' + shadeHex(c) + ')"></span>';
    }).join('');
    showModal('自定义背景',
      '<div class="form-row"><label>预设渐变背景（点击色卡）</label><div class="color-picker">' + swatches + '</div></div>' +
      '<div class="form-row"><label>使用自己的图片</label>' +
        '<button id="bgUpload" class="btn small">📷 选择本地图片</button>' +
        '<input type="file" id="bgFile" accept="image/*" class="hidden" />' +
      '</div>' +
      (ev.bgImage ? '<div class="form-row"><button id="bgClear" class="btn small danger">恢复默认渐变背景</button></div>' : '') +
      '<div class="form-actions"><button id="bgClose" class="btn">关闭</button></div>',
      function () {
        $('modalBox').querySelectorAll('.color-dot').forEach(function (dot) {
          dot.onclick = function () {
            Store.updateEvent(detailEventId, { color: dot.dataset.color, bgImage: '' });
            renderDetail();
            renderCountdownList();
            closeModal();
          };
        });
        $('bgUpload').onclick = function () { $('bgFile').click(); };
        $('bgFile').addEventListener('change', function () {
          const file = this.files && this.files[0];
          if (!file) return;
          compressImage(file, function (dataUrl) {
            if (!dataUrl) return;
            Store.updateEvent(detailEventId, { bgImage: dataUrl });
            renderDetail();
            closeModal();
            toast('背景已更新');
          });
        });
        if (ev.bgImage) {
          $('bgClear').onclick = function () {
            Store.updateEvent(detailEventId, { bgImage: '' });
            renderDetail();
            closeModal();
            toast('已恢复默认背景');
          };
        }
        $('bgClose').onclick = closeModal;
      });
  }

  /* 图片压缩（限宽 1280、JPEG，控制 localStorage 体积） */
  function compressImage(file, cb) {
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        const maxW = 1280;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.78);
        if (url.length > 1400000) { toast('图片过大，压缩后仍超限，请换一张'); cb(null); return; }
        cb(url);
      };
      img.onerror = function () { toast('图片读取失败'); cb(null); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ================= 科目 / 专注项 ================= */
  function findSubject(id) {
    return Store.getData().subjects.find(function (x) { return x.id === id; });
  }
  function subjectNameOf(session) {
    const subj = findSubject(session.subjectId);
    return subj ? subj.name : (session.subjectName || '未知');
  }
  function subjectColorOf(session) {
    const subj = findSubject(session.subjectId);
    return subj ? subj.color : (session.subjectColor || '#8a90a3');
  }
  function todayMinutesOfSubject(id) {
    const today = Countdown.todayStr();
    let ms = 0;
    Store.getData().sessions.forEach(function (s) {
      if (s.subjectId === id && Countdown.fmtDate(new Date(s.start)) === today) ms += s.durationMs;
    });
    return ms / 60000;
  }

  function currentSubject() {
    const d = Store.getData();
    const sid = selectedSubjectId || (Focus.currentSubjectId && Focus.currentSubjectId());
    return d.subjects.find(function (s) { return s.id === sid; }) || d.subjects[0] || null;
  }

  function renderFocus() {
    const d = Store.getData();
    // 选中的科目若已被删除则重置
    if (selectedSubjectId && !d.subjects.find(function (x) { return x.id === selectedSubjectId; })) {
      selectedSubjectId = null;
    }
    if (!selectedSubjectId && d.subjects.length) selectedSubjectId = d.subjects[0].id;

    const chips = d.subjects.map(function (s) {
      return '<button class="chip' + (s.id === selectedSubjectId ? ' active' : '') + '" data-id="' + s.id + '">' +
        '<span class="dot" style="background:' + s.color + '"></span>' + esc(s.name) + '</button>';
    }).join('');
    $('subjectChips').innerHTML = chips +
      '<button class="chip manage" id="manageSubjectsChip">⚙️ 管理</button>';

    $('subjectChips').querySelectorAll('.chip[data-id]').forEach(function (el) {
      el.onclick = function () {
        if (Focus.isRunning() || Focus.isPaused()) { toast('计时中，请先结束'); return; }
        selectedSubjectId = el.dataset.id;
        renderFocus();
      };
    });
    $('manageSubjectsChip').onclick = openSubjectsManager;

    updateFocusButtons();
    renderTodaySessions();
  }

  /* 添加/编辑科目（含目标时长） */
  function openSubjectModal(subj) {
    const isEdit = !!subj;
    const s = subj || { name: '', color: COLORS[0], targetMinutes: 0 };
    let color = s.color || COLORS[0];
    const colorDots = COLORS.map(function (c) {
      return '<span class="color-dot' + (c === color ? ' active' : '') + '" data-color="' + c + '" style="background:' + c + '"></span>';
    }).join('');
    showModal(isEdit ? '编辑科目' : '添加科目',
      '<div class="form-row"><label>名称</label><input id="subjName" type="text" value="' + esc(s.name) + '" placeholder="如：高数 / 背单词 / 跑步" /></div>' +
      '<div class="form-row"><label>每日目标时长（分钟，0 表示不设）</label>' +
        '<input id="subjTarget" type="number" min="0" max="1440" value="' + (s.targetMinutes || 0) + '" /></div>' +
      '<div class="form-row"><label>颜色</label><div class="color-picker">' + colorDots + '</div></div>' +
      '<div class="form-actions">' +
        (isEdit ? '<button id="subjDelete" class="btn danger">删除</button>' : '') +
        '<button id="subjCancel" class="btn">取消</button>' +
        '<button id="subjSave" class="btn primary">保存</button>' +
      '</div>',
      function () {
        $('modalBox').querySelectorAll('.color-dot').forEach(function (dot) {
          dot.onclick = function () {
            color = dot.dataset.color;
            $('modalBox').querySelectorAll('.color-dot').forEach(function (d) { d.classList.remove('active'); });
            dot.classList.add('active');
          };
        });
        $('subjCancel').onclick = closeModal;
        $('subjSave').onclick = function () {
          const name = $('subjName').value.trim();
          if (!name) { toast('请填写名称'); return; }
          const targetMinutes = Math.max(0, parseInt($('subjTarget').value, 10) || 0);
          if (isEdit) Store.updateSubject(s.id, { name: name, color: color, targetMinutes: targetMinutes });
          else Store.addSubject({ name: name, color: color, targetMinutes: targetMinutes });
          closeModal();
          renderFocus();
          updateRing();
          toast('已保存');
        };
        if (isEdit) $('subjDelete').onclick = function () { confirmDeleteSubject(s.id); };
      });
  }

  /* 管理科目列表 */
  function openSubjectsManager() {
    const d = Store.getData();
    const rows = d.subjects.map(function (s) {
      const min = Math.round(todayMinutesOfSubject(s.id));
      const target = s.targetMinutes ? ('目标 ' + s.targetMinutes + ' 分钟') : '未设目标';
      return '<div class="setting-row">' +
        '<span style="display:flex;align-items:center;gap:8px;min-width:0">' +
          '<span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' + s.color + '"></span>' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.name) +
            '<span style="color:var(--muted);font-size:12px"> · 今日 ' + min + ' 分钟 · ' + target + '</span></span>' +
        '</span>' +
        '<span style="display:flex;gap:6px;flex-shrink:0">' +
          '<button class="btn small" data-edit="' + s.id + '">编辑</button>' +
          '<button class="btn small danger" data-del="' + s.id + '">删除</button>' +
        '</span>' +
      '</div>';
    }).join('');

    showModal('管理科目',
      '<div class="subj-manage">' + (rows || '<div class="chart-empty">还没有科目</div>') + '</div>' +
      '<div class="form-actions">' +
        '<button id="subjMgrAdd" class="btn primary">＋ 添加科目</button>' +
        '<button id="subjMgrClose" class="btn">关闭</button>' +
      '</div>',
      function () {
        $('modalBox').querySelectorAll('[data-edit]').forEach(function (el) {
          el.onclick = function () { openSubjectModal(findSubject(el.dataset.edit)); };
        });
        $('modalBox').querySelectorAll('[data-del]').forEach(function (el) {
          el.onclick = function () { confirmDeleteSubject(el.dataset.del); };
        });
        $('subjMgrAdd').onclick = function () { openSubjectModal(null); };
        $('subjMgrClose').onclick = closeModal;
      });
  }

  /* 删除科目：询问是否保留历史记录 */
  function confirmDeleteSubject(id) {
    const s = findSubject(id);
    if (!s) return;
    const count = Store.getData().sessions.filter(function (x) { return x.subjectId === id; }).length;
    showModal('删除科目',
      '<p style="font-size:14px;line-height:1.7;color:var(--text-soft);margin:0 0 4px">' +
        '确定删除「' + esc(s.name) + '」？<br/>该科目下有 <b>' + count + '</b> 条专注记录，是否保留？</p>' +
      '<div class="form-actions" style="flex-direction:column">' +
        '<button id="delKeep" class="btn primary">删除科目，保留历史记录</button>' +
        '<button id="delDrop" class="btn danger">删除科目及全部记录</button>' +
        '<button id="delCancel" class="btn">取消</button>' +
      '</div>',
      function () {
        $('delKeep').onclick = function () {
          Store.removeSubject(id, true);
          closeModal(); renderFocus(); updateRing(); renderStats();
          toast('已删除科目，历史记录已保留');
        };
        $('delDrop').onclick = function () {
          Store.removeSubject(id, false);
          closeModal(); renderFocus(); updateRing(); renderStats();
          toast('已删除科目及全部记录');
        };
        $('delCancel').onclick = closeModal;
      });
  }

  /* ================= 专注计时 ================= */
  function updateFocusButtons() {
    const running = Focus.isRunning();
    const paused = Focus.isPaused();
    $('focusStartBtn').textContent = paused ? '继续' : '开始';
    $('focusStartBtn').disabled = running;
    $('focusPauseBtn').disabled = !running;
    $('focusStopBtn').disabled = !running && !paused;
    $('timerRing').classList.toggle('running', running || paused);
    $('timerSub').textContent = running ? '专注中…'
      : paused ? '已暂停'
      : (currentSubject() ? '当前科目：' + currentSubject().name : '选择科目，开始专注');
  }

  function onTick(text, ms) {
    $('timerText').textContent = text;
    updateRing();
    checkPomodoro(ms);
  }

  function checkPomodoro(ms) {
    const d = Store.getData();
    if (!d.settings.pomodoro.enabled) return;
    const focusMs = d.settings.pomodoro.focusMin * 60000;
    if (focusMs <= 0) return;
    const cycles = Math.floor(ms / focusMs);
    if (cycles > 0 && cycles !== pomodoroNotified) {
      pomodoroNotified = cycles;
      toast('已完成 ' + cycles + ' 个番茄钟，记得休息 ' + d.settings.pomodoro.breakMin + ' 分钟');
    }
  }

  function startFocus() {
    const subject = currentSubject();
    if (!subject) { openSubjectsManager(); return; }
    selectedSubjectId = subject.id;
    if (Focus.isPaused()) {
      Focus.resume(onTick);
    } else if (!Focus.isRunning()) {
      pomodoroNotified = 0;
      Focus.start(subject.id, onTick);
    }
    updateFocusButtons();
  }
  function pauseFocus() { Focus.pause(); updateFocusButtons(); }
  function stopFocus() {
    const session = Focus.stop();
    if (session) {
      if (session.durationMs < 5000) {
        toast('时间太短，未记录');
      } else {
        // 冗余保存科目名与颜色：即使日后删除该科目，历史记录仍可正确显示
        const subj = findSubject(session.subjectId);
        session.subjectName = subj ? subj.name : '未知';
        session.subjectColor = subj ? subj.color : '#8a90a3';
        Store.addSession(session);
        toast('已记录 ' + Focus.humanize(session.durationMs));
      }
    }
    $('timerText').textContent = '00:00';
    updateRing();
    updateFocusButtons();
    renderTodaySessions();
  }

  function todayFocusMinutes() {
    const d = Store.getData();
    const today = Countdown.todayStr();
    let ms = 0;
    d.sessions.forEach(function (s) {
      if (Countdown.fmtDate(new Date(s.start)) === today) ms += s.durationMs;
    });
    if (Focus.isRunning() || Focus.isPaused()) ms += Focus.elapsedMs();
    return ms / 60000;
  }
  /* 今日目标 = 各科目自定义目标之和（不再使用全局目标） */
  function dailyTargetMinutes() {
    return Store.getData().subjects.reduce(function (sum, s) { return sum + (s.targetMinutes || 0); }, 0);
  }

  function updateRing() {
    const goal = dailyTargetMinutes();
    const mins = todayFocusMinutes();
    const p = Math.min(1, goal > 0 ? mins / goal : 0);
    $('timerRing').style.background = 'conic-gradient(var(--accent) ' + (p * 360) + 'deg, var(--ring-track) 0deg)';
  }

  /* 各科目今日目标进度 */
  function renderSubjectProgress() {
    const d = Store.getData();
    const html = d.subjects.filter(function (s) { return s.targetMinutes > 0; }).map(function (s) {
      const min = Math.round(todayMinutesOfSubject(s.id));
      const pct = Math.min(100, Math.round(min / s.targetMinutes * 100));
      return '<div class="sp-item">' +
        '<div class="sp-head"><span>' + esc(s.name) + '</span><span>' + min + ' / ' + s.targetMinutes + ' 分钟</span></div>' +
        '<div class="sp-bar"><div class="sp-fill" style="width:' + pct + '%;background:' + s.color + '"></div></div>' +
      '</div>';
    }).join('');
    $('subjectProgress').innerHTML = html;
  }

  /* 今日专注记录：严格按自然日展示，不做跨天累计 */
  function renderTodaySessions() {
    const d = Store.getData();
    const today = Countdown.todayStr();
    const todaySessions = d.sessions
      .filter(function (s) { return Countdown.fmtDate(new Date(s.start)) === today; })
      .sort(function (a, b) { return new Date(b.start) - new Date(a.start); });

    const totalMs = todaySessions.reduce(function (sum, s) { return sum + s.durationMs; }, 0);
    const goal = dailyTargetMinutes();
    const totalMin = Math.round(totalMs / 60000);
    const goalText = goal ? ' · 目标 ' + goal + ' 分钟' : '';
    $('todayTotal').textContent = '共 ' + Focus.humanize(totalMs) + goalText +
      (goal ? ' · 完成 ' + Math.min(999, Math.round(totalMin / goal * 100)) + '%' : '');

    renderSubjectProgress();

    if (!todaySessions.length) {
      $('todaySessions').innerHTML = '<div class="chart-empty">今天还没有专注记录</div>';
      return;
    }
    $('todaySessions').innerHTML = todaySessions.map(function (s) {
      const st = new Date(s.start);
      const en = new Date(s.end);
      const timeRange = Countdown.pad(st.getHours()) + ':' + Countdown.pad(st.getMinutes()) + ' - ' +
        Countdown.pad(en.getHours()) + ':' + Countdown.pad(en.getMinutes());
      return '<div class="session-item">' +
        '<span class="session-dot" style="background:' + subjectColorOf(s) + '"></span>' +
        '<div class="session-info">' +
          '<div class="session-name">' + esc(subjectNameOf(s)) + '</div>' +
          '<div class="session-time">' + timeRange + '</div>' +
        '</div>' +
        '<span class="session-dur">' + Focus.humanize(s.durationMs) + '</span>' +
      '</div>';
    }).join('');
  }

  /* ================= 统计 ================= */
  function lastNDays(n) {
    const arr = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      arr.push({ date: d, key: Countdown.fmtDate(d) });
    }
    return arr;
  }

  /* 按时间范围聚合各科目专注时长（含已删除科目的历史记录） */
  function subjectBreakdown(range) {
    const d = Store.getData();
    const days = range === 'day' ? 1 : (range === 'week' ? 7 : 30);
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    const map = {};
    d.sessions.forEach(function (s) {
      if (new Date(s.start) < from) return;
      const key = s.subjectId || '__unknown';
      if (!map[key]) map[key] = { id: key, ms: 0 };
      map[key].ms += s.durationMs;
      const subj = findSubject(key);
      map[key].name = subj ? subj.name : (s.subjectName || '未知');
      map[key].color = subj ? subj.color : (s.subjectColor || '#8a90a3');
    });

    const arr = Object.keys(map).map(function (k) { return map[k]; }).filter(function (x) { return x.ms > 0; });
    const total = arr.reduce(function (sum, x) { return sum + x.ms; }, 0);
    return arr.map(function (x) {
      return {
        id: x.id, name: x.name, color: x.color, ms: x.ms,
        value: Math.round(x.ms / 60000),
        percent: total ? Math.round(x.ms / total * 100) : 0
      };
    }).sort(function (a, b) { return b.ms - a.ms; });
  }

  /* 将会话时长拆入各自然小时（跨小时按比例计入） */
  function hourlyBreakdown(days) {
    const buckets = new Array(24).fill(0);
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    Store.getData().sessions.forEach(function (s) {
      const start = new Date(s.start);
      if (start < from) return;
      let remain = Math.max(0, s.durationMs || 0);
      let cursor = start.getTime();
      while (remain > 0) {
        const d = new Date(cursor);
        const hourEnd = new Date(d);
        hourEnd.setHours(d.getHours() + 1, 0, 0, 0);
        const slice = Math.min(remain, hourEnd.getTime() - cursor);
        if (slice > 0) buckets[d.getHours()] += slice;
        remain -= slice;
        cursor = hourEnd.getTime();
        if (cursor - start.getTime() > 24 * 3600 * 1000) break;
      }
    });

    return buckets.map(function (ms, h) {
      return {
        hour: h,
        label: h + '时',
        ms: ms,
        value: Math.round(ms / 60000)
      };
    });
  }

  /* 最强连续 2 小时窗口（可跨 0 点） */
  function findPeakWindow(hourly) {
    let best = { start: -1, end: -1, ms: 0 };
    for (let i = 0; i < 24; i++) {
      const a = hourly[i].ms + hourly[(i + 1) % 24].ms;
      if (a > best.ms) best = { start: i, end: (i + 1) % 24, ms: a };
    }
    if (best.ms <= 0) return null;
    return best;
  }

  function hourLabel(h) {
    return (h < 10 ? '0' + h : '' + h) + ':00';
  }

  function computeStats() {
    const d = Store.getData();
    const today = Countdown.todayStr();
    const goal = dailyTargetMinutes();

    let totalMs = 0, todayMs = 0;
    const dayMap = {};
    d.sessions.forEach(function (s) {
      const key = Countdown.fmtDate(new Date(s.start));
      totalMs += s.durationMs;
      if (key === today) todayMs += s.durationMs;
      dayMap[key] = (dayMap[key] || 0) + s.durationMs;
    });

    let streak = 0;
    const cursor = new Date();
    while (dayMap[Countdown.fmtDate(cursor)]) { streak++; cursor.setDate(cursor.getDate() - 1); }

    const weekTrend = lastNDays(7).map(function (x) {
      return { label: WEEK_CN[x.date.getDay()].slice(1), value: Math.round((dayMap[x.key] || 0) / 60000) };
    });
    const monthTrend = lastNDays(30).map(function (x) {
      return { label: (x.date.getMonth() + 1) + '/' + x.date.getDate(), value: Math.round((dayMap[x.key] || 0) / 60000) };
    });
    const maxMonth = monthTrend.reduce(function (m, x) { return Math.max(m, x.value); }, 0);
    monthTrend.forEach(function (x, i) {
      x.showLabel = x.value > 0 && (i === 0 || i === monthTrend.length - 1 || x.value === maxMonth);
    });

    const bySubject = subjectBreakdown('month');

    const avg7 = Math.round(weekTrend.reduce(function (s, x) { return s + x.value; }, 0) / 7);
    const avg30 = Math.round(monthTrend.reduce(function (s, x) { return s + x.value; }, 0) / 30);

    const hourly = hourlyBreakdown(30);
    const peak = findPeakWindow(hourly);
    let peakTitle = '';
    if (peak) {
      const endH = (peak.end + 1) % 24;
      peakTitle = hourLabel(peak.start) + '–' + hourLabel(endH);
    }
    const peakMinutes = peak ? Math.round(peak.ms / 60000) : 0;

    return {
      totalMinutes: Math.round(totalMs / 60000),
      totalHuman: Focus.humanize(totalMs),
      todayMinutes: Math.round(todayMs / 60000),
      todayHuman: Focus.humanize(todayMs),
      streakDays: streak,
      dailyGoal: goal,
      todayPercent: goal ? Math.round(todayMs / (goal * 60000) * 100) : 0,
      avg7Human: Focus.humanize(avg7 * 60000),
      avg30Human: Focus.humanize(avg30 * 60000),
      bySubject: bySubject,
      weekTrend: weekTrend,
      monthTrend: monthTrend,
      hourly: hourly,
      peak: peak,
      peakTitle: peakTitle,
      peakMinutes: peakMinutes
    };
  }

  function renderStats() {
    const st = computeStats();
    const cards = [
      { value: st.totalHuman, label: '累计专注', accent: true },
      { value: st.streakDays + ' 天', label: '连续专注', accent: false },
      { value: st.todayHuman, label: '今日专注', accent: false },
      { value: st.dailyGoal > 0 ? st.todayPercent + '%' : '—', label: '目标完成', accent: false }
    ];
    $('statCards').innerHTML = cards.map(function (c) {
      return '<div class="stat-card' + (c.accent ? ' accent' : '') + '">' +
        '<div class="value">' + c.value + '</div><div class="label">' + c.label + '</div></div>';
    }).join('');

    // 扇形图：按 日/周/月 范围聚合
    const breakdown = subjectBreakdown(pieRange);
    const rangeText = { day: '今日', week: '近 7 天', month: '近 30 天' }[pieRange] || '近 30 天';
    const rangeTotal = breakdown.reduce(function (sum, x) { return sum + x.ms; }, 0);
    const pieCanvas = $('chartPie');
    const pieOk = Charts.renderDonut(pieCanvas,
      breakdown.map(function (s) { return { label: s.name, value: s.value, color: s.color }; }),
      Focus.humanize(rangeTotal), rangeText);
    $('chartPieEmpty').classList.toggle('hidden', pieOk);
    const legend = pieCanvas.parentElement.querySelector('.legend') || addLegend(pieCanvas.parentElement);
    legend.innerHTML = breakdown.map(function (s) {
      return '<div class="legend-item">' +
        '<span class="legend-dot" style="background:' + s.color + '"></span>' +
        '<span class="legend-name">' + esc(s.name) + '</span>' +
        '<span class="legend-pct">' + s.percent + '%</span>' +
        '<span class="legend-dur">' + Focus.humanize(s.ms) + '</span>' +
        '</div>';
    }).join('');

    const barOk = Charts.renderBar($('chartBar'), st.weekTrend.map(function (x) {
      return { label: x.label, value: x.value, color: '#6366f1' };
    }), { target: st.dailyGoal });
    $('chartBarEmpty').classList.toggle('hidden', barOk);

    const lineOk = Charts.renderLine($('chartLine'), st.monthTrend, null, { maWindow: 7, showAvg: true });
    $('chartLineEmpty').classList.toggle('hidden', lineOk);

    // 高效时段分析（近 30 天 · 按小时）
    const hourItems = st.hourly.map(function (x) {
      return { label: x.label, value: x.value, color: '#6366f1' };
    });
    const hoursOk = Charts.renderHours($('chartHours'), hourItems, {
      peakStart: st.peak ? st.peak.start : -1,
      peakEnd: st.peak ? st.peak.end : -1
    });
    $('chartHoursEmpty').classList.toggle('hidden', hoursOk);
    const peakHint = $('peakHint');
    if (peakHint) {
      peakHint.textContent = st.peak
        ? '高效时段 ' + st.peakTitle + ' · 这 2 小时共 ' + Charts.fmtMin(st.peakMinutes)
        : '专注记录还不够，多积累几天就能算出高效时段';
    }

    window._lastSummary = st;
  }

  function addLegend(parent) {
    const div = document.createElement('div');
    div.className = 'legend';
    parent.appendChild(div);
    return div;
  }

  async function runAI() {
    const btn = $('aiAnalyzeBtn');
    const out = $('aiResult');
    const st = window._lastSummary || computeStats();
    const ai = Store.getData().settings.ai;
    if (!ai.enabled || !ai.endpoint) {
      toast('请先在“设置”中启用并配置 AI');
      showPage('settings');
      return;
    }
    btn.disabled = true;
    out.className = 'ai-result loading';
    out.textContent = '正在分析学习状态…';
    try {
      const content = await AI.analyze(st);
      out.className = 'ai-result';
      out.textContent = content;
    } catch (e) {
      out.className = 'ai-result error';
      out.textContent = '分析失败：' + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= 设置 ================= */
  function renderSettings() {
    const s = Store.getData().settings;
    $('pomodoroEnabled').checked = !!s.pomodoro.enabled;
    $('focusMinInput').value = s.pomodoro.focusMin;
    $('breakMinInput').value = s.pomodoro.breakMin;
    $('aiEnabled').checked = !!s.ai.enabled;
    $('aiProvider').value = s.ai.provider || 'deepseek';
    $('aiEndpoint').value = s.ai.endpoint || '';
    $('aiKey').value = s.ai.apiKey || '';
    $('aiModel').value = s.ai.model || '';
  }

  /* 访问 Capacitor 原生插件。本项目没有打包器，用全局 Capacitor.Plugins。*/
  function capPlugin(name) {
    const C = typeof window !== 'undefined' ? window.Capacitor : null;
    return (C && C.Plugins && C.Plugins[name]) || null;
  }

  function exportData() {
    const json = Store.exportJSON();
    const filename = 'shiguang-backup-' + Countdown.todayStr() + '.json';
    const blob = new Blob([json], { type: 'application/json' });

    function showFallback(msg) {
      showModal('导出备份',
        '<p style="font-size:13px;color:var(--text-soft);margin:0 0 10px">' +
          (msg || '请复制下方内容，粘贴到备忘录 / 微信文件传输助手，或保存为 ' + esc(filename)) +
        '</p>' +
        '<textarea id="exportText" readonly style="width:100%;height:180px;border:1px solid var(--border);border-radius:12px;padding:10px;font-size:12px;font-family:ui-monospace,Consolas,monospace;background:var(--bg-soft);color:var(--text)"></textarea>' +
        '<div class="form-actions">' +
          '<button id="exportCopy" class="btn primary">复制备份内容</button>' +
          '<button id="exportShare" class="btn">系统分享</button>' +
          '<button id="exportClose" class="btn">关闭</button>' +
        '</div>',
        function () {
          const ta = $('exportText');
          ta.value = json;
          $('exportCopy').onclick = function () {
            ta.select();
            ta.setSelectionRange(0, 99999999);
            const ok = function () { toast('已复制，请粘贴保存到备忘录或聊天工具'); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(json).then(ok, function () {
                try { document.execCommand('copy'); ok(); } catch (e) { toast('复制失败，请长按选中后复制'); }
              });
            } else {
              try { document.execCommand('copy'); ok(); } catch (e) { toast('复制失败，请长按选中后复制'); }
            }
          };
          $('exportShare').onclick = function () { shareBackup(blob, filename, json); };
          $('exportClose').onclick = closeModal;
        });
    }

    function tryDownload() {
      try {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast('已触发下载：' + filename + '，请在系统「下载」文件夹查看');
        return true;
      } catch (e) {
        return false;
      }
    }

    // 原生 App：Android WebView 既没有 navigator.share，也不处理 <a download>，
    // 必须用 Capacitor 插件把文件写进缓存目录，再拉起系统分享面板。
    const Filesystem = capPlugin('Filesystem');
    const Share = capPlugin('Share');
    if (Filesystem && typeof Filesystem.writeFile === 'function') {
      Filesystem.writeFile({
        path: filename,
        data: json,
        directory: 'CACHE',
        encoding: 'utf8'
      })
        .then(function (res) {
          if (Share && typeof Share.share === 'function') {
            return Share.share({
              title: '时光备份',
              text: '时光数据备份 ' + filename,
              url: res.uri,
              dialogTitle: '保存或发送备份文件'
            });
          }
          toast('备份已写入应用缓存：' + filename);
          return null;
        })
        .then(function () {
          toast('请在弹窗里选择「保存到文件」或发送给自己');
          return null;
        })
        .catch(function (err) {
          if (err && (err.name === 'AbortError' || /cancel/i.test(String(err.message || '')))) return;
          const msg = err && err.message ? err.message : '未知原因';
          showFallback('系统分享不可用（' + esc(msg) + '），请复制下方内容保存为 ' + esc(filename));
        });
      return;
    }

    // 网页环境：优先系统分享（能直接存文件/发微信）
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (canNativeShare) {
      const file = (typeof File === 'function')
        ? new File([blob], filename, { type: 'application/json' })
        : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '时光备份', text: '时光数据备份 ' + filename })
          .then(function () {
            toast('已打开分享，请保存到文件或发送给自己');
          })
          .catch(function (err) {
            if (err && err.name === 'AbortError') { toast('已取消分享'); return; }
            if (!tryDownload()) showFallback();
          });
        return;
      }
    }

    if (tryDownload()) return;
    showFallback('未能直接下载。请复制下方备份内容并保存为 ' + esc(filename));
  }

  function shareBackup(blob, filename, json) {
    const Filesystem = capPlugin('Filesystem');
    const Share = capPlugin('Share');
    if (Filesystem && typeof Filesystem.writeFile === 'function' && Share && typeof Share.share === 'function') {
      Filesystem.writeFile({ path: filename, data: json, directory: 'CACHE', encoding: 'utf8' })
        .then(function (res) {
          return Share.share({ title: '时光备份', text: '时光数据备份', url: res.uri, dialogTitle: '保存或发送备份文件' });
        })
        .catch(function () { toast('分享不可用，请用「复制备份内容」'); });
      return;
    }

    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const file = canNativeShare && (typeof File === 'function')
      ? new File([blob], filename, { type: 'application/json' })
      : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: '时光备份', text: '时光数据备份' })
        .then(function () { toast('已打开分享'); })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          toast('分享不可用，请用「复制备份内容」');
        });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () { toast('已复制备份内容'); });
    } else {
      toast('请长按文本框复制');
    }
  }

  /* ================= 初始化 ================= */
  function init() {
    applyTheme(Store.getData().settings.theme || 'light');

    // 恢复未正常结束的专注会话（进程被杀 / 清后台后）
    const recovered = Focus.restore();
    if (recovered) {
      selectedSubjectId = recovered.subjectId;
    }

    renderCountdownList();
    renderFocus();
    updateRing();
    lastToday = Countdown.todayStr();
    if (recovered) {
      $('timerText').textContent = Focus.format(recovered.elapsedMs);
      updateRing();
      toast('已恢复未完成的专注（已暂停 ' + Focus.humanize(recovered.elapsedMs) + '），可继续或结束');
    }

    // 顶栏主题切换
    $('themeToggle').onclick = function () {
      const cur = Store.getData().settings.theme;
      const next = resolveTheme(cur) === 'dark' ? 'light' : 'dark';
      Store.setSetting({ theme: next });
      applyTheme(next);
      rerenderCharts();
    };

    // 底部导航
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.onclick = function () { showPage(b.dataset.page); };
    });

    // 添加事件
    $('addEventBtn').onclick = function () { openEventModal(null); };

    // 详情页按钮
    $('detailBack').onclick = closeDetail;
    $('detailEdit').onclick = function () {
      const ev = Store.getData().events.find(function (x) { return x.id === detailEventId; });
      if (ev) openEventModal(ev);
    };
    $('detailBg').onclick = openBgModal;

    // 专注控制
    $('focusStartBtn').onclick = startFocus;
    $('focusPauseBtn').onclick = pauseFocus;
    $('focusStopBtn').onclick = stopFocus;

    // 扇形图范围切换
    $('pieRange').addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      pieRange = btn.dataset.r;
      $('pieRange').querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      renderStats();
    });

    // AI 分析
    $('aiAnalyzeBtn').onclick = runAI;

    // 设置：主题
    $('themeSeg').addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const theme = btn.dataset.theme;
      Store.setSetting({ theme: theme });
      applyTheme(theme);
      rerenderCharts();
    });

    // 设置：番茄钟
    $('pomodoroEnabled').addEventListener('change', function () {
      Store.setSetting({ pomodoro: Object.assign({}, Store.getData().settings.pomodoro, { enabled: this.checked }) });
    });
    $('focusMinInput').addEventListener('change', function () {
      const v = parseInt(this.value, 10);
      Store.setSetting({ pomodoro: Object.assign({}, Store.getData().settings.pomodoro, { focusMin: v || 25 }) });
    });
    $('breakMinInput').addEventListener('change', function () {
      const v = parseInt(this.value, 10);
      Store.setSetting({ pomodoro: Object.assign({}, Store.getData().settings.pomodoro, { breakMin: v || 5 }) });
    });

    // 设置：AI
    $('aiEnabled').addEventListener('change', function () {
      Store.setAISetting({ enabled: this.checked });
    });
    $('aiProvider').addEventListener('change', function () {
      const p = AI.presets()[this.value] || {};
      Store.setAISetting({ provider: this.value, endpoint: p.endpoint, model: p.model });
      renderSettings();
    });
    $('aiEndpoint').addEventListener('change', function () { Store.setAISetting({ endpoint: this.value.trim() }); });
    $('aiKey').addEventListener('change', function () { Store.setAISetting({ apiKey: this.value.trim() }); });
    $('aiModel').addEventListener('change', function () { Store.setAISetting({ model: this.value.trim() }); });

    // 设置：数据
    $('exportBtn').onclick = exportData;
    $('importBtn').onclick = function () { $('importFile').click(); };
    $('importFile').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          Store.importJSON(reader.result);
          toast('导入成功');
          location.reload();
        } catch (e) {
          toast('导入失败：文件格式错误');
        }
      };
      reader.readAsText(file);
    });

    // 弹窗遮罩关闭
    $('modal').addEventListener('click', function (e) {
      if (e.target === $('modal')) closeModal();
    });

    // 数据订阅：任何变更后刷新当前页
    Store.subscribe(function () {
      if (currentPage === 'countdown') renderCountdownList();
      if (currentPage === 'focus') { renderFocus(); updateRing(); }
      if (currentPage === 'stats') renderStats();
      if (detailEventId) renderDetail();
    });

    // 零点跨天检测：自动切换“今日”，不跨天累计
    setInterval(function () {
      const t = Countdown.todayStr();
      if (t !== lastToday) {
        lastToday = t;
        if (currentPage === 'countdown') renderCountdownList();
        if (currentPage === 'focus') { renderFocus(); updateRing(); }
        if (currentPage === 'stats') renderStats();
        if (detailEventId) renderDetail();
      }
    }, 30000);

    // 窗口尺寸变化重绘图表
    let resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (currentPage === 'stats') renderStats(); }, 200);
    });
  }

  function rerenderCharts() {
    if (currentPage === 'stats') renderStats();
  }

  document.addEventListener('DOMContentLoaded', init);
})();