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

  function fmtMin(m) {
    if (m < 60) return Math.round(m) + '分';
    const h = m / 60;
    return (Math.round(h * 10) / 10) + 'h';
  }

  /* ---------- 环形图（扇形/环形） ---------- */
  function renderDonut(canvas, items, centerTop, centerBottom) {
    const { ctx, w, h } = setup(canvas);
    const total = items.reduce(function (s, i) { return s + i.value; }, 0);
    ctx.clearRect(0, 0, w, h);
    if (!items.length || total <= 0) return false;

    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 6;
    const r = R * 0.66;
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
        start += angle;
      });

      // 中心文字
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
  function renderBar(canvas, items) {
    const { ctx, w, h } = setup(canvas);
    const max = items.reduce(function (s, i) { return Math.max(s, i.value); }, 0);
    ctx.clearRect(0, 0, w, h);
    if (!items.length || max <= 0) return false;

    const padL = 8, padR = 8, padTop = 24, padBottom = 24;
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
    });
    return true;
  }

  /* ---------- 折线图 ---------- */
  function renderLine(canvas, items, areaColor) {
    const { ctx, w, h } = setup(canvas);
    const max = items.reduce(function (s, i) { return Math.max(s, i.value); }, 0);
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
    fmtMin: fmtMin,
    cssVar: cssVar
  };

  window.Charts = Charts;
})();
