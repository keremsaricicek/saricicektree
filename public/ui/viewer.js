/* ui/viewer.js: Full-screen photo viewer (lightbox) with swipe and zoom.
   Loaded in order after the older scripts; see index.html. */
"use strict";

/* ---------- Full-screen photo viewer ---------- */
function uiViewer(items, start = 0, meta = {}) {
  if (!items.length) return;
  const back = document.activeElement,
    lb = document.createElement("dialog");
  lb.className = "ds-lightbox";
  lb.setAttribute("aria-label", "Fotoğraf görüntüleyici");
  lb.innerHTML = `<div class="ds-lb-bg"></div><div class="ds-lb-top"><span class="ds-lb-count" aria-live="polite"></span><div class="ds-lb-tools"><button type="button" class="ds-lb-btn ds-lb-story" hidden>${icon("book-open-text")}<span>Hikâyesi</span></button><button type="button" class="ds-lb-btn ds-lb-zoom" aria-label="Yakınlaştır">${icon("zoom-in")}</button><button type="button" class="ds-lb-btn ds-lb-close" aria-label="Kapat">${icon("x")}</button></div></div><div class="ds-lb-stage"><div class="ds-lb-track">${items.map((x, i) => `<figure class="ds-lb-slide">${x.video ? uiVideoPlayer(x.video, x.url, x.alt) : `<img src="${esc(x.url)}" alt="${esc(x.alt || "")}" draggable="false" ${Math.abs(i - start) > 1 ? 'loading="lazy"' : ""}>`}</figure>`).join("")}</div>${items.length > 1 ? `<button type="button" class="ds-lb-nav is-prev" aria-label="Önceki fotoğraf">${icon("chevron-left")}</button><button type="button" class="ds-lb-nav is-next" aria-label="Sonraki fotoğraf">${icon("chevron-right")}</button>` : ""}</div><div class="ds-lb-foot">${meta.caption ? `<div class="ds-lb-caption">${meta.caption}</div>` : ""}${items.length > 1 ? `<div class="ds-lb-dots">${items.map(() => "<i></i>").join("")}</div>` : ""}</div>`;
  document.body.append(lb);
  hydrate();
  const stage = $(".ds-lb-stage", lb),
    track = $(".ds-lb-track", lb),
    // One element per slide: the photo, or the video's frame; zoom and drag gestures stay off videos so their controls work.
    slides = $$(".ds-lb-slide > :first-child", lb);
  let index = start,
    scale = 1,
    tx = 0,
    ty = 0;
  const pointers = new Map();
  let gesture = null;

  const apply = (animate) => {
    const img = slides[index];
    img.style.transition = animate ? "transform 260ms cubic-bezier(.2,.8,.2,1)" : "none";
    img.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`;
    lb.classList.toggle("is-zoomed", scale > 1.01);
  };
  const clampPan = () => {
    const img = slides[index],
      r = stage.getBoundingClientRect(),
      w = img.clientWidth * scale,
      h = img.clientHeight * scale,
      mx = Math.max(0, (w - r.width) / 2),
      my = Math.max(0, (h - r.height) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  };
  const resetZoom = (animate = true) => {
    scale = 1;
    tx = ty = 0;
    apply(animate);
  };
  const go = (n, animate = true) => {
    if (scale > 1) resetZoom(false);
    index = Math.max(0, Math.min(items.length - 1, n));
    track.style.transition = animate ? "transform 320ms cubic-bezier(.16,1,.3,1)" : "none";
    track.style.transform = `translate3d(${-index * 100}%,0,0)`;
    $(".ds-lb-count", lb).textContent = items.length > 1 ? `${index + 1} / ${items.length}` : "";
    $$(".ds-lb-dots i", lb).forEach((d, i) => d.classList.toggle("on", i === index));
    $$("video", lb).forEach((v) => v.closest(".ds-lb-slide") !== slides[index].closest(".ds-lb-slide") && v.pause());
    $(".ds-lb-zoom", lb).hidden = !!items[index].video;
    const story = $(".ds-lb-story", lb);
    story.hidden = !(items[index].id && meta.story);
    $(".ds-lb-nav.is-prev", lb)?.toggleAttribute("disabled", index === 0);
    $(".ds-lb-nav.is-next", lb)?.toggleAttribute("disabled", index === items.length - 1);
  };
  const zoomAt = (s, cx, cy) => {
    const r = slides[index].getBoundingClientRect(),
      ox = cx - (r.left + r.width / 2),
      oy = cy - (r.top + r.height / 2),
      k = s / scale;
    tx = tx - ox * (k - 1);
    ty = ty - oy * (k - 1);
    scale = s;
    if (scale <= 1.01) {
      scale = 1;
      tx = ty = 0;
    }
    clampPan();
    apply(true);
  };
  const close = () => {
    if (lb.classList.contains("is-closing")) return;
    lb.classList.add("is-closing");
    setTimeout(
      () => {
        lb.close();
        lb.remove();
        document.documentElement.classList.remove("ds-lock");
        back?.focus?.({ preventScroll: true });
      },
      uiReduced() ? 0 : 200,
    );
  };
  // Closed from outside (back gesture, Escape): tidy up the same way.
  lb.addEventListener("close", () => {
    if (lb.classList.contains("is-closing")) return;
    lb.remove();
    document.documentElement.classList.remove("ds-lock");
    back?.focus?.({ preventScroll: true });
  });

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, .ds-video")) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    } else if (pointers.size === 1) gesture = { type: "pending", x: e.clientX, y: e.clientY, t: performance.now(), tx, ty };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.type === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()],
        s = Math.max(1, Math.min(4, (gesture.scale * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.dist));
      zoomAt(s, (a.x + b.x) / 2, (a.y + b.y) / 2);
      slides[index].style.transition = "none";
      return;
    }
    const dx = e.clientX - gesture.x,
      dy = e.clientY - gesture.y;
    if (gesture.type === "pending") {
      if (Math.hypot(dx, dy) < 8) return;
      gesture.type = scale > 1 ? "pan" : Math.abs(dx) > Math.abs(dy) ? "swipe" : dy > 0 ? "dismiss" : "none";
    }
    if (gesture.type === "pan") {
      tx = gesture.tx + dx;
      ty = gesture.ty + dy;
      clampPan();
      apply(false);
    } else if (gesture.type === "swipe") {
      const edge = (index === 0 && dx > 0) || (index === items.length - 1 && dx < 0) ? 0.35 : 1;
      track.style.transition = "none";
      track.style.transform = `translate3d(calc(${-index * 100}% + ${dx * edge}px),0,0)`;
    } else if (gesture.type === "dismiss") {
      const img = slides[index];
      img.style.transition = "none";
      img.style.transform = `translate3d(${dx * 0.4}px,${dy}px,0) scale(${1 - Math.min(0.25, dy / 1600)})`;
      lb.style.setProperty("--lb-fade", String(Math.max(0.15, 1 - dy / 450)));
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === "pinch") {
      if (pointers.size < 2) gesture = pointers.size ? { type: "pending", ...[...pointers.values()][0], t: performance.now(), tx, ty } : null;
      return;
    }
    const dx = p.x - gesture.x,
      dy = p.y - gesture.y,
      v = Math.hypot(dx, dy) / Math.max(1, performance.now() - gesture.t);
    if (gesture.type === "swipe") {
      const w = stage.clientWidth;
      if ((dx < -w * 0.18 || (dx < -30 && v > 0.45)) && index < items.length - 1) go(index + 1);
      else if ((dx > w * 0.18 || (dx > 30 && v > 0.45)) && index > 0) go(index - 1);
      else go(index);
    } else if (gesture.type === "dismiss") {
      lb.style.removeProperty("--lb-fade");
      if (dy > 120 || (dy > 40 && v > 0.5)) close();
      else resetZoom(true);
    } else if (gesture.type === "pending" && e.pointerType !== "mouse") {
      const now = performance.now();
      if (ui.lastTap && now - ui.lastTap.t < 300 && Math.hypot(p.x - ui.lastTap.x, p.y - ui.lastTap.y) < 30) {
        zoomAt(scale > 1 ? 1 : 2.5, p.x, p.y);
        ui.lastTap = null;
      } else {
        ui.lastTap = { t: now, x: p.x, y: p.y };
        setTimeout(() => {
          if (ui.lastTap?.t === now && scale === 1) lb.classList.toggle("is-chrome-hidden");
        }, 310);
      }
    }
    gesture = null;
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("dblclick", (e) => {
    if (!e.target.closest("button, .ds-video")) zoomAt(scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
  });
  stage.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && scale === 1) return;
      e.preventDefault();
      if (e.ctrlKey) zoomAt(Math.max(1, Math.min(4, scale * (1 - e.deltaY * 0.01))), e.clientX, e.clientY);
      else {
        tx -= e.deltaX;
        ty -= e.deltaY;
        clampPan();
        apply(false);
      }
    },
    { passive: false },
  );
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  });
  lb.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  lb.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.classList.contains("ds-lb-close")) close();
    else if (b.classList.contains("is-prev")) go(index - 1);
    else if (b.classList.contains("is-next")) go(index + 1);
    else if (b.classList.contains("ds-lb-zoom")) {
      const r = stage.getBoundingClientRect();
      zoomAt(scale > 1 ? 1 : 2.5, r.left + r.width / 2, r.top + r.height / 2);
    } else if (b.classList.contains("ds-lb-story")) {
      const id = items[index].id;
      close();
      setTimeout(() => photoDetail(id), 220);
    }
  });
  addEventListener("resize", () => lb.isConnected && go(index, false));
  lb.showModal();
  document.documentElement.classList.add("ds-lock");
  go(start, false);
  $(".ds-lb-close", lb).focus({ preventScroll: true });
}
function uiLightbox(postId, index = 0) {
  const p = ffFind(postId);
  if (!p) return;
  const imgs = uiImages(p);
  uiViewer(
    imgs.map((x) => ({ url: uiBigUrl(x.url, x.media), id: x.id, video: x.video, alt: x.title || p.body?.slice(0, 100) || "Aile fotoğrafı" })),
    index,
    {
      story: true,
      caption: `<div class="ds-lb-author">${avatar(p.author)}<div><strong>${uiNameHtml(p.author)}</strong><small>${uiWhen(p.createdAt)}${p.kind === "memory" && p.date ? " · " + dateText(p.date) : ""}${p.place ? " · " + esc(p.place) : ""}</small></div></div>${p.body ? `<p>${esc(p.body)}</p>` : ""}`,
    },
  );
}
