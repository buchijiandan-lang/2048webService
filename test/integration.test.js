const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { start } = require("../src/server");
test("real SOAP adapters, replay, concurrency, lifecycle and restart", async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "soap2048-")), "test.db");
  let app = await start({ port: 0, dbPath, quiet: true });
  const call = async (path, body) => {
    const r = await fetch(app.url + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  };
  try {
    const requestId = randomUUID();
    const first = await call("/api/games", { requestId });
    assert.equal(first.success, true);
    assert.equal(first.game.board.cell.filter(Boolean).length, 2);
    const replay = await call("/api/games", { requestId });
    assert.equal(replay.game.gameId, first.game.gameId);
    const id = first.game.gameId;
    assert.equal(
      (
        await call(`/api/games/${id}/moves`, {
          requestId: randomUUID(),
          expectedVersion: 99,
          direction: "LEFT",
        })
      ).code,
      "VERSION_CONFLICT",
    );
    const moveId = randomUUID();
    const moved = await call(`/api/games/${id}/moves`, {
      requestId: moveId,
      expectedVersion: 0,
      direction: "LEFT",
    });
    assert.equal(moved.success, true);
    assert.equal(
      (
        await call(`/api/games/${id}/moves`, {
          requestId: moveId,
          expectedVersion: 0,
          direction: "RIGHT",
        })
      ).code,
      "IDEMPOTENCY_CONFLICT",
    );
    assert.equal(
      (
        await call(`/api/games/${id}/score`, {
          requestId: randomUUID(),
          expectedVersion: moved.game.version,
          nickname: "Alice",
          score: "999999",
        })
      ).code,
      "INVALID_GAME_STATE",
    );
    // Seed a domain fixture only in the isolated test database; all tested operations still travel HTTP SOAP.
    const game = app.store.get(id);
    game.board = [1024, 1024, ...Array(14).fill(0)];
    game.score = "0";
    game.status = "PLAYING";
    app.store.save(game);
    const won = await call(`/api/games/${id}/moves`, {
      requestId: randomUUID(),
      expectedVersion: game.version,
      direction: "LEFT",
    });
    assert.equal(won.game.status, "WON");
    assert.equal(won.game.score, "2048");
    const submitted = await call(`/api/games/${id}/score`, {
      requestId: randomUUID(),
      expectedVersion: won.game.version,
      nickname: "Alice",
      score: "999999",
    });
    assert.equal(submitted.entry.score, "2048");
    assert.equal(
      (
        await call(`/api/games/${id}/score`, {
          requestId: randomUUID(),
          expectedVersion: won.game.version,
          nickname: "Alice",
        })
      ).duplicate,
      true,
    );
    assert.equal(
      (
        await call(`/api/games/${id}/continue`, {
          requestId: randomUUID(),
          expectedVersion: won.game.version + 1,
        })
      ).code,
      "INVALID_GAME_STATE",
    );
    assert.equal(
      (await call("/api/leaderboard?limit=0")).code,
      "INVALID_LIMIT",
    );
    assert.ok(
      app.events.some(
        (e) => e.service === "GameService" && e.operation === "Move",
      ),
    );
    assert.ok(
      app.events.some(
        (e) =>
          e.service === "LeaderboardService" && e.operation === "SubmitScore",
      ),
    );
    await app.close();
    app = await start({ port: 0, dbPath, quiet: true });
    assert.equal(
      (await call("/api/leaderboard?limit=10")).entries.entry[0].score,
      "2048",
    );
    assert.equal((await call("/api/games", { requestId })).game.gameId, id);
    assert.equal((await call(`/api/games/${id}`)).game.status, "FINISHED");
  } finally {
    await app.close();
  }
});
