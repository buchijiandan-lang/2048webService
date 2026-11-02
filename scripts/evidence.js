const { start } = require("../src/server");
const { Words } = require("../src/words");
const { randomUUID } = require("node:crypto");
const { mkdirSync, writeFileSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
(async () => {
  mkdirSync("docs/soap-samples", { recursive: true });
  const app = await start({
    port: 0,
    dbPath: join(mkdtempSync(join(tmpdir(), "2048-evidence-")), "evidence.db"),
    quiet: true,
  });
  const summary = {
    at: new Date().toISOString(),
    note: "Local samples use an isolated database. Win fixture explicitly seeded for repeatable classroom evidence.",
    operations: [],
  };
  const call = async (kind, op, args) => {
    const [result, response, , request] = await app.proxy[kind][op + "Async"](
      { requestId: randomUUID(), ...args },
      { timeout: 5000, proxy: false },
    );
    const prefix = `docs/soap-samples/${kind}-${op}`;
    writeFileSync(prefix + "-request.xml", request);
    writeFileSync(prefix + "-response.xml", response);
    summary.operations.push({
      service: kind,
      op,
      success: result.success,
      errorCode: result.errorCode,
    });
    if (!result.success) throw Error(result.errorCode);
    return result;
  };
  try {
    const first = await call("game", "NewGame", {});
    const id = first.game.gameId;
    await call("game", "GetGame", { gameId: id });
    let game = app.store.get(id);
    game.board = [1024, 1024, ...Array(14).fill(0)];
    app.store.save(game);
    const win = await call("game", "Move", {
      gameId: id,
      expectedVersion: 0,
      direction: "LEFT",
    });
    const continued = await call("game", "ContinueAfterWin", {
      gameId: id,
      expectedVersion: win.game.version,
    });
    game = app.store.get(id);
    game.status = "LOST";
    game.board = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    game.finishedAt = new Date().toISOString();
    app.store.save(game);
    const entry = await call("leaderboard", "SubmitScore", {
      gameId: id,
      expectedVersion: continued.game.version,
      nickname: "SOAP Demo",
    });
    await call("leaderboard", "GetTopScores", { limit: 10 });
    await call("leaderboard", "GetBestScoreByNickname", {
      nickname: "SOAP Demo",
    });
    await call("game", "ResetGame", {
      gameId: id,
      expectedVersion: entry.game.version,
    });
    const words = new Words();
    try {
      summary.external = { success: true, ...(await words.convert("2048")) };
    } catch (error) {
      summary.external = { success: false, code: error.code };
    }
    if (words.lastExchange?.request)
      writeFileSync(
        "docs/soap-samples/NumberToWords-request.xml",
        words.lastExchange.request,
      );
    if (words.lastExchange?.response)
      writeFileSync(
        "docs/soap-samples/NumberToWords-response.xml",
        words.lastExchange.response,
      );
    summary.external.health = words.health;
    writeFileSync(
      "docs/soap-samples/verification.json",
      JSON.stringify(summary, null, 2),
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
