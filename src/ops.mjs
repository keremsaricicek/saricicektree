// Operational error records (browser reports and server job failures) for the admin panel.
// Only an event name, a short message and the page area are kept, for 30 days.
import { assert } from "./domain.mjs";
import { log } from "./log.mjs";

const KEEP_DAYS = 30;
const clip = (v, n) =>
  String(v ?? "")
    // eslint-disable-next-line no-control-regex -- strips control characters from stored text on purpose
    .replace(/[\u0000-\u001f]/g, " ")
    .slice(0, n);

export async function recordError(run, source, event, message, area = null) {
  const now = new Date();
  await run(
    "INSERT INTO error_log(source,event,message,area,createdAt) VALUES(?,?,?,?,?)",
    source,
    clip(event, 60),
    clip(message, 200),
    area && clip(area, 40),
    now.toISOString(),
  );
  await run("DELETE FROM error_log WHERE createdAt<?", new Date(now.getTime() - KEEP_DAYS * 86400_000).toISOString());
}

export async function ops({ path, method, u, read, all, one, run, limit, opsInfo = {} }) {
  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (path === "/api/experience/ops/client-error" && method === "POST") {
    await limit("client-error:" + u.id, 30, 3600000);
    const b = await read(4000);
    assert(/^[a-z][a-z0-9._-]{2,59}$/.test(String(b.event || "")), 400, "Olay adı geçersiz.");
    await recordError(run, "client", b.event, b.message, b.area);
    log("warn", "client." + b.event, { area: clip(b.area, 40), message: clip(b.message, 200) });
    return reply({ ok: true }, 201);
  }
  if (path === "/api/experience/ops/errors" && method === "GET") {
    assert(u.role !== "member", 403, "Bu işlem yöneticiye açık.");
    const items = await all("SELECT id,source,event,message,area,createdAt FROM error_log ORDER BY id DESC LIMIT 100");
    const byEvent = await all("SELECT source,event,COUNT(*) n,MAX(createdAt) last FROM error_log GROUP BY source,event ORDER BY n DESC LIMIT 30");
    return reply({ items, byEvent, keepDays: KEEP_DAYS });
  }
  if (path === "/api/experience/ops/usage" && method === "GET") {
    assert(u.role !== "member", 403, "Bu işlem yöneticiye açık.");
    return reply(await usage({ all, one }, opsInfo));
  }
  return null;
}

/**
 * Figures for the admin panel: counts only. No message, post or comment text, no e-mail addresses
 * other than pending invites (which the owner created), and no per-person activity.
 * `opsInfo` holds runtime-specific extras (Node: file storage, database size, backup status).
 */
export async function usage({ all, one }, opsInfo = {}) {
  const now = Date.now(),
    since = (days) => new Date(now - days * 86400_000).toISOString();
  const count = async (sql, ...args) => Number((await one(sql, ...args))?.n || 0);
  const activeSince = async (days) =>
    count(
      `SELECT COUNT(DISTINCT id) n FROM (
         SELECT createdBy id FROM feed_posts WHERE createdAt>=?1 UNION ALL
         SELECT createdBy FROM feed_comments WHERE createdAt>=?1 UNION ALL
         SELECT senderId FROM messages WHERE createdAt>=?1 UNION ALL
         SELECT userId FROM group_messages WHERE createdAt>=?1 UNION ALL
         SELECT createdBy FROM photos WHERE createdAt>=?1)`,
      since(days),
    );
  const content = async (table, extra = "") => ({
    total: await count(`SELECT COUNT(*) n FROM ${table} WHERE 1=1 ${extra}`),
    last30: await count(`SELECT COUNT(*) n FROM ${table} WHERE createdAt>=? ${extra}`, since(30)),
  });
  const roles = Object.fromEntries((await all("SELECT role,COUNT(*) n FROM users WHERE active=1 GROUP BY role")).map((r) => [r.role, Number(r.n)]));
  const invites = await all("SELECT used,expires FROM invites");
  return {
    generatedAt: new Date(now).toISOString(),
    members: {
      active: Object.values(roles).reduce((a, b) => a + b, 0),
      byRole: roles,
      inactive: await count("SELECT COUNT(*) n FROM users WHERE active=0"),
      contributing7: await activeSince(7),
      contributing30: await activeSince(30),
    },
    invites: {
      pending: invites.filter((i) => !i.used && Number(i.expires) >= now).length,
      accepted: invites.filter((i) => i.used).length,
      expired: invites.filter((i) => !i.used && Number(i.expires) < now).length,
    },
    content: {
      posts: await content("feed_posts", "AND deletedAt IS NULL"),
      comments: await content("feed_comments", "AND deletedAt IS NULL"),
      photos: await content("photos", "AND deletedAt IS NULL"),
      privateMessages: await content("messages"),
      groupMessages: await content("group_messages"),
      people: await count("SELECT COUNT(*) n FROM people WHERE deletedAt IS NULL"),
    },
    errors: {
      last7: await count("SELECT COUNT(*) n FROM error_log WHERE createdAt>=?", since(7)),
      top: await all(
        "SELECT source,event,COUNT(*) n,MAX(createdAt) last FROM error_log WHERE createdAt>=? GROUP BY source,event ORDER BY n DESC LIMIT 5",
        since(7),
      ),
    },
    storage: (await opsInfo.storage?.()) ?? null,
    database: (await opsInfo.database?.()) ?? null,
    backup: (await opsInfo.backup?.()) ?? null,
  };
}
