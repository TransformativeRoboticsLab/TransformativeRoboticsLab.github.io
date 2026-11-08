// Fetches public data from the lab's GitHub repositories and writes compact
// JSON for the interactive models (data/*.json) plus data-driven thumbnails
// (thumbs/*.svg). Re-run after the project repositories change:
//   node tools/build-data.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = "https://raw.githubusercontent.com/TransformativeRoboticsLab";
const API = "https://api.github.com/repos/TransformativeRoboticsLab";
mkdirSync(join(ROOT, "data"), { recursive: true });
mkdirSync(join(ROOT, "thumbs"), { recursive: true });

async function text(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const raw = (repo, path) => text(`${RAW}/${repo}/main/${path.split("/").map(encodeURIComponent).join("/")}`);
async function tree(repo) {
  const r = await fetch(`${API}/${repo}/git/trees/main?recursive=1`);
  return (await r.json()).tree.filter((x) => x.type === "blob");
}
const r1 = (v, k = 1) => Math.round(v * 10 ** k) / 10 ** k;
const save = (name, obj) => { writeFileSync(join(ROOT, "data", name), JSON.stringify(obj)); console.log(`data/${name}`); };
const svg = (name, body) => { writeFileSync(join(ROOT, "thumbs", name), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">${body}</svg>`); console.log(`thumbs/${name}`); };

function csvRows(t) {
  return t.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(",").map((s) => s.replace(/^"|"$/g, "").trim()));
}
// Instron exports: optional "Results Table" blocks, then a header row
// containing Time / Displacement / Force, a units row, then numbers.
function instron(t) {
  const rows = csvRows(t);
  const meta = {};
  const h = rows.findIndex((r) => r.some((c) => /^time$/i.test(c)) && r.some((c) => /displacement|extension/i.test(c)));
  for (let i = 0; i < Math.max(0, h); i += 1) {
    const r = rows[i], next = rows[i + 2];
    if (r.includes("Height") && next) r.forEach((c, k) => { if (c && next[k] !== undefined && next[k] !== "") meta[c] = next[k]; });
  }
  if (h < 0) return null;
  const head = rows[h], col = (re) => head.findIndex((c) => re.test(c));
  const it = col(/^time$/i), id = col(/displacement|extension/i), iF = col(/force|load/i);
  const units = rows[h + 1].map((u) => u.replace(/[()]/g, ""));
  const pts = [];
  for (let i = h + 2; i < rows.length; i += 1) {
    const a = Number(rows[i][it]), b = Number(rows[i][id]), c = Number(rows[i][iF]);
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) pts.push([a, b, c]);
  }
  const fScale = /^n$/i.test(units[iF]) ? 1 / 1000 : 1; // store kN
  return { meta, units: { time: units[it], disp: units[id], force: "kN" }, pts: pts.map(([a, b, c]) => [a, b, c * fScale]) };
}
// Keep at most n points, always keeping the extremes of the force signal.
function decimate(pts, n = 1200) {
  if (pts.length <= n) return pts;
  const step = pts.length / n, out = [];
  for (let k = 0; k < n; k += 1) {
    const a = Math.floor(k * step), b = Math.min(pts.length, Math.floor((k + 1) * step));
    let lo = a, hi = a;
    for (let i = a; i < b; i += 1) { if (pts[i][2] < pts[lo][2]) lo = i; if (pts[i][2] > pts[hi][2]) hi = i; }
    for (const i of lo < hi ? [lo, hi] : [hi, lo]) if (out[out.length - 1] !== pts[i]) out.push(pts[i]);
  }
  return out;
}
const curve = (c) => ({ t: c.pts.map((p) => r1(p[0], 2)), d: c.pts.map((p) => r1(p[1], 4)), f: c.pts.map((p) => r1(p[2], 5)) });
const pathOf = (xs0, ys0, w, h, pad = 14) => {
  const k = Math.max(1, Math.ceil(xs0.length / 160));
  const xs = xs0.filter((_, i) => i % k === 0), ys = ys0.filter((_, i) => i % k === 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return xs.map((x, i) => `${i ? "L" : "M"}${(pad + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * pad)).toFixed(1)},${(h - pad - ((ys[i] - y0) / (y1 - y0 || 1)) * (h - 2 * pad)).toFixed(1)}`).join("");
};

// ---- TRUNC: motion-capture workspace and trajectory tests -------------------------
async function trunc() {
  const base = "matlab/training";
  const ws = csvRows(await raw("TRUNC", `${base}/data/2024_02_19_21_08_57/positions.csv`));
  const head = ws[0], ix = (n) => head.indexOf(n);
  const cables = head.filter((h) => /^l\d+$/.test(h));
  const pts = ws.slice(1).map((r) => [
    r1(1000 * Number(r[ix("x_end_avg")])), r1(1000 * Number(r[ix("y_end_avg")])), r1(1000 * Number(r[ix("z_end_avg")])),
    ...["qx_end_avg", "qy_end_avg", "qz_end_avg", "qw_end_avg"].map((q) => r1(Number(r[ix(q)]), 4)),
    ...cables.map((c) => r1(Number(r[ix(c)]), 2)),
  ]).filter((p) => p.every(Number.isFinite));
  const traj = {};
  for (const [name, dir] of [["circle", "circle_2024_02_21_15_16_35"], ["triangle", "triangle_2024_02_22_15_48_39"], ["line", "line_2024_02_22_17_32_07"]]) {
    const rows = csvRows(await raw("TRUNC", `${base}/experiments/${dir}/positions.csv`));
    const h = rows[0];
    traj[name] = rows.slice(1).map((r) => ["x_end_avg", "y_end_avg", "z_end_avg"].map((k) => r1(1000 * Number(r[h.indexOf(k)])))).filter((p) => p.every(Number.isFinite));
  }
  save("trunc.json", { units: "mm (position), mm (cable length change from home)", fields: ["x", "y", "z", "qx", "qy", "qz", "qw", ...cables], cables, points: pts, trajectories: traj });
  const sample = pts.filter((_, i) => i % 6 === 0);
  const xs = sample.map((p) => p[0]), zs = sample.map((p) => p[2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const dots = sample.map((p) => `<circle cx="${(20 + ((p[0] - x0) / (x1 - x0)) * 280).toFixed(1)}" cy="${(185 - ((p[2] - z0) / (z1 - z0)) * 170).toFixed(1)}" r="1.3" fill="hsl(${(200 + 140 * (p[2] - z0) / (z1 - z0)).toFixed(0)} 70% 55%)" fill-opacity="0.75"/>`).join("");
  const c = traj.circle, cx = c.map((p) => 20 + ((p[0] - x0) / (x1 - x0)) * 280), cz = c.map((p) => 185 - ((p[2] - z0) / (z1 - z0)) * 170);
  svg("trunc.svg", `<rect width="320" height="200" fill="#0f172a"/>${dots}<path d="${cx.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${cz[i].toFixed(1)}`).join("")}" fill="none" stroke="#fbbf24" stroke-width="2"/>`);
}

// ---- FPM: probed surfaces ----------------------------------------------------------
async function fpm() {
  const grid = csvRows(await raw("FPM_control", "Data/surface_20260330_171551.csv")).slice(1).map((r) => r.map(Number)).filter((r) => r.every(Number.isFinite));
  const scans = [];
  for (const f of ["radial_probe_a_20260406_002017_interactive.html", "radial_probe_a_20260406_011205_interactive.html"]) {
    const html = await raw("FPM_control", f);
    const at = html.indexOf("Plotly.newPlot(");
    const start = html.indexOf("[", at);
    let depth = 0, end = start;
    for (let i = start; i < html.length; i += 1) { if (html[i] === "[") depth += 1; else if (html[i] === "]") { depth -= 1; if (!depth) { end = i + 1; break; } } }
    const traces = JSON.parse(html.slice(start, end)).map((tr) => ({ name: tr.name, x: tr.x, y: tr.y, z: tr.z, type: tr.type, mode: tr.mode }));
    scans.push({ file: f, traces });
  }
  save("fpm.json", { grid: { columns: ["x", "y", "z_trigger"], units: "mm", rows: grid }, radial: scans });
  const xs = [...new Set(grid.map((r) => r[0]))], ys = [...new Set(grid.map((r) => r[1]))];
  const zs = grid.map((r) => r[2]), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const cw = 280 / xs.length, ch = 170 / ys.length;
  const cells = grid.map((r) => `<rect x="${(20 + xs.indexOf(r[0]) * cw).toFixed(1)}" y="${(15 + (ys.length - 1 - ys.indexOf(r[1])) * ch).toFixed(1)}" width="${(cw + 0.5).toFixed(1)}" height="${(ch + 0.5).toFixed(1)}" fill="hsl(${(240 - 200 * (r[2] - z0) / (z1 - z0 || 1)).toFixed(0)} 65% 52%)"/>`).join("");
  svg("fpm.svg", `<rect width="320" height="200" fill="#111827"/>${cells}`);
}

// ---- VTP foam durability ------------------------------------------------------------
async function vtp() {
  const files = (await tree("vtp-foam-durability")).filter((x) => x.path.startsWith("data/") && x.path.endsWith(".csv") && x.size < 400000);
  const groups = {};
  for (const f of files) {
    const c = instron(await raw("vtp-foam-durability", f.path));
    if (!c || c.pts.length < 5) continue;
    const g = f.path.split("/")[1];
    (groups[g] = groups[g] || []).push({ name: f.path.split("/").pop().replace(/\.csv$/, ""), path: f.path, ...curve({ pts: decimate(c.pts) }) });
  }
  save("vtp.json", { source: "TransformativeRoboticsLab/vtp-foam-durability", units: { t: "s", d: "mm", f: "kN" }, groups });
  const g = groups.VTP_testing || Object.values(groups)[0];
  const paths = g.slice(0, 5).map((c, k) => `<path d="${pathOf(c.d, c.f, 320, 200, 18)}" fill="none" stroke="${["#f97316", "#38bdf8", "#a3e635", "#f472b6", "#facc15"][k]}" stroke-width="2"/>`).join("");
  svg("vtp.svg", `<rect width="320" height="200" fill="#1c1917"/>${paths}`);
}

// ---- FDE metamaterials: compression tests -----------------------------------------------
async function fde() {
  const files = (await tree("FDE-Metamaterials")).filter((x) => x.path.startsWith("data/instron_tests/") && x.path.endsWith(".csv"));
  const groups = {};
  for (const f of files) {
    const c = instron(await raw("FDE-Metamaterials", f.path));
    if (!c || c.pts.length < 5) continue;
    const parts = f.path.split("/");
    const g = `${parts[2]} ${parts[3]}`;
    const m = c.meta, H = Number(m.Height), T = Number(m.Thickness), W = Number(m.Width);
    (groups[g] = groups[g] || []).push({
      name: parts.pop().replace(/\.csv$/, ""), path: f.path, label: m["Specimen label"] || "",
      dims: Number.isFinite(H * T * W) ? { height: H, thickness: T, width: W } : null,
      ...curve({ pts: decimate(c.pts, 500) }),
    });
  }
  save("fde.json", { source: "TransformativeRoboticsLab/FDE-Metamaterials", units: { t: "s", d: "mm", f: "kN" }, groups });
  const all = Object.values(groups).flat();
  const pick = [all.find((c) => /dense/i.test(c.name)), all.find((c) => /sparse/i.test(c.name)), ...Object.entries(groups).filter(([k]) => /metamaterial/i.test(k)).slice(0, 2).map(([, v]) => v[0])].filter(Boolean);
  const paths = pick.map((c, k) => `<path d="${pathOf(c.d, c.f, 320, 200, 18)}" fill="none" stroke="${["#22d3ee", "#a78bfa", "#fb7185", "#4ade80"][k]}" stroke-width="2"/>`).join("");
  svg("fde.svg", `<rect width="320" height="200" fill="#0c0a09"/>${paths}`);
}

// ---- RADs: rotating-square lattice with a lock-held dilation gradient ----------------------
function rads() {
  const cols = 9, rows = 5, dphi = Math.asin(0.1) * 180 / Math.PI;
  let s = `<rect width="320" height="200" fill="#0b1220"/>`;
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const theta = Math.min(80, 10 + dphi * (cols - 1 - c) * 1.4), alpha = (150 - theta) / 70;
    const t = alpha - 1, size = 13 + 9 * t, cx = 30 + c * 32.5, cy = 36 + r * 32;
    const col = `rgb(${Math.round(60 + 170 * t)},${Math.round(110 - 40 * t)},${Math.round(200 - 160 * t)})`;
    s += `<rect x="${(cx - size / 2).toFixed(1)}" y="${(cy - size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" fill="${col}" transform="rotate(${(theta * ((r + c) % 2 ? 1 : -1) / 2).toFixed(1)} ${cx} ${cy})"/>`;
  }
  svg("rads.svg", s);
}

const which = process.argv.slice(2);
const jobs = { trunc, fpm, vtp, fde, rads };
for (const [k, fn] of Object.entries(jobs)) if (!which.length || which.includes(k)) await fn();
