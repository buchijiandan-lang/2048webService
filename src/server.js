const express = require("express");
const http = require("node:http");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Store } = require("./store");
const { publish, clients } = require("./soap");
const { TimeServiceClient } = require("./time");
function normalize(result) {
  if (result.game) {
    result.game.version = Number(result.game.version);
    result.game.reachedTile = Number(result.game.reachedTile);
    result.game.board.cell = result.game.board.cell.map(Number);
  }
  if (result.entries) {
    let e = result.entries.entry || [];
    result.entries.entry = Array.isArray(e) ? e : [e];
  }
  return result;
}
function httpStatus(code) {
  if (!code) return 200;
  if (code === "GAME_NOT_FOUND") return 404;
  if (
    [
      "VERSION_CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "GAME_NOT_ACTIVE",
      "INVALID_GAME_STATE",
    ].includes(code)
  )
    return 409;
  if (code === "INTERNAL_ERROR") return 500;
  return 400;
}
async function start({
  port = Number(process.env.PORT || 8080),
  dbPath = process.env.DB_PATH || join(__dirname, "../data/2048.db"),
  quiet = false,
} = {}) {
  const store = new Store(dbPath),
    app = express(),
    server = http.createServer(app),
    events = [];
  let proxy;
  const externalTime = new TimeServiceClient({
    onCall: (event) => {
      events.push(event);
      if (events.length > 100) events.shift();
      if (!quiet) console.log(JSON.stringify(event));
    },
  });
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    next();
  });
  app.use(
    "/ws",
    express.raw({ type: () => true, limit: "64kb" }),
    (req, res, next) => {
      if (req.body) {
        const body = req.body.toString("utf8");
        if (/<!DOCTYPE|<!ENTITY/i.test(body))
          return res
            .status(400)
            .type("text/xml")
            .send("<error>DTD and ENTITY are forbidden</error>");
        req.body = body;
      }
      next();
    },
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    publish(app, store, url, events, quiet);
    proxy = await clients(url);
  } catch (error) {
    server.close();
    store.close();
    throw error;
  }
  app.use(express.json({ limit: "16kb" }));
  const invoke = (kind, op, args) =>
    proxy[kind][`${op}Async`](args, { timeout: 5000, proxy: false }).then(
      ([r]) => normalize(r),
    );
  const route = (kind, op, args) => async (req, res) => {
    const requestId =
      req.body?.requestId || req.query.requestId || randomUUID();
    try {
      const result = await invoke(kind, op, { requestId, ...args(req) });
      res
        .status(httpStatus(result.errorCode))
        .json({ ...result, code: result.errorCode });
    } catch {
      res
        .status(503)
        .json({ success: false, code: "SOAP_UNAVAILABLE", requestId });
    }
  };
  const gameArgs = (req) => ({
    gameId: req.params.id,
    expectedVersion: req.body?.expectedVersion,
  });
  app.post(
    "/api/games",
    route("game", "NewGame", () => ({})),
  );
  app.get(
    "/api/games/:id",
    route("game", "GetGame", (req) => ({ gameId: req.params.id })),
  );
  app.post(
    "/api/games/:id/moves",
    route("game", "Move", (req) => ({
      ...gameArgs(req),
      direction: req.body.direction,
    })),
  );
  app.post(
    "/api/games/:id/continue",
    route("game", "ContinueAfterWin", gameArgs),
  );
  app.post("/api/games/:id/reset", route("game", "ResetGame", gameArgs));
  app.post(
    "/api/games/:id/score",
    route("leaderboard", "SubmitScore", (req) => ({
      ...gameArgs(req),
      nickname: req.body.nickname || "",
    })),
  );
  app.get(
    "/api/leaderboard",
    route("leaderboard", "GetTopScores", (req) => ({
      limit: req.query.limit ?? 10,
    })),
  );
  app.get(
    "/api/leaderboard/best",
    route("leaderboard", "GetBestScoreByNickname", (req) => ({
      nickname: req.query.nickname || "",
    })),
  );
  let words;
  try {
    const { Words } = require("./words");
    words = new Words();
  } catch {}
  app.get("/api/scores/:score/words", async (req, res) => {
    try {
      if (!words) throw Error();
      res.json({ success: true, ...(await words.convert(req.params.score)) });
    } catch (error) {
      res.status(error.code === "INVALID_SCORE" ? 400 : 503).json({
        success: false,
        code: error.code || "NUMBER_WORDS_UNAVAILABLE",
      });
    }
  });
  app.get("/api/time", async (req, res) => {
    const requestId = randomUUID();
    const result = await externalTime.getTime(requestId);
    res.setHeader("Cache-Control", "no-store");
    res.status(result.success ? 200 : 503).json({ ...result, requestId });
  });
  app.get("/api/health", (req, res) =>
    res.json({
      success: true,
      soap: "ready",
      database: "ready",
      numberConversion: words?.health || { status: "not_checked" },
      externalTime: externalTime.health,
    }),
  );
  app.get("/api/events", (req, res) => res.json(events.slice(-30)));
  app.use(express.static(join(__dirname, "../public")));
  app.use((error, req, res, next) =>
    res
      .status(error.status === 413 ? 413 : 400)
      .json({ success: false, code: "INVALID_REQUEST" }),
  );
  if (!quiet) console.log(`2048 SOAP ready: ${url}`);
  return {
    url,
    store,
    events,
    proxy,
    close: () =>
      new Promise((resolve) =>
        server.close(() => {
          store.close();
          resolve();
        }),
      ),
  };
}
if (require.main === module)
  start().catch((error) => {
    console.error("Startup failed:", error.message);
    process.exitCode = 1;
  });
module.exports = { start };
