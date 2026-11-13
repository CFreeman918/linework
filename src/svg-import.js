/* SVG → maxGraph stencil conversion, shared by SVG import and the draw tool.
 *
 * Geometry is flattened to absolute move / line / quad / curve / close segments
 * (arcs become cubics), so transforms can be applied point by point. Colours are
 * not kept: dark fills become "ink" (drawn in the cell's line colour) and light
 * fills use the cell's fill colour, so imported symbols follow the theme and the
 * Style panel like the built-in ones.
 */

/* ---------- path data ---------- */
const NUM = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/;

/** Parse SVG path data into absolute segments: {t:"M"|"L"|"C"|"Q"|"Z", p:[...]} */
export function parsePath(d) {
  const out = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
  const n = d.length;
  const ws = () => { while (i < n && (d[i] === "," || d[i] === " " || d[i] === "\n" || d[i] === "\t" || d[i] === "\r")) i++; };
  const num = () => { ws(); const m = NUM.exec(d.slice(i, i + 48)); if (!m) throw new Error("bad path"); i += m[0].length; return +m[0]; };
  const flag = () => { ws(); const c = d[i++]; if (c !== "0" && c !== "1") throw new Error("bad arc flag"); return c === "1"; };
  const more = () => { ws(); return i < n && /[-+.\d]/.test(d[i]); };
  while (true) {
    ws(); if (i >= n) break;
    if (/[A-Za-z]/.test(d[i])) cmd = d[i++];
    else if (!cmd) throw new Error("bad path");
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = () => (rel ? x : 0), oy = () => (rel ? y : 0);
    if (C === "Z") { out.push({ t: "Z" }); x = sx; y = sy; lc = lq = null; continue; }
    let first = true;
    do {
      if (C === "M") {
        x = num() + ox(); y = num() + oy();
        if (first) { out.push({ t: "M", p: [x, y] }); sx = x; sy = y; } else out.push({ t: "L", p: [x, y] });
        lc = lq = null;
      } else if (C === "L") { x = num() + ox(); y = num() + oy(); out.push({ t: "L", p: [x, y] }); lc = lq = null; }
      else if (C === "H") { x = num() + ox(); out.push({ t: "L", p: [x, y] }); lc = lq = null; }
      else if (C === "V") { y = num() + oy(); out.push({ t: "L", p: [x, y] }); lc = lq = null; }
      else if (C === "C" || C === "S") {
        let x1, y1;
        if (C === "C") { x1 = num() + ox(); y1 = num() + oy(); }
        else { x1 = lc ? 2 * x - lc[0] : x; y1 = lc ? 2 * y - lc[1] : y; }
        const x2 = num() + ox(), y2 = num() + oy(), ex = num() + ox(), ey = num() + oy();
        out.push({ t: "C", p: [x1, y1, x2, y2, ex, ey] }); lc = [x2, y2]; lq = null; x = ex; y = ey;
      } else if (C === "Q" || C === "T") {
        let x1, y1;
        if (C === "Q") { x1 = num() + ox(); y1 = num() + oy(); }
        else { x1 = lq ? 2 * x - lq[0] : x; y1 = lq ? 2 * y - lq[1] : y; }
        const ex = num() + ox(), ey = num() + oy();
        out.push({ t: "Q", p: [x1, y1, ex, ey] }); lq = [x1, y1]; lc = null; x = ex; y = ey;
      } else if (C === "A") {
        const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(), ex = num() + ox(), ey = num() + oy();
        for (const c of arcToCubics(x, y, rx, ry, rot, fa, fs, ex, ey)) out.push({ t: "C", p: c });
        x = ex; y = ey; lc = lq = null;
      } else throw new Error("bad path command " + cmd);
      first = false;
    } while (more());
  }
  return out;
}

