/* ui/tree.js: Soy Ağacı: layout, nodes, portraits, minimap, pinch zoom.
   Loaded in order after the older scripts; see index.html. */
"use strict";

/* ---------- Soy Ağacı ---------- */
const UI_TREE = { w: 216, h: 84, couple: 28, unit: 40, row: 178, pad: 96, top: 64 };
function uiTreeLayout(list) {
  const ids = new Set(list.map((p) => p.id)),
    rel = state.relations.filter((r) => ids.has(r.personA) && ids.has(r.personB)),
    levels = generationMap(),
    ranks = new Map(list.map((p) => [p.id, levels.get(p.id) || 0]));
  for (let i = 0; i < 3; i++)
    for (const r of rel.filter((r) => r.type === "spouse")) {
      const l = Math.max(ranks.get(r.personA), ranks.get(r.personB));
      ranks.set(r.personA, l);
      ranks.set(r.personB, l);
    }
  const parentsOf = new Map(),
    spousesOf = new Map();
  for (const r of rel) {
    if (r.type === "spouse") {
      for (const [a, b] of [
        [r.personA, r.personB],
        [r.personB, r.personA],
      ]) {
        if (!spousesOf.has(a)) spousesOf.set(a, []);
        spousesOf.get(a).push(b);
      }
    } else {
      if (!parentsOf.has(r.personB)) parentsOf.set(r.personB, []);
      parentsOf.get(r.personB).push(r);
    }
  }
  const byId = new Map(list.map((p) => [p.id, p])),
    rows = new Map();
  for (const p of list) {
    const k = ranks.get(p.id);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(p);
  }
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]),
    pos = new Map(),
    center = (id) => pos.get(id).x + UI_TREE.w / 2;
  sorted.forEach(([, row], ri) => {
    const y = UI_TREE.top + ri * UI_TREE.row,
      used = new Set(),
      units = [];
    const birth = (p) => p.birthDate || "9999";
    for (const p of [...row].sort((a, b) => birth(a).localeCompare(birth(b)))) {
      if (used.has(p.id)) continue;
      const members = [p];
      used.add(p.id);
      for (const s of spousesOf.get(p.id) || [])
        if (!used.has(s) && ranks.get(s) === ranks.get(p.id) && byId.has(s)) {
          members.push(byId.get(s));
          used.add(s);
        }
      // Blood relative first, married-in partner beside them.
      members.sort((a, b) => (parentsOf.has(b.id) ? 1 : 0) - (parentsOf.has(a.id) ? 1 : 0));
      const anchors = members.flatMap((m) => (parentsOf.get(m.id) || []).map((r) => r.personA)).filter((id) => pos.has(id));
      units.push({
        members,
        want: anchors.length ? anchors.reduce((s, id) => s + center(id), 0) / anchors.length : null,
        birth: birth(members[0]),
      });
    }
    units.sort((a, b) => (a.want ?? 1e9) - (b.want ?? 1e9) || a.birth.localeCompare(b.birth));
    let cursor = UI_TREE.pad;
    for (const u of units) {
      const width = u.members.length * UI_TREE.w + (u.members.length - 1) * UI_TREE.couple;
      let x = u.want == null ? cursor : Math.max(cursor, u.want - width / 2);
      u.members.forEach((m, i) => pos.set(m.id, { x: x + i * (UI_TREE.w + UI_TREE.couple), y, rank: ranks.get(m.id), row: ri }));
      cursor = x + width + UI_TREE.unit;
    }
  });
  // Centre parents over their children where the row leaves room.
  const childrenOf = new Map();
  for (const [child, rs] of parentsOf)
    for (const r of rs) {
      if (!childrenOf.has(r.personA)) childrenOf.set(r.personA, []);
      childrenOf.get(r.personA).push(child);
    }
  for (let pass = 0; pass < 2; pass++)
    for (let ri = sorted.length - 2; ri >= 0; ri--) {
      const row = sorted[ri][1].map((p) => p.id).sort((a, b) => pos.get(a).x - pos.get(b).x);
      const groups = [];
      for (const id of row) {
        const last = groups.at(-1);
        if (last && (spousesOf.get(id) || []).includes(last.at(-1))) last.push(id);
        else groups.push([id]);
      }
      groups.forEach((g, gi) => {
        const kids = [...new Set(g.flatMap((id) => childrenOf.get(id) || []))];
        if (!kids.length) return;
        const kc = kids.reduce((s, c) => s + center(c), 0) / kids.length,
          gl = pos.get(g[0]).x,
          gw = pos.get(g.at(-1)).x + UI_TREE.w - gl,
          target = kc - gw / 2,
          prev = groups[gi - 1],
          next = groups[gi + 1],
          min = prev ? pos.get(prev.at(-1)).x + UI_TREE.w + UI_TREE.unit : UI_TREE.pad,
          max = next ? pos.get(next[0]).x - UI_TREE.unit - gw : Infinity,
          nx = Math.max(min, Math.min(max, target)),
          dx = nx - gl;
        if (Math.abs(dx) > 0.5) g.forEach((id) => (pos.get(id).x += dx));
      });
    }
  const minX = Math.min(...[...pos.values()].map((p) => p.x)),
    shift = UI_TREE.pad - minX;
  for (const p of pos.values()) p.x += shift;
  const width = Math.max(760, ...[...pos.values()].map((p) => p.x + UI_TREE.w + UI_TREE.pad)),
    height = UI_TREE.top + sorted.length * UI_TREE.row - (UI_TREE.row - UI_TREE.h) + 72;
  // Connectors
  // Each kind of connector is one SVG path made of many pieces, so a large tree adds a handful of elements, not thousands.
  const r = 14,
    edges = { parent: [], adoptive: [], spouse: [], ring: [] };
  for (const rr of rel.filter((x) => x.type === "spouse")) {
    const a = pos.get(rr.personA),
      b = pos.get(rr.personB);
    if (!a || !b) continue;
    if (a.row !== b.row) {
      // Rare: partners placed on different generations still get a visible link.
      const [t, btm] = a.y < b.y ? [a, b] : [b, a];
      edges.spouse.push(`M${t.x + UI_TREE.w / 2} ${t.y + UI_TREE.h}L${btm.x + UI_TREE.w / 2} ${btm.y}`);
      continue;
    }
    const [l, rgt] = a.x < b.x ? [a, b] : [b, a],
      y = l.y + UI_TREE.h / 2;
    edges.spouse.push(`M${l.x + UI_TREE.w} ${y}H${rgt.x}`);
    const cx = (l.x + UI_TREE.w + rgt.x) / 2;
    edges.ring.push(`M${cx - 5} ${y}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0`);
  }
  const families = new Map();
  for (const c of list) {
    const rs = (parentsOf.get(c.id) || []).filter((x) => pos.has(x.personA));
    if (!rs.length) continue;
    const key = rs
      .map((x) => x.personA)
      .sort()
      .join("|");
    if (!families.has(key)) families.set(key, { parents: rs.map((x) => x.personA), kids: [] });
    families.get(key).kids.push({ id: c.id, adoptive: rs.some((x) => x.type === "adoptive") });
  }
  for (const f of families.values()) {
    const ps = f.parents.map((id) => pos.get(id)).sort((a, b) => a.x - b.x);
    let ox, oy;
    const adjacent = ps.length === 2 && ps[0].row === ps[1].row && ps[1].x - (ps[0].x + UI_TREE.w) <= UI_TREE.couple + 1;
    if (adjacent) {
      ox = (ps[0].x + UI_TREE.w + ps[1].x) / 2;
      oy = ps[0].y + UI_TREE.h / 2;
    } else {
      ox = ps[0].x + UI_TREE.w / 2;
      oy = ps[0].y + UI_TREE.h;
    }
    for (const k of f.kids) {
      const c = pos.get(k.id),
        cx = c.x + UI_TREE.w / 2,
        cy = c.y,
        bus = cy - 36,
        dir = Math.sign(cx - ox),
        rad = Math.min(r, Math.abs(cx - ox) / 2);
      const d =
        Math.abs(cx - ox) < 1
          ? `M${ox} ${oy}V${cy}`
          : `M${ox} ${oy}V${bus - rad}Q${ox} ${bus} ${ox + dir * rad} ${bus}H${cx - dir * rad}Q${cx} ${bus} ${cx} ${bus + rad}V${cy}`;
      edges[k.adoptive ? "adoptive" : "parent"].push(d);
    }
  }
  const svg = [
    ["ds-edge-parent", edges.parent],
    ["ds-edge-parent is-adoptive", edges.adoptive],
    ["ds-edge-spouse", edges.spouse],
    ["ds-edge-ring", edges.ring],
  ]
    .filter(([, d]) => d.length)
    .map(([cls, d]) => `<path class="${cls}" d="${d.join("")}"/>`)
    .join("");
  return { pos, rows: sorted, width, height, svg };
}
/* Profile portraits the viewer is allowed to see, loaded once per visit to the tree. */
async function uiTreePortraits() {
  if (ui.portraitsBusy) return;
  ui.portraitsBusy = true;
  try {
    const r = demoMode ? { items: [] } : await exApi("/portraits");
    const next = new Map(r.items.map((x) => [x.personId, x])),
      prev = ui.portraits || new Map(),
      changed = next.size !== prev.size || [...next].some(([id, x]) => prev.get(id)?.url !== x.url);
    ui.portraits = next;
    if (changed && route === "tree") {
      const vp = $(".tree-viewport"),
        at = vp && [vp.scrollLeft, vp.scrollTop];
      render();
      const nv = $(".tree-viewport");
      if (nv && at) [nv.scrollLeft, nv.scrollTop] = at;
    }
  } catch {
    /* Initials stay in place. */
  } finally {
    ui.portraitsBusy = false;
  }
}
function uiTreeAvatar(p) {
  const face = ui.portraits?.get(p.id);
  if (!face) return avatar(p);
  return `<span class="avatar ds-node-photo" data-tone="${avatarTone(p.name)}" aria-hidden="true"><img ${uiPic(face.url, face.media, { fixed: 320 })} alt="" loading="lazy" decoding="async" data-initials="${esc(initials(p.name))}" style="${uiFocus(face.media)}"></span>`;
}
function uiTreeNode(p, c) {
  const [first, ...rest] = String(p.name).split(" "),
    memorial = !!p.deathDate,
    years = `${p.birthDate ? p.birthDate.slice(0, 4) : "?"}${memorial ? " – " + p.deathDate.slice(0, 4) : ""}`;
  return `<button class="tree-node ds-node ${memorial ? "is-memorial" : ""} ${p.id === treeFocus ? "selected" : ""} ${p.id === ui.mePerson ? "is-me" : ""}" style="left:${c.x}px;top:${c.y}px" data-konak="tree-person" data-id="${esc(p.id)}" aria-label="${esc(p.name)}, ${years}">${uiTreeAvatar(p)}<span class="ds-node-text"><strong>${esc(rest.length ? first : p.name)}</strong>${rest.length ? `<span class="ds-node-sur">${esc(rest.join(" "))}</span>` : ""}${p.nickname ? `<em>“${esc(p.nickname)}”</em>` : ""}<small>${memorial ? icon("flower-2") : ""}${years}</small></span>${p.id === ui.mePerson ? '<b class="ds-node-me">Sen</b>' : ""}</button>`;
}
function tree() {
  let list = state.people;
  if (treeFocus) {
    const keep = new Set([treeFocus]);
    for (let i = 0; i < 2; i++) {
      const snap = new Set(keep);
      for (const r of state.relations)
        if (snap.has(r.personA) || snap.has(r.personB)) {
          keep.add(r.personA);
          keep.add(r.personB);
        }
    }
    list = list.filter((p) => keep.has(p.id));
  }
  const L = list.length ? uiTreeLayout(list) : null;
  ui.treeLayout = L;
  ui.treeList = list;
  ui.treeWindowed = list.length > UI_TREE_ALL;
  const focusName = treeFocus ? state.people.find((p) => p.id === treeFocus)?.name : "";
  const head = `<section class="page-head ds-tree-head"><div><span class="eyebrow">Köklerimiz</span><h1>Soy Ağacı</h1><p>${state.people.length} kişi · ${L ? L.rows.length : 0} kuşak${treeFocus ? " · " + esc(focusName) + " ve yakınları" : ""}</p></div><div class="row">${isStaff() ? button("Kişi ekle", "add-person", "user-plus", "primary") + button("Bağ ekle", "add-relation", "link-2") : ""}<button type="button" class="btn" data-ui="gedcom">${icon("file-text")}GEDCOM</button>${knButton(icon("circle-help"), "tree-help", 'aria-label="Soy ağacı kullanım bilgisi" title="Nasıl kullanılır?"', "icon-btn")}</div></section>`;
  if (!L) return head + empty("Köklerimizi birlikte çizelim.", "İlk aile üyesini ekleyerek başlayın.", isStaff() ? "add-person" : "");
  return `${head}<div class="ds-tree-bar"><button type="button" class="search ds-tree-find" data-action="search-tree">${icon("search")}<span>İsim veya lakapla birini bul</span></button>${treeFocus ? `<div class="ds-focus-chip">${avatar(state.people.find((p) => p.id === treeFocus) || focusName)}<span>${esc(focusName)} ve yakınları</span>${button("", "tree-reset", "x", "icon-btn", 'aria-label="Tüm ağacı göster"')}</div>` : ""}</div><section class="tree-board kn-tree-board ds-tree-board"><div class="tree-viewport" tabindex="0" aria-label="Soy ağacı. Kaydırarak gezin; bir kişiye dokunarak profilini açın.${ui.treeWindowed ? " Büyük ağaçta yalnız görünen bölümdeki kişiler listelenir; birini bulmak için aramayı kullan." : ""}"><div class="tree-canvas" style="width:${L.width}px;height:${L.height}px;transform:scale(${zoom})"><svg width="${L.width}" height="${L.height}" fill="none" aria-hidden="true">${L.svg}</svg>${L.rows.map(([level], i) => `<span class="ds-gen" style="top:${UI_TREE.top + i * UI_TREE.row - 30}px">${Number(level) + 1}. kuşak</span>`).join("")}${ui.treeWindowed ? "" : list.map((p) => uiTreeNode(p, L.pos.get(p.id))).join("")}</div></div><canvas class="ds-minimap" aria-hidden="true" hidden></canvas><div class="tree-tools ds-tree-tools"><button data-action="zoom-in" aria-label="Yakınlaştır">${icon("plus")}</button><span id="zoom-label">${Math.round(zoom * 100)}%</span><button data-action="zoom-out" aria-label="Uzaklaştır">${icon("minus")}</button><button data-action="zoom-fit" aria-label="Ekrana sığdır">${icon("scan")}</button></div><div class="ds-tree-legend"><span><i class="is-parent"></i>Ebeveyn – çocuk</span><span><i class="is-spouse"></i>Eş</span><span><i class="is-adoptive"></i>Evlat edinme</span><span>${icon("flower-2")}Anısına</span></div></section><p class="ds-tree-note">${"Bir kişiye dokun: profilini aç ya da yalnızca yakınlarını gör. Ağacı sürükleyerek gezebilirsin."}</p>${isStaff() ? `<div class="ds-tree-foot">${button("Yazdır / PDF", "print-tree", "printer", "text-btn")}</div>` : ""}`;
}
/* Large trees: every person keeps a place in the layout, links and minimap, but only the cards in and around the
   visible area are in the page. They are added and removed while panning and zooming; printing draws them all. */
