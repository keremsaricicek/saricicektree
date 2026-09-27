// Fills the operator's name and support address from the server settings. Nothing is invented:
// when a value is not configured the page says so, so an incomplete page is never mistaken for a final one.
"use strict";
fetch("/api/config")
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then((config) => {
    for (const el of document.querySelectorAll("[data-fill]")) {
      const value = config[el.dataset.fill];
      if (value && el.dataset.fill === "supportEmail") {
        const a = document.createElement("a");
        a.href = "mailto:" + value;
        a.textContent = value;
        el.replaceChildren(a);
      } else if (value) el.textContent = value;
      else {
        el.textContent = el.dataset.fill === "supportEmail" ? "(destek adresi henüz tanımlanmadı)" : "(işletmeci adı henüz tanımlanmadı)";
        el.classList.add("missing");
      }
    }
  });