/** SVG elliptical arc (endpoint form) → cubic Béziers [x1,y1,x2,y2,x,y][] */
export function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  const r = (phi * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dpt = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out = [];
  for (let i = 0, t = t1; i < segs; i++, t += step) {
    const [ax, ay] = pt(t), [bx, by] = i === segs - 1 ? [x2, y2] : pt(t + step), [dax, day] = dpt(t), [dbx, dby] = dpt(t + step);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return out;
}

/* ---------- stencil building ---------- */
const fmt = (n) => String(Math.round(n * 100) / 100);
const ATTRS = { M: ["x", "y"], L: ["x", "y"], Q: ["x1", "y1", "x2", "y2"], C: ["x1", "y1", "x2", "y2", "x3", "y3"] };
const TAGS = { M: "move", L: "line", Q: "quad", C: "curve" };

/**
 * Build stencil XML from painted paths.
 * items: [{ segs, paint: "stroke"|"fill"|"fillstroke", ink?: bool, cap?, join? }]
 * opts.minSize pads a thin bounding box; opts.unit rescales so the longer side is `unit`.
 * Returns { xml, x, y, w, h } where x/y/w/h is the padded bounding box in input units.
 */
export function stencilFromPaths(items, { minSize = 0, unit = 0 } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) for (const s of it.segs) if (s.p) for (let i = 0; i < s.p.length; i += 2) {
    x0 = Math.min(x0, s.p[i]); x1 = Math.max(x1, s.p[i]); y0 = Math.min(y0, s.p[i + 1]); y1 = Math.max(y1, s.p[i + 1]);
  }
  if (x0 === Infinity) return null;
  let w = x1 - x0, h = y1 - y0;
  const min = Math.max(minSize, Math.max(w, h) * 0.02, 1e-3);
  if (w < min) { x0 -= (min - w) / 2; w = min; }
  if (h < min) { y0 -= (min - h) / 2; h = min; }
  const k = unit ? unit / Math.max(w, h) : 1;
  let body = "", cap = "", join = "";
  for (const it of items) {
    if (it.cap && it.cap !== cap) { cap = it.cap; body += `<linecap cap="${cap}"/>`; }
    if (it.join && it.join !== join) { join = it.join; body += `<linejoin join="${join}"/>`; }
    let path = "<path>";
    for (const s of it.segs) {
      if (s.t === "Z") { path += "<close/>"; continue; }
      path += `<${TAGS[s.t]} ` + ATTRS[s.t].map((a, i) => `${a}="${fmt((s.p[i] - (i % 2 ? y0 : x0)) * k)}"`).join(" ") + "/>";
    }
    path += "</path>";
    const paint = `<${it.paint}/>`;
    body += it.ink && it.paint !== "stroke" ? `<save/><fillcolor color="stroke"/>${path}${paint}<restore/>` : path + paint;
  }
  const xml = `<shape w="${fmt(w * k)}" h="${fmt(h * k)}" aspect="variable" strokewidth="inherit"><background/><foreground>${body}</foreground></shape>`;
  return { xml, x: x0, y: y0, w, h };
}

/* ---------- SVG files ---------- */
const GEOM = "path,rect,circle,ellipse,line,polyline,polygon";
const SKIP = "defs,clipPath,mask,symbol,marker,pattern,linearGradient,radialGradient,filter,metadata,title,desc";
const PICTURE_ONLY = "text,image,foreignObject,use,video,iframe";

