import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./style.css";
import {
  Graph, InternalEvent, UndoManager, ConnectionConstraint, Point, StencilShape, StencilShapeRegistry,
  ModelXmlSerializer, RubberBandHandler, getDefaultPlugins, ConstraintHandler, ImageBox,
  HandleConfig, VertexHandlerConfig, EdgeHandlerConfig, Clipboard
} from "@maxgraph/core";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SVGNS = "http://www.w3.org/2000/svg";
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
let toastT;
function toast(msg, ms = 2200) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); }

/* ---------- stencils: reusable symbols with fixed connection points ---------- */
const STENCILS = {
  data: `<shape name="data" w="100" h="60" aspect="variable" strokewidth="inherit">
    <connections><constraint x="0.6" y="0" perimeter="0"/><constraint x="0.4" y="1" perimeter="0"/><constraint x="0.1" y="0.5" perimeter="0"/><constraint x="0.9" y="0.5" perimeter="0"/></connections>
    <background><path><move x="20" y="0"/><line x="100" y="0"/><line x="80" y="60"/><line x="0" y="60"/><close/></path></background>
    <foreground><fillstroke/></foreground></shape>`,
  document: `<shape name="document" w="100" h="70" aspect="variable" strokewidth="inherit">
    <connections><constraint x="0.5" y="0" perimeter="0"/><constraint x="0" y="0.45" perimeter="0"/><constraint x="1" y="0.45" perimeter="0"/><constraint x="0.5" y="0.9" perimeter="0"/></connections>
    <background><path><move x="0" y="0"/><line x="100" y="0"/><line x="100" y="60"/><curve x1="75" y1="45" x2="25" y2="80" x3="0" y3="60"/><close/></path></background>
    <foreground><fillstroke/></foreground></shape>`,
  valve: `<shape name="valve" w="60" h="40" aspect="variable" strokewidth="inherit">
    <connections><constraint x="0" y="0.5" perimeter="0" name="in"/><constraint x="1" y="0.5" perimeter="0" name="out"/><constraint x="0.5" y="0.5" perimeter="0" name="stem"/></connections>
    <background><path><move x="0" y="0"/><line x="60" y="40"/><line x="60" y="0"/><line x="0" y="40"/><close/></path></background>
    <foreground><fillstroke/></foreground></shape>`,
  pump: `<shape name="pump" w="60" h="60" aspect="variable" strokewidth="inherit">
    <connections><constraint x="0" y="0.5" perimeter="0" name="suction"/><constraint x="0.5" y="0" perimeter="0" name="discharge"/></connections>
    <background><ellipse x="0" y="0" w="60" h="60"/></background>
    <foreground><fillstroke/><path><move x="30" y="0"/><line x="60" y="0"/></path><stroke/><path><move x="17" y="13"/><line x="47" y="30"/><line x="17" y="47"/><close/></path><stroke/></foreground></shape>`,
  instrument: `<shape name="instrument" w="56" h="56" aspect="fixed" strokewidth="inherit">
    <connections><constraint x="0.5" y="0" perimeter="0"/><constraint x="0.5" y="1" perimeter="0"/><constraint x="0" y="0.5" perimeter="0"/><constraint x="1" y="0.5" perimeter="0"/></connections>
    <background><ellipse x="0" y="0" w="56" h="56"/></background>
    <foreground><fillstroke/><path><move x="0" y="28"/><line x="56" y="28"/></path><stroke/></foreground></shape>`,
  resistor: `<shape name="resistor" w="80" h="20" aspect="variable" strokewidth="inherit">
    <connections><constraint x="0" y="0.5" perimeter="0"/><constraint x="1" y="0.5" perimeter="0"/></connections>
    <background/><foreground><path><move x="0" y="10"/><line x="15" y="10"/><line x="20" y="0"/><line x="30" y="20"/><line x="40" y="0"/><line x="50" y="20"/><line x="60" y="0"/><line x="65" y="10"/><line x="80" y="10"/></path><stroke/></foreground></shape>`,
  capacitor: `<shape name="capacitor" w="60" h="40" aspect="variable" strokewidth="inherit">
    <connections><constraint x="0" y="0.5" perimeter="0"/><constraint x="1" y="0.5" perimeter="0"/></connections>
    <background/><foreground><path><move x="0" y="20"/><line x="26" y="20"/><move x="26" y="0"/><line x="26" y="40"/><move x="34" y="0"/><line x="34" y="40"/><move x="34" y="20"/><line x="60" y="20"/></path><stroke/></foreground></shape>`,
  ground: `<shape name="ground" w="40" h="30" aspect="variable" strokewidth="inherit">
    <connections><constraint x="0.5" y="0" perimeter="0"/></connections>
    <background/><foreground><path><move x="20" y="0"/><line x="20" y="12"/><move x="4" y="12"/><line x="36" y="12"/><move x="10" y="19"/><line x="30" y="19"/><move x="16" y="26"/><line x="24" y="26"/></path><stroke/></foreground></shape>`,
};
for (const [name, xml] of Object.entries(STENCILS)) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  StencilShapeRegistry.add(name, new StencilShape(el));
}

/* ---------- library ---------- */
const TXT = { fillColor: "none", strokeColor: "none", align: "left", verticalAlign: "top", spacing: 4, whiteSpace: "wrap", fontSize: 14 };
const LIB = {
  basic: [
    { n: "Rectangle", w: 120, h: 60, s: { shape: "rectangle" }, v: "Box", i: `<rect x="2" y="5" width="34" height="18"/>` },
    { n: "Rounded", w: 120, h: 60, s: { rounded: true }, v: "Box", i: `<rect x="2" y="5" width="34" height="18" rx="5"/>` },
    { n: "Ellipse", w: 100, h: 70, s: { shape: "ellipse", perimeter: "ellipsePerimeter" }, v: "", i: `<ellipse cx="19" cy="14" rx="17" ry="11"/>` },
    { n: "Diamond", w: 100, h: 80, s: { shape: "rhombus", perimeter: "rhombusPerimeter" }, v: "", i: `<path d="M19 1 37 14 19 27 1 14z"/>` },
    { n: "Triangle", w: 80, h: 70, s: { shape: "triangle", perimeter: "trianglePerimeter", direction: "north" }, v: "", i: `<path d="M19 2 36 26H2z"/>` },
    { n: "Hexagon", w: 110, h: 60, s: { shape: "hexagon", perimeter: "hexagonPerimeter" }, v: "", i: `<path d="M9 3h20l8 11-8 11H9L1 14z"/>` },
    { n: "Cylinder", w: 70, h: 80, s: { shape: "cylinder" }, v: "", i: `<path d="M6 6v16c0 5 26 5 26 0V6"/><ellipse cx="19" cy="6" rx="13" ry="4"/>` },
    { n: "Cloud", w: 120, h: 80, s: { shape: "cloud" }, v: "", i: `<path d="M10 24a7 7 0 0 1-1-14 9 9 0 0 1 17-2 7 7 0 0 1 4 16z"/>` },
    { n: "Text", w: 140, h: 40, s: TXT, v: "Text", i: `<path class="np" d="M8 6V4h22v2M19 4v20M15 24h8"/>` },
  ],
  flow: [
    { n: "Process", w: 130, h: 60, s: {}, v: "Process", i: `<rect x="2" y="5" width="34" height="18"/>` },
    { n: "Decision", w: 120, h: 90, s: { shape: "rhombus", perimeter: "rhombusPerimeter" }, v: "Yes?", i: `<path d="M19 1 37 14 19 27 1 14z"/>` },
    { n: "Start / end", w: 120, h: 50, s: { rounded: true, arcSize: 50 }, v: "Start", i: `<rect x="2" y="7" width="34" height="14" rx="7"/>` },
    { n: "Data", w: 130, h: 60, s: { shape: "data" }, v: "Input", i: `<path d="M8 5h28l-6 18H2z"/>` },
    { n: "Document", w: 120, h: 75, s: { shape: "document" }, v: "Report", i: `<path d="M3 3h32v19c-8-6-16 6-32 0z"/>` },
    { n: "Database", w: 80, h: 90, s: { shape: "cylinder" }, v: "DB", i: `<path d="M6 6v16c0 5 26 5 26 0V6"/><ellipse cx="19" cy="6" rx="13" ry="4"/>` },
  ],
  symbols: [
    { n: "Valve", w: 60, h: 40, s: { shape: "valve", verticalLabelPosition: "bottom", verticalAlign: "top" }, v: "", i: `<path d="M4 4l30 20V4L4 24z"/>`, pts: [[4, 14], [34, 14], [19, 14]] },
    { n: "Pump", w: 60, h: 60, s: { shape: "pump", verticalLabelPosition: "bottom", verticalAlign: "top" }, v: "", i: `<circle cx="19" cy="14" r="12"/><path class="np" d="M19 2h12M14 8l11 6-11 6z"/>`, pts: [[7, 14], [19, 2]] },
    { n: "Instrument", w: 56, h: 56, s: { shape: "instrument", fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }, v: "TT\n101", i: `<circle cx="19" cy="14" r="12"/><path d="M7 14h24"/>` },
    { n: "Resistor", w: 80, h: 20, s: { shape: "resistor", verticalLabelPosition: "top", verticalAlign: "bottom" }, v: "", i: `<path class="np" d="M1 14h7l2-6 4 12 4-12 4 12 4-12 2 6h9"/>`, pts: [[1, 14], [37, 14]] },
    { n: "Capacitor", w: 60, h: 40, s: { shape: "capacitor", verticalLabelPosition: "top", verticalAlign: "bottom" }, v: "", i: `<path class="np" d="M2 14h15M17 5v18M21 5v18M21 14h15"/>`, pts: [[2, 14], [36, 14]] },
    { n: "Ground", w: 40, h: 30, s: { shape: "ground" }, v: "", i: `<path class="np" d="M19 3v9M9 12h20M13 17h12M17 22h4"/>`, pts: [[19, 3]] },
  ],
};
const MINE_KEY = "linework.symbols.v1";
const DOC_KEY = "linework.doc.v1";
function loadMine() { try { return JSON.parse(store.get(MINE_KEY) || "[]"); } catch { return []; } }
function saveMine(list) { store.set(MINE_KEY, JSON.stringify(list)); }

