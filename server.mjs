// Minimal dependency-free server: serves the web app and forwards
// /api to Immich (same origin => no CORS problems, cookies just work).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const target = new URL(process.env.IMMICH_URL || "http://localhost:2283");
const port = Number(process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json; charset=utf-8",
};

let logWindow = [];
http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const headers = { ...req.headers, host: target.host };
    const up = http.request({
      hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers,
    }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end("Immich nicht erreichbar"); });
    req.pipe(up);
    return;
  }
  if (req.url.split("?")[0] === "/locales/index.json") {
    // Every public/locales/<code>.json is an available language; "_meta.name" is its display name.
    try {
      const list = fs.readdirSync(path.join(root, "locales")).filter((f) => /^[a-z]{2,3}(-[A-Za-z0-9]+)?\.json$/.test(f)).map((f) => {
        const code = f.slice(0, -5); let meta = {};
        try { meta = JSON.parse(fs.readFileSync(path.join(root, "locales", f), "utf8")); } catch {}
        return { code, name: meta["_meta.name"] || code, dir: meta["_meta.dir"] || "ltr" };
      }).sort((a, b) => (a.code === "en" ? -1 : b.code === "en" ? 1 : a.name.localeCompare(b.name)));
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache" }); return res.end(JSON.stringify(list));
    } catch { res.writeHead(500); return res.end("[]"); }
  }
  if (req.url === "/log" && req.method === "POST") {
    // Client diagnostics (errors, stalls, gesture data) end up in the container log: `docker logs fotos-web`.
    // No photo IDs or credentials are ever sent by the client. Size and rate are limited.
    const now = Date.now(); logWindow = logWindow.filter((t) => now - t < 60000);
    if (logWindow.length >= 120) { res.writeHead(429); return res.end(); }
    logWindow.push(now);
    let body = ""; let big = false;
    req.on("data", (c) => { if ((body += c).length > 8192) { big = true; req.destroy(); } });
    req.on("end", () => {
      if (big) return;
      try { for (const e of [].concat(JSON.parse(body)).slice(0, 20)) console.log("[client]", JSON.stringify(e).slice(0, 600)); } catch {}
      res.writeHead(204); res.end();
    });
    req.on("error", () => {});
    return;
  }
  if (req.url === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Nicht gefunden"); }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}  ->  ${target.origin}`));
