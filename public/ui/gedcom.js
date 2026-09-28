"use strict";
/* Soy Ağacı: GEDCOM export (everyone, only the people they may see) and import with a preview
   (admin and moderators). The server re-reads the file on import; the preview only shows what will
   happen and lets the member decide about possible duplicates. */
function uiGedcomDialog() {
  modal(
    "GEDCOM",
    html`<p>
        GEDCOM, soy ağacı programlarının ortak dosya biçimidir. Buradan ağacı başka bir programa taşıyabilir ya da başka bir programdaki ağacı buraya
        ekleyebilirsin.
      </p>
      <div class="ds-list">
        <button type="button" class="ds-row" data-ui="gedcom-export">
          <span class="ds-row-icon">${raw(icon("download"))}</span
          ><span class="ds-row-text"><strong>Ağacı dışa aktar (.ged)</strong><small>Görebildiğin kişiler ve aralarındaki bağlar</small></span>
        </button>
      </div>
      ${
        isStaff()
          ? html`<h3>İçe aktar</h3>
              <p class="muted">Önce ne ekleneceğini görürsün; onaylamadan hiçbir şey değişmez. Dosya UTF-8 kodlamalı olmalı.</p>
              <label class="btn" for="gedcom-file">${raw(icon("upload"))} GEDCOM dosyası seç</label
              ><input id="gedcom-file" type="file" accept=".ged,.gedcom,text/plain" class="sr-only" />
              <div id="gedcom-preview" aria-live="polite"></div>`
          : ""
      }`,
  );
  $("#gedcom-file")?.addEventListener("change", (e) => uiGedcomPreview(e.target.files[0]));
}

async function uiGedcomExport() {
  if (demoMode) return toast("Önizlemede dışa aktarma yok; gerçek hesabınla canlı sitede kullanabilirsin.");
  const res = await fetch("/api/archive/gedcom/export", { credentials: "same-origin" });
  if (!res.ok) throw Error("Dışa aktarma yapılamadı.");
  download("saricicek-soyagaci-" + new Date().toISOString().slice(0, 10) + ".ged", await res.text(), "text/plain;charset=utf-8");
  toast("Soy ağacı dosyası indirildi.");
}

let uiGedcomText = "";
async function uiGedcomPreview(file) {
  const box = $("#gedcom-preview");
  if (!file) return;
  if (demoMode) return (box.textContent = "Önizlemede içe aktarma yapılmaz; gerçek hesabınla canlı sitede kullanabilirsin.");
  box.textContent = "Dosya okunuyor…";
  try {
    uiGedcomText = await file.text();
    const p = await api("/api/archive/gedcom/preview", "POST", { text: uiGedcomText });
    const unclear = p.items.filter((x) => x.matches.length && !x.matches.some((m) => m.exact));
    const linked = p.items.filter((x) => x.matches.some((m) => m.exact)).length;
    box.innerHTML = html`<div class="ds-gedcom">
      <p>
        <strong>${p.people}</strong> kişi, <strong>${p.relations}</strong> bağ bulundu.
        ${linked ? html`${linked} kişi ağaçta zaten var; onlar yeniden eklenmez, bağları mevcut kayda eklenir.` : ""}
      </p>
      ${
        unclear.length
          ? html`<h4>Aynı kişi olabilir (${unclear.length})</h4>
              <p class="muted">Ad aynı ama doğum bilgisi eşleşmiyor ya da eksik. Her biri için seç:</p>
              ${unclear.slice(0, 50).map(
                (x) =>
                  html`<label class="field"
                    ><span>${x.name}${x.birthDate ? " · " + x.birthDate : ""}</span
                    ><select data-gedcom-ref="${x.ref}">
                      <option value="new">Yeni kişi olarak ekle</option>
                      ${x.matches.map((m) => html`<option value="link:${m.id}">Ağaçtaki ${m.name}${m.birthDate ? " (" + m.birthDate + ")" : ""} ile aynı</option>`)}
                      <option value="skip">Bu kişiyi ekleme</option>
                    </select></label
                  >`,
              )}`
          : ""
      }
      ${
        p.carried
          ? html`<h4>Ağaçta alanı olmayan bilgiler</h4>
              <p class="muted">${p.carried} kişide bu bilgiler kaybolmaz; kişinin notuna "GEDCOM'dan" başlığıyla yazılır:</p>
              <ul>
                ${p.unsupported.map((u) => html`<li>${u.label}: ${u.count} kayıt${u.examples.length ? html` <small>(ör. ${u.examples.join(", ")})</small>` : ""}</li>`)}
              </ul>`
          : ""
      }
      ${
        Object.keys(p.skippedRecords).length
          ? html`<p class="muted">
              Ağaca bağlanamayan kayıtlar aktarılmaz:
              ${Object.entries(p.skippedRecords)
                .map(([k, n]) => (k === "OBJE" ? "görsel/dosya" : k === "SOUR" ? "kaynak" : k === "REPO" ? "arşiv" : k) + " " + n)
                .join(", ")}.
              Fotoğrafları Avlu'ya ayrıca yükleyebilirsin.
            </p>`
          : ""
      }
      ${
        p.warningCount
          ? html`<details>
              <summary>${p.warningCount} uyarı</summary>
              <ul>
                ${p.warnings.map((w) => html`<li>${w}</li>`)}
              </ul>
            </details>`
          : ""
      }
      <div class="form-actions"><button type="button" class="btn primary" data-ui="gedcom-import">İçe aktar</button></div>
    </div>`;
    hydrate();
  } catch (e) {
    box.textContent = e.message;
  }
}

async function uiGedcomImport(button) {
  const decisions = Object.fromEntries($$("[data-gedcom-ref]").map((s) => [s.dataset.gedcomRef, s.value]));
  button.disabled = true;
  button.textContent = "Aktarılıyor…";
  try {
    const r = await api("/api/archive/gedcom/import", "POST", { text: uiGedcomText, decisions });
    uiGedcomText = "";
    $("#gedcom-preview").innerHTML = html`<p role="status">
      <strong>${r.createdPeople}</strong> kişi eklendi, <strong>${r.linkedPeople}</strong> kişi mevcut kayıtla eşleştirildi,
      <strong>${r.createdRelations}</strong> bağ eklendi.${r.skippedRelations ? " " + r.skippedRelations + " bağ zaten vardı ya da eklenemedi." : ""}
    </p>`;
    await refresh();
  } catch (e) {
    button.disabled = false;
    button.textContent = "İçe aktar";
    toast(e.message);
  }
}
