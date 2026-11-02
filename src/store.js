const { DatabaseSync } = require("node:sqlite");
const { randomUUID } = require("node:crypto");
const { mkdirSync } = require("node:fs");
const { dirname } = require("node:path");
const { slide, spawn, canMove } = require("./domain");
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class BusinessError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = (code) => {
  throw new BusinessError(code);
};
const now = () => new Date().toISOString();
function nickname(value) {
  const n =
    String(value || "")
      .normalize("NFC")
      .trim() || "Anonymous";
  if ([...n].length < 2 || [...n].length > 16 || /[<>\p{Cc}\p{Cf}]/u.test(n))
    fail("INVALID_NICKNAME");
  return n;
}
class Store {
  constructor(path, rng = Math.random) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.rng = rng;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,gameId TEXT UNIQUE NOT NULL,nickname TEXT NOT NULL,score INTEGER NOT NULL,reachedTile INTEGER NOT NULL,createdAt TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS ranking ON entries(score DESC,reachedTile DESC,createdAt ASC,id ASC);`);
  }
  get(id) {
    if (!uuid.test(String(id))) fail("INVALID_GAME_ID");
    const row = this.db
      .prepare("SELECT snapshot FROM games WHERE id=?")
      .get(id);
    if (!row) fail("GAME_NOT_FOUND");
    return JSON.parse(row.snapshot);
  }
  save(game) {
    this.db
      .prepare(
        "INSERT INTO games VALUES(?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot",
      )
      .run(game.gameId, JSON.stringify(game));
  }
  snapshot(g) {
    return { ...g, board: { cell: g.board } };
  }
  create() {
    const board = Array(16).fill(0);
    spawn(board, this.rng);
    spawn(board, this.rng);
    const time = now();
    const g = {
      gameId: randomUUID(),
      board,
      score: "0",
      status: "PLAYING",
      reachedTile: Math.max(...board),
      version: 0,
      createdAt: time,
      updatedAt: time,
    };
    this.save(g);
    return g;
  }
  entry(row) {
    return row
      ? {
          ...row,
          score: String(row.score),
          reachedTile: Number(row.reachedTile),
        }
      : undefined;
  }
  rows(sql, ...args) {
    const stmt = this.db.prepare(sql);
    stmt.setReadBigInts(true);
    return stmt.all(...args).map((row) => this.entry(row));
  }
  top(limit) {
    return this.rows(
      "SELECT * FROM entries ORDER BY score DESC,reachedTile DESC,createdAt ASC,id ASC LIMIT ?",
      limit,
    );
  }
  execute(service, operation, args) {
    const requestId = args.requestId;
    if (!uuid.test(String(requestId)))
      return {
        success: false,
        errorCode: "INVALID_REQUEST_ID",
        requestId: String(requestId || "").slice(0, 36),
      };
    const write = [
      "NewGame",
      "Move",
      "ContinueAfterWin",
      "ResetGame",
      "SubmitScore",
    ].includes(operation);
    const fingerprint = JSON.stringify([
      service,
      operation,
      Object.keys(args)
        .sort()
        .map((k) => [k, args[k]]),
    ]);
    try {
      if (write) {
        this.db.exec("BEGIN IMMEDIATE");
        const existing = this.db
          .prepare("SELECT * FROM requests WHERE id=?")
          .get(requestId);
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            fail("IDEMPOTENCY_CONFLICT");
          this.db.exec("COMMIT");
          return JSON.parse(existing.result);
        }
      }
      const result = {
        success: true,
        requestId,
        ...this.dispatch(operation, args),
      };
      if (write) {
        this.db
          .prepare("INSERT INTO requests VALUES(?,?,?)")
          .run(requestId, fingerprint, JSON.stringify(result));
        this.db.exec("COMMIT");
      }
      return result;
    } catch (error) {
      if (write && this.db.isTransaction) this.db.exec("ROLLBACK");
      if (!(error instanceof BusinessError))
        console.error("Storage operation failed:", error.code || error.name);
      return {
        success: false,
        requestId,
        errorCode:
          error instanceof BusinessError ? error.code : "INTERNAL_ERROR",
        message: "Operation rejected",
      };
    }
  }
  version(g, args) {
    if (
      !Number.isSafeInteger(Number(args.expectedVersion)) ||
      args.expectedVersion === undefined ||
      Number(args.expectedVersion) < 0
    )
      fail("INVALID_VERSION");
    if (Number(args.expectedVersion) !== g.version) fail("VERSION_CONFLICT");
  }
  changed(g) {
    g.version++;
    g.updatedAt = now();
    this.save(g);
  }
  dispatch(op, a) {
    if (op === "NewGame") return { game: this.snapshot(this.create()) };
    if (op === "GetTopScores") {
      const limit = Number(a.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        fail("INVALID_LIMIT");
      return { entries: { entry: this.top(limit) } };
    }
    if (op === "GetBestScoreByNickname") {
      const name = nickname(a.nickname);
      const rows = this.rows(
        "SELECT * FROM entries WHERE nickname=? ORDER BY score DESC,reachedTile DESC,createdAt ASC,id ASC LIMIT 1",
        name,
      );
      return rows[0] ? { entry: rows[0] } : {};
    }
    const g = this.get(a.gameId);
    if (op === "GetGame") return { game: this.snapshot(g) };
    if (op === "SubmitScore") {
      const old = this.rows(
        "SELECT * FROM entries WHERE gameId=?",
        g.gameId,
      )[0];
      if (old) return { entry: old, duplicate: true, game: this.snapshot(g) };
      this.version(g, a);
      if (!["WON", "LOST"].includes(g.status)) fail("INVALID_GAME_STATE");
      const e = {
        id: randomUUID(),
        gameId: g.gameId,
        nickname: nickname(a.nickname),
        score: g.score,
        reachedTile: g.reachedTile,
        createdAt: now(),
      };
      this.db
        .prepare("INSERT INTO entries VALUES(?,?,?,?,?,?)")
        .run(
          e.id,
          e.gameId,
          e.nickname,
          BigInt(e.score),
          e.reachedTile,
          e.createdAt,
        );
      g.status = "FINISHED";
      g.finishedAt = e.createdAt;
      this.changed(g);
      return { entry: e, duplicate: false, game: this.snapshot(g) };
    }
    this.version(g, a);
    if (op === "ResetGame") {
      if (g.status !== "FINISHED") {
        g.status = "ABANDONED";
        g.finishedAt = now();
        this.changed(g);
      }
      return { previousGameId: g.gameId, game: this.snapshot(this.create()) };
    }
    if (op === "ContinueAfterWin") {
      if (g.status !== "WON") fail("INVALID_GAME_STATE");
      g.status = canMove(g.board) ? "PLAYING_AFTER_WIN" : "LOST";
      if (g.status === "LOST") g.finishedAt = now();
      this.changed(g);
      return { game: this.snapshot(g) };
    }
    if (op === "Move") {
      if (!["UP", "DOWN", "LEFT", "RIGHT"].includes(a.direction))
        fail("INVALID_DIRECTION");
      if (!["PLAYING", "PLAYING_AFTER_WIN"].includes(g.status))
        fail("GAME_NOT_ACTIVE");
      const moved = slide(g.board, a.direction);
      if (!moved.changed)
        return { game: this.snapshot(g), changed: false, scoreDelta: "0" };
      const score = BigInt(g.score) + moved.delta;
      if (score > 9223372036854775807n) fail("SCORE_OVERFLOW");
      g.board = moved.board;
      g.score = String(score);
      const spawnedTile = spawn(g.board, this.rng);
      g.reachedTile = Math.max(g.reachedTile, ...g.board);
      if (g.status === "PLAYING" && g.reachedTile >= 2048) g.status = "WON";
      else if (!canMove(g.board)) {
        g.status = "LOST";
        g.finishedAt = now();
      }
      this.changed(g);
      return {
        game: this.snapshot(g),
        changed: true,
        scoreDelta: String(moved.delta),
        spawnedTile,
      };
    }
    fail("INVALID_OPERATION");
  }
  close() {
    this.db.close();
  }
}
module.exports = { Store };
