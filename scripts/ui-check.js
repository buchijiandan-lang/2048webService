const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const { start } = require("../src/server");
const { mkdirSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
(async () => {
  const app = await start({ port: 0, dbPath: ":memory:", quiet: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(app.url);
    await page.waitForFunction(
      () => document.querySelectorAll(".cell").length === 16,
    );
    assert.equal(await page.locator(".cell").count(), 16);
    const cellHeights = await page
      .locator(".cell")
      .evaluateAll((cells) =>
        cells.map((c) => c.getBoundingClientRect().height),
      );
    assert.ok(
      Math.max(...cellHeights) - Math.min(...cellHeights) < 1,
      "board rows must have equal heights",
    );
    const id = await page.evaluate(() => localStorage.getItem("2048-game"));
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(150);
    assert.ok(app.events.some((e) => e.operation === "Move"));
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".cell").length === 16,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("2048-game")),
      id,
    );
    await page.locator("#language").click();
    await page.getByRole("button", { name: "New game" }).waitFor();
    await page.locator("#new").click();
    await page.waitForFunction(
      (old) => localStorage.getItem("2048-game") !== old,
      id,
    );
    // Isolated fixture to exercise winner/submission UI without modifying normal game randomness.
    const current = await page.evaluate(() =>
      localStorage.getItem("2048-game"),
    );
    const g = app.store.get(current);
    g.board = [1024, 1024, ...Array(14).fill(0)];
    app.store.save(g);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".cell").length === 16,
    );
    await page.keyboard.press("ArrowLeft");
    await page.locator("#overlay").waitFor({ state: "visible" });
    assert.match(await page.locator("#state-title").textContent(), /2048/);
    await page.locator("#nickname").fill("UI tester");
    await page.locator("#submit button").click();
    await page.locator("#submitted").waitFor({ state: "visible" });
    await page
      .locator("#leaders .player")
      .filter({ hasText: "UI tester" })
      .waitFor();
    await page.locator("#new").click();
    await page.locator("#overlay").waitFor({ state: "hidden" });
    await page.locator("#language").click();
    mkdirSync("docs/screenshots", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 360, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator('[data-direction="RIGHT"]').click();
    await page.waitForTimeout(100);
    await page.screenshot({
      path: "docs/screenshots/mobile.png",
      fullPage: true,
    });
    // Delayed external response from an old game must not leave the next equal-score game loading forever.
    let releaseWords,
      wordCalls = 0;
    await page.route("**/api/scores/*/words", async (route) => {
      wordCalls++;
      if (wordCalls === 1) await new Promise((r) => (releaseWords = r));
      await route.fulfill({
        json: { success: false, code: "NUMBER_WORDS_UNAVAILABLE" },
        status: 503,
      });
    });
    const seedWin = async () => {
      const gameId = await page.evaluate(() =>
        localStorage.getItem("2048-game"),
      );
      const state = app.store.get(gameId);
      state.board = [1024, 1024, ...Array(14).fill(0)];
      state.score = "0";
      app.store.save(state);
      await page.reload();
      await page.waitForFunction(
        () => document.querySelectorAll(".cell").length === 16,
      );
      await page.keyboard.press("ArrowLeft");
      await page.locator("#overlay").waitFor({ state: "visible" });
    };
    await seedWin();
    await page.waitForTimeout(100);
    await page.locator("#new").click();
    await page.locator("#overlay").waitFor({ state: "hidden" });
    releaseWords();
    await page.waitForTimeout(100);
    // Refresh would reset module state and hide the bug, so reload the fixture via a version-conflict refresh.
    const nextId = await page.evaluate(() => localStorage.getItem("2048-game"));
    const next = app.store.get(nextId);
    next.board = [1024, 1024, ...Array(14).fill(0)];
    next.version++;
    app.store.save(next);
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(100);
    await page.keyboard.press("ArrowLeft");
    await page.locator("#overlay").waitFor({ state: "visible" });
    await page.locator("#retry-words").waitFor({ state: "visible" });
    assert.equal(wordCalls, 2);
    assert.deepEqual(errors, []);
    console.log(
      "UI PASS: SOAP move, reload recovery, language, reset, win, submit, ranking, 360px layout.",
    );
  } finally {
    await browser.close();
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
