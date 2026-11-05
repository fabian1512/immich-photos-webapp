// Takes the README screenshots from the demo mode with headless Chrome (no dependencies, uses the DevTools protocol).
//   node demo/screenshots.mjs            (Chrome/Chromium must be installed; set CHROME=/path/to/chrome if not found)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "docs", "screenshots");
const PORT = 8081, DEBUG = 9333, W = 1440, H = 900;
const chromePath = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => fs.existsSync(p));
if (!chromePath) { console.error("Chrome not found – set CHROME=/path/to/chrome"); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const demo = spawn(process.execPath, [path.join(here, "server.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "photos-shots-"));
const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill(); demo.kill(); fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup);

async function until(fn, ms = 15000) { const t = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() - t > ms) throw new Error("timeout"); await sleep(150); } }
const target = await until(async () => (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()).find((t) => t.type === "page"));
await until(async () => (await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => (ws.onopen = ok));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { ok, bad } = pending.get(d.id); pending.delete(d.id); d.error ? bad(new Error(d.error.message)) : ok(d.result); } };
const cdp = (method, params = {}) => new Promise((ok, bad) => { const i = ++id; pending.set(i, { ok, bad }); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expr) => { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + expr.slice(0, 80)); return r.result.value; };
const waitFor = (expr, ms) => until(() => run(expr), ms);
const go = async (hash, prefs = {}) => {
  await run(`localStorage.setItem("lang","en"); ${Object.entries(prefs).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join("")} location.hash=${JSON.stringify(hash)}; location.reload();`);
  await sleep(600);
  await waitFor(`!!document.querySelector("#app:not(.hidden)")`);
};
const shot = async (name) => {
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(out, name + ".png"), Buffer.from(data, "base64")); console.log("saved", name);
};
const loaded = (sel, n) => waitFor(`document.querySelectorAll(${JSON.stringify(sel)}).length >= ${n}`, 20000);

await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await cdp("Page.navigate", { url: `http://localhost:${PORT}/` });
await waitFor(`!!document.querySelector("#loginForm")`);
await run(`localStorage.setItem("lang","en")`); await cdp("Page.reload"); await sleep(800);
await run(`const f=document.querySelector("#loginForm"); f.email.value="demo@example.com"; f.password.value="demo"; f.requestSubmit();`);
await waitFor(`!!document.querySelector("#app:not(.hidden)")`);

await go("#/photos", { mode: "years" }); await loaded(".card.big img.loaded", 6); await sleep(500); await shot("years");
await go("#/photos", { mode: "months" }); await loaded(".card img.loaded", 8); await sleep(500); await shot("months");
await go("#/photos", { mode: "all", zoom2: 2 }); await loaded(".tile img.loaded", 24); await sleep(400); await shot("all-photos");

// Viewer with the info panel
await run(`document.querySelectorAll(".tile")[8].click()`); await waitFor(`!!document.querySelector("#vStage img")`);
await run(`document.querySelector("#vInfoBtn").click()`); await waitFor(`document.querySelectorAll("#vPanel dt").length > 3`); await sleep(500); await shot("viewer");
await run(`document.querySelector("#vClose").click()`);

// Selection mode
await run(`document.querySelector("#selToggle").click(); [1,3,4,9,10].forEach(i => document.querySelectorAll(".tile")[i].click());`); await sleep(300); await shot("selection");

await go("#/collections"); await loaded(".strip .tilecard img, .strip .person img", 10); await sleep(700); await shot("collections");
await go("#/map"); await loaded(".mapwrap .pin", 5); await sleep(3500); await shot("map");
await go("#/search/sunset"); await loaded(".tile img.loaded", 12); await sleep(400); await shot("search");

// Dark mode
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await go("#/photos", { mode: "years" }); await loaded(".card.big img.loaded", 6); await sleep(500); await shot("years-dark");
await go("#/photos", { mode: "all", zoom2: 2 }); await loaded(".tile img.loaded", 24); await sleep(400); await shot("all-photos-dark");

cleanup(); process.exit(0);