/* ---------- graph ---------- */
const container = $("#graph");
const graph = new Graph(container, undefined, [...getDefaultPlugins(), RubberBandHandler]);
const model = graph.getDataModel ? graph.getDataModel() : graph.model;
const view = graph.getView();
graph.options.foldingEnabled = false;
graph.setConnectable(false);
graph.setAllowDanglingEdges(true);
const SNAP_KEY = "linework.snap.v1";
let snapOn = store.get(SNAP_KEY) !== "0";
graph.setGridEnabled(snapOn);
graph.setGridSize(10);
graph.setTooltips(false);
graph.setCellsEditable(false);
graph.tolerance = 14;
graph.tapAndHoldEnabled = false;
graph.doubleTapTimeout = 280;

const selH = graph.getPlugin("SelectionHandler");
const rubber = graph.getPlugin("RubberBandHandler");
const panH = graph.getPlugin("PanningHandler");
const connH = graph.getPlugin("ConnectionHandler");
if (selH) selH.guidesEnabled = true;
if (panH) panH.panningEnabled = false;
rubber?.setEnabled(false);

HandleConfig.size = 14;
HandleConfig.labelSize = 10;
EdgeHandlerConfig.handleShape = "circle";
EdgeHandlerConfig.virtualBendsEnabled = false;

/* Connection-point marker used when re-attaching edge ends */
const PORT_IMG = new ImageBox("data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="5.2" fill="#fff" stroke="#0E7C8F" stroke-width="2.4"/></svg>`), 14, 14);
for (const m of ["update", "redraw", "setFocus"]) {
  const orig = ConstraintHandler.prototype[m];
  if (typeof orig === "function") ConstraintHandler.prototype[m] = function (...a) { this.pointImage = PORT_IMG; return orig.apply(this, a); };
}

/* Ports: style.ports = "x,y;x,y" (relative 0–1). Falls back to stencil points, then four side midpoints. */
const parsePorts = (s) => String(s).split(";").filter(Boolean).map((p) => p.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
const fmtPorts = (arr) => arr.map(([x, y]) => `${+x.toFixed(3)},${+y.toFixed(3)}`).join(";");
const SIDES = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
function constraintsFor(state) {
  if (!state || !state.cell || !state.cell.isVertex()) return null;
  const st = state.cell.style || {};
  if (st.fillColor === "none" && st.strokeColor === "none" && !st.ports && !state.cell.getChildCount()) return null;
  if (st.ports) return parsePorts(st.ports).map(([x, y]) => new ConnectionConstraint(new Point(x, y), false));
  const sc = state.shape?.stencil?.constraints;
  if (sc && sc.length) return sc;
  return SIDES.map(([x, y]) => new ConnectionConstraint(new Point(x, y), true));
}
graph.getAllConnectionConstraints = (terminal) => constraintsFor(terminal);
function relPortsOf(cell) {
  const st = cell.style || {};
  if (st.ports) return parsePorts(st.ports);
  const state = view.getState(cell);
  const sc = state?.shape?.stencil?.constraints;
  if (sc && sc.length) return sc.map((c) => [c.point.x, c.point.y]);
  return SIDES.map((p) => p.slice());
}

/* Theme-aware default styles */
function applyTheme() {
  const ss = graph.getStylesheet();
  const v = ss.getDefaultVertexStyle(), e = ss.getDefaultEdgeStyle();
  Object.assign(v, { fillColor: css("--shape-fill"), strokeColor: css("--ink"), fontColor: css("--ink"), strokeWidth: 1.5,
    fontFamily: "IBM Plex Sans, system-ui, sans-serif", fontSize: 13, whiteSpace: "wrap", spacing: 4 });
  Object.assign(e, { strokeColor: css("--ink"), fontColor: css("--ink"), strokeWidth: 1.5, edgeStyle: "orthogonalEdgeStyle", rounded: true,
    endArrow: "classic", endSize: 7, fontFamily: "IBM Plex Sans, system-ui, sans-serif", fontSize: 12, labelBackgroundColor: css("--canvas") });
  VertexHandlerConfig.selectionColor = EdgeHandlerConfig.selectionColor = EdgeHandlerConfig.connectFillColor = css("--accent");
  HandleConfig.fillColor = css("--paper"); HandleConfig.strokeColor = css("--accent");
  HandleConfig.labelFillColor = css("--accent");
  graph.refresh();
  drawOverlay();
}
const mq = matchMedia("(prefers-color-scheme: dark)");
mq.addEventListener?.("change", applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* Undo */
const undo = new UndoManager();
// UNDO fires after CHANGE, so the buttons must re-sync here too
const onUndoable = (_s, evt) => { undo.undoableEditHappened(evt.getProperty("edit")); syncUndo(); };
model.addListener(InternalEvent.UNDO, onUndoable);
view.addListener(InternalEvent.UNDO, onUndoable);
function syncUndo() { $("#undo").disabled = !undo.canUndo(); $("#redo").disabled = !undo.canRedo(); }
$("#undo").onclick = () => { undo.undo(); syncUndo(); };
$("#redo").onclick = () => { undo.redo(); syncUndo(); };

/* Save */
let saveT;
function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { const ok = store.set(DOC_KEY, new ModelXmlSerializer(model).export()); $("#status").textContent = ok ? "Saved on this device" : "Not saved: storage unavailable"; }
    catch (err) { $("#status").textContent = "Save failed"; console.warn(err); }
  }, 500);
}

