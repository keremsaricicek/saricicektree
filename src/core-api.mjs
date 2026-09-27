// Family core API shared by the Node server and the Cloudflare Worker: bootstrap, people, relations,
// events, photos, private media, invitations, members, settings, the admin overview and
// export/restore. Sign-in, sessions, static files and the storage/database bindings stay in each
// runtime and come in through the context, so a rule changed here applies to both.
import { memories } from "./memories.mjs";
import { pickVariant } from "./variants.mjs";
import { photoVisibleSQL, visiblePhoto } from "./archive.mjs";
import { assert, clean, validDate, personInput, validateRelation } from "./domain.mjs";

const now = () => new Date().toISOString(),
  randomUUID = () => crypto.randomUUID();
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });
const staff = (u) => assert(u.role === "owner" || u.role === "moderator", 403, "Bu işlem için moderatör yetkisi gerekiyor.");
const owner = (u) => assert(u.role === "owner", 403, "Bu işlem yalnızca aile yöneticisine açık.");
/** Rows changed by a statement (Node sqlite: changes, Cloudflare D1: meta.changes). */
const changesOf = (r) => r?.changes ?? r?.meta?.changes ?? 0;
const defaults = {
  familyTitle: "Sarıçiçek",
  familyStory: "Bir aile, birbirine anlatılan hikâyelerle yaşar. Köklerimizi, anılarımızı ve bizi bir arada tutan bağları birlikte koruyoruz.",
  mailDomain: "",
};

/**
 * Handles the core routes after sign-in; unknown API paths get 404.
 * @param {any} c path, method, url, u, res (carries res.hidden), read(max), json(status, data),
 *   all/one/run/batch, storage, limit, origin, token(), hash(value), securityHeaders, mediaJobs,
 *   onUserDeactivated(id)
 */
