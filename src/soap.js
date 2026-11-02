const soap = require("soap");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const operations = {
  game: ["NewGame", "GetGame", "Move", "ContinueAfterWin", "ResetGame"],
  leaderboard: ["SubmitScore", "GetTopScores", "GetBestScoreByNickname"],
};
const options = {
  customDeserializer: { long: (text) => text },
  forceSoap12Headers: false,
};
function publish(app, store, base, events, quiet) {
  for (const [kind, ops] of Object.entries(operations)) {
    const service = kind === "game" ? "GameService" : "LeaderboardService";
    const methods = Object.fromEntries(
      ops.map((operation) => [
        operation,
        (args) => {
          args = args && typeof args === "object" ? args : {};
          const started = performance.now();
          const result = store.execute(service, operation, args);
          const event = {
            requestId: args.requestId,
            service,
            operation,
            success: result.success,
            code: result.errorCode || "OK",
            durationMs: Math.round(performance.now() - started),
            at: new Date().toISOString(),
          };
          events.push(event);
          if (events.length > 100) events.shift();
          if (!quiet) console.log(JSON.stringify(event));
          return result;
        },
      ]),
    );
    const xml = readFileSync(
      join(__dirname, `../contracts/${kind}.wsdl`),
      "utf8",
    ).replaceAll("http://127.0.0.1:8080", base);
    soap.listen(app, {
      path: `/ws/${kind}`,
      services: { [service]: { [`${service}Port`]: methods } },
      xml,
      suppressStack: true,
      returnFault: true,
      ...options,
    });
  }
}
async function clients(base) {
  const result = {};
  for (const kind of Object.keys(operations))
    result[kind] = await soap.createClientAsync(`${base}/ws/${kind}?wsdl`, {
      ...options,
      wsdl_options: { timeout: 3000, proxy: false },
    });
  return result;
}
module.exports = { publish, clients };