/* ---------- coordinates ---------- */
const stage = $("#stage");
function local(e) { const r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function toGraph(p) { const s = view.scale, t = view.translate; return { x: p.x / s - t.x, y: p.y / s - t.y }; }
function viewCenter() { return toGraph({ x: container.clientWidth / 2, y: container.clientHeight / 2 }); }
const snap = (n) => snapOn ? Math.round(n / 10) * 10 : Math.round(n);
function setSnap(on) {
  snapOn = on; graph.setGridEnabled(on); store.set(SNAP_KEY, on ? "1" : "0");
  container.classList.toggle("nosnap", !on);
  toast(on ? "Snap to grid on" : "Snap to grid off");
}
container.classList.toggle("nosnap", !snapOn);

/* ---------- insert ---------- */
let placeOffset = 0;
function insertItem(item, at) {
  const c = at || (() => { const vc = viewCenter(); placeOffset = (placeOffset + 20) % 100; return { x: vc.x + placeOffset - 40, y: vc.y + placeOffset - 40 }; })();
  const x = snap(c.x - item.w / 2), y = snap(c.y - item.h / 2);
  let cell;
  graph.batchUpdate(() => {
    const parent = graph.getDefaultParent();
    if (item.parts && item.parts.length > 1) {
      cell = graph.insertVertex({ parent, value: "", x, y, width: item.w, height: item.h, style: { fillColor: "none", strokeColor: "none", ports: item.ports } });
      for (const p of item.parts) graph.insertVertex({ parent: cell, value: p.v, x: p.x, y: p.y, width: p.w, height: p.h, style: { ...p.s } });
    } else if (item.parts) {
      const p = item.parts[0];
      cell = graph.insertVertex({ parent, value: p.v, x, y, width: item.w, height: item.h, style: { ...p.s, ...(item.ports ? { ports: item.ports } : {}) } });
    } else {
      cell = graph.insertVertex({ parent, value: item.v, x, y, width: item.w, height: item.h, style: { ...item.s } });
    }
  });
  graph.setSelectionCell(cell);
  return cell;
}

/* ---------- library drawer ---------- */
let cat = "basic";
function tileSvg(item) {
  if (item.i) {
    const pts = (item.pts || []).map(([x, y]) => `<circle class="pt" cx="${x}" cy="${y}" r="2.4"/>`).join("");
    return `<svg viewBox="0 0 38 28" aria-hidden="true">${item.i}${pts}</svg>`;
  }
  const pr = parsePorts(item.ports || "");
  const w = 34, h = Math.max(10, Math.min(24, 34 * item.h / item.w)), ox = 2, oy = (28 - h) / 2;
  return `<svg viewBox="0 0 38 28" aria-hidden="true"><rect x="${ox}" y="${oy}" width="${w}" height="${h}" rx="3" style="stroke-dasharray:3 2"/>${pr.map(([x, y]) => `<circle class="pt" cx="${ox + x * w}" cy="${oy + y * h}" r="2.4"/>`).join("")}</svg>`;
}
function renderTiles() {
  const box = $("#tiles");
  const items = cat === "mine" ? loadMine() : LIB[cat];
  box.innerHTML = "";
  if (!items.length) { box.innerHTML = `<p class="empty">No saved symbols yet. Select a shape or a group, open <b>Points</b>, then <b>Save to library</b>.</p>`; return; }
  items.forEach((item, idx) => {
    const b = document.createElement("button");
    b.className = "tile"; b.type = "button"; b.title = item.n; b.setAttribute("aria-label", "Add " + item.n);
    b.innerHTML = `${tileSvg(item)}<small>${item.n.replace(/[<&]/g, "")}</small>`;
    attachTileDrag(b, item, idx);
    box.appendChild(b);
  });
}
document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
  cat = t.dataset.cat;
  document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
  renderTiles();
});
function setDrawer(open) { $("#drawer").classList.toggle("closed", !open); $("#tool-shapes").setAttribute("aria-pressed", String(open)); }
$("#tool-shapes").onclick = () => setDrawer($("#drawer").classList.contains("closed"));

function attachTileDrag(el, item, idx) {
  let start = null, ghost = null, lp = null;
  el.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
    if (cat === "mine") lp = setTimeout(() => { lp = null; start = null; mineMenu(e, idx); }, 600);
  });
  el.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const d = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (d > 8 && lp) { clearTimeout(lp); lp = null; }
    if (!ghost && d > 10) { ghost = document.createElement("div"); ghost.className = "ghost"; ghost.innerHTML = tileSvg(item); document.body.appendChild(ghost); }
    if (ghost) { ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; }
  });
  const end = (e) => {
    if (lp) { clearTimeout(lp); lp = null; }
    if (!start) return;
    const wasDrag = !!ghost;
    ghost?.remove(); ghost = null; start = null;
    if (e.type === "pointercancel") return;
    if (!wasDrag) { insertItem(item); if (matchMedia("(max-width: 700px)").matches) setDrawer(false); return; }
    const r = container.getBoundingClientRect();
    const overDrawer = $("#drawer").contains(document.elementFromPoint(e.clientX, e.clientY));
    if (!overDrawer && e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) insertItem(item, toGraph(local(e)));
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

/* ---------- modes ---------- */
let mode = "select";
let armed = null;       // { cell, c } — first end of a tap-tap connection
let portsCell = null;   // cell whose connection points are being edited
const HINTS = {
  connect: "Drag from a point to another point, or tap one point then another",
  box: "Drag on empty canvas to select an area",
  ports: "Tap the shape to add a connection point · tap a point to remove it",
};
function setMode(m) {
  mode = m; armed = null;
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m || (m === "ports" && b.dataset.mode === "select"))));
  graph.setEnabled(m === "select" || m === "box");
  rubber?.setEnabled(m === "box");
  if (m !== "ports") portsCell = null;
  if (HINTS[m]) toast(HINTS[m], 2800);
  drawOverlay(); updateBar(); renderPop();
}
document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => setMode(b.dataset.mode));
$("#tool-text").onclick = () => { setMode("select"); insertItem(LIB.basic.find((i) => i.n === "Text")); focusLabel(); };

/* ---------- overlay: connection points ---------- */
const ov = $("#overlay");
function el(tag, attrs, parent = ov) { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; }
function portPoints(cell) {
  const state = view.getState(cell);
  if (!state) return [];
  const cs = constraintsFor(state) || [];
  return cs.map((c, i) => { const p = graph.getConnectionPoint(state, c); return p ? { x: p.x, y: p.y, c, i } : null; }).filter(Boolean);
}
function allVertices(parent = graph.getDefaultParent(), out = []) {
  for (const c of parent.children || []) { if (c.isVertex()) { out.push(c); if (!(c.style?.ports)) allVertices(c, out); } }
  return out;
}
let tempLine = null;
function drawOverlay() {
  ov.textContent = "";
  if (mode === "connect") {
    for (const cell of allVertices()) {
      for (const p of portPoints(cell)) {
        el("circle", { class: "halo", cx: p.x, cy: p.y, r: 20 });
        const isArmed = armed && armed.cell === cell && armed.i === p.i;
        el("circle", { class: "port" + (isArmed ? " armed" : ""), cx: p.x, cy: p.y, r: 7 });
      }
    }
  } else if (mode === "ports" && portsCell) {
    const s = view.getState(portsCell);
    if (s) {
      el("rect", { class: "frame", x: s.x, y: s.y, width: s.width, height: s.height });
      for (let k = 1; k < 4; k++) {
        el("line", { class: "gridtick", x1: s.x + s.width * k / 4, y1: s.y, x2: s.x + s.width * k / 4, y2: s.y + s.height });
        el("line", { class: "gridtick", x1: s.x, y1: s.y + s.height * k / 4, x2: s.x + s.width, y2: s.y + s.height * k / 4 });
      }
      for (const [x, y] of relPortsOf(portsCell)) el("circle", { class: "port", cx: s.x + x * s.width, cy: s.y + y * s.height, r: 8 });
    }
  }
  if (tempLine) el("line", { class: "rubber", x1: tempLine.x1, y1: tempLine.y1, x2: tempLine.x2, y2: tempLine.y2 });
}
function hitPort(pt, radius = 26) {
  let best = null, bd = radius;
  for (const cell of allVertices()) for (const p of portPoints(cell)) {
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < bd) { bd = d; best = { cell, c: p.c, i: p.i, x: p.x, y: p.y }; }
  }
  return best;
}
function vertexAt(pt) {
  let c = graph.getCellAt(pt.x, pt.y, null, true, false);
  while (c && c.parent && c.parent !== graph.getDefaultParent() && !(c.style?.ports)) c = c.parent;
  return c && c.isVertex() ? c : null;
}
function connect(src, dst, endPt) {
  const style = {};
  if (src.c) Object.assign(style, { exitX: src.c.point.x, exitY: src.c.point.y, exitPerimeter: src.c.perimeter ? 1 : 0 });
  if (dst?.c) Object.assign(style, { entryX: dst.c.point.x, entryY: dst.c.point.y, entryPerimeter: dst.c.perimeter ? 1 : 0 });
  let edge;
  graph.batchUpdate(() => {
    edge = graph.insertEdge({ parent: graph.getDefaultParent(), value: "", source: src.cell, target: dst?.cell || null, style });
    if (!dst && endPt) { const g = toGraph(endPt); edge.geometry.setTerminalPoint(new Point(snap(g.x), snap(g.y)), false); }
  });
  return edge;
}
function editPortsAt(pt) {
  const s = view.getState(portsCell); if (!s) return;
  const ports = relPortsOf(portsCell);
  const hit = ports.findIndex(([x, y]) => Math.hypot(s.x + x * s.width - pt.x, s.y + y * s.height - pt.y) < 22);
  if (hit >= 0) ports.splice(hit, 1);
  else {
    const pad = 28;
    if (pt.x < s.x - pad || pt.x > s.x + s.width + pad || pt.y < s.y - pad || pt.y > s.y + s.height + pad) return false;
    let x = Math.min(1, Math.max(0, (pt.x - s.x) / s.width)), y = Math.min(1, Math.max(0, (pt.y - s.y) / s.height));
    const q = (n) => Math.round(n * 8) / 8;
    x = q(x); y = q(y);
    const edgeSnap = 0.1;
    if (x < edgeSnap) x = 0; if (x > 1 - edgeSnap) x = 1; if (y < edgeSnap) y = 0; if (y > 1 - edgeSnap) y = 1;
    ports.push([x, y]);
  }
  model.setStyle(portsCell, { ...portsCell.style, ports: fmtPorts(ports) || "" });
  return true;
}

