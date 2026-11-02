const soap = require("soap");
const { join } = require("node:path");
const ENDPOINT = "https://beta.greyphillips.com/apis/soap/argos/acl.asmx";
function parseTime(value) {
  if (typeof value !== "string") throw Error("Invalid time");
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!m) throw Error("Missing or invalid timezone");
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    year < 1970 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw Error("Invalid calendar date");
  if (m[7] !== "Z") {
    const h = Number(m[7].slice(1, 3)),
      min = Number(m[7].slice(4));
    if (h > 14 || min > 59 || (h === 14 && min !== 0))
      throw Error("Invalid offset");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw Error("Invalid timestamp");
  return new Date(timestamp).toISOString();
}
class TimeServiceClient {
  constructor({
    endpoint = process.env.TIME_ENDPOINT || ENDPOINT,
    timeout = Number(process.env.TIME_TIMEOUT_MS || 5000),
    now = Date.now,
    onCall = () => {},
  } = {}) {
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000)
      throw Error("TIME_TIMEOUT_MS must be 1..30000");
    this.endpoint = endpoint;
    this.timeout = timeout;
    this.now = now;
    this.onCall = onCall;
    this.sample = null;
    this.inflight = null;
    this.retryAt = 0;
    this.health = { status: "not_checked" };
  }
  result(cached) {
    return {
      success: true,
      status: "fresh",
      ...this.sample,
      ageMs: Math.max(0, this.now() - this.sampleAt),
      cached,
    };
  }
  failure() {
    return {
      success: false,
      status: this.sample ? "stale" : "unavailable",
      code: "TIME_UNAVAILABLE",
      ...(this.sample
        ? {
            lastSample: {
              ...this.sample,
              ageMs: Math.max(0, this.now() - this.sampleAt),
            },
          }
        : {}),
    };
  }
  async getTime(requestId) {
    if (this.sample && this.now() - this.sampleAt < 60000)
      return this.result(true);
    if (this.inflight) return this.inflight;
    if (this.now() < this.retryAt) return this.failure();
    this.inflight = this.fetchTime(requestId);
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }
  async fetchTime(requestId) {
    const started = performance.now();
    let success = false;
    try {
      this.clientPromise ??= soap.createClientAsync(
        join(__dirname, "../contracts/time.wsdl"),
      );
      const client = await this.clientPromise;
      client.setEndpoint(this.endpoint);
      const value = await new Promise((resolve, reject) =>
        client.GPApiClientLibrary_argos.GPApiClientLibrary_argosSoap.getDateTime(
          { strFormat: "yyyy-MM-ddTHH:mm:sszzz" },
          (error, result, response, headers, request) => {
            this.lastExchange = { request, response };
            error ? reject(error) : resolve(result);
          },
          {
            timeout: this.timeout,
            maxContentLength: 65536,
            signal: AbortSignal.timeout(this.timeout),
          },
        ),
      );
      const sourceTime = value?.getDateTimeResult,
        utcTime = parseTime(sourceTime);
      this.sampleAt = this.now();
      this.sample = {
        utcTime,
        sourceTime,
        source: "GreyPhillips SOAP",
        fetchedAt: new Date(this.sampleAt).toISOString(),
      };
      this.health = { status: "available", checkedAt: this.sample.fetchedAt };
      this.retryAt = 0;
      success = true;
      return this.result(false);
    } catch {
      this.retryAt = this.now() + 15000;
      this.health = {
        status: "unavailable",
        checkedAt: new Date(this.now()).toISOString(),
      };
      return this.failure();
    } finally {
      this.onCall({
        requestId,
        service: "ExternalTimeService",
        operation: "getDateTime",
        success,
        code: success ? "OK" : "TIME_UNAVAILABLE",
        durationMs: Math.round(performance.now() - started),
        at: new Date().toISOString(),
      });
    }
  }
}
module.exports = { TimeServiceClient, parseTime };
