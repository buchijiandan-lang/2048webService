const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { TimeServiceClient, parseTime } = require("../src/time");
test("oversized SOAP response is rejected before XML processing", async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    res.setHeader("Content-Type", "text/xml");
    res.end(
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><!--' +
        "x".repeat(100000) +
        '--><soap:Body><getDateTimeResponse xmlns="http://greyphillips.com/"><getDateTimeResult>2026-11-02T09:26:20-06:00</getDateTimeResult></getDateTimeResponse></soap:Body></soap:Envelope>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const c = new TimeServiceClient({
      endpoint: `http://127.0.0.1:${server.address().port}`,
    });
    assert.equal((await c.getTime()).success, false);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("timeout returns unavailable without a fabricated sample", async () => {
  const server = http.createServer(() => {});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const c = new TimeServiceClient({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      timeout: 80,
    });
    const start = Date.now();
    const r = await c.getTime();
    assert.equal(r.status, "unavailable");
    assert.equal(r.success, false);
    assert.equal(r.lastSample, undefined);
    assert.ok(Date.now() - start < 2000);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test("time parser requires real calendar date and explicit offset", () => {
  assert.equal(
    parseTime("2026-11-02T09:26:20-06:00"),
    "2026-11-02T15:26:20.000Z",
  );
  for (const bad of [
    "2026-11-02T09:26:20",
    "2026-02-30T12:00:00Z",
    "2026-11-02T25:00:00Z",
    "oops",
  ])
    assert.throws(() => parseTime(bad));
});
test("real SOAP client deduplicates, caches and marks previous sample stale on failure", async () => {
  let calls = 0,
    bad = false,
    clock = 0;
  const server = http.createServer((req, res) => {
    let xml = "";
    req.on("data", (x) => (xml += x));
    req.on("end", () => {
      calls++;
      assert.match(xml, /yyyy-MM-ddTHH:mm:sszzz/);
      assert.equal(
        req.headers.soapaction,
        '"http://greyphillips.com/getDateTime"',
      );
      res.setHeader("Content-Type", "text/xml");
      res.end(
        bad
          ? "bad XML"
          : '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><getDateTimeResponse xmlns="http://greyphillips.com/"><getDateTimeResult>2026-11-02T09:26:20-06:00</getDateTimeResult></getDateTimeResponse></soap:Body></soap:Envelope>',
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const c = new TimeServiceClient({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      now: () => clock,
    });
    const [a, b] = await Promise.all([c.getTime(), c.getTime()]);
    assert.equal(a.utcTime, "2026-11-02T15:26:20.000Z");
    assert.equal(b.utcTime, a.utcTime);
    assert.equal(calls, 1);
    assert.equal((await c.getTime()).cached, true);
    clock = 61000;
    bad = true;
    const fail = await c.getTime();
    assert.equal(fail.success, false);
    assert.equal(fail.status, "stale");
    assert.equal(fail.lastSample.utcTime, a.utcTime);
    await c.getTime();
    assert.equal(calls, 2);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