/* ---------- gestures: pinch, pan, long-press, connect, ports ---------- */
const pointers = new Map();
let gesture = null;    // { kind: 'pinch'|'pan'|'lock'|'connect'|'tap', ... }
let lpTimer = null, lpStart = null;
function inCanvas(e) { const t = e.target; return t instanceof Node && (container.contains(t) || t === ov || ov.contains(t)); }
function resetMg() {
  for (const h of [selH, rubber, connH, panH]) { try { h?.reset?.(); } catch {} }
  try { graph.isMouseDown = false; } catch {}
}
function isBackground(e, pt) {
  const overlayPane = view.getOverlayPane?.();
  if (overlayPane && overlayPane.contains(e.target)) return false;
  return !graph.getCellAt(pt.x, pt.y);
}
let raf = 0, pending = null;
function setView(s, tx, ty) { pending = [s, tx, ty]; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const [a, b, c] = pending; view.scaleAndTranslate(a, b, c); }); }
function stop(e) { e.stopPropagation(); e.stopImmediatePropagation?.(); }

window.addEventListener("pointerdown", (e) => {
  if (!inCanvas(e)) return;
  const pt = local(e);
  pointers.set(e.pointerId, { ...pt, type: e.pointerType });
  if (pointers.size === 2) {
    clearTimeout(lpTimer); lpTimer = null; tempLine = null; drawOverlay();
    resetMg();
    const [a, b] = [...pointers.values()];
    gesture = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: view.scale,
      world: toGraph({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
    stop(e); return;
  }
  if (pointers.size > 2) { stop(e); return; }

  // Long press (touch or pen) opens the context menu
  if (e.pointerType !== "mouse" && (mode === "select" || mode === "box")) {
    lpStart = pt;
    lpTimer = setTimeout(() => { lpTimer = null; resetMg(); gesture = { kind: "lock" }; contextMenu(e.clientX, e.clientY, pt); }, 520);
  }

  if (mode === "connect") {
    const hp = hitPort(pt);
    if (hp) { gesture = { kind: "connect", src: hp, start: pt, moved: false }; stop(e); return; }
    if (armed) { gesture = { kind: "tap", start: pt }; stop(e); return; }
    gesture = { kind: "pan", last: pt, start: pt }; stop(e); return;
  }
  if (mode === "ports") { gesture = { kind: "tap", start: pt, pan: true, last: pt }; stop(e); return; }

  const bg = isBackground(e, pt);
  if (mode === "select" && bg && e.pointerType !== "pen") { gesture = { kind: "pan", last: pt, start: pt }; stop(e); return; }
  if (mode === "select" && bg && e.pointerType === "pen") { rubber?.setEnabled(true); gesture = { kind: "penbox" }; return; }
  if (mode === "box" && bg && e.pointerType === "touch") { /* box mode: finger drags select too */ }
}, true);

window.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const pt = local(e);
  const rec = pointers.get(e.pointerId); rec.x = pt.x; rec.y = pt.y;
  if (lpTimer && Math.hypot(pt.x - lpStart.x, pt.y - lpStart.y) > 10) { clearTimeout(lpTimer); lpTimer = null; }
  if (!gesture) return;
  if (gesture.kind === "pinch" && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const s = Math.min(4, Math.max(0.2, gesture.s0 * d / gesture.d0));
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    setView(s, m.x / s - gesture.world.x, m.y / s - gesture.world.y);
    stop(e); e.preventDefault(); return;
  }
  if (gesture.kind === "pan" || (gesture.kind === "tap" && gesture.pan)) {
    if (gesture.kind === "tap" && Math.hypot(pt.x - gesture.start.x, pt.y - gesture.start.y) > 8) gesture = { kind: "pan", last: gesture.last, start: gesture.start };
    if (gesture.kind === "pan") {
      const s = view.scale, t = view.translate;
      setView(s, t.x + (pt.x - gesture.last.x) / s, t.y + (pt.y - gesture.last.y) / s);
      gesture.last = pt;
    }
    stop(e); return;
  }
  if (gesture.kind === "connect") {
    if (Math.hypot(pt.x - gesture.start.x, pt.y - gesture.start.y) > 8) gesture.moved = true;
    if (gesture.moved) { const over = hitPort(pt); tempLine = { x1: gesture.src.x, y1: gesture.src.y, x2: over ? over.x : pt.x, y2: over ? over.y : pt.y }; drawOverlay(); }
    stop(e); return;
  }
  if (gesture.kind === "lock" || gesture.kind === "tap") { stop(e); }
}, true);

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const pt = local(e);
  pointers.delete(e.pointerId);
  if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
  if (!gesture) return;
  const g = gesture;
  if (g.kind === "pinch") { stop(e); if (pointers.size === 0) gesture = null; else gesture = { kind: "lock" }; return; }
  if (g.kind === "lock") { stop(e); if (pointers.size === 0) gesture = null; return; }
  if (g.kind === "penbox") { gesture = null; setTimeout(() => rubber?.setEnabled(mode === "box"), 0); return; }
  gesture = null;
  if (e.type === "pointercancel") { tempLine = null; drawOverlay(); stop(e); return; }

  if (g.kind === "pan") {
    stop(e);
    if (mode === "select" && Math.hypot(pt.x - g.start.x, pt.y - g.start.y) < 8) graph.clearSelection();
    return;
  }
  if (g.kind === "connect") {
    stop(e); tempLine = null;
    if (!g.moved) {
      if (armed && !(armed.cell === g.src.cell && armed.i === g.src.i)) { const ed = connect(armed, g.src); armed = null; flashEdge(ed); }
      else armed = (armed && armed.cell === g.src.cell && armed.i === g.src.i) ? null : g.src;
      drawOverlay(); return;
    }
    const dst = hitPort(pt);
    if (dst && dst.cell === g.src.cell && dst.i === g.src.i) { drawOverlay(); return; }
    if (dst) flashEdge(connect(g.src, dst));
    else { const v = vertexAt(pt); flashEdge(v && v !== g.src.cell ? connect(g.src, { cell: v }) : connect(g.src, null, pt)); }
    armed = null; drawOverlay(); return;
  }
  if (g.kind === "tap") {
    stop(e);
    if (mode === "ports") { editPortsAt(pt); return; }
    if (mode === "connect" && armed) { const v = vertexAt(pt); if (v && v !== armed.cell) flashEdge(connect(armed, { cell: v })); armed = null; drawOverlay(); }
  }
}
window.addEventListener("pointerup", endPointer, true);
window.addEventListener("pointercancel", endPointer, true);
function flashEdge(edge) { if (edge) toast("Connected"); }

/* Mouse wheel / trackpad zoom for desktop */
container.addEventListener("wheel", (e) => {
  e.preventDefault();
  const pt = local(e), s0 = view.scale;
  if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 40 && !e.shiftKey && e.deltaMode === 0 && !e.deltaX) {
    const w = toGraph(pt), s = Math.min(4, Math.max(0.2, s0 * Math.exp(-e.deltaY * 0.0022)));
    setView(s, pt.x / s - w.x, pt.y / s - w.y);
  } else {
    setView(s0, view.translate.x - e.deltaX / s0, view.translate.y - e.deltaY / s0);
  }
}, { passive: false });

/* Grid follows the view */
function updateGrid() {
  const s = view.scale, t = view.translate, g = graph.getGridSize() * s * (s < 0.6 ? 2 : 1);
  container.style.backgroundSize = `${g}px ${g}px`;
  container.style.backgroundPosition = `${t.x * s}px ${t.y * s}px`;
  $("#zval").textContent = Math.round(s * 100) + "%";
}
for (const ev of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) view.addListener(ev, () => { updateGrid(); drawOverlay(); });

