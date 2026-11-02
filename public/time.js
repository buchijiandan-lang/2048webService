(() => {
  const text = {
    zh: {
      title: "北京时间 · 外部 SOAP",
      loading: "正在同步外部时间…",
      fresh: "最近采样（非实时走秒）",
      stale: "同步失败 · 上次采样已过期",
      unavailable: "外部时间暂不可用",
      refresh: "同步时间",
      age: "采样距今",
      seconds: "秒",
    },
    en: {
      title: "Beijing time · External SOAP",
      loading: "Synchronizing external time…",
      fresh: "Latest sample (not a ticking clock)",
      stale: "Sync failed · Previous sample is stale",
      unavailable: "External time unavailable",
      refresh: "Sync time",
      age: "Sample age",
      seconds: "seconds",
    },
  };
  let state = null,
    busy = false;
  let receivedAt = performance.now();
  const el = (id) => document.getElementById(id);
  function render() {
    const en = document.documentElement.lang === "en",
      t = text[en ? "en" : "zh"];
    el("time-title").textContent = t.title;
    el("time-refresh").textContent = t.refresh;
    el("time-refresh").disabled = busy;
    el("time-status").textContent = busy
      ? t.loading
      : t[state?.status || "unavailable"];
    const sample = state?.success ? state : state?.lastSample;
    el("time-value").textContent = sample
      ? new Intl.DateTimeFormat(en ? "en-GB" : "zh-CN", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).format(new Date(sample.utcTime))
      : "—";
    el("time-age").textContent = sample
      ? `${t.age} ${Math.floor(((sample.ageMs || 0) + performance.now() - receivedAt) / 1000)} ${t.seconds} · UTC+08:00`
      : "";
  }
  async function sync() {
    if (busy) return;
    busy = true;
    render();
    try {
      const response = await fetch("/api/time", {
        signal: AbortSignal.timeout(7000),
      });
      const result = await response.json();
      if (!response.ok && result.code !== "TIME_UNAVAILABLE") throw Error();
      state = result;
      receivedAt = performance.now();
    } catch {
      const previous = state?.success ? state : state?.lastSample;
      state = {
        success: false,
        status: previous ? "stale" : "unavailable",
        lastSample: previous,
      };
    } finally {
      busy = false;
      render();
    }
  }
  el("time-refresh").onclick = sync;
  setInterval(() => {
    if (!document.hidden) render();
  }, 1000);
  new MutationObserver(render).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  setInterval(() => {
    if (!document.hidden) sync();
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sync();
  });
  sync();
})();
