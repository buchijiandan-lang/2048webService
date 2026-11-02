const $ = (id) => document.getElementById(id);
let lang = localStorage.getItem("2048-lang") || "zh",
  game = null,
  busy = false,
  wordState = null,
  wordScore = null,
  leaders = [];
const t = (key) => messages[lang][key] || key;
const format = (n) =>
  BigInt(n || 0).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
function translate() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("language").textContent = lang === "zh" ? "EN" : "中文";
  render();
  renderLeaders();
  renderWords();
}
function showError(error) {
  $("error").textContent = t(error.code || "network");
  if ($("error").textContent === (error.code || ""))
    $("error").textContent = `${t("generic")} (${error.code})`;
  $("error").hidden = false;
}
async function api(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw { code: "network" };
  }
  const data = await response.json();
  if (!response.ok || !data.success) throw data;
  return data;
}
function setGame(value) {
  if (game?.gameId !== value.gameId) {
    wordScore = null;
    wordState = null;
  }
  game = value;
  localStorage.setItem("2048-game", game.gameId);
  render();
  if (
    ["WON", "LOST", "FINISHED"].includes(game.status) &&
    wordScore !== game.score
  ) {
    wordScore = game.score;
    loadWords();
  }
}
function render() {
  $("new").disabled = busy;
  $("continue").disabled = busy;
  $("submit").querySelector("button").disabled = busy;
  if (!game) return;
  $("score").textContent = format(game.score);
  $("tile").textContent = game.reachedTile;
  $("status").textContent = busy ? t("busy") : t(game.status);
  const board = $("board");
  board.replaceChildren();
  game.board.cell.forEach((value, i) => {
    const cell = document.createElement("div");
    cell.className = "cell" + (value > 2048 ? " high" : "");
    cell.dataset.value = value;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute(
      "aria-label",
      `${Math.floor(i / 4) + 1},${(i % 4) + 1}: ${value}`,
    );
    cell.textContent = value || "";
    board.append(cell);
  });
  const terminal = ["WON", "LOST", "FINISHED", "ABANDONED"].includes(
    game.status,
  );
  $("overlay").hidden = !terminal;
  $("continue").hidden = game.status !== "WON";
  $("state-title").textContent = t(game.status);
  $("state-help").textContent = t(
    game.status === "WON"
      ? "wonHelp"
      : game.status === "LOST"
        ? "lostHelp"
        : "finishedHelp",
  );
  $("finish").hidden = !["WON", "LOST", "FINISHED"].includes(game.status);
  $("submit").hidden = game.status === "FINISHED";
  $("submitted").hidden = game.status !== "FINISHED";
}
async function action(suffix, extra = {}) {
  if (busy) return;
  busy = true;
  $("error").hidden = true;
  render();
  const path = game ? `/api/games/${game.gameId}/${suffix}` : "/api/games";
  const payload = {
    requestId: crypto.randomUUID(),
    ...(game ? { expectedVersion: game.version } : {}),
    ...extra,
  };
  // Preserve the exact request across a network retry so a lost response cannot make a second move.
  try {
    let result;
    try {
      result = await api(path, payload);
    } catch (error) {
      if (error.code !== "network") throw error;
      result = await api(path, payload);
    }
    setGame(result.game);
    if (suffix === "score") await loadLeaders();
  } catch (error) {
    if (error.code === "VERSION_CONFLICT") {
      try {
        setGame((await api(`/api/games/${game.gameId}`)).game);
      } catch {}
    }
    showError(error);
  } finally {
    busy = false;
    render();
    loadLogs();
  }
}
function move(direction) {
  if (game && ["PLAYING", "PLAYING_AFTER_WIN"].includes(game.status))
    action("moves", { direction });
}
async function loadLeaders() {
  try {
    const r = await api("/api/leaderboard?limit=10");
    leaders = r.entries?.entry || [];
    renderLeaders();
  } catch (error) {
    showError(error);
  }
}
function renderLeaders() {
  $("leaders").replaceChildren();
  $("empty").hidden = leaders.length > 0;
  $("best").textContent = format(leaders[0]?.score || 0);
  leaders.forEach((entry, i) => {
    const li = document.createElement("li"),
      rank = document.createElement("span"),
      player = document.createElement("span"),
      sub = document.createElement("small"),
      score = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(i + 1).padStart(2, "0");
    player.className = "player";
    player.textContent = entry.nickname;
    sub.textContent = `${entry.reachedTile} · ${new Date(entry.createdAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}`;
    player.append(sub);
    score.className = "leader-score";
    score.textContent = format(entry.score);
    li.append(rank, player, score);
    $("leaders").append(li);
  });
}
function renderWords() {
  $("words").textContent =
    wordState?.words || t(wordState?.status || "loading");
  $("retry-words").hidden = wordState?.status !== "unavailable";
}
async function loadWords() {
  const score = game?.score,
    gameId = game?.gameId;
  if (score === undefined) return;
  wordState = { status: "loading" };
  renderWords();
  try {
    const result = await api(`/api/scores/${score}/words`);
    if (game?.gameId === gameId && game?.score === score)
      wordState = { words: result.words };
  } catch {
    if (game?.gameId === gameId && game?.score === score)
      wordState = { status: "unavailable" };
  }
  renderWords();
}
async function loadLogs() {
  try {
    const events = await (await fetch("/api/events")).json();
    $("logs").textContent = events
      .map(
        (e) =>
          `${e.service}.${e.operation} · ${e.code} · ${e.durationMs} ms\n${e.requestId}`,
      )
      .reverse()
      .join("\n");
  } catch {}
}
$("new").onclick = () => action("reset");
$("continue").onclick = () => action("continue");
$("refresh").onclick = () => loadLeaders();
$("retry-words").onclick = loadWords;
$("language").onclick = () => {
  lang = lang === "zh" ? "en" : "zh";
  localStorage.setItem("2048-lang", lang);
  translate();
};
$("submit").onsubmit = (e) => {
  e.preventDefault();
  action("score", { nickname: $("nickname").value });
};
$("best-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api(
      `/api/leaderboard/best?nickname=${encodeURIComponent($("best-name").value)}`,
    );
    $("personal-result").textContent = r.entry
      ? `${r.entry.nickname} · ${format(r.entry.score)}`
      : t("noBest");
  } catch (error) {
    showError(error);
  }
};
document.addEventListener("keydown", (e) => {
  if (
    e.target.matches("input,textarea,select") ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey
  )
    return;
  const d =
    {
      ArrowLeft: "LEFT",
      ArrowRight: "RIGHT",
      ArrowUp: "UP",
      ArrowDown: "DOWN",
      a: "LEFT",
      d: "RIGHT",
      w: "UP",
      s: "DOWN",
    }[e.key] || { A: "LEFT", D: "RIGHT", W: "UP", S: "DOWN" }[e.key];
  if (d) {
    e.preventDefault();
    move(d);
  }
});
document
  .querySelectorAll("[data-direction]")
  .forEach((b) => (b.onclick = () => move(b.dataset.direction)));
let touch;
$("board").addEventListener("pointerdown", (e) => {
  touch = { x: e.clientX, y: e.clientY };
  $("board").setPointerCapture(e.pointerId);
});
$("board").addEventListener("pointerup", (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x,
    dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  move(
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? "RIGHT"
        : "LEFT"
      : dy > 0
        ? "DOWN"
        : "UP",
  );
});
$("board").addEventListener("pointercancel", () => (touch = null));
async function init() {
  translate();
  await loadLeaders();
  const saved = localStorage.getItem("2048-game");
  if (saved) {
    try {
      setGame((await api(`/api/games/${saved}`)).game);
    } catch (error) {
      showError(error);
    }
  } else await action("");
  loadLogs();
}
init();