/* Zoom controls */
function zoomAround(f) { const c = { x: container.clientWidth / 2, y: container.clientHeight / 2 }, w = toGraph(c), s = Math.min(4, Math.max(0.2, view.scale * f)); view.scaleAndTranslate(s, c.x / s - w.x, c.y / s - w.y); }
$("#zin").onclick = () => zoomAround(1.25);
$("#zout").onclick = () => zoomAround(0.8);
$("#zval").onclick = () => zoomAround(1 / view.scale);
function fitView() {
  const b = graph.getGraphBounds();
  if (!b || b.width === 0) return;
  const s0 = view.scale, t0 = view.translate;
  const gx = b.x / s0 - t0.x, gy = b.y / s0 - t0.y, gw = b.width / s0, gh = b.height / s0;
  const W = container.clientWidth, H = container.clientHeight;
  const dr = $("#drawer"), cr = container.getBoundingClientRect();
  const leftPad = W <= 700 ? 24 : dr.classList.contains("closed") ? 96 : dr.getBoundingClientRect().right - cr.left + 16, pad = 40;
  const s = Math.max(0.2, Math.min(1.5, (W - leftPad - 96 - pad) / gw, (H - 2 * pad - 70) / gh));
  view.scaleAndTranslate(s, (leftPad + (W - leftPad - 96 - gw * s) / 2) / s - gx, (pad + (H - 70 - 2 * pad - gh * s) / 2) / s - gy);
}
$("#fit").onclick = fitView;

/* ---------- context bar ---------- */
const SWATCHES = [
  { n: "Default", v: null }, { n: "None", v: "none" },
  { n: "Teal", v: "rgba(14,124,143,0.22)" }, { n: "Amber", v: "rgba(214,150,30,0.26)" },
  { n: "Red", v: "rgba(196,72,48,0.22)" }, { n: "Green", v: "rgba(64,140,80,0.24)" }, { n: "Violet", v: "rgba(110,90,190,0.22)" },
];
const ic = {
  trash: `<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>`,
  dup: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>`,
  rot: `<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>`,
  front: `<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5" opacity=".45"/><path d="m3 16.5 9 5 9-5" opacity=".45"/></svg>`,
};
const bar = $("#bar");
let labelT;
function focusLabel() { setTimeout(() => { const i = $("#label"); if (i) { i.focus(); i.select(); } }, 30); }
function labelText(cell) { const v = cell.value; return v == null ? "" : typeof v === "object" ? (v.getAttribute?.("label") ?? "") : String(v); }

function updateBar() {
  const cells = graph.getSelectionCells();
  bar.innerHTML = "";
  if (mode === "ports" && portsCell) {
    bar.hidden = false;
    bar.innerHTML = `<span class="hint">${relPortsOf(portsCell).length} points</span>
      <input type="text" id="symname" placeholder="Symbol name" value="${(labelText(portsCell) || "My symbol").replace(/"/g, "&quot;")}" aria-label="Symbol name">
      <button class="txtbtn quiet" id="psave" type="button">Save to library</button>
      <button class="txtbtn" id="pdone" type="button">Done</button>`;
    $("#pdone").onclick = () => setMode("select");
    $("#psave").onclick = () => saveSymbol(portsCell, $("#symname").value.trim() || "My symbol");
    return;
  }
  if (mode === "connect") {
    bar.hidden = false;
    bar.innerHTML = `<span class="hint">${armed ? "Now tap the second point" : "Connect mode"}</span><button class="txtbtn" id="cdone" type="button">Done</button>`;
    $("#cdone").onclick = () => setMode("select");
    return;
  }
  if (!cells.length) { bar.hidden = true; return; }
  bar.hidden = false;
  const one = cells.length === 1 ? cells[0] : null;
  const parts = [];
  if (one) parts.push(`<input type="text" id="label" placeholder="Label" aria-label="Label" value="${labelText(one).replace(/\n/g, " / ").replace(/"/g, "&quot;")}">`);
  parts.push(`<button class="chip" type="button" id="b-style" aria-pressed="${popOpen}" aria-controls="pop">Style</button>`);
  if (one && one.isVertex()) {
    const cur = one.style?.fillColor ?? null;
    parts.push(`<span class="sep"></span>` + SWATCHES.map((s, k) => `<button class="sw" type="button" data-sw="${k}" title="${s.n} fill" aria-label="${s.n} fill" aria-pressed="${String(cur === s.v)}"
      style="background:${s.v === null ? "var(--shape-fill)" : s.v === "none" ? "linear-gradient(135deg,transparent 45%,var(--danger) 46% 54%,transparent 55%)" : s.v}"></button>`).join(""));
    parts.push(`<span class="sep"></span><button class="chip" type="button" id="b-ports">Points</button>`);
    parts.push(`<button class="ib" type="button" id="b-rot" title="Rotate 90°" aria-label="Rotate 90 degrees">${ic.rot}</button>`);
  }
  if (one && one.isEdge()) {
    const es = one.style || {};
    const kind = es.edgeStyle === "none" ? (es.curved ? "curved" : "straight") : "elbow";
    const arrows = es.endArrow === "none" ? "none" : es.startArrow && es.startArrow !== "none" ? "both" : "end";
    parts.push(`<span class="sep"></span>` + ["elbow", "straight", "curved"].map((k) => `<button class="chip" type="button" data-route="${k}" aria-pressed="${k === kind}">${k[0].toUpperCase() + k.slice(1)}</button>`).join(""));
    parts.push(`<span class="sep"></span>` + [["end", "→"], ["both", "↔"], ["none", "—"]].map(([k, g]) => `<button class="chip" type="button" data-arrow="${k}" aria-pressed="${k === arrows}" aria-label="Arrows: ${k}">${g}</button>`).join(""));
  }
  if (cells.filter((c) => c.isVertex()).length > 1) parts.push(`<span class="sep"></span><button class="chip" type="button" id="b-arrange" aria-haspopup="menu">Arrange</button>`);
  if (cells.length > 1 && cells.some((c) => c.isVertex())) parts.push(`<button class="chip" type="button" id="b-group">Make symbol</button>`);  parts.push(`<span class="sep"></span><button class="ib" type="button" id="b-dup" title="Duplicate" aria-label="Duplicate">${ic.dup}</button>`);
  parts.push(`<button class="ib" type="button" id="b-front" title="Bring to front" aria-label="Bring to front">${ic.front}</button>`);
  parts.push(`<button class="ib danger" type="button" id="b-del" title="Delete" aria-label="Delete">${ic.trash}</button>`);
  bar.innerHTML = parts.join("");

  const li = $("#label");
  if (li) {
    li.addEventListener("input", () => { clearTimeout(labelT); labelT = setTimeout(() => model.setValue(one, li.value.replace(/ \/ /g, "\n")), 350); });
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(labelT); model.setValue(one, li.value.replace(/ \/ /g, "\n")); li.blur(); } e.stopPropagation(); });
    li.addEventListener("blur", () => { clearTimeout(labelT); if (labelText(one).replace(/\n/g, " / ") !== li.value) model.setValue(one, li.value.replace(/ \/ /g, "\n")); });
  }
  bar.querySelectorAll("[data-sw]").forEach((b) => b.onclick = () => {
    const v = SWATCHES[+b.dataset.sw].v;
    const st = { ...one.style }; if (v === null) delete st.fillColor; else st.fillColor = v;
    model.setStyle(one, st);
  });
  bar.querySelectorAll("[data-route]").forEach((b) => b.onclick = () => {
    const st = { ...one.style }; const k = b.dataset.route;
    if (k === "elbow") { delete st.edgeStyle; delete st.curved; }
    else { st.edgeStyle = "none"; st.curved = k === "curved"; }
    graph.batchUpdate(() => { model.setStyle(one, st); if (k !== "elbow") model.setGeometry(one, Object.assign(one.geometry.clone(), { points: [] })); });
  });
  bar.querySelectorAll("[data-arrow]").forEach((b) => b.onclick = () => {
    const st = { ...one.style }; const k = b.dataset.arrow;
    st.endArrow = k === "none" ? "none" : "classic"; st.startArrow = k === "both" ? "classic" : "none";
    model.setStyle(one, st);
  });
  $("#b-ports") && ($("#b-ports").onclick = () => { portsCell = one; setMode("ports"); });
  $("#b-rot") && ($("#b-rot").onclick = () => { const st = { ...one.style }; st.rotation = ((st.rotation || 0) + 90) % 360; model.setStyle(one, st); });
  $("#b-group") && ($("#b-group").onclick = makeSymbol);
  $("#b-style").onclick = () => togglePop();
  $("#b-arrange") && ($("#b-arrange").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); arrangeMenu(r.left, bar.getBoundingClientRect().top - 8, true); });
  $("#b-dup").onclick = duplicate;
  $("#b-front").onclick = () => graph.orderCells(false, graph.getSelectionCells());
  $("#b-del").onclick = removeSelection;
}
function duplicate() { const cells = graph.getSelectionCells(); if (!cells.length) return; const clones = graph.moveCells(cells, 20, 20, true); graph.setSelectionCells(clones); }
function removeSelection() { const cells = graph.getSelectionCells(); if (cells.length) graph.removeCells(cells, true); }
function makeSymbol() {
  const cells = graph.getSelectionCells().filter((c) => c.isVertex());
  if (!cells.length) return;
  let group;
  graph.batchUpdate(() => {
    group = graph.groupCells(null, 0, cells);
    model.setStyle(group, { fillColor: "none", strokeColor: "none", ports: fmtPorts(SIDES) });
  });
  graph.setSelectionCell(group);
  portsCell = group; setMode("ports");
}
function saveSymbol(cell, name) {
  const g = cell.geometry;
  const kids = (cell.children || []).filter((c) => c.isVertex());
  const ports = fmtPorts(relPortsOf(cell));
  const item = { n: name, w: g.width, h: g.height, ports };
  if (kids.length) item.parts = kids.map((k) => ({ v: labelText(k), s: { ...k.style }, x: k.geometry.x, y: k.geometry.y, w: k.geometry.width, h: k.geometry.height }));
  else { const s = { ...cell.style }; delete s.ports; item.parts = [{ v: labelText(cell), s, x: 0, y: 0, w: g.width, h: g.height }]; }
  const list = loadMine(); list.push(item); saveMine(list);
  toast(`Saved “${name}” to Mine`);
  if (cat === "mine") renderTiles();
}

