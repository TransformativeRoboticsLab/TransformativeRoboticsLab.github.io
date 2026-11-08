// Mechanical-test explorer: pick a test group and specimens, switch axes,
// zoom (drag), hover for values, and read peak force, travel and work.
// window.TRLCurves.mount({ data: "../../data/vtp.json", stressFromDims: false })
(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function mount(cfg) {
    const data = await (await fetch(cfg.data)).json();
    const groups = Object.keys(data.groups);
    const chart = root.TRLChart.create($("chart"), { onHover: showHover });
    $("group").innerHTML = groups.map((g) => `<option>${esc(g)}</option>`).join("");
    if (cfg.defaultGroup && groups.includes(cfg.defaultGroup)) $("group").value = cfg.defaultGroup;
    let selected = new Set();

    const modes = [["fd", "Force vs displacement"], ["ft", "Force vs time"], ["dt", "Displacement vs time"]];
    if (cfg.stressFromDims) modes.unshift(["ss", "Nominal stress vs strain"]);
    $("axes").innerHTML = modes.map(([k, t]) => `<option value="${k}">${t}</option>`).join("");

    function axesOf(c) {
      const m = $("axes").value;
      if (m === "ss" && c.dims) {
        const A = c.dims.thickness * c.dims.width, H = c.dims.height;
        return { x: c.d.map((d) => d / H), y: c.f.map((f) => (f * 1000) / A * 1000), xl: "nominal strain (–)", yl: "nominal stress (kPa)" };
      }
      if (m === "ft") return { x: c.t, y: c.f, xl: "time (s)", yl: "force (kN)" };
      if (m === "dt") return { x: c.t, y: c.d, xl: "time (s)", yl: "displacement (mm)" };
      return { x: c.d, y: c.f, xl: "displacement (mm)", yl: "force (kN)" };
    }
    function stats(c) {
      let peak = -Infinity, at = 0, work = 0;
      for (let i = 0; i < c.f.length; i += 1) {
        if (c.f[i] > peak) { peak = c.f[i]; at = c.d[i]; }
        if (i) work += 0.5 * (c.f[i] + c.f[i - 1]) * (c.d[i] - c.d[i - 1]); // kN mm = J
      }
      return { peak, at, dmax: Math.max(...c.d), dur: c.t[c.t.length - 1] - c.t[0], work };
    }
    function renderList() {
      const list = data.groups[$("group").value];
      $("series").innerHTML = list.map((c, k) => `<label><input type="checkbox" data-k="${k}" ${selected.has(k) ? "checked" : ""}/><span class="swatch" id="sw${k}"></span><span title="${esc(c.path)}">${esc(c.name)}${c.label ? ` <span class="muted">(${esc(c.label)})</span>` : ""}</span></label>`).join("");
      $("series").querySelectorAll("[data-k]").forEach((cb) => cb.addEventListener("change", () => { const k = Number(cb.dataset.k); if (cb.checked) selected.add(k); else selected.delete(k); plot(); }));
    }
    function plot() {
      const list = data.groups[$("group").value];
      const picked = [...selected].sort((a, b) => a - b).map((k) => ({ k, c: list[k] }));
      let labels = null;
      const series = picked.map(({ k, c }) => { const a = axesOf(c); labels = { xlabel: a.xl, ylabel: a.yl }; return { name: c.name, x: a.x, y: a.y, k }; });
      const drawn = chart.setSeries(series, labels || { xlabel: "", ylabel: "" });
      list.forEach((_, k) => { const sw = $(`sw${k}`); if (sw) sw.style.background = "transparent"; });
      drawn.forEach((s) => { const sw = $(`sw${s.k}`); if (sw) sw.style.background = s.color; });
      $("table").innerHTML = picked.length ? `<table style="width:100%;font-size:12px;border-collapse:collapse"><tr><th align="left">specimen</th><th align="right">peak kN</th><th align="right">at mm</th><th align="right">travel mm</th><th align="right">work J</th></tr>${picked.map(({ c }) => { const s = stats(c); return `<tr><td>${esc(c.name)}</td><td align="right">${s.peak.toFixed(3)}</td><td align="right">${s.at.toFixed(2)}</td><td align="right">${s.dmax.toFixed(2)}</td><td align="right">${s.work.toFixed(2)}</td></tr>`; }).join("")}</table><p class="muted" style="font-size:12px">Work is the area under force–displacement (net, loading and unloading).</p>` : "";
      $("hover").textContent = picked.length ? "Hover a curve. Drag to zoom, double-click to reset." : "Tick specimens to plot them.";
    }
    function showHover(h) {
      if (!h) return;
      const m = $("axes").value, unit = m === "ss" ? ["", " kPa"] : m === "fd" ? [" mm", " kN"] : m === "ft" ? [" s", " kN"] : [" s", " mm"];
      $("hover").textContent = `${h.s.name}\nx ${h.x.toPrecision(4)}${unit[0]}   y ${h.y.toPrecision(4)}${unit[1]}`;
    }
    $("group").addEventListener("change", () => { selected = new Set([0, 1, 2].filter((k) => k < data.groups[$("group").value].length)); renderList(); plot(); });
    $("axes").addEventListener("change", plot);
    $("all").addEventListener("click", () => { selected = new Set(data.groups[$("group").value].map((_, k) => k)); renderList(); plot(); });
    $("none").addEventListener("click", () => { selected = new Set(); renderList(); plot(); });
    $("group").dispatchEvent(new Event("change"));
    $("count").textContent = `${groups.length} test groups · ${Object.values(data.groups).reduce((s, g) => s + g.length, 0)} specimens`;
  }
  root.TRLCurves = { mount };
})(window);
