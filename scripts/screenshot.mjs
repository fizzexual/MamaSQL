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
    viewport: { width: 1320, height: 840 },
    deviceScaleFactor: 2,
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
    // The builder auto-opens the first connection + table, so the canvas
    // populates without interaction.
    await page.waitForSelector(".bld", { timeout: 10000 });
    await page.waitForSelector(".bld-sheet", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: "screenshot.png" });

    // Open the row form (right inspector).
    await page.click(".bld-rn-exp").catch(() => {});
    await page.waitForSelector(".bud-inspector", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(350);
    await page.screenshot({ path: "screenshot-form.png" });
    console.log("wrote screenshot.png, screenshot-form.png");
  } catch (e) {
    console.log("interaction error: " + e.message);
    await page.screenshot({ path: "screenshot.png" });
  }
} finally {
  await browser.close();
}