/* ---------- clipboard ---------- */
function clipBounds(cells) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    const g = c.geometry; if (!g || g.relative) continue;
    const pts = c.isEdge() ? [g.sourcePoint, g.targetPoint, ...(g.points || [])].filter(Boolean) : [{ x: g.x, y: g.y }, { x: g.x + g.width, y: g.y + g.height }];
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
function copySelection() { const n = Clipboard.copy(graph).length; if (n) toast(n === 1 ? "Copied" : `Copied ${n} items`); }
function cutSelection() { const n = Clipboard.cut(graph, graph.getSelectionCells()).length; if (n) toast(n === 1 ? "Cut" : `Cut ${n} items`); }
const canPaste = () => !Clipboard.isEmpty() && Clipboard.getCells().length > 0;
/* Paste centred on `at` (graph coords). Without `at`, offset from the original
   when it is on screen, otherwise centre in the view. */
function pasteAt(at) {
  if (!canPaste()) return;
  const src = Clipboard.getCells(), b = clipBounds(src);
  if (!at && b) {
    const tl = toGraph({ x: 0, y: 0 }), br = toGraph({ x: container.clientWidth, y: container.clientHeight });
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    if (cx < tl.x || cx > br.x || cy < tl.y || cy > br.y) at = viewCenter();
  }
  if (!at || !b) { Clipboard.paste(graph); return; }
  const dx = snap(at.x - b.width / 2) - b.x, dy = snap(at.y - b.height / 2) - b.y;
  const cells = graph.importCells(graph.getImportableCells(src), dx, dy, graph.getDefaultParent());
  graph.setSelectionCells(cells);
}
function selectAll() { setMode("select"); graph.selectAll(); }

/* ---------- arrange ---------- */
function nudge(dx, dy) {
  const cells = graph.getMovableCells(graph.getSelectionCells());
  if (cells.length) graph.moveCells(cells, dx, dy);
}
const arrangeable = () => graph.getSelectionCells().filter((c) => c.isVertex() && c.geometry);
function distribute(horizontal) {
  const cells = arrangeable();
  if (cells.length < 3) { toast("Select three or more shapes to distribute"); return; }
  const [pos, size] = horizontal ? ["x", "width"] : ["y", "height"];
  cells.sort((a, b) => a.geometry[pos] - b.geometry[pos]);
  const first = cells[0].geometry, last = cells[cells.length - 1].geometry;
  const span = last[pos] + last[size] - first[pos];
  const gap = (span - cells.reduce((s, c) => s + c.geometry[size], 0)) / (cells.length - 1);
  graph.batchUpdate(() => {
    let at = first[pos];
    for (const c of cells) { const g = c.geometry.clone(); g[pos] = Math.round(at); model.setGeometry(c, g); at += g[size] + gap; }
  });
}
function arrangeMenu(x, y, above = false) {
  const al = (a) => () => graph.alignCells(a, arrangeable());
  menu(x, y, [
    { t: "Align left", f: al("left") }, { t: "Align centre", f: al("center") }, { t: "Align right", f: al("right") }, "-",
    { t: "Align top", f: al("top") }, { t: "Align middle", f: al("middle") }, { t: "Align bottom", f: al("bottom") }, "-",
    { t: "Distribute horizontally", f: () => distribute(true) }, { t: "Distribute vertically", f: () => distribute(false) },
  ], above);
}

/* ---------- style panel ---------- */
const INKS = [
  { n: "Default", v: null }, { n: "Grey", v: "#7D898C" }, { n: "Teal", v: "#0E7C8F" }, { n: "Amber", v: "#C98A12" },
  { n: "Red", v: "#C44830" }, { n: "Green", v: "#3F8C50" }, { n: "Violet", v: "#6E5ABE" },
];
const LINES = [INKS[0], { n: "None", v: "none" }, ...INKS.slice(1)];
const WIDTHS = [1, 1.5, 2.5, 4];
const DASHES = [["solid", null], ["dashed", "4 3"], ["dotted", "1 2"]];
const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36, 48];
const ALIGNS = ["left", "center", "right"];
const NO = "linear-gradient(135deg,transparent 45%,var(--danger) 46% 54%,transparent 55%)";
let popOpen = false;
const pop = document.createElement("div");
Object.assign(pop, { className: "pop", id: "pop", hidden: true });
pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Style");
stage.appendChild(pop);

