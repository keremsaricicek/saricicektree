// Staged capacity test with a realistic mix, against a throw-away local Node server (never production).
//   node scripts/capacity.mjs [secondsPerStage=60] [out.json]
// Each virtual user (VU) is a signed-in member with the page open: one live stream (SSE) held open the whole time,
// and a loop of actions with 1–3 s of "reading" between them. Stages hold 100, 250, 500 and 1,000 VUs.
// Mix per action: Hayat first page 30 %, new-activity check 15 %, a post's comments 10 %, comment 7 %, like 7 %,
// open a conversation 12 %, send a message 10 %, tree/bootstrap data 6 %, photo upload (150 KB JPEG) 3 %.
// The load generator runs on the same machine as the server, so both compete for the same CPUs.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, cpus, totalmem } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import net from "node:net";

const SECONDS = Number(process.argv[2] || 60),
  OUT = process.argv[3],
  STAGES = (process.env.CAPACITY_STAGES || "100,250,500,1000").split(",").map(Number),
  USERS = 1000;
const data = mkdtempSync(join(tmpdir(), "saricicek-capacity-")),
  probe = net.createServer().listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((r) => probe.close(r));
// With CADDY_BIN set, traffic goes through the repository's Caddyfile as in production (compose.yaml); otherwise the
// load hits Node directly, where about 2,000 simultaneous connections overflow its listen queue.
const caddyBin = process.env.CADDY_BIN,
  edge = caddyBin ? port + 1 : port,
  origin = "http://127.0.0.1:" + edge,
  env = {
    ...process.env,
    DATA_DIR: data,
    PORT: String(port),
    HOST: "127.0.0.1",
    APP_ORIGIN: origin,
    TRUST_PROXY: caddyBin ? "1" : "",
    MEDIA_JOBS: "off",
    VIDEOS: "off",
  },
  hash = (s) => createHash("sha256").update(s).digest("hex"),
  now = new Date().toISOString();
const photo = "data:image/jpeg;base64," + readFileSync("tests/fixtures/photo-1100.jpg").toString("base64");

// Fixture: 1,000 members with sessions, 1,000 people, 3,000 posts, 20,000 messages.
execFileSync(process.execPath, ["--input-type=module", "-e", "await import('./src/db.mjs');"], { env, stdio: "pipe" });
const db = new DatabaseSync(join(data, "family.sqlite")),
  users = [];
db.exec("BEGIN");
for (let i = 0; i < USERS; i++) {
  const id = "cap-user-" + i,
    token = randomUUID(),
    csrf = randomUUID();
  users.push({ id, token, csrf });
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(id, "Deneme Üye " + i, i + "@capacity.invalid", "not-a-real-password-hash", "member", 1, now);
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hash(token), id, csrf, Date.now() + 6 * 3600000);
}
for (let i = 0; i < 1000; i++)
  db.prepare("INSERT INTO people(id,name,place,birthDate,createdAt,updatedAt) VALUES(?,?,?,?,?,?)").run(
    "p" + i,
    "Kişi " + i + " Sarıçiçek",
    "Gaziantep",
    1900 + (i % 120) + "-01-01",
    now,
    now,
  );
const post = db.prepare("INSERT INTO feed_posts(createdBy,clientId,kind,body,peopleIds,visibility,userIds,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)");
for (let i = 0; i < 3000; i++)
  post.run(
    users[i % USERS].id,
    "seed-post-" + i,
    "post",
    "Aile notu " + i + ". Bugün herkesi andık.",
    "[]",
    "family",
    "[]",
    new Date(Date.now() - i * 60000).toISOString(),
    now,
  );
// Every post has its history in the activity log, as on a site that has been in use.
db.exec("INSERT INTO feed_activity(postId,kind,createdAt) SELECT id,'post',createdAt FROM feed_posts ORDER BY id");
const message = db.prepare("INSERT INTO messages(senderId,recipientId,clientId,body,createdAt) VALUES(?,?,?,?,?)");
for (let i = 0; i < 20000; i++) message.run(users[i % USERS].id, users[(i + 1) % USERS].id, "seed-msg-" + i, "Merhaba, nasılsın?", now);
db.exec("COMMIT");
const postIds = db
  .prepare("SELECT id FROM feed_posts ORDER BY id DESC LIMIT 300")
  .all()
  .map((r) => r.id);
