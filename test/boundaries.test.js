const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { start } = require("../src/server");
test("SOAP boundary rejects XML entities, preserves large scores and serializes competing versions", async () => {
  const app = await start({ port: 0, dbPath: ":memory:", quiet: true });
  const call = async (kind, op, args) => {
    const [r] = await app.proxy[kind][op + "Async"](
      { requestId: randomUUID(), ...args },
      { proxy: false, timeout: 2000 },
    );
    return r;
  };
  try {
    const empty = await fetch(app.url + "/ws/game", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        SOAPAction: "http://webservice.example.com/2048/game/v1/NewGame",
      },
      body: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><NewGameRequest xmlns="http://webservice.example.com/2048/game/v1"/></s:Body></s:Envelope>',
    });
    const emptyBody = await empty.text();
    assert.match(emptyBody, /INVALID_REQUEST_ID/);
    assert.doesNotMatch(emptyBody, /TypeError/);
    const initial = await call("game", "NewGame", {});
    const id = initial.game.gameId;
    let g = app.store.get(id);
    g.board = [2, 2, ...Array(14).fill(0)];
    app.store.save(g);
    const results = await Promise.all([
      call("game", "Move", {
        gameId: id,
        expectedVersion: 0,
        direction: "LEFT",
      }),
      call("game", "Move", {
        gameId: id,
        expectedVersion: 0,
        direction: "RIGHT",
      }),
    ]);
    assert.equal(results.filter((r) => r.success).length, 1);
    assert.equal(results.find((r) => !r.success).errorCode, "VERSION_CONFLICT");
    g = app.store.get(id);
    g.status = "WON";
    g.score = "9007199254740993";
    g.reachedTile = 2048;
    app.store.save(g);
    assert.equal(
      (
        await call("leaderboard", "SubmitScore", {
          gameId: id,
          expectedVersion: g.version,
          nickname: "<b>X</b>",
        })
      ).errorCode,
      "INVALID_NICKNAME",
    );
    const continued = await call("game", "ContinueAfterWin", {
      gameId: id,
      expectedVersion: g.version,
    });
    assert.equal(continued.game.status, "PLAYING_AFTER_WIN");
    g = app.store.get(id);
    g.status = "LOST";
    app.store.save(g);
    const submitted = await call("leaderboard", "SubmitScore", {
      gameId: id,
      expectedVersion: g.version,
      nickname: "😀😀",
    });
    assert.equal(submitted.entry.score, "9007199254740993");
    const best = await call("leaderboard", "GetBestScoreByNickname", {
      nickname: "😀😀",
    });
    assert.equal(best.entry.score, "9007199254740993");
    const xml =
      '<!DOCTYPE x [<!ENTITY data SYSTEM "file:///secret">]><x>&data;</x>';
    const response = await fetch(app.url + "/ws/game", {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml,
    });
    assert.equal(response.status, 400);
    const reset = await call("game", "ResetGame", {
      gameId: id,
      expectedVersion: submitted.game.version,
    });
    assert.notEqual(reset.game.gameId, id);
    assert.equal(
      (await call("game", "GetGame", { gameId: id })).game.status,
      "FINISHED",
    );
  } finally {
    await app.close();
  }
});