function restyle(f) {
  graph.batchUpdate(() => { for (const c of graph.getSelectionCells()) { const st = { ...c.style }; if (f(st, c) !== false) model.setStyle(c, st); } });
}
const setOrDel = (st, k, v) => { if (v === null) delete st[k]; else st[k] = v; };
function swRow(key, label, list, cur, dflt) {
  return `<div class="prow"><span class="plabel">${label}</span><div class="pset">${list.map((s, i) => `<button class="sw" type="button" data-k="${key}" data-i="${i}"
    title="${s.n}" aria-label="${label}: ${s.n}" aria-pressed="${cur === s.v}" style="background:${s.v === null ? dflt : s.v === "none" ? NO : s.v}"></button>`).join("")}</div></div>`;
}
const row = (label, html) => `<div class="prow"><span class="plabel">${label}</span><div class="pset">${html}</div></div>`;
function chip(key, i, pressed, inner, label) {
  return `<button class="chip" type="button" data-k="${key}" data-i="${i}" aria-pressed="${pressed}" aria-label="${label}" title="${label}">${inner}</button>`;
}
function renderPop() {
  const cells = graph.getSelectionCells();
  if (!cells.length || mode !== "select") popOpen = false;
  $("#b-style")?.setAttribute("aria-pressed", String(popOpen));
  pop.hidden = !popOpen;
  if (!popOpen) return;
  const first = cells[0], raw = first.style || {}, eff = graph.getCellStyle(first);
  const hasV = cells.some((c) => c.isVertex());
  const width = +eff.strokeWidth || 1, fs = +eff.fontStyle || 0, size = +eff.fontSize || 12;
  const dash = raw.dashed ? (raw.dashPattern === DASHES[2][1] ? "dotted" : "dashed") : "solid";
  const line = (w, da = "") => `<svg viewBox="0 0 28 12" aria-hidden="true"><line x1="3" y1="6" x2="25" y2="6" stroke-width="${w}" ${da && `stroke-dasharray="${da}"`}/></svg>`;
  const alignIc = (a) => `<svg viewBox="0 0 28 12" aria-hidden="true">${[[1, 22], [4, 14], [7, 18], [10, 12]].map(([y, w]) => {
    const x = a === "left" ? 3 : a === "right" ? 25 - w : 14 - w / 2; return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke-width="1.6"/>`; }).join("")}</svg>`;
  pop.innerHTML = [
    hasV ? swRow("fill", "Fill", SWATCHES, raw.fillColor ?? null, "var(--shape-fill)") : "",
    swRow("line", "Line", LINES, raw.strokeColor ?? null, "var(--ink)"),
    row("Width", WIDTHS.map((w, i) => chip("width", i, w === width, line(w), `Line width ${w}`)).join("")),
    row("Dash", DASHES.map(([n, p], i) => chip("dash", i, n === dash, line(1.6, p && p.split(" ").map((x) => x * 1.6).join(" ")), `${n[0].toUpperCase() + n.slice(1)} line`)).join("")),
    swRow("font", "Text", INKS, raw.fontColor ?? null, "var(--ink)"),
    row("Font", `${chip("size", -1, false, "A−", "Smaller text")}<span class="num" aria-label="Text size">${size}</span>${chip("size", 1, false, "A+", "Larger text")}
      <span class="sep"></span>${chip("bold", 0, !!(fs & 1), "<b>B</b>", "Bold")}${chip("italic", 0, !!(fs & 2), "<i>I</i>", "Italic")}`),
    hasV ? row("Align", ALIGNS.map((a, i) => chip("align", i, (eff.align || "center") === a, alignIc(a), `Align text ${a}`)).join("")) : "",
  ].join("");
}
pop.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  const k = b.dataset.k, i = +b.dataset.i;
  const first = graph.getSelectionCells()[0]; if (!first) return;
  const fs0 = +graph.getCellStyle(first).fontStyle || 0;
  const flag = (bit) => { const on = !(fs0 & bit); restyle((st) => { const f = +st.fontStyle || 0; st.fontStyle = on ? f | bit : f & ~bit; }); };
  if (k === "fill") restyle((st, c) => c.isVertex() ? setOrDel(st, "fillColor", SWATCHES[i].v) : false);
  else if (k === "line") restyle((st) => setOrDel(st, "strokeColor", LINES[i].v));
  else if (k === "font") restyle((st) => setOrDel(st, "fontColor", INKS[i].v));
  else if (k === "width") restyle((st) => setOrDel(st, "strokeWidth", WIDTHS[i] === 1.5 ? null : WIDTHS[i]));
  else if (k === "dash") restyle((st) => { const p = DASHES[i][1]; setOrDel(st, "dashed", p ? true : null); setOrDel(st, "dashPattern", p); });
  else if (k === "size") restyle((st, c) => {
    const cur = +graph.getCellStyle(c).fontSize || 12;
    st.fontSize = i > 0 ? (SIZES.find((s) => s > cur) ?? cur) : ([...SIZES].reverse().find((s) => s < cur) ?? cur);
  });
  else if (k === "bold") flag(1);
  else if (k === "italic") flag(2);
  else if (k === "align") restyle((st, c) => c.isVertex() ? (st.align = ALIGNS[i], undefined) : false);
});
function togglePop(open = !popOpen) { popOpen = open; renderPop(); }

graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => { if (mode === "ports" && !graph.isCellSelected(portsCell)) setMode("select"); else updateBar(); renderPop(); });
model.addListener(InternalEvent.CHANGE, () => { scheduleSave(); syncUndo(); drawOverlay(); if (document.activeElement?.id !== "label" && document.activeElement?.id !== "symname") updateBar(); renderPop(); });
graph.addListener(InternalEvent.DOUBLE_CLICK, (_s, evt) => { const c = evt.getProperty("cell"); if (c) { graph.setSelectionCell(c); focusLabel(); } evt.consume?.(); });

/* ---------- menus ---------- */
function closeMenus() { document.querySelectorAll(".menu,.scrim").forEach((m) => m.remove()); }
/* `above`: y is the anchor's top edge and the menu opens upward from it. */
function menu(x, y, items, above = false) {
  closeMenus();
  const m = document.createElement("div"); m.className = "menu"; m.setAttribute("role", "menu");
  for (const it of items) {
    if (it === "-") { m.appendChild(document.createElement("hr")); continue; }
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem"); b.textContent = it.t;
    if (it.danger) b.className = "danger";
    b.onclick = () => { closeMenus(); it.f(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
  const h = m.getBoundingClientRect().height; // re-measure: setting left can rewrap items
  m.style.top = Math.max(8, Math.min(above ? y - h : y, innerHeight - h - 8)) + "px";
  setTimeout(() => document.addEventListener("pointerdown", function h(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("pointerdown", h, true); } }, true), 0);
  m.querySelector("button")?.focus({ preventScroll: true });
}
function contextMenu(cx, cy, pt) {
  const cell = graph.getCellAt(pt.x, pt.y);
  if (cell) {
    if (!graph.isCellSelected(cell)) graph.setSelectionCell(cell);
    const sel = graph.getSelectionCells();
    const items = [{ t: "Edit label", f: focusLabel }, { t: "Copy", f: copySelection }, { t: "Cut", f: cutSelection }, { t: "Duplicate", f: duplicate }];
    if (arrangeable().length > 1) items.push({ t: "Arrange…", f: () => setTimeout(() => arrangeMenu(cx, cy), 0) });
    if (sel.length === 1 && cell.isVertex()) items.push({ t: "Connection points", f: () => { portsCell = cell; setMode("ports"); } }, { t: "Save to library", f: () => saveSymbol(cell, labelText(cell).split("\n")[0] || "My symbol") });
    if (sel.length > 1) items.push({ t: "Make symbol from selection", f: makeSymbol });
    items.push({ t: "Bring to front", f: () => graph.orderCells(false, sel) }, { t: "Send to back", f: () => graph.orderCells(true, sel) }, "-", { t: "Delete", danger: true, f: removeSelection });
    menu(cx, cy, items);
  } else {
    const at = toGraph(pt);
    menu(cx, cy, [
      ...(canPaste() ? [{ t: "Paste here", f: () => pasteAt(at) }] : []),
      { t: "Add text here", f: () => { insertItem(LIB.basic.find((i) => i.n === "Text"), at); focusLabel(); } },
      { t: "Add box here", f: () => insertItem(LIB.basic[1], at) },
      { t: "Select all", f: selectAll },
      { t: "Fit diagram", f: fitView },
    ]);
  }
}
function mineMenu(e, idx) {
  const list = loadMine();
  menu(e.clientX, e.clientY, [
    { t: "Place in view", f: () => insertItem(list[idx]) },
    { t: `Delete “${list[idx].n}”`, danger: true, f: () => { list.splice(idx, 1); saveMine(list); renderTiles(); } },
  ]);
}
function sheet(html, wire) {
  closeMenus();
  const s = document.createElement("div"); s.className = "scrim";
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  s.addEventListener("pointerdown", (e) => { if (e.target === s) s.remove(); });
  document.body.appendChild(s); wire(s, () => s.remove());
}
$("#more").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  menu(r.right - 220, r.bottom + 6, [
    { t: "Open file…", f: openFile },
    { t: "Save as .linework file", f: saveFile },
    { t: "Export SVG", f: () => exportImage("svg") },
    { t: "Export PNG", f: () => exportImage("png") },
    "-",
    { t: snapOn ? "Snap to grid: on" : "Snap to grid: off", f: () => setSnap(!snapOn) },
    { t: "Diagram XML…", f: xmlSheet },
    { t: "Load example diagram", f: () => confirmSheet("Load the example diagram?", "This replaces what is on the canvas, and undo history starts over.", "Load example", () => { replaceModel(EXAMPLE); }) },
    "-",
    { t: "Clear canvas", danger: true, f: () => confirmSheet("Clear the canvas?", "Everything on the canvas is removed. You can undo it. Saved symbols stay in your library.", "Clear", () => { graph.removeCells(graph.getChildCells(graph.getDefaultParent()), true); }) },
  ]);
};
function confirmSheet(title, body, ok, f) {
  sheet(`<h2>${title}</h2><p>${body}</p><div class="row"><button class="txtbtn quiet" data-x>Cancel</button><button class="txtbtn" data-ok>${ok}</button></div>`,
    (s, close) => { s.querySelector("[data-x]").onclick = close; s.querySelector("[data-ok]").onclick = () => { close(); f(); }; s.querySelector("[data-ok]").focus(); });
}
function xmlSheet() {
  const xml = new ModelXmlSerializer(model).export();
  sheet(`<h2>Diagram XML</h2><p>Copy this to keep a backup or move the diagram to another device. Paste XML here and choose Load to replace the canvas.</p>
    <textarea id="xmlbox" spellcheck="false" aria-label="Diagram XML"></textarea>
    <div class="row"><button class="txtbtn quiet" data-x>Close</button><button class="txtbtn quiet" data-copy>Copy</button><button class="txtbtn" data-load>Load</button></div>`,
    (s, close) => {
      const ta = s.querySelector("textarea"); ta.value = xml;
      s.querySelector("[data-x]").onclick = close;
      s.querySelector("[data-copy]").onclick = () => navigator.clipboard.writeText(ta.value).then(() => toast("Copied XML"), () => { ta.focus(); ta.select(); toast("Select all and copy"); });
      s.querySelector("[data-load]").onclick = () => { try { replaceModel(ta.value); close(); toast("Diagram loaded"); } catch (err) { toast("That XML could not be read. Check that it starts with <mxGraphModel>."); } };
    });
}
/* ---------- files and export ---------- */
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function stamp() { const d = new Date(), z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`; }
function saveFile() {
  download(new Blob([new ModelXmlSerializer(model).export()], { type: "application/xml" }), `diagram-${stamp()}.linework`);
}
function openFile() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".linework,.xml,.drawio,application/xml,text/xml";
  input.onchange = async () => {
    const f = input.files?.[0]; if (!f) return;
    try { replaceModel(await f.text()); toast(`Opened ${f.name}`); }
    catch { toast("That file could not be read. Linework opens files it saved itself."); }
  };
  input.click();
}
function buildSvg() {
  const src = container.querySelector("svg");
  const b = graph.getGraphBounds();
  if (!src || !b || !b.width) return null;
  const pad = 20, s = view.scale;
  const svg = src.cloneNode(true);
  svg.removeAttribute("style");
  svg.querySelectorAll("[pointer-events]").forEach((n) => n.removeAttribute("pointer-events"));
  // drop selection handles and other overlay decorations
  const panes = svg.querySelectorAll(":scope > g > g");
  panes.forEach((g, i) => { if (i !== 1) g.remove(); });
  const w = b.width / s + pad * 2, h = b.height / s + pad * 2;
  const x = b.x - pad * s, y = b.y - pad * s;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", `${x} ${y} ${b.width + pad * 2 * s} ${b.height + pad * 2 * s}`);
  svg.setAttribute("width", w); svg.setAttribute("height", h);
  const bg = document.createElementNS(SVGNS, "rect");
  Object.entries({ x, y, width: b.width + pad * 2 * s, height: b.height + pad * 2 * s, fill: css("--canvas") }).forEach(([k, v]) => bg.setAttribute(k, v));
  svg.insertBefore(bg, svg.firstChild);
  return { text: new XMLSerializer().serializeToString(svg), w, h };
}
function exportImage(kind) {
  graph.clearSelection();
  requestAnimationFrame(() => {
    const out = buildSvg();
    if (!out) { toast("Nothing to export yet"); return; }
    if (kind === "svg") { download(new Blob([out.text], { type: "image/svg+xml" }), `diagram-${stamp()}.svg`); return; }
    const img = new Image(), k = 2;
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = Math.ceil(out.w * k); c.height = Math.ceil(out.h * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((blob) => blob ? download(blob, `diagram-${stamp()}.png`) : toast("PNG export failed"), "image/png");
    };
    img.onerror = () => toast("PNG export failed");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(out.text);
  });
}
function replaceModel(xml) {
  const tmpModel = graph.getDataModel ? graph.getDataModel() : graph.model;
  new ModelXmlSerializer(tmpModel).import(xml);
  undo.clear(); syncUndo(); graph.clearSelection(); fitView(); scheduleSave();
}

