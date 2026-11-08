// Small interactive canvas chart: many series, drag to zoom, double-click to
// reset, hover for the nearest point. Used by the foam and metamaterial explorers.
(function (root) {
  "use strict";
  const PALETTE = ["#2f6fde", "#e0453a", "#2e9d6b", "#d9822b", "#8a4fd6", "#16a9c7", "#c2417a", "#6b8e23", "#b8860b", "#4b5563"];

  function niceTicks(lo, hi, n = 6) {
    const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n + 0.5) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * span; v += step) out.push(+v.toPrecision(10));
    return out;
  }
  const fmt = (v) => { const a = Math.abs(v); return a !== 0 && (a >= 1e4 || a < 1e-3) ? v.toExponential(1) : String(+v.toPrecision(4)); };

  function create(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    let series = [], view = null, full = null, hover = null, drag = null;
    const L = 64, R = 16, T = 14, B = 46;
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

    function bounds() {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const s of series) for (let i = 0; i < s.x.length; i += 1) {
        const x = s.x[i], y = s.y[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (!Number.isFinite(x0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
      const px = (x1 - x0) * 0.03 || 1, py = (y1 - y0) * 0.05 || 1;
      return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py };
    }
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }
    function draw() {
      const { w, h } = size(), v = view || full;
      if (!v) return;
      const sx = (x) => L + ((x - v.x0) / (v.x1 - v.x0)) * (w - L - R), sy = (y) => h - B - ((y - v.y0) / (v.y1 - v.y0)) * (h - T - B);
      ctx.clearRect(0, 0, w, h);
      ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = css("--muted"); ctx.strokeStyle = css("--line"); ctx.lineWidth = 1;
      for (const y of niceTicks(v.y0, v.y1)) { ctx.beginPath(); ctx.moveTo(L, sy(y)); ctx.lineTo(w - R, sy(y)); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(fmt(y), L - 6, sy(y) + 4); }
      for (const x of niceTicks(v.x0, v.x1, 8)) { ctx.textAlign = "center"; ctx.fillText(fmt(x), sx(x), h - B + 16); }
      ctx.fillStyle = css("--ink"); ctx.textAlign = "center";
      ctx.fillText(opts.xlabel || "", (L + w - R) / 2, h - 10);
      ctx.save(); ctx.translate(14, (T + h - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(opts.ylabel || "", 0, 0); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(L, T, w - L - R, h - T - B); ctx.clip();
      for (const s of series) {
        ctx.strokeStyle = s.color; ctx.lineWidth = s === (hover && hover.s) ? 2.5 : 1.5; ctx.beginPath();
        let started = false;
        for (let i = 0; i < s.x.length; i += 1) {
          const X = sx(s.x[i]), Y = sy(s.y[i]);
          if (!Number.isFinite(X) || !Number.isFinite(Y)) { started = false; continue; }
          if (started) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); started = true; }
        }
        ctx.stroke();
      }
      if (hover) {
        const X = sx(hover.x), Y = sy(hover.y);
        ctx.fillStyle = hover.s.color; ctx.beginPath(); ctx.arc(X, Y, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (drag && drag.moved) { ctx.fillStyle = "rgba(127,127,127,0.18)"; ctx.fillRect(Math.min(drag.x, drag.x2), T, Math.abs(drag.x2 - drag.x), h - T - B); }
      ctx.restore();
      ctx.strokeStyle = css("--muted"); ctx.beginPath(); ctx.moveTo(L, h - B); ctx.lineTo(w - R, h - B); ctx.stroke();
      api.toData = (px) => v.x0 + ((px - L) / (w - L - R)) * (v.x1 - v.x0);
      api.toPx = { sx, sy };
    }
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (drag) { drag.x2 = px; drag.moved = Math.abs(px - drag.x) > 4; draw(); return; }
      if (!api.toPx) return;
      let best = null, bd = 400;
      for (const s of series) for (let i = 0; i < s.x.length; i += 1) {
        const dx = api.toPx.sx(s.x[i]) - px, dy = api.toPx.sy(s.y[i]) - py, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { s, i, x: s.x[i], y: s.y[i] }; }
      }
      hover = best; draw();
      if (opts.onHover) opts.onHover(best);
    });
    canvas.addEventListener("mouseleave", () => { hover = null; draw(); if (opts.onHover) opts.onHover(null); });
    canvas.addEventListener("mousedown", (e) => { const r = canvas.getBoundingClientRect(); drag = { x: e.clientX - r.left, x2: e.clientX - r.left, moved: false }; });
    window.addEventListener("mouseup", () => {
      if (drag && drag.moved && api.toData) {
        const a = api.toData(Math.min(drag.x, drag.x2)), b = api.toData(Math.max(drag.x, drag.x2));
        let y0 = Infinity, y1 = -Infinity;
        for (const s of series) for (let i = 0; i < s.x.length; i += 1) if (s.x[i] >= a && s.x[i] <= b) { y0 = Math.min(y0, s.y[i]); y1 = Math.max(y1, s.y[i]); }
        if (Number.isFinite(y0)) { const p = (y1 - y0) * 0.06 || 1; view = { x0: a, x1: b, y0: y0 - p, y1: y1 + p }; }
      }
      drag = null; draw();
    });
    canvas.addEventListener("dblclick", () => { view = null; draw(); });
    window.addEventListener("resize", draw);

    const api = {
      setSeries(list, labels) {
        series = list.map((s, k) => ({ color: PALETTE[k % PALETTE.length], ...s }));
        if (labels) Object.assign(opts, labels);
        full = bounds(); view = null; hover = null; draw();
        return series;
      },
      reset() { view = null; draw(); },
      redraw: draw,
      PALETTE,
    };
    return api;
  }
  root.TRLChart = { create, PALETTE };
})(window);
