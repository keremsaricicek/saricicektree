// "Şifremi unuttum" in the browser, with a real local SMTP server: the e-mail's link sets a new
// password once; invites show their e-mail state and can be sent again.
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMTPServer } from "smtp-server";

const PORT = 3994,
  ORIGIN = `http://localhost:${PORT}`;
let smtp, server, data;
const inbox = [];

test.beforeAll(async () => {
  smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, done) {
      let text = "";
      stream.on("data", (c) => (text += c));
      stream.on("end", () => {
        // Undo quoted-printable encoding (soft line breaks and =XX bytes) to read the link as the mail app shows it.
        const bytes = Buffer.from(
          text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))),
          "latin1",
        );
        inbox.push({ to: session.envelope.rcptTo[0].address, text: bytes.toString("utf8") });
        done();
      });
    },
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  data = mkdtempSync(join(tmpdir(), "sf-mail-ui-"));
  server = spawn(process.execPath, ["scripts/test-server.mjs"], {
    env: { ...process.env, DATA_DIR: data, PORT: String(PORT), MEDIA_JOBS: "off", SMTP_URL: `smtp://127.0.0.1:${smtp.server.address().port}` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  for (;;) if (String((await once(server.stdout, "data"))[0]).includes(ORIGIN)) break;
});
test.afterAll(async () => {
  server?.kill();
  smtp?.close();
  rmSync(data, { recursive: true, force: true });
});
test.use({ storageState: { cookies: [], origins: [] } });

test("a member resets a forgotten password from the e-mailed link", async ({ page }) => {
  await page.goto(ORIGIN + "/");
  await page.getByRole("button", { name: "Şifremi unuttum" }).click();
  await page.locator("#dialog [name=email]").fill("owner@test.local");
  await page.locator("#dialog [type=submit]").click();
  await expect(page.locator("#dialog [role=status]")).toContainText("Bu adres kayıtlıysa");
  await expect.poll(() => inbox.length).toBe(1);
  const link = inbox[0].text.match(/https?:\/\/\S+#reset=[0-9a-f]+/)[0];
  await page.goto("about:blank"); // a link opened from an e-mail is a fresh page load
  await page.goto(link);
  await page.locator("[name=password]").fill("Yeni-Parola-2026!");
  await page.locator("#login-form [type=submit]").click();
  await expect(page.locator("#login-form .form-error")).toHaveText("Şifreniz yenilendi. Şimdi giriş yapabilirsiniz.");
  await page.locator("[name=email]").fill("owner@test.local");
  await page.locator("[name=password]").fill("Yeni-Parola-2026!");
  await page.locator("#login-form [type=submit]").click();
  await page.waitForFunction(() => typeof state !== "undefined" && state?.user);

  // Invites: the e-mail state is shown and the invite can be sent again with a fresh link.
  await page.evaluate(() => (location.hash = "admin"));
  await page.evaluate(() => handle("invite", document.body));
  await page.locator("#dialog [name=email]").fill("kuzen@test.local");
  await page.locator("#dialog [type=submit]").click();
  await expect(page.locator("#dialog [role=status]")).toContainText("kuzen@test.local adresine e-posta gönderiliyor");
  await expect.poll(() => inbox.filter((m) => m.to === "kuzen@test.local").length).toBe(1);
  await page.keyboard.press("Escape");
  await page.evaluate(() => refresh());
  const row = page.locator("#main .event-row", { hasText: "kuzen@test.local" });
  await expect(row).toContainText("E-posta gönderildi");
  await row.getByRole("button", { name: "Yeniden gönder" }).click();
  await expect.poll(() => inbox.filter((m) => m.to === "kuzen@test.local").length).toBe(2);
  const [first, second] = inbox.filter((m) => m.to === "kuzen@test.local").map((m) => m.text.match(/#invite=([0-9a-f]+)/)[1]);
  expect(first).not.toBe(second);
});
