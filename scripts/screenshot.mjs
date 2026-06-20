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
    await page.waitForTimeout(600);
    // Header: open the connection switcher.
    await page.click(".bud-connsw").catch(() => {});
    await page.waitForTimeout(250);
    await page.screenshot({ path: "screenshot.png" });
    await page.click(".bud-menu-backdrop").catch(() => {});
    await page.waitForTimeout(150);

    // Sidebar: open search and filter.
    await page.click(".bud-sources-actions .icon-btn").catch(() => {});
    await page.waitForSelector(".bud-src-search input", { timeout: 3000 }).catch(() => {});
    await page.fill(".bud-src-search input", "cust").catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshot-sidebar.png" });
    console.log("wrote screenshot.png, screenshot-sidebar.png");
  } catch (e) {
    console.log("interaction error: " + e.message);
    await page.screenshot({ path: "screenshot.png" });
  }
} finally {
  await browser.close();
}
