// Headless screenshot of the MamaSQL UI in browser/mock mode, using the
// installed Edge (no browser download). The standard preview tooling is
// sandboxed to a different folder, so this is how we eyeball the UI.
//
// Usage: run `npm run dev` in one shell, then `npm run screenshot` in another.
// Writes screenshot-skeleton.png, screenshot.png, screenshot-menu.png.
import { chromium } from "playwright-core";

const url = process.env.URL || "http://localhost:1420";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1320, height: 860 },
    deviceScaleFactor: 1,
  });
  for (let i = 0; i < 20; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  try {
    // The SQL-client workspace is the app — wait for it, then open the first
    // datasource → first table so the editor + results grid are populated.
    await page.waitForSelector(".bud-app", { timeout: 12000 });
    await page.waitForTimeout(700);
    // Activate the first connection, then run the default query so the
    // SQL editor + results are populated (DbVisualizer-style view).
    await page.click(".bud-src.ds").catch(() => {});
    await page.waitForTimeout(700);
    await page.click(".bud-sql-run").catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: "screenshot.png" });
    console.log("wrote screenshot.png (workspace)");
  } catch (e) {
    console.log("interaction error: " + e.message);
    await page.screenshot({ path: "screenshot.png" });
  }
} finally {
  await browser.close();
}
