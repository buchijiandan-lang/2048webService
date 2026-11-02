const soap = require("soap");
const { join } = require("node:path");
class Words {
  constructor({
    endpoint = process.env.NUMBER_ENDPOINT ||
      "https://www.dataaccess.com/webservicesserver/NumberConversion.wso",
    timeout = Number(process.env.NUMBER_TIMEOUT_MS || 5000),
  } = {}) {
    this.endpoint = endpoint;
    this.timeout = timeout;
    this.cache = new Map();
    this.health = { status: "not_checked" };
  }
  async convert(score) {
    if (
      !/^(0|[1-9][0-9]{0,19})$/.test(score) ||
      BigInt(score) > 18446744073709551615n
    )
      throw Object.assign(Error(), { code: "INVALID_SCORE" });
    const cached = this.cache.get(score);
    if (cached && cached.expires > Date.now())
      return { words: cached.words, cached: true };
    try {
      this.clientPromise ??= soap.createClientAsync(
        join(__dirname, "../contracts/number-conversion.wsdl"),
      );
      const client = await this.clientPromise;
      client.setEndpoint(this.endpoint);
      const port = client.NumberConversion.NumberConversionSoap;
      let result;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await new Promise((resolve, reject) =>
            port.NumberToWords(
              { ubiNum: score },
              (error, value, raw, header, request) => {
                this.lastExchange = { request, response: raw };
                error ? reject(error) : resolve(value);
              },
              {
                timeout: this.timeout,
                signal: AbortSignal.timeout(this.timeout),
              },
            ),
          );
          break;
        } catch (error) {
          if (
            attempt === 1 ||
            ![
              "ECONNABORTED",
              "ECONNRESET",
              "ECONNREFUSED",
              "ETIMEDOUT",
              "ENOTFOUND",
              "ERR_CANCELED",
            ].includes(error.code)
          )
            throw error;
        }
      }
      const words = result?.NumberToWordsResult?.trim();
      if (!words || words.length > 4096) throw Error("Invalid SOAP result");
      this.cache.set(score, { words, expires: Date.now() + 86400000 });
      if (this.cache.size > 1000)
        this.cache.delete(this.cache.keys().next().value);
      this.health = {
        status: "available",
        checkedAt: new Date().toISOString(),
      };
      return { words, cached: false };
    } catch {
      this.health = {
        status: "unavailable",
        checkedAt: new Date().toISOString(),
      };
      throw Object.assign(Error("Number Conversion unavailable"), {
        code: "NUMBER_WORDS_UNAVAILABLE",
      });
    }
  }
}
module.exports = { Words };
