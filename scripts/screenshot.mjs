// Headless screenshot of the MamaSQL UI in browser/mock mode, using the
// installed Edge (no browser download). The standard preview tooling is
// sandboxed to a different folder, so this is how we eyeball the UI.
//
// Usage: run `npm run dev` in one shell, then `npm run screenshot` in another.
import { chromium } from "playwright-core";

const url = process.env.URL || "http://localhost:1420";
const out = process.env.OUT || "screenshot.png";

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
  // Best-effort: drive a populated view (connect → expand → run).
  try {
    await page.waitForSelector(".conn-name", { timeout: 10000 });
    await page.click(".conn-name");
    await page.waitForSelector(".tree-row", { timeout: 5000 });
    await page.click(".tree-toggle");
    await page.click(".btn-run");
    await page.waitForSelector(".grid", { timeout: 5000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log("interaction skipped: " + e.message);
  }
  await page.screenshot({ path: out });
  console.log("wrote " + out);
} finally {
  await browser.close();
}