/* Keyboard (desktop convenience) */
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input,textarea")) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? undo.redo() : undo.undo(); syncUndo(); }
  else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); undo.redo(); syncUndo(); }
  else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
  else if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySelection(); }
  else if (mod && e.key.toLowerCase() === "x") { e.preventDefault(); cutSelection(); }
  else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); pasteAt(); }
  else if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); selectAll(); }
  else if (e.key.startsWith("Arrow") && !mod && !graph.isSelectionEmpty()) {
    e.preventDefault();
    const d = e.shiftKey || !snapOn ? 1 : graph.getGridSize();
    nudge(e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0);
  }
  else if (e.key === "Delete" || e.key === "Backspace") { removeSelection(); }
  else if (e.key === "Escape") { closeMenus(); togglePop(false); setMode("select"); graph.clearSelection(); }
  else if (e.key === "c" && !mod) setMode(mode === "connect" ? "select" : "connect");
});

/* ---------- example diagram ---------- */
function buildExample(g) {
  const p = g.getDefaultParent();
  const V = (v, x, y, w, h, s = {}) => g.insertVertex({ parent: p, value: v, x, y, width: w, height: h, style: s });
  const E = (a, b, s = {}, v = "") => g.insertEdge({ parent: p, value: v, source: a, target: b, style: s });
  g.batchUpdate(() => {
    V("Example: tank level loop", 40, 0, 340, 30, { ...TXT, fontSize: 16, fontStyle: 1 });
    const start = V("Start", 100, 60, 120, 46, { rounded: true, arcSize: 50 });
    const read = V("Read level\nLT-101", 100, 150, 120, 60, { shape: "data" });
    const dec = V("Level\n> 80%?", 100, 260, 120, 90, { shape: "rhombus", perimeter: "rhombusPerimeter", fillColor: "rgba(214,150,30,0.26)" });
    const close = V("Close inlet\nXV-102", 300, 275, 130, 60, { fillColor: "rgba(14,124,143,0.22)" });
    const log = V("Log reading", 100, 400, 120, 70, { shape: "document" });
    E(start, read); E(read, dec);
    E(dec, close, { exitX: 1, exitY: 0.5, exitPerimeter: 0 }, "yes");
    E(dec, log, { exitX: 0.5, exitY: 1, exitPerimeter: 0 }, "no");
    E(close, log, { exitX: 0.5, exitY: 1, exitPerimeter: 0, entryX: 1, entryY: 0.45, entryPerimeter: 0 });
    const tank = V("T-100", 520, 140, 90, 130, { shape: "cylinder" });
    const lt = V("LT\n101", 640, 60, 56, 56, { shape: "instrument", fontSize: 12, fontFamily: "IBM Plex Mono, monospace" });
    const valve = V("XV-102", 470, 330, 60, 40, { shape: "valve", verticalLabelPosition: "bottom", verticalAlign: "top" });
    const pump = V("P-101", 690, 320, 60, 60, { shape: "pump", verticalLabelPosition: "bottom", verticalAlign: "top" });
    E(valve, tank, { exitX: 0.5, exitY: 0.5, exitPerimeter: 0, startArrow: "none", endArrow: "none", entryX: 0.5, entryY: 1, entryPerimeter: 1 });
    E(lt, tank, { exitX: 0, exitY: 0.5, exitPerimeter: 0, dashed: true, endArrow: "none", entryX: 1, entryY: 0.25, entryPerimeter: 0 });
    E(tank, pump, { exitX: 1, exitY: 0.85, exitPerimeter: 0, entryX: 0, entryY: 0.5, entryPerimeter: 0 });
    const feed = E(null, valve, { entryX: 0, entryY: 0.5, entryPerimeter: 0 }, "feed");
    feed.geometry.setTerminalPoint(new Point(380, 350), true);
    const out = E(pump, null, { exitX: 0.5, exitY: 0, exitPerimeter: 0 });
    out.geometry.setTerminalPoint(new Point(830, 260), false);
  });
}
let EXAMPLE = "";

/* ---------- boot ---------- */
applyTheme();
renderTiles();
setDrawer(innerWidth > 1000);
{
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:800px;height:600px";
  document.body.appendChild(host);
  const g2 = new Graph(host);
  buildExample(g2);
  EXAMPLE = new ModelXmlSerializer(g2.getDataModel ? g2.getDataModel() : g2.model).export();
  g2.destroy?.(); host.remove();
}
const saved = store.get(DOC_KEY);
let loaded = false;
if (saved) { try { new ModelXmlSerializer(model).import(saved); loaded = graph.getChildCells(graph.getDefaultParent()).length > 0; if (loaded) $("#status").textContent = "Restored from this device"; } catch (err) { console.warn(err); } }
if (!loaded) new ModelXmlSerializer(model).import(EXAMPLE);
undo.clear(); syncUndo();
updateGrid();
requestAnimationFrame(fitView);
setMode("select");
window.__lw = { buildSvg, graph, model, view, setMode, insertItem, LIB, connect, hitPort, portPoints, relPortsOf };