export async function coreApi(c) {
  const { path, method, url, u, res, all, one, run, batch, storage, limit, origin, token, hash, mediaJobs } = c;
  const json = (_res, status, data) => c.json(status, data);
  const body = (_req, max) => c.read(max);
  const req = null; // requests are read through c.read
  const headers = c.securityHeaders || {};
  const audit = (uid, action, id = "") => run("INSERT INTO audit(userId,action,entityId,createdAt) VALUES(?,?,?,?)", uid, action, id, now());
  // Never include localSecurityKey (Node: encrypts two-factor secrets).
  const settings = async () => ({
    ...defaults,
    ...Object.fromEntries((await all("SELECT * FROM settings WHERE key!='localSecurityKey'")).map((x) => [x.key, x.value])),
  });
  const decorate = async (items) => {
    const ids = new Set(items.map((x) => x.id));
    const tags = (await all("SELECT * FROM photo_people")).filter((x) => ids.has(x.photoId));
    return items.map((p) => ({ ...p, url: "/media/" + p.id, peopleIds: tags.filter((x) => x.photoId === p.id).map((x) => x.personId) }));
  };
  if (path === "/api/bootstrap" && method === "GET")
    return json(res, 200, {
      user: publicUser(u),
      settings: await settings(),
      people: await all("SELECT * FROM people WHERE deletedAt IS NULL ORDER BY name"),
      relations: await all(
        "SELECT r.* FROM relations r JOIN people a ON a.id=r.personA JOIN people b ON b.id=r.personB WHERE a.deletedAt IS NULL AND b.deletedAt IS NULL",
      ),
      photos: await decorate(
        await all(
          `SELECT id,title,date,place,description,createdBy,status,createdAt,COALESCE((SELECT visibility FROM photo_privacy WHERE photoId=photos.id),'family') visibility FROM photos WHERE deletedAt IS NULL AND (status='approved' OR createdBy=? OR ?!='member') AND ${photoVisibleSQL} ORDER BY createdAt DESC,id DESC LIMIT 200`,
          u.id,
          u.role,
          u.id,
          u.id,
          u.id,
        ),
      ),
      events: await all(
        `SELECT * FROM events WHERE deletedAt IS NULL AND (status='approved' OR createdBy=? OR ?!='member') ORDER BY date DESC LIMIT 1000`,
        u.id,
        u.role,
      ),
      photoCount: (await one(`SELECT COUNT(*) n FROM photos WHERE deletedAt IS NULL AND status='approved' AND ${photoVisibleSQL}`, u.id, u.id, u.id)).n,
    });
  if (path === "/api/people" && method === "POST") {
    staff(u);
    const b = personInput(await body(req, 16000)),
      id = randomUUID(),
      date = now();
    await run(
      "INSERT INTO people(id,name,birthDate,deathDate,place,country,biography,source,createdBy,createdAt,updatedAt,deletedAt,nickname,birthPlace) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)",
      id,
      b.name,
      b.birthDate,
      b.deathDate,
      b.place,
      b.country,
      b.biography,
      b.source,
      u.id,
      date,
      date,
      b.nickname,
      b.birthPlace,
    );
    await audit(u.id, "Kişi eklendi", id);
    return json(res, 201, { id });
  }
  const personMatch = path.match(/^\/api\/people\/([\w-]+)$/);
  if (personMatch) {
    staff(u);
    const id = personMatch[1];
    assert(!res.hidden.has(id), 404, "Kişi bulunamadı.");
    assert(await one("SELECT id FROM people WHERE id=? AND deletedAt IS NULL", id), 404, "Kişi bulunamadı.");
    if (method === "PATCH") {
      const b = personInput(await body(req, 16000));
      await run(
        "UPDATE people SET name=?,birthDate=?,deathDate=?,place=?,country=?,biography=?,source=?,updatedAt=?,nickname=?,birthPlace=? WHERE id=?",
        b.name,
        b.birthDate,
        b.deathDate,
        b.place,
        b.country,
        b.biography,
        b.source,
        now(),
        b.nickname,
        b.birthPlace,
        id,
      );
      await audit(u.id, "Kişi güncellendi", id);
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE") {
      await run("UPDATE people SET deletedAt=? WHERE id=?", now(), id);
      await audit(u.id, "Kişi arşivden kaldırıldı", id);
      return json(res, 200, { ok: true });
    }
  }
  if (path === "/api/relations" && method === "POST") {
    staff(u);
    const b = await body(req, 4096);
    assert(!res.hidden.has(b.personA) && !res.hidden.has(b.personB), 404, "Kişi bulunamadı.");
    assert(
      (await one("SELECT id FROM people WHERE id=? AND deletedAt IS NULL", b.personA)) &&
        (await one("SELECT id FROM people WHERE id=? AND deletedAt IS NULL", b.personB)),
      400,
      "Her iki kişiyi de seçin.",
    );
    validateRelation(await all("SELECT * FROM relations"), b.personA, b.personB, b.type);
    const id = randomUUID();
    assert(
      changesOf(
        await run(
          `WITH RECURSIVE descendants(id) AS (SELECT ? UNION SELECT r.personB FROM relations r JOIN descendants d ON r.personA=d.id WHERE r.type!='spouse') INSERT INTO relations SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM relations WHERE type=? AND ((personA=? AND personB=?) OR (?='spouse' AND personA=? AND personB=?))) AND (?='spouse' OR NOT EXISTS(SELECT 1 FROM descendants WHERE id=?))`,
          b.personB,
          id,
          b.personA,
          b.personB,
          b.type,
          validDate(b.date),
          b.type,
          b.personA,
          b.personB,
          b.type,
          b.personB,
          b.personA,
          b.type,
          b.personA,
        ),
      ) === 1,
      409,
      "Bu bağ zaten var veya soy ağacında döngü oluşturuyor.",
    );
    await audit(u.id, "Aile bağı eklendi", id);
    return json(res, 201, { id });
  }
  if (path.match(/^\/api\/relations\/[\w-]+$/) && method === "DELETE") {
    staff(u);
    const id = path.split("/").pop(),
      relation = await one("SELECT * FROM relations WHERE id=?", id);
    assert(relation && !res.hidden.has(relation.personA) && !res.hidden.has(relation.personB), 404, "Aile bağı bulunamadı.");
    await run("DELETE FROM relations WHERE id=?", id);
    await audit(u.id, "Aile bağı kaldırıldı", id);
    return json(res, 200, { ok: true });
  }
  if (path === "/api/photos" && method === "GET") {
    const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get("offset")) || 0));
    const items = await all(
      `SELECT id,title,date,place,description,createdBy,status,createdAt,COALESCE((SELECT visibility FROM photo_privacy WHERE photoId=photos.id),'family') visibility FROM photos WHERE deletedAt IS NULL AND (status='approved' OR createdBy=? OR ?!='member') AND ${photoVisibleSQL} ORDER BY createdAt DESC,id DESC LIMIT 101 OFFSET ?`,
      u.id,
      u.role,
      u.id,
      u.id,
      u.id,
      offset,
    );
    return json(res, 200, { items: await decorate(items.slice(0, 100)), hasMore: items.length > 100 });
  }
  if (path === "/api/photos" && method === "POST")
    return await memories({
      path: "/api/experience/memories",
      method,
      url,
      u,
      read: (max) => body(req, max),
      all,
      one,
      run,
      batch,
      storage,
      mediaJobs,
      limit,
    });
  if (path === "/api/events" && method === "POST") {
    const b = await body(req, 16000),
      title = clean(b.title, 160);
    assert(title, 400, "Başlık girin.");
    assert(["gathering", "birthday", "marriage", "memorial", "funeral", "migration", "story"].includes(b.type), 400, "Olay türünü seçin.");
    const date = validDate(b.date, false),
      personId = b.personId || null;
    assert(!res.hidden.has(personId), 404, "Kişi bulunamadı.");
    assert(!personId || (await one("SELECT id FROM people WHERE id=? AND deletedAt IS NULL", personId)), 400, "Kişi bulunamadı.");
    const id = randomUUID();
    await run(
      "INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,NULL)",
      id,
      title,
      b.type,
      date,
      clean(b.place),
      clean(b.description, 5000),
      personId,
      u.id,
      u.role === "member" ? "pending" : "approved",
      now(),
    );
    await audit(u.id, "Aile olayı eklendi", id);
    return json(res, 201, { id });
  }
  const content = path.match(/^\/api\/(photos|events)\/([\w-]+)$/);
  if (content && method === "PATCH") {
    const [, table, id] = content,
      b = await body(req, 16000),
      item = await one(`SELECT * FROM ${table} WHERE id=? AND deletedAt IS NULL`, id);
    assert(item && !res.hidden.has(item.personId), 404, "Kayıt bulunamadı.");
    if (table === "photos") assert(await visiblePhoto(one, u, id), 404, "Fotoğraf bulunamadı.");
    assert(u.role !== "member" || item.createdBy === u.id, 403, "Bu kaydı düzenleyemezsiniz.");
    if (b.status) {
      staff(u);
      assert(["approved", "rejected"].includes(b.status), 400, "Durum geçersiz.");
      await run(`UPDATE ${table} SET status=? WHERE id=?`, b.status, id);
      await audit(u.id, "İçerik " + b.status, id);
    } else if (table === "photos") {
      return await memories({
        path: "/api/experience/memories/" + id,
        method,
        url,
        u,
        read: async () => b,
        all,
        one,
        run,
        batch,
        storage,
        mediaJobs,
        limit,
      });
    } else {
      const title = clean(b.title, 160);
      assert(title, 400, "Başlık girin.");
      await run(
        `UPDATE ${table} SET title=?,description=?,place=?,date=?,status=? WHERE id=?`,
        title,
        clean(b.description, 5000),
        clean(b.place),
        validDate(b.date, table === "photos"),
        u.role === "member" ? "pending" : item.status,
        id,
      );
      await audit(u.id, "İçerik düzenlendi", id);
    }
    return json(res, 200, { ok: true });
  }
  if (content && method === "DELETE") {
    const [, table, id] = content,
      item = await one(`SELECT * FROM ${table} WHERE id=? AND deletedAt IS NULL`, id);
    assert(item, 404, "Kayıt bulunamadı.");
    if (table === "photos") assert(await visiblePhoto(one, u, id), 404, "Fotoğraf bulunamadı.");
    assert(u.role !== "member" || item.createdBy === u.id, 403, "Bu kaydı kaldıramazsınız.");
    await run(`UPDATE ${table} SET deletedAt=? WHERE id=?`, now(), id);
    await audit(u.id, "İçerik kaldırıldı", id);
    return json(res, 200, { ok: true });
  }
  if (path.startsWith("/media/") && method === "GET") {
    const p = await visiblePhoto(one, u, path.slice(7));
    assert(p && (p.status === "approved" || p.createdBy === u.id || u.role !== "member"), 404, "Fotoğraf bulunamadı.");
    const variant = await pickVariant(one, p.id, url.searchParams.get("w"));
    const file = await storage.get(variant?.filename || p.filename);
    assert(file, 404, "Fotoğraf bulunamadı.");
    return new Response(file.body, { headers: { ...headers, "Content-Type": variant?.mime || p.mime, "Cache-Control": "private, no-store" } });
  }
  if (path === "/api/admin" && method === "GET") {
    staff(u);
    return json(res, 200, {
      users: u.role === "owner" ? await all("SELECT id,name,email,role,active,createdAt FROM users") : [],
      invites:
        u.role === "owner"
          ? await all(
              `SELECT i.id,i.email,i.role,i.expires,i.used,m.status mailStatus,m.lastError mailError,m.sentAt mailSentAt
               FROM invites i LEFT JOIN mail_queue m ON m.id=(SELECT MAX(id) FROM mail_queue WHERE refId=i.id AND kind='invite')
               ORDER BY i.expires DESC`,
            )
          : [],
      audit: await all("SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.userId ORDER BY a.id DESC LIMIT 100"),
      trash: {
        people: await all("SELECT id,name,deletedAt FROM people WHERE deletedAt IS NOT NULL"),
        photos: await all("SELECT id,title,deletedAt FROM photos WHERE deletedAt IS NOT NULL"),
        events: await all("SELECT id,title,personId,deletedAt FROM events WHERE deletedAt IS NOT NULL"),
      },
    });
  }
  if (path === "/api/invites" && method === "POST") {
    owner(u);
    const b = await body(req, 4096),
      email = clean(b.email).toLowerCase();
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, "Geçerli e-posta girin.");
    assert(["member", "moderator"].includes(b.role), 400, "Rol geçersiz.");
    assert(!(await one("SELECT id FROM users WHERE email=?", email)), 409, "Üye zaten kayıtlı.");
    const raw = token(),
      id = randomUUID();
    await run("INSERT INTO invites VALUES(?,?,?,?,?,?,?)", id, email, b.role, await hash(raw), Date.now() + 7 * 86400000, 0, u.id);
    await audit(u.id, "Davet oluşturuldu", id);
    const url = origin + "/#invite=" + raw;
    const mail = (await c.onInviteCreated?.({ id, email, role: b.role, url, inviter: u.name })) || null;
    return json(res, 201, { url, email, mail });
  }
  // A new link for an unused invite (the old one stops working), sent again by e-mail when available.
  const resend = path.match(/^\/api\/invites\/([\w-]+)\/resend$/);
  if (resend && method === "POST") {
    owner(u);
    const invite = await one("SELECT * FROM invites WHERE id=? AND used=0", resend[1]);
    assert(invite, 404, "Davet bulunamadı ya da kullanılmış.");
    const raw = token();
    await run("UPDATE invites SET token=?,expires=? WHERE id=?", await hash(raw), Date.now() + 7 * 86400000, invite.id);
    await audit(u.id, "Davet yenilendi", invite.id);
    const url = origin + "/#invite=" + raw;
    const mail = (await c.onInviteCreated?.({ id: invite.id, email: invite.email, role: invite.role, url, inviter: u.name })) || null;
    return json(res, 200, { url, email: invite.email, mail });
  }
  if (path.match(/^\/api\/invites\/[\w-]+$/) && method === "DELETE") {
    owner(u);
    await run("DELETE FROM invites WHERE id=?", path.split("/").pop());
    return json(res, 200, { ok: true });
  }
  const userMatch = path.match(/^\/api\/users\/([\w-]+)$/);
  if (userMatch && method === "PATCH") {
    owner(u);
    const id = userMatch[1],
      target = await one("SELECT * FROM users WHERE id=?", id);
    assert(target && target.role !== "owner", 400, "Kurucu hesabı bu ekrandan değiştirilemez.");
    const b = await body(req, 4096);
    assert(["member", "moderator"].includes(b.role) && [0, 1].includes(b.active), 400, "Rol veya durum geçersiz.");
    await run("UPDATE users SET role=?,active=? WHERE id=?", b.role, b.active, id);
    await c.onUserDeactivated?.(id); // Node: ends that member's sessions so a role change takes effect at once
    await audit(u.id, "Üye yetkisi değiştirildi", id);
    return json(res, 200, { ok: true });
  }
  if (path === "/api/restore" && method === "POST") {
    staff(u);
    const b = await body(req, 4096);
    assert(["people", "photos", "events"].includes(b.table), 400, "Kayıt türü geçersiz.");
    assert(b.table !== "people" || !res.hidden.has(b.id), 404, "Kayıt bulunamadı.");
    await run(`UPDATE ${b.table} SET deletedAt=NULL WHERE id=?`, b.id);
    await audit(u.id, "Kayıt geri yüklendi", b.id);
    return json(res, 200, { ok: true });
  }
  if (path === "/api/settings" && method === "PATCH") {
    owner(u);
    const b = await body(req, 16000);
    for (const key of ["familyTitle", "familyStory", "mailDomain"])
      if (key in b) {
        const value = clean(b[key], key === "familyStory" ? 10000 : 200);
        if (key === "mailDomain") assert(!value || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value), 400, "Alan adını https:// olmadan yazın.");
        await run("INSERT OR REPLACE INTO settings VALUES(?,?)", key, value);
      }
    await audit(u.id, "Aile ayarları güncellendi");
    return json(res, 200, { ok: true });
  }
  if (path === "/api/export" && method === "GET") {
    owner(u);
    return json(res, 200, {
      version: 1,
      exportedAt: now(),
      settings: await settings(),
      people: await all("SELECT * FROM people"),
      relations: await all("SELECT * FROM relations"),
      photos: await all("SELECT * FROM photos"),
      photoPeople: await all("SELECT * FROM photo_people"),
      events: await all("SELECT * FROM events"),
    });
  }
  return json(res, 404, { error: "İşlem bulunamadı." });
}