const UI_TREE_ALL = 120,
  UI_TREE_BATCH = 150;
function uiTreeWindow(all = false) {
  const L = ui.treeLayout,
    vp = $(".ds-tree-board .tree-viewport"),
    canvas = $(".tree-canvas");
  if (!ui.treeWindowed || !L || !vp || !canvas) return;
  const margin = 480,
    x0 = vp.scrollLeft / zoom - margin,
    y0 = vp.scrollTop / zoom - margin,
    x1 = (vp.scrollLeft + vp.clientWidth) / zoom + margin,
    y1 = (vp.scrollTop + vp.clientHeight) / zoom + margin;
  const want = new Set();
  for (const p of ui.treeList) {
    const c = L.pos.get(p.id);
    if (all || (c.x + UI_TREE.w >= x0 && c.x <= x1 && c.y + UI_TREE.h >= y0 && c.y <= y1)) want.add(p.id);
  }
  for (const el of canvas.querySelectorAll(":scope > .ds-node"))
    if (want.has(el.dataset.id)) want.delete(el.dataset.id);
    else if (el !== document.activeElement) el.remove();
  if (!want.size) return;
  // Zoomed far out, hundreds of cards may be due at once: add the ones nearest the middle first, a frame at a time,
  // so the page keeps answering while the rest arrive.
  const mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2,
    near = (id) => {
      const c = L.pos.get(id);
      return Math.abs(c.x - mx) + Math.abs(c.y - my);
    },
    batch = all ? [...want] : [...want].sort((a, b) => near(a) - near(b)).slice(0, UI_TREE_BATCH);
  const add = new Set(batch);
  canvas.insertAdjacentHTML(
    "beforeend",
    ui.treeList
      .filter((p) => add.has(p.id))
      .map((p) => uiTreeNode(p, L.pos.get(p.id)))
      .join(""),
  );
  hydrate();
  if (batch.length < want.size) ui.treeMore ||= requestAnimationFrame(() => ((ui.treeMore = 0), uiTreeWindow()));
}
function uiTreeWatch() {
  const vp = $(".ds-tree-board .tree-viewport"),
    canvas = $(".tree-canvas");
  if (!ui.treeWindowed || !vp || vp.dataset.window) return;
  vp.dataset.window = "1";
  let frame = 0;
  const update = () => frame || (frame = requestAnimationFrame(() => ((frame = 0), uiTreeWindow())));
  vp.addEventListener("scroll", update, { passive: true });
  // Zoom buttons, pinch and "fit" all change the canvas scale.
  new MutationObserver(update).observe(canvas, { attributes: true, attributeFilter: ["style"] });
  uiTreeWindow();
}
addEventListener("beforeprint", () => route === "tree" && uiTreeWindow(true));
addEventListener("afterprint", () => route === "tree" && uiTreeWindow());
/* Opening a person from the tree: a rich card with the next steps. */
function uiTreeFit() {
  const vp = $(".ds-tree-board .tree-viewport"),
    canvas = $(".tree-canvas");
  if (!vp || !canvas) return;
  const room = innerHeight - (uiPhone() ? 56 + 68 + 40 : 64 + 40),
    want = parseFloat(canvas.style.height) * zoom + 8;
  vp.style.height = Math.round(Math.max(360, Math.min(want, room))) + "px";
}
function uiTreeCentre(force = false) {
  const vp = $(".tree-viewport"),
    canvas = $(".tree-canvas");
  if (!vp || !canvas) return;
  uiTreeFit();
  const L = ui.treeLayout,
    target = treeFocus && L?.pos.get(treeFocus);
  if (target) {
    const x = target.x * zoom,
      y = target.y * zoom;
    vp.scrollTo({ left: Math.max(0, x - vp.clientWidth / 2 + (UI_TREE.w * zoom) / 2), top: Math.max(0, y - vp.clientHeight / 3), behavior: "instant" });
  } else if (L && (force || !ui.treeCentred)) {
    // Centre on the eldest generation so the roots are the first thing seen.
    const places = [...L.pos.values()],
      top = Math.min(...places.map((c) => c.y)),
      roots = places.filter((c) => c.y === top),
      l = Math.min(...roots.map((c) => c.x)),
      r = Math.max(...roots.map((c) => c.x + UI_TREE.w));
    vp.scrollLeft = Math.max(0, ((l + r) / 2) * zoom - vp.clientWidth / 2);
  }
  ui.treeCentred = true;
  uiTreeWatch();
  uiTreeWindow();
}
/* Desktop minimap: every person as a dot, the visible area as a frame; click or drag to move. */
function uiTreeMinimap() {
  const vp = $(".ds-tree-board .tree-viewport"),
    map = $(".ds-minimap"),
    L = ui.treeLayout;
  if (!vp || !map || !L) return;
  const draw = () => {
    const big = L.width * zoom > vp.clientWidth * 1.15 || L.height * zoom > vp.clientHeight * 1.15;
    map.hidden = !big || !matchMedia("(min-width: 1024px)").matches;
    if (map.hidden) return;
    const W = 200,
      scale = W / L.width,
      H = Math.max(40, Math.min(150, L.height * scale)),
      sy = H / L.height,
      dpr = devicePixelRatio || 1,
      css = getComputedStyle(map);
    if (map.width !== W * dpr || map.height !== Math.round(H * dpr)) {
      map.width = W * dpr;
      map.height = Math.round(H * dpr);
      map.style.width = W + "px";
      map.style.height = Math.round(H) + "px";
    }
    const g = map.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = css.getPropertyValue("--map-node").trim() || "#8fa965";
    for (const [id, p] of L.pos) {
      g.fillStyle =
        id === treeFocus || id === ui.mePerson ? css.getPropertyValue("--map-me").trim() || "#2f4a35" : css.getPropertyValue("--map-node").trim() || "#8fa965";
      g.fillRect(p.x * scale, p.y * sy, Math.max(2, UI_TREE.w * scale), Math.max(2, UI_TREE.h * sy));
    }
    g.strokeStyle = css.getPropertyValue("--map-frame").trim() || "#2f4a35";
    g.lineWidth = 1.5;
    g.strokeRect(
      (vp.scrollLeft / zoom) * scale + 0.75,
      (vp.scrollTop / zoom) * sy + 0.75,
      Math.min(W, (vp.clientWidth / zoom) * scale) - 1.5,
      Math.min(H, (vp.clientHeight / zoom) * sy) - 1.5,
    );
  };
  ui.drawMinimap = draw;
  if (!map.dataset.ready) {
    map.dataset.ready = "1";
    let frame = 0;
    vp.addEventListener("scroll", () => frame || (frame = requestAnimationFrame(() => ((frame = 0), draw()))), { passive: true });
    const go = (e) => {
      const r = map.getBoundingClientRect(),
        x = ((e.clientX - r.left) / r.width) * L.width * zoom,
        y = ((e.clientY - r.top) / r.height) * L.height * zoom;
      vp.scrollTo({ left: x - vp.clientWidth / 2, top: y - vp.clientHeight / 2, behavior: "instant" });
    };
    map.addEventListener("pointerdown", (e) => {
      map.setPointerCapture(e.pointerId);
      go(e);
      const move = (ev) => go(ev),
        up = () => (map.removeEventListener("pointermove", move), map.removeEventListener("pointerup", up));
      map.addEventListener("pointermove", move);
      map.addEventListener("pointerup", up);
    });
  }
  draw();
}
addEventListener("resize", () => route === "tree" && ui.drawMinimap?.());
function uiTreePinch() {
  const vp = $(".tree-viewport"),
    canvas = $(".tree-canvas");
  if (!vp || vp.dataset.pinch) return;
  vp.dataset.pinch = "1";
  let start = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  vp.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        const r = vp.getBoundingClientRect(),
          mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
          my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        start = { d: dist(e.touches), z: zoom, cx: (vp.scrollLeft + mx) / zoom, cy: (vp.scrollTop + my) / zoom, mx, my };
      }
    },
    { passive: true },
  );
  vp.addEventListener(
    "touchmove",
    (e) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      zoom = Math.max(0.35, Math.min(2, (start.z * dist(e.touches)) / start.d));
      canvas.style.transform = `scale(${zoom})`;
      vp.scrollLeft = start.cx * zoom - start.mx;
      vp.scrollTop = start.cy * zoom - start.my;
      $("#zoom-label") && ($("#zoom-label").textContent = Math.round(zoom * 100) + "%");
    },
    { passive: false },
  );
  vp.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) start = null;
  });
  vp.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = vp.getBoundingClientRect(),
        mx = e.clientX - r.left,
        my = e.clientY - r.top,
        cx = (vp.scrollLeft + mx) / zoom,
        cy = (vp.scrollTop + my) / zoom;
      zoom = Math.max(0.35, Math.min(2, zoom * (1 - e.deltaY * 0.01)));
      canvas.style.transform = `scale(${zoom})`;
      vp.scrollLeft = cx * zoom - mx;
      vp.scrollTop = cy * zoom - my;
      $("#zoom-label") && ($("#zoom-label").textContent = Math.round(zoom * 100) + "%");
    },
    { passive: false },
  );
}
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="search-tree"]')) {
    e.preventDefault();
    searchDialog(true);
  }
});