db.close();

const server = spawn(process.execPath, ["src/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
for (;;) if (String((await once(server.stdout, "data"))[0]).includes(origin)) break;
let proxy = null;
if (caddyBin) {
  writeFileSync(join(data, "Caddyfile"), readFileSync("Caddyfile", "utf8").replace("app:3000", "127.0.0.1:" + port));
  proxy = spawn(caddyBin, ["run", "--config", join(data, "Caddyfile"), "--adapter", "caddyfile"], {
    env: { ...process.env, SITE_DOMAIN: ":" + edge, XDG_DATA_HOME: data, XDG_CONFIG_HOME: data },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(origin + "/health").then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
}
console.error("Sunucu: " + origin);
const rss = () => {
  const s = readFileSync(`/proc/${server.pid}/status`, "utf8");
  return { rssMB: Math.round(Number(s.match(/VmRSS:\s+(\d+)/)[1]) / 1024), peakMB: Math.round(Number(s.match(/VmHWM:\s+(\d+)/)[1]) / 1024) };
};

const ACTIONS = [
  [30, "feed", (u) => ["GET", "/api/experience/feed?"]],
  [15, "changes", (u) => ["GET", "/api/experience/feed/changes?after=" + (u.cursor ?? "")]],
  [10, "comments", () => ["GET", `/api/experience/feed/${pick(postIds)}/comments`]],
  [7, "comment", () => ["POST", `/api/experience/feed/${pick(postIds)}/comments`, { body: "Ne güzel bir gün! " + Math.random().toString(36).slice(2, 7) }]],
  [7, "like", () => ["PUT", `/api/experience/feed/${pick(postIds)}/like`, {}]],
  [12, "thread", (u) => ["GET", "/api/experience/conversations/dm/" + u.peer]],
  [10, "send", (u) => ["POST", "/api/experience/conversations/dm/" + u.peer, { body: "Akşam görüşelim mi?", clientId: randomUUID() }]],
  [6, "bootstrap", () => ["GET", "/api/bootstrap"]],
  [
    3,
    "upload",
    () => [
      "POST",
      "/api/experience/memories",
      {
        clientId: randomUUID(),
        share: true,
        body: "Eski bir kare",
        photos: [{ data: photo, date: "1985-06-19", place: "Halfeti", description: "Yaz tatili", outsiders: "Komşular", peopleIds: [] }],
      },
    ],
  ],
];
const total = ACTIONS.reduce((a, [w]) => a + w, 0);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const choose = () => {
  let r = Math.random() * total;
  for (const a of ACTIONS) if ((r -= a[0]) < 0) return a;
  return ACTIONS[0];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let samples = [];
const streamStatus = {};
async function act(u) {
  const [, name, build] = choose(),
    [method, path, body] = build(u),
    t = performance.now();
  let status = 0;
  try {
    const res = await fetch(origin + path, {
      method,
      headers: { cookie: "sf_session=" + u.token, origin, "content-type": "application/json", "x-csrf-token": u.csrf },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    status = res.status;
    const json = await res.json().catch(() => ({}));
    if (name === "changes" && json.cursor != null) u.cursor = json.cursor;
  } catch {
    status = 0;
  }
  samples.push({ name, ms: performance.now() - t, ok: status >= 200 && status < 300, status });
}
// The page's live connection: the server ends it every 25 s and the page opens a new one, as public/ui/feed.js does.
async function stream(u) {
  while (!u.done) {
    try {
      const res = await fetch(origin + "/api/chat/stream", { headers: { cookie: "sf_session=" + u.token, origin }, signal: u.stop.signal });
      u.streamOpen = res.ok;
      streamStatus[res.status] = (streamStatus[res.status] || 0) + 1;
      const reader = res.body.getReader();
      for (;;) if ((await reader.read()).done) break;
    } catch {
      // closed at the end of the run, or refused under load
    }
    u.streamOpen = false;
    await sleep(1000);
  }
}
async function vu(u) {
  u.stop = new AbortController();
  stream(u);
  await sleep(Math.random() * 3000); // arrivals spread over 3 s
  while (!u.done) {
    await act(u);
    await sleep(1000 + Math.random() * 2000);
  }
}

const report = {
  date: now,
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCPUs: cpus().length,
    ramGB: Math.round(totalmem() / 1024 ** 3),
    server: "Node + SQLite, one process",
    proxy: caddyBin ? "Caddy (repository Caddyfile)" : "none",
    generator: "same machine",
  },
  fixture: { members: USERS, people: 1000, posts: 3000, messages: 20000 },
  secondsPerStage: SECONDS,
  mix: Object.fromEntries(ACTIONS.map(([w, n]) => [n, w])),
  stages: [],
};
const running = [];
try {
  for (const n of STAGES) {
    while (running.length < n) {
      const u = { ...users[running.length], peer: users[(running.length + 1) % USERS].id };
      running.push(u);
      vu(u);
    }
    await sleep(5000); // let the new users settle in before measuring
    samples = [];
    const t0 = performance.now();
    await sleep(SECONDS * 1000);
    const elapsed = (performance.now() - t0) / 1000,
      got = samples;
    const ms = got.map((s) => s.ms).sort((a, b) => a - b),
      q = (p) => Math.round(ms[Math.min(ms.length - 1, Math.ceil(ms.length * p) - 1)] || 0);
    const byAction = {};
    for (const s of got) {
      const a = (byAction[s.name] ||= { n: 0, errors: 0, ms: [] });
      a.n++;
      a.errors += s.ok ? 0 : 1;
      a.ms.push(s.ms);
    }
    for (const a of Object.values(byAction)) {
      a.ms.sort((x, y) => x - y);
      a.p95ms = Math.round(a.ms[Math.ceil(a.ms.length * 0.95) - 1]);
      delete a.ms;
    }
    const stage = {
      users: n,
      openStreams: running.filter((u) => u.streamOpen).length,
      requests: got.length,
      perSecond: Math.round(got.length / elapsed),
      errors: got.filter((s) => !s.ok).length,
      errorRate: +((got.filter((s) => !s.ok).length / Math.max(1, got.length)) * 100).toFixed(2),
      statuses: Object.fromEntries([...new Set(got.filter((s) => !s.ok).map((s) => s.status))].map((c) => [c, got.filter((s) => s.status === c).length])),
      p50ms: q(0.5),
      p95ms: q(0.95),
      p99ms: q(0.99),
      ...rss(),
      byAction,
    };
    report.stages.push(stage);
    console.log(
      `${n} kullanıcı: ${stage.requests} istek (${stage.perSecond}/sn), hata %${stage.errorRate}, p50 ${stage.p50ms} ms, p95 ${stage.p95ms} ms, p99 ${stage.p99ms} ms, açık canlı bağlantı ${stage.openStreams}, bellek ${stage.rssMB} MB`,
    );
  }
} finally {
  for (const u of running) {
    u.done = true;
    u.stop?.abort();
  }
  await sleep(500);
  const check = new DatabaseSync(join(data, "family.sqlite"));
  report.integrity = check.prepare("PRAGMA integrity_check").get().integrity_check;
  report.foreignKeyErrors = check.prepare("PRAGMA foreign_key_check").all().length;
  check.close();
  proxy?.kill();
  server.kill();
  await once(server, "exit");
  rmSync(data, { recursive: true, force: true });
}
report.streamResponses = streamStatus;
console.log("Canlı bağlantı yanıtları:", JSON.stringify(streamStatus));
console.log(`SQLite bütünlük: ${report.integrity}; yabancı anahtar hatası: ${report.foreignKeyErrors}`);
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
