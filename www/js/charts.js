/* charts.js —— 自研 Canvas 图表（环形 / 柱形 / 折线），零外部依赖 */
(function () {
  'use strict';

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }

  /* 统一动画入口 */
  function animate(draw) {
    const t0 = performance.now();
    const dur = 450;
    function frame(t) {
      const raw = Math.min(1, (t - t0) / dur);
      draw(easeOut(raw));
      if (raw < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* 输入为分钟，展示精确到整分钟 */
  function fmtMin(m) {
    const total = Math.max(0, Math.round(m));
    if (total < 60) return total + '分';
    const h = Math.floor(total / 60);
    const rem = total % 60;
    return rem === 0 ? h + '小时' : h + '小时' + rem + '分';
  }

  /* ---------- 环形图（扇形/环形） ---------- */
  function luminanceOf(hex) {
    const c = parseHex(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  }

  function contrastOn(hex) {
    return luminanceOf(hex) > 0.62 ? '#1f2430' : '#ffffff';
  }

  function renderDonut(canvas, items, centerTop, centerBottom) {
    const { ctx, w, h } = setup(canvas);
    const total = items.reduce(function (s, i) { return s + i.value; }, 0);
    ctx.clearRect(0, 0, w, h);
    if (!items.length || total <= 0) return false;

    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 6;
    const r = R * 0.62;
    const mid = (R + r) / 2;
    const lineW = R - r;
    const track = cssVar('--grid', '#e5e7eb');

    animate(function (p) {
      ctx.clearRect(0, 0, w, h);
      // 背景轨道
      ctx.beginPath();
      ctx.arc(cx, cy, mid, 0, Math.PI * 2);
      ctx.strokeStyle = track;
      ctx.lineWidth = lineW;
      ctx.stroke();

      let start = -Math.PI / 2;
      const drawn = [];
      items.forEach(function (item) {
        const frac = item.value / total;
        const angle = frac * Math.PI * 2 * p;
        if (angle <= 0.001) return;
        ctx.beginPath();
        ctx.arc(cx, cy, mid, start, start + angle);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'butt';
        ctx.stroke();
        drawn.push({ item: item, frac: frac, midAngle: start + angle / 2 });
        start += angle;
      });

      // 扇区上的时长标注（占比足够大才画，避免挤压）
      if (p > 0.85) {
        drawn.forEach(function (d) {
          if (d.frac < 0.07) return;
          const lx = cx + Math.cos(d.midAngle) * mid;
          const ly = cy + Math.sin(d.midAngle) * mid;
          ctx.fillStyle = contrastOn(d.item.color);
          ctx.font = '700 10px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(fmtMin(d.item.value), lx, ly);
        });
      }

      // 中心文字：合计时长 + 范围
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = cssVar('--text', '#1f2937');
      ctx.font = '700 20px system-ui, -apple-system, sans-serif';
      ctx.fillText(centerTop, cx, cy - 7);
      ctx.fillStyle = cssVar('--muted', '#9ca3af');
      ctx.font = '400 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(centerBottom, cx, cy + 13);
    });
    return true;
  }

  /* ---------- 柱形图 ---------- */
  function renderBar(canvas, items, options) {
    const opts = options || {};
    const target = typeof opts.target === 'number' && opts.target > 0 ? opts.target : 0;
    const { ctx, w, h } = setup(canvas);
    let max = items.reduce(function (s, i) { return Math.max(s, i.value); }, 0);
    if (target > max) max = target;
    ctx.clearRect(0, 0, w, h);
    if (!items.length || max <= 0) return false;

    const padL = 8, padR = 8, padTop = 28, padBottom = 24;
    const plotW = w - padL - padR;
    const plotH = h - padTop - padBottom;
    const n = items.length;
    const slot = plotW / n;
    const barW = Math.min(36, slot * 0.62);
    const textColor = cssVar('--muted', '#9ca3af');
    const axisColor = cssVar('--border', '#e5e7eb');

    animate(function (p) {
      ctx.clearRect(0, 0, w, h);
      // 基线
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padTop + plotH + 0.5);
      ctx.lineTo(w - padR, padTop + plotH + 0.5);
      ctx.stroke();

      items.forEach(function (item, idx) {
        const cx = padL + slot * idx + slot / 2;
        const bh = (item.value / max) * plotH * p;
        const x = cx - barW / 2;
        const y = padTop + plotH - bh;
        const grad = ctx.createLinearGradient(0, y, 0, padTop + plotH);
        grad.addColorStop(0, item.color || '#6366f1');
        grad.addColorStop(1, shade(item.color || '#6366f1', -18));
        roundRect(ctx, x, y, barW, bh, 6);
        ctx.fillStyle = grad;
        ctx.fill();

        // 数值标签
        if (p > 0.9 && item.value > 0) {
          ctx.fillStyle = cssVar('--text-soft', '#4b5563');
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(fmtMin(item.value), cx, y - 3);
        }

        // x 轴标签
        ctx.fillStyle = textColor;
        ctx.font = '400 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(item.label, cx, padTop + plotH + 6);
      });

      // 每日目标虚线
      if (target > 0 && p > 0.55) {
        const ty = padTop + plotH - (target / max) * plotH;
        ctx.save();
        ctx.strokeStyle = cssVar('--warning', '#f59e0b');
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, ty + 0.5);
        ctx.lineTo(w - padR, ty + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cssVar('--warning', '#f59e0b');
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('目标 ' + fmtMin(target), w - padR, ty - 3);
        ctx.restore();
      }
    });
    return true;
  }

  /* ---------- 24 小时分布（高效时段） ---------- */
  function renderHours(canvas, items, options) {
    const opts = options || {};
    const peakStart = typeof opts.peakStart === 'number' ? opts.peakStart : -1;
    const peakEnd = typeof opts.peakEnd === 'number' ? opts.peakEnd : -1;
    const { ctx, w, h } = setup(canvas);
    const max = items.reduce(function (s, i) { return Math.max(s, i.value); }, 0);
    ctx.clearRect(0, 0, w, h);
    if (!items.length || max <= 0) return false;

    const padL = 8, padR = 8, padTop = 18, padBottom = 22;
    const plotW = w - padL - padR;
    const plotH = h - padTop - padBottom;
    const n = items.length;
    const slot = plotW / n;
    const barW = Math.max(3, slot * 0.62);
    const textColor = cssVar('--muted', '#9ca3af');
    const axisColor = cssVar('--border', '#e5e7eb');
    const peakColor = cssVar('--warning', '#f59e0b');

    // 不同时段分色：凌晨 / 上午 / 下午 / 晚上；累计最多用橙色
    function bandColor(h) {
      if (h < 6) return '#64748b';   // 凌晨
      if (h < 12) return '#0ea5e9';  // 上午
      if (h < 18) return '#8b5cf6';  // 下午
      return '#6366f1';              // 晚上
    }

    function inPeak(idx) {
      if (peakStart < 0 || peakEnd < 0) return false;
      if (peakStart <= peakEnd) return idx >= peakStart && idx <= peakEnd;
      return idx >= peakStart || idx <= peakEnd;
    }

    animate(function (p) {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padTop + plotH + 0.5);
      ctx.lineTo(w - padR, padTop + plotH + 0.5);
      ctx.stroke();

      items.forEach(function (item, idx) {
        const cx = padL + slot * idx + slot / 2;
        const bh = (item.value / max) * plotH * p;
        const x = cx - barW / 2;
        const y = padTop + plotH - bh;
        const isTop = item.value > 0 && item.value === max;
        const base = isTop ? peakColor : bandColor(idx);
        if (bh > 0.5) {
          const grad = ctx.createLinearGradient(0, y, 0, padTop + plotH);
          grad.addColorStop(0, base);
          grad.addColorStop(1, shade(base, isTop ? -10 : -18));
          roundRect(ctx, x, y, barW, bh, 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // 累计最多小时的数值标注
        if (p > 0.92 && isTop) {
          ctx.fillStyle = cssVar('--text-soft', '#4b5563');
          ctx.font = '600 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(fmtMin(item.value), cx, y - 3);
        }

        // x 轴：每 6 小时标一次
        if (idx % 6 === 0) {
          ctx.fillStyle = textColor;
          ctx.font = '400 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(item.label, cx, padTop + plotH + 6);
        }
      });

      // 高峰 2 小时窗口（与橙色高值区一致）
      if (p > 0.7 && peakStart >= 0 && peakEnd >= 0) {
        const from = peakStart <= peakEnd ? peakStart : 0;
        const to = peakStart <= peakEnd ? peakEnd : 23;
        const x0 = padL + slot * from + 1;
        const x1 = padL + slot * (to + 1) - 1;
        const by = padTop + plotH + 16;
        ctx.save();
        ctx.strokeStyle = peakColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, by);
        ctx.lineTo(x1, by);
        ctx.stroke();
        ctx.restore();
      }
    });
    return true;
  }

  /* ---------- 折线图 ---------- */
  function renderLine(canvas, items, areaColor, options) {
    const opts = options || {};
    const showMA = opts.maWindow !== 0;
    const maWindow = typeof opts.maWindow === 'number' && opts.maWindow > 1
      ? Math.floor(opts.maWindow) : 7;
    const showAvg = opts.showAvg !== false;
    const { ctx, w, h } = setup(canvas);
    const values = items.map(function (i) { return i.value; });
    let max = values.reduce(function (s, v) { return Math.max(s, v); }, 0);
    const avg = values.length ? values.reduce(function (s, v) { return s + v; }, 0) / values.length : 0;
    if (showAvg && avg > max) max = avg;

    function movingAverage(arr, win) {
      return arr.map(function (_, i) {
        const from = Math.max(0, i - win + 1);
        let sum = 0;
        for (let k = from; k <= i; k++) sum += arr[k];
        return sum / (i - from + 1);
      });
    }
    const maSeries = showMA ? movingAverage(values, maWindow) : null;
    if (maSeries) {
      const maMax = maSeries.reduce(function (s, v) { return Math.max(s, v); }, 0);
      if (maMax > max) max = maMax;
    }

    ctx.clearRect(0, 0, w, h);
    if (!items.length || max <= 0) return false;

    const padL = 8, padR = 8, padTop = 22, padBottom = 24;
    const plotW = w - padL - padR;
    const plotH = h - padTop - padBottom;
    const n = items.length;
    const step = n > 1 ? plotW / (n - 1) : 0;
    const lineColor = cssVar('--accent', '#6366f1');
    const gridColor = cssVar('--grid', '#e5e7eb');
    const labelColor = cssVar('--muted', '#9ca3af');
    const fill = areaColor || lineColor;

    function xAt(i) { return padL + (n > 1 ? step * i : plotW / 2); }
    function yAt(v) { return padTop + plotH - (v / max) * plotH; }

    animate(function (p) {
      ctx.clearRect(0, 0, w, h);
      const count = Math.max(2, Math.ceil(n * p));

      // 水平网格线
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let g = 0; g <= 3; g++) {
        const gy = padTop + (plotH / 3) * g;
        ctx.beginPath();
        ctx.moveTo(padL, gy + 0.5);
        ctx.lineTo(w - padR, gy + 0.5);
        ctx.stroke();
      }

      const visible = items.slice(0, count);

      // 面积渐变
      if (visible.length > 1) {
        const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
        grad.addColorStop(0, hexA(fill, 0.28));
        grad.addColorStop(1, hexA(fill, 0.02));
        ctx.beginPath();
        ctx.moveTo(xAt(0), padTop + plotH);
        visible.forEach(function (it, i) { ctx.lineTo(xAt(i), yAt(it.value)); });
        ctx.lineTo(xAt(visible.length - 1), padTop + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // 折线
      if (visible.length > 1) {
        ctx.beginPath();
        visible.forEach(function (it, i) {
          const px = xAt(i), py = yAt(it.value);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = fill;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // 均值参考线
      if (showAvg && avg > 0 && p > 0.5) {
        const ay = yAt(avg);
        ctx.save();
        ctx.strokeStyle = cssVar('--muted', '#9ca3af');
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, ay + 0.5);
        ctx.lineTo(w - padR, ay + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cssVar('--muted', '#9ca3af');
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('均值 ' + fmtMin(Math.round(avg)), padL, ay - 3);
        ctx.restore();
      }

      // N 日均线
      if (maSeries && visible.length > 1) {
        ctx.beginPath();
        visible.forEach(function (it, i) {
          const px = xAt(i), py = yAt(maSeries[i]);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = cssVar('--success', '#10b981');
        ctx.lineWidth = 1.75;
        ctx.setLineDash([6, 3]);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.setLineDash([]);
        if (p > 0.95) {
          const last = visible.length - 1;
          ctx.fillStyle = cssVar('--success', '#10b981');
          ctx.font = '600 10px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(maWindow + '日均线', w - padR, yAt(maSeries[last]) - 4);
        }
      }

      // 数据点 + 标签
      visible.forEach(function (it, i) {
        const px = xAt(i), py = yAt(it.value);
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = fill;
        ctx.lineWidth = 2;
        ctx.stroke();
        // 首尾与峰值标注
        if (it.showLabel) {
          ctx.fillStyle = cssVar('--text-soft', '#4b5563');
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(fmtMin(it.value), px, py - 6);
        }
      });

      // x 轴标签（稀疏显示）
      visible.forEach(function (it, i) {
        if (it.showLabel || i === visible.length - 1) {
          ctx.fillStyle = labelColor;
          ctx.font = '400 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(it.label, xAt(i), padTop + plotH + 6);
        }
      });
    });
    return true;
  }

  /* ---------- 工具 ---------- */
  function shade(hex, percent) {
    const c = parseHex(hex);
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const r = Math.round((t - c.r) * p + c.r);
    const g = Math.round((t - c.g) * p + c.g);
    const b = Math.round((t - c.b) * p + c.b);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function parseHex(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  function hexA(hex, alpha) {
    const c = parseHex(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }

  const Charts = {
    renderDonut: renderDonut,
    renderBar: renderBar,
    renderLine: renderLine,
    renderHours: renderHours,
    fmtMin: fmtMin,
    cssVar: cssVar
  };

  window.Charts = Charts;
})();
