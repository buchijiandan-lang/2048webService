const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { Words } = require("../src/words");
test("external failure is unavailable, invalid unsigned input never sent", async () => {
  const words = new Words({
    endpoint: "http://127.0.0.1:1/unavailable",
    timeout: 150,
  });
  await assert.rejects(words.convert("-1"), { code: "INVALID_SCORE" });
  await assert.rejects(words.convert("18446744073709551616"), {
    code: "INVALID_SCORE",
  });
  await assert.rejects(words.convert("2048"), {
    code: "NUMBER_WORDS_UNAVAILABLE",
  });
  assert.equal(words.health.status, "unavailable");
});
test("WSDL client uses SOAP envelope, caches genuine response and rejects malformed data", async () => {
  let count = 0,
    malformed = false;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      count++;
      assert.match(body, /<ubiNum>2048<\/ubiNum>/);
      res.setHeader("Content-Type", "text/xml");
      res.end(
        malformed
          ? "not XML"
          : '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><NumberToWordsResponse xmlns="http://www.dataaccess.com/webservicesserver/"><NumberToWordsResult>two thousand and forty eight </NumberToWordsResult></NumberToWordsResponse></soap:Body></soap:Envelope>',
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const w = new Words({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      timeout: 500,
    });
    assert.equal(
      (await w.convert("2048")).words,
      "two thousand and forty eight",
    );
    assert.equal((await w.convert("2048")).cached, true);
    assert.equal(count, 1);
    malformed = true;
    const bad = new Words({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      timeout: 500,
    });
    await assert.rejects(bad.convert("2048"), {
      code: "NUMBER_WORDS_UNAVAILABLE",
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
});
