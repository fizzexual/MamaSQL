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
    // The dashboard is the default landing screen — wait for it and shoot.
    await page.waitForSelector(".dash-app", { timeout: 12000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "screenshot.png" });
    console.log("wrote screenshot.png");

    // Connections page.
    await page.click('.dash-nav-item:has-text("Connections")');
    await page.waitForTimeout(400);
    await page.screenshot({ path: "screenshot-connections.png" });
    console.log("wrote screenshot-connections.png");

    // Logs page.
    await page.click('.dash-nav-item:has-text("Logs")');
    await page.waitForTimeout(400);
    await page.screenshot({ path: "screenshot-logs.png" });
    console.log("wrote screenshot-logs.png");
  } catch (e) {
    console.log("interaction error: " + e.message);
    await page.screenshot({ path: "screenshot.png" });
  }
} finally {
  await browser.close();
}
