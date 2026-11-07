"use strict";
// Small client-side diagnostics: sends errors, main-thread stalls and gesture data to POST /log (shows up in `docker logs fotos-web`).
// Contains no photo IDs, names or credentials. Max. 100 messages per page load.
(function () {
  const BUILD = "v27";
  const queue = []; let sent = 0, timer = 0;
  function flush() {
    timer = 0; if (!queue.length) return;
    const body = JSON.stringify(queue.splice(0, 20));
    try { if (!(navigator.sendBeacon && navigator.sendBeacon("/log", new Blob([body], { type: "application/json" })))) fetch("/log", { method: "POST", body, keepalive: true }).catch(() => {}); } catch {}
  }
  function log(type, data) {
    if (sent >= 100) return; sent++;
    let ctx = {}; try { ctx = window.__logContext ? window.__logContext() : {}; } catch {}
    queue.push({ t: new Date().toISOString().slice(11, 23), build: BUILD, ev: type, ...ctx, ...data });
    if (!timer) timer = setTimeout(flush, 3000);
  }
  window.Log = { log };
  addEventListener("error", (e) => log("error", { msg: String(e.message).slice(0, 200), src: String(e.filename || "").split("/").pop(), line: e.lineno }));
  addEventListener("unhandledrejection", (e) => log("rejection", { msg: String((e.reason && e.reason.message) || e.reason).slice(0, 200) }));
  addEventListener("pagehide", flush); document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  // Stall detection: a timer that should run every 250 ms but is delayed by more than 1.5 s means the page was frozen.
  let last = performance.now();
  setInterval(() => {
    const n = performance.now(), gap = n - last; last = n;
    if (gap > 1750 && !document.hidden) log("stall", { ms: Math.round(gap) });
  }, 250);
  document.addEventListener("visibilitychange", () => { last = performance.now(); });
  // Load timing: 8 s and 20 s after start, a summary of API calls and thumbnails (counts and durations only, no URLs).
  function loadSummary(tag) {
    try {
      const nav = performance.getEntriesByType("navigation")[0] || {};
      const res = performance.getEntriesByType("resource");
      const stat = (list) => { const d = list.map((r) => Math.round(r.responseEnd - r.startTime)).sort((a, b) => a - b); return { n: d.length, p50: d[d.length >> 1] || 0, p90: d[Math.floor(d.length * 0.9)] || 0, max: d[d.length - 1] || 0, cached: list.filter((r) => r.transferSize === 0).length }; };
      const api = res.filter((r) => r.name.includes("/api/") && !/thumbnail|original|playback/.test(r.name));
      const slowApi = api.sort((a, b) => (b.responseEnd - b.startTime) - (a.responseEnd - a.startTime))[0];
      log("load", { tag, dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), thumbs: stat(res.filter((r) => /thumbnail/.test(r.name))), api: stat(api), slowestApi: slowApi ? { ms: Math.round(slowApi.responseEnd - slowApi.startTime), path: slowApi.name.split("?")[0].replace(/^.*\/api/, "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id") } : null });
    } catch {}
  }
  setTimeout(() => loadSummary("8s"), 8000); setTimeout(() => loadSummary("20s"), 20000);
  log("boot", { ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, standalone: !!navigator.standalone, mem: navigator.deviceMemory });
})();
