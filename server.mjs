// Minimaler Server ohne Abhängigkeiten: liefert die Web-App aus und leitet
// /api an Immich weiter (gleiche Herkunft => keine CORS-Probleme, Cookies gehen).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const target = new URL(process.env.IMMICH_URL || "http://localhost:2283");
const port = Number(process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json",
};

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
  if (req.url === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Nicht gefunden"); }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}  ->  ${target.origin}`));
