const soap = require("soap");
const { writeFileSync } = require("node:fs");
(async () => {
  const client = await soap.createClientAsync(
    "contracts/number-conversion.wsdl",
  );
  const results = [];
  for (const endpoint of [
    "https://www.dataaccess.com/webservicesserver/NumberConversion.wso",
    "http://www.dataaccess.com/webservicesserver/NumberConversion.wso",
  ]) {
    client.setEndpoint(endpoint);
    await new Promise((resolve) =>
      client.NumberConversion.NumberConversionSoap.NumberToWords(
        { ubiNum: "2048" },
        (error, value, raw, header, request) => {
          const entry = {
            at: new Date().toISOString(),
            endpoint,
            success: !error,
            value,
            request,
            response: raw,
            error: error
              ? {
                  code: error.code,
                  message: error.message,
                  status: error.response?.status,
                }
              : undefined,
          };
          results.push(entry);
          console.log({
            endpoint,
            success: entry.success,
            value,
            error: entry.error,
          });
          resolve();
        },
        { timeout: 8000, signal: AbortSignal.timeout(8000) },
      ),
    );
  }
  writeFileSync(
    "docs/soap-samples/external-probe.json",
    JSON.stringify(results, null, 2),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
