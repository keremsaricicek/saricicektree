// Restores a backup made by scripts/backup.mjs into an empty folder, verifying every file.
//   BACKUP_PASSPHRASE=... node scripts/restore.mjs <yedek.sfbk | s3://kova/klasör/yedek.sfbk> <boş-hedef-klasör>
// An s3:// source is downloaded first with the BACKUP_S3_* settings (docs/BACKUP.md).
// Start the server with DATA_DIR=<hedef> afterwards. See docs/BACKUP.md.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreBackup, fetchBackup } from "../src/offsite-backup.mjs";

const [file, targetDir] = process.argv.slice(2);
if (!file || !targetDir) {
  console.error("Kullanım: BACKUP_PASSPHRASE=... node scripts/restore.mjs <yedek.sfbk | s3://kova/yol/yedek.sfbk> <boş-hedef-klasör>");
  process.exit(2);
}
const download = file.startsWith("s3://") ? mkdtempSync(join(tmpdir(), "sf-restore-")) : null;
try {
  const local = download ? await fetchBackup(file, join(download, "backup.sfbk")) : file;
  const r = await restoreBackup({ file: local, targetDir, passphrase: process.env.BACKUP_PASSPHRASE });
  console.log(`Geri yüklendi: ${r.files} dosya → ${targetDir}`);
} catch (e) {
  console.error("Geri yükleme başarısız: " + e.message);
  process.exitCode = 1;
} finally {
  if (download) rmSync(download, { recursive: true, force: true });
}
