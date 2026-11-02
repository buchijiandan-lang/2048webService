const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const { start } = require("../src/server");
(async () => {
  const app = await start({ port: 0, dbPath: ":memory:", quiet: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 360, height: 900 },
    });
    let fail = false;
    const sample = {
      utcTime: "2026-11-02T15:26:20.000Z",
      fetchedAt: "2026-11-02T15:26:21.000Z",
      ageMs: 0,
    };
    await page.route("**/api/time", (r) =>
      r.fulfill({
        status: fail ? 503 : 200,
        json: fail
          ? {
              success: false,
              status: "stale",
              code: "TIME_UNAVAILABLE",
              lastSample: sample,
            }
          : { success: true, status: "fresh", ...sample },
      }),
    );
    await page.goto(app.url);
    await page.waitForFunction(() =>
      document.getElementById("time-value").textContent.includes("23:26:20"),
    );
    assert.match(await page.locator("#time-status").textContent(), /最近采样/);
    await page.locator("#language").click();
    assert.match(await page.locator("#time-title").textContent(), /Beijing/);
    fail = true;
    await page.locator("#time-refresh").click();
    await page.waitForFunction(() =>
      document.getElementById("time-status").textContent.includes("stale"),
    );
    assert.match(await page.locator("#time-value").textContent(), /23:26:20/);
    await page.waitForTimeout(2100);
    assert.match(
      await page.locator("#time-age").textContent(),
      /Sample age [1-9]\d* seconds/,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "docs/screenshots/time-mobile.png",
      fullPage: true,
    });
    console.log("Time UI PASS: timezone, language, stale fallback, 360px");
  } finally {
    await browser.close();
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