function shapeToD(el) {
  const v = (a) => (el[a]?.baseVal?.value ?? +el.getAttribute(a)) || 0;
  switch (el.localName) {
    case "path": return el.getAttribute("d") || "";
    case "line": return `M${v("x1")} ${v("y1")}L${v("x2")} ${v("y2")}`;
    case "polyline": case "polygon": {
      const p = [...(el.points || [])].map((q) => `${q.x} ${q.y}`);
      return p.length ? `M${p.join("L")}${el.localName === "polygon" ? "Z" : ""}` : "";
    }
    case "circle": case "ellipse": {
      const cx = v("cx"), cy = v("cy"), rx = el.localName === "circle" ? v("r") : v("rx"), ry = el.localName === "circle" ? v("r") : v("ry");
      if (!rx || !ry) return "";
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case "rect": {
      const x = v("x"), y = v("y"), w = v("width"), h = v("height");
      if (!w || !h) return "";
      let rx = el.hasAttribute("rx") ? v("rx") : el.hasAttribute("ry") ? v("ry") : 0;
      let ry = el.hasAttribute("ry") ? v("ry") : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
        `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
  }
  return "";
}
function luminance(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 0;
  const [r, g, b] = m[1].split(/[ ,/]+/).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
const transparent = (c, op) => c === "none" || /rgba\([^)]*,\s*0\)$/.test(c) || +op === 0;

/** Remove anything that could run code or load from the network. */
function sanitize(svg) {
  svg.querySelectorAll("script,foreignObject,iframe,embed,object,audio,video").forEach((n) => n.remove());
  for (const n of [svg, ...svg.querySelectorAll("*")]) {
    for (const a of [...n.attributes]) {
      const name = a.name.toLowerCase(), val = a.value.trim().toLowerCase();
      if (name.startsWith("on")) n.removeAttribute(a.name);
      else if ((name === "href" || name === "xlink:href") && !val.startsWith("#") && !val.startsWith("data:image/")) n.removeAttribute(a.name);
    }
  }
  svg.querySelectorAll("style").forEach((s) => { s.textContent = s.textContent.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none"); });
}

/**
 * Convert an SVG file's text into a symbol.
 * Resolves to { kind: "stencil", xml, w, h } or { kind: "image", uri, w, h, reason }.
 * Rejects with a user-facing message when the file can't be used.
 */
export async function svgToSymbol(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.querySelector("parsererror")) throw new Error("That file isn't a readable SVG.");
  sanitize(root);
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Measure inside a sandboxed iframe (no scripts) so CSS classes and transforms resolve.
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1200px;height:1200px;border:0;visibility:hidden";
  document.body.appendChild(frame);
  try {
    await new Promise((res) => { frame.onload = res; frame.srcdoc = "<!doctype html><html><body style=\"margin:0\"></body></html>"; });
    const fd = frame.contentDocument, win = frame.contentWindow;
    const svg = fd.importNode(root, true);
    fd.body.appendChild(svg);

    const picture = (reason) => {
      let w = svg.viewBox?.baseVal?.width || svg.width?.baseVal?.value || 0, h = svg.viewBox?.baseVal?.height || svg.height?.baseVal?.value || 0;
      if (!w || !h) { try { const b = svg.getBBox(); w = b.width; h = b.height; } catch { /* use default */ } }
      if (!w || !h) { w = 100; h = 100; }
      return { kind: "image", uri: "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(root)), w, h, reason };
    };
    const visible = (el) => !el.closest(SKIP);
    if ([...svg.querySelectorAll(PICTURE_ONLY)].some(visible)) return picture("it contains text, images or reused elements");
    if ([...svg.querySelectorAll("[mask]")].some(visible)) return picture("it uses masks");

    const rootM = svg.getScreenCTM()?.inverse();
    const items = [];
    let segCount = 0;
    for (const el of svg.querySelectorAll(GEOM)) {
      if (!visible(el)) continue;
      const cs = win.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
      if (/url\(/.test(cs.fill) || /url\(/.test(cs.stroke)) return picture("it uses gradients or patterns");
      const hasFill = !transparent(cs.fill, cs.fillOpacity);
      const hasStroke = !transparent(cs.stroke, cs.strokeOpacity) && parseFloat(cs.strokeWidth) > 0;
      if (!hasFill && !hasStroke) continue;
      let segs;
      try { segs = parsePath(shapeToD(el)); } catch { continue; }
      if (!segs.length) continue;
      const sm = el.getScreenCTM();
      const m = rootM && sm ? rootM.multiply(sm) : new DOMMatrix();
      for (const s of segs) if (s.p) for (let i = 0; i < s.p.length; i += 2) {
        const x = s.p[i], y = s.p[i + 1];
        s.p[i] = m.a * x + m.c * y + m.e; s.p[i + 1] = m.b * x + m.d * y + m.f;
      }
      segCount += segs.length;
      items.push({ segs, paint: hasFill && hasStroke ? "fillstroke" : hasFill ? "fill" : "stroke", ink: hasFill && luminance(cs.fill) < 0.55, cap: cs.strokeLinecap, join: cs.strokeLinejoin });
    }
    if (!items.length) throw new Error("No drawable shapes were found in that SVG.");
    if (segCount > 6000) return picture("it is too detailed to convert");
    const st = stencilFromPaths(items, { unit: 100 });
    return { kind: "stencil", xml: st.xml, w: st.w, h: st.h };
  } finally {
    frame.remove();
  }
}
