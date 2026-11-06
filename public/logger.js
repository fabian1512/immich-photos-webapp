"use strict";
// Small client-side diagnostics: sends errors, main-thread stalls and gesture data to POST /log (shows up in `docker logs fotos-web`).
// Contains no photo IDs, names or credentials. Max. 100 messages per page load.
(function () {
  const BUILD = "v22";
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
  log("boot", { ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, standalone: !!navigator.standalone, mem: navigator.deviceMemory });
})();
