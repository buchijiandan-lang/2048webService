const { TimeServiceClient } = require("../src/time");
const { writeFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
(async () => {
  const results = [];
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1200));
    const c = new TimeServiceClient();
    const r = await c.getTime(randomUUID());
    results.push(r);
    for (const key of ["request", "response"])
      if (c.lastExchange?.[key])
        writeFileSync(
          `docs/soap-samples/time-${i + 1}-${key}.xml`,
          c.lastExchange[key],
        );
  }
  const advances =
    results.every((r) => r.success) &&
    Date.parse(results[1].utcTime) > Date.parse(results[0].utcTime);
  writeFileSync(
    "docs/soap-samples/time-verification.json",
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), results, advances },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, advances }, null, 2));
  if (!advances) process.exitCode = 1;
})();
