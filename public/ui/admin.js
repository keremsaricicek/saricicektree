"use strict";
/* Admin panel: usage and health at a glance. Only counts and states come from the server
   (/api/experience/ops/usage); no message, post or comment text is ever shown here. */
const uiBytes = (n) => {
  if (n == null) return "—";
  const [value, unit, digits] = n < 1048576 ? [Math.max(1, n / 1024), "KB", 0] : n < 1073741824 ? [n / 1048576, "MB", 1] : [n / 1073741824, "GB", 2];
  return value.toLocaleString("tr-TR", { maximumFractionDigits: digits }) + " " + unit;
};
const uiStorageKind = {
  memories: "Fotoğraflar",
  variants: "Küçük kopyalar",
  chat: "Mesaj ekleri",
  documents: "Belgeler",
  feed: "Hayat görselleri",
  archive: "Arşiv",
  backups: "Arşiv yedekleri",
  audio: "Ses kayıtları",
};

async function uiAdminUsage() {
  if ($("#ds-usage") || route !== "admin" || !isStaff()) return;
  const head = $("#main .page-head, #main .page-header, #main h1");
  const host = document.createElement("section");
  host.className = "card ds-usage";
  host.id = "ds-usage";
  host.setAttribute("aria-labelledby", "ds-usage-title");
  host.innerHTML = html`<div class="section-head"><h2 id="ds-usage-title">Kullanım ve durum</h2></div>
    <p class="ds-usage-note">Yükleniyor…</p>`;
  (head?.closest("section, header, div") || $("#main")).insertAdjacentElement(head ? "afterend" : "afterbegin", host);
  try {
    const u = demoMode ? uiDemoUsage() : await api("/api/experience/ops/usage");
    if (!host.isConnected) return;
    const tile = (label, value, detail = "") =>
      html`<div class="ds-usage-tile"><strong>${value}</strong><span>${label}</span>${detail ? html`<small>${detail}</small>` : ""}</div>`;
    const row = (label, v) =>
      html`<tr>
        <th scope="row">${label}</th>
        <td>${v.total}</td>
        <td>${v.last30}</td>
      </tr>`;
    const b = u.backup;
    const backupText = !b
      ? "Bu kurulumda sunucu yedeği barındırıcı tarafından yönetilir."
      : !b.configured
        ? "Tam yedek kapalı: BACKUP_TARGET tanımlı değil."
        : b.lastFailure && (!b.lastSuccess || b.lastFailure > b.lastSuccess)
          ? "Son yedek alınamadı (" + uiFullDate(b.lastFailure) + "): " + (b.lastError || "") + (b.failures > 1 ? " · art arda " + b.failures + " kez" : "")
          : b.lastSuccess
            ? "Son başarılı yedek: " + uiFullDate(b.lastSuccess)
            : "Henüz yedek alınmadı; ilk yedek UTC 02:00'den sonra alınır.";
    const backupBad = !!b && (!b.configured || (b.lastFailure && (!b.lastSuccess || b.lastFailure > b.lastSuccess)));
    host.innerHTML = html`<div class="section-head">
        <h2 id="ds-usage-title">Kullanım ve durum</h2>
        <small>${uiFullDate(u.generatedAt)}</small>
      </div>
      <div class="ds-usage-grid">
        ${tile("aktif üye", u.members.active, (u.members.byRole.moderator || 0) + " moderatör · " + (u.members.inactive || 0) + " dondurulmuş")}
        ${tile("son 7 günde katkı veren", u.members.contributing7, "30 günde " + u.members.contributing30)}
        ${tile("bekleyen davet", u.invites.pending, u.invites.accepted + " kabul · " + u.invites.expired + " süresi dolmuş")}
        ${tile("son 7 günde hata", u.errors.last7)}
      </div>
      <div class="ds-usage-cols">
        <div>
          <h3>İçerik</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Tür</th>
                <th scope="col">Toplam</th>
                <th scope="col">Son 30 gün</th>
              </tr>
            </thead>
            <tbody>
              ${row("Paylaşım", u.content.posts)}${row("Yorum", u.content.comments)}${row("Fotoğraf", u.content.photos)}${row("Özel mesaj", u.content.privateMessages)}${row("Grup mesajı", u.content.groupMessages)}
            </tbody>
          </table>
          <small>Soy ağacında ${u.content.people} kişi. Mesajların yalnız sayısı gösterilir; içerikleri bu panelde görünmez.</small>
        </div>
        <div>
          <h3>Depolama</h3>
          ${
            u.storage
              ? html`<table class="data-table">
                    <tbody>
                      ${raw(
                        Object.entries(u.storage.byKind)
                          .sort((a, c) => c[1] - a[1])
                          .map(
                            ([k, v]) =>
                              html`<tr>
                                <th scope="row">${uiStorageKind[k] || k}</th>
                                <td>${uiBytes(v)}</td>
                              </tr>`,
                          )
                          .join(""),
                      )}
                      <tr>
                        <th scope="row">Veritabanı</th>
                        <td>${uiBytes(u.database?.bytes)}</td>
                      </tr>
                      <tr>
                        <th scope="row"><strong>Toplam dosya</strong></th>
                        <td><strong>${uiBytes(u.storage.total)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                  <small>Diskte boş alan: ${uiBytes(u.storage.diskFree)}</small>`
              : html`<p>Dosyalar barındırıcının depolama alanında tutulur; boyut bilgisi bu kurulumda gösterilemiyor.</p>`
          }
          <h3>Yedek</h3>
          <p class="${backupBad ? "ds-usage-alert" : ""}" role="${backupBad ? "alert" : "status"}">${backupText}</p>
          ${
            u.errors.top.length
              ? html`<h3>En sık hatalar (7 gün)</h3>
                  <ul class="ds-usage-errors">
                    ${raw(u.errors.top.map((e) => html`<li><code>${e.event}</code> · ${e.n} kez</li>`).join(""))}
                  </ul>`
              : ""
          }
        </div>
      </div>`;
  } catch (e) {
    if (host.isConnected) host.querySelector(".ds-usage-note").textContent = "Kullanım bilgisi alınamadı: " + e.message;
  }
}

// Sample figures for the demo; nothing is read from a server.
function uiDemoUsage() {
  const t = new Date().toISOString();
  return {
    generatedAt: t,
    members: { active: 6, byRole: { owner: 1, moderator: 1, member: 4 }, inactive: 0, contributing7: 4, contributing30: 6 },
    invites: { pending: 1, accepted: 5, expired: 0 },
    content: {
      posts: { total: 42, last30: 9 },
      comments: { total: 118, last30: 21 },
      photos: { total: 64, last30: 7 },
      privateMessages: { total: 230, last30: 40 },
      groupMessages: { total: 95, last30: 12 },
      people: state.people.length,
    },
    errors: { last7: 0, top: [] },
    storage: { total: 187_000_000, byKind: { memories: 150_000_000, variants: 24_000_000, chat: 9_000_000, documents: 4_000_000 }, diskFree: 38_000_000_000 },
    database: { bytes: 6_500_000 },
    backup: { configured: true, lastSuccess: t, lastFailure: null, lastError: null, failures: 0 },
  };
}
