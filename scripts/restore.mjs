// Restores a backup made by scripts/backup.mjs into an empty folder, verifying every file.
//   BACKUP_PASSPHRASE=... node scripts/restore.mjs <yedek.sfbk> <boş-hedef-klasör>
// Start the server with DATA_DIR=<hedef> afterwards. See docs/BACKUP.md.
import { restoreBackup } from "../src/offsite-backup.mjs";

const [file, targetDir] = process.argv.slice(2);
if (!file || !targetDir) {
  console.error("Kullanım: BACKUP_PASSPHRASE=... node scripts/restore.mjs <yedek.sfbk> <boş-hedef-klasör>");
  process.exit(2);
}
try {
  const r = await restoreBackup({ file, targetDir, passphrase: process.env.BACKUP_PASSPHRASE });
  console.log(`Geri yüklendi: ${r.files} dosya → ${targetDir}`);
} catch (e) {
  console.error("Geri yükleme başarısız: " + e.message);
  process.exit(1);
}
