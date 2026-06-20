// Capture the functional build across its key states.
import { chromium } from "playwright-core";

const url = process.env.URL || "http://localhost:1420";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 840 }, deviceScaleFactor: 2 });
  for (let i = 0; i < 20; i++) {
    try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3000 }); break; } catch { await page.waitForTimeout(500); }
  }
  const shot = (name) => page.screenshot({ path: name });

  // Open the HR (MySQL) source -> submissions (matches the reference).
  await page.waitForSelector(".bud-src.ds", { timeout: 12000 });
  await page.locator(".bud-src.ds", { hasText: "HR" }).click();
  await page.waitForSelector(".bud-table", { timeout: 6000 });
  await page.locator(".bud-table", { hasText: "submissions" }).click();
  await page.waitForSelector(".bud-grid", { timeout: 6000 });
  await page.waitForTimeout(700);
  await shot("screenshot-hr.png");

  // Select a couple of rows to show selection + Row actions badge.
  const checks = page.locator(".bud-grid tbody tr .bud-rowcheck");
  await checks.nth(0).check().catch(() => {});
  await checks.nth(2).check().catch(() => {});
  await page.waitForTimeout(150);
  await page.locator(".bud-tool", { hasText: "Row actions" }).click().catch(() => {});
  await page.waitForTimeout(200);
  await shot("screenshot-rowactions.png");
  await page.click(".bud-menu-backdrop").catch(() => {});
  await page.waitForTimeout(150);

  // SQL runner.
  await page.locator(".bud-sql-toggle").click();
  await page.waitForSelector(".bud-sqlpanel", { timeout: 4000 });
  await page.fill(".bud-sql-editor", "SELECT email, day_of_week, in_hours, out_hours FROM submissions;");
  await page.click(".bud-sql-run");
  await page.waitForTimeout(700);
  await shot("screenshot-sql.png");
  await page.locator(".bud-sql-toggle").click();
  await page.waitForTimeout(300);

  // Create-a-view modal.
  await page.click(".bud-create-view");
  await page.waitForSelector(".bud-modal", { timeout: 3000 });
  await page.waitForTimeout(200);
  await shot("screenshot-view.png");
  await page.click(".bud-modal-cancel").catch(() => {});
  await page.waitForTimeout(200);

  // Design + Settings tabs.
  await page.locator(".bud-tab", { hasText: "Design" }).click();
  await page.waitForTimeout(300);
  await shot("screenshot-design.png");
  await page.locator(".bud-tab", { hasText: "Settings" }).click();
  await page.waitForTimeout(300);
  await shot("screenshot-settings.png");

  console.log("done");
} catch (e) {
  console.log("error: " + e.message);
} finally {
  await browser.close();
}
