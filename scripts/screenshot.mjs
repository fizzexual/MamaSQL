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
    // Open the datasource -> first table to populate the grid.
    await page.waitForSelector(".bud-src.ds", { timeout: 12000 });
    await page.click(".bud-src.ds");
    await page.waitForSelector(".bud-table", { timeout: 6000 });
    await page.click(".bud-table");
    await page.waitForSelector(".bud-grid", { timeout: 6000 });
    await page.waitForTimeout(700);
    // Open a column editor popover (matches the reference).
    await page.hover(".bud-grid thead th:nth-child(4)").catch(() => {});
    await page.click(".bud-grid thead th:nth-child(4) .bud-th-menu").catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshot.png" });

    // Add Server modal.
    await page.keyboard.press("Escape").catch(() => {});
    await page.click(".bud-addserver").catch(() => {});
    await page.waitForSelector(".bud-modal", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    await page.screenshot({ path: "screenshot-server.png" });
    console.log("wrote screenshot.png, screenshot-server.png");
  } catch (e) {
    console.log("interaction error: " + e.message);
    await page.screenshot({ path: "screenshot.png" });
  }
} finally {
  await browser.close();
}
