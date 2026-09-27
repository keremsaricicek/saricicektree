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
  await run("DELETE FROM error_log WHERE createdAt<?", new Date(now - KEEP_DAYS * 86400_000).toISOString());
}

export async function ops({ path, method, u, read, all, run, limit }) {
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
  return null;
}
