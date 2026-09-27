// Full encrypted backup of this installation (database + all files) to BACKUP_TARGET.
//   BACKUP_TARGET=/mnt/yedek BACKUP_PASSPHRASE=... node scripts/backup.mjs
// The server runs this daily by itself when BACKUP_TARGET is set; see docs/BACKUP.md.
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backupWithAlerts } from "../src/offsite-backup.mjs";
import { recordError } from "../src/ops.mjs";

const dataDir = resolve(process.env.DATA_DIR || "data");
const record = async (e) => {
  const db = new DatabaseSync(resolve(dataDir, "family.sqlite"));
  try {
    await recordError(async (sql, ...args) => db.prepare(sql).run(...args), "server", "backup.offsite_failed", e.message);
  } finally {
    db.close();
  }
};
try {
  const r = await backupWithAlerts({ dataDir, record });
  console.log(`Yedek tamam: ${r.files} dosya, ${(r.bytes / 1048576).toFixed(1)} MB → ${r.where}`);
} catch (e) {
  console.error("Yedek alınamadı: " + e.message);
  process.exit(1);
}
