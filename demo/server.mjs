// Demo mode: a tiny fake Immich API with generated dummy photos, plus the regular web app in front of it.
//   node demo/server.mjs          -> http://localhost:8081 (any e-mail/password works)
// Nothing here talks to a real Immich server or contains real photos.
import http from "node:http";
import { assets, byId, months, ALBUMS, PEOPLE, CITIES, columnar, asDto } from "./data.mjs";
import { picture, avatar, THEMES } from "./art.mjs";

const MOCK_PORT = Number(process.env.DEMO_API_PORT || 2299);
const json = (res, body, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok({}); } }); });
const svg = (res, s) => { res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" }); res.end(s); };

/** Assets for /timeline/* queries (person, album, bounding box, favorites). */
function filtered(q) {
  let list = assets;
  if (q.get("albumId")) list = (ALBUMS.find((a) => a.id === q.get("albumId")) || { assets: [] }).assets;
  if (q.get("personId")) { const i = PEOPLE.findIndex((p) => p.id === q.get("personId")); list = list.filter((a) => a.person === i); }
  if (q.get("isFavorite") === "true") list = list.filter((a) => a.isFavorite);
  if (q.get("bbox")) { const [w, s, e, n] = q.get("bbox").split(",").map(Number); list = list.filter((a) => a.lat != null && a.lon >= w && a.lon <= e && a.lat >= s && a.lat <= n); }
  return list;
}
const SMART = [[/mountain|hike|hiking|alps/, 0], [/beach|sea|ocean|coast/, 1], [/city|street|building/, 2], [/forest|tree|wood/, 3], [/sunset|sunrise|evening/, 4], [/flower|meadow|field|garden/, 5], [/night|star|moon|sky/, 6]];
const page = (list, body, def) => {
  const size = body.size || def, p = body.page || 1, items = list.slice((p - 1) * size, p * size).map(asDto);
  return { assets: { items, total: list.length, count: items.length, facets: [], nextPage: p * size < list.length ? String(p + 1) : null }, albums: { total: 0, count: 0, items: [], facets: [] } };
};

const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname.replace(/^\/api/, ""), q = url.searchParams, m = req.method;
  if (p === "/server/version") return json(res, { major: 3, minor: 3, patch: 6 });
  if (p === "/auth/login" && m === "POST") {
    res.setHeader("set-cookie", "immich_access_token=demo; Path=/; HttpOnly; SameSite=Lax");
    return json(res, { accessToken: "demo", userId: "demo-user", userEmail: "demo@example.com", name: "Demo User", isAdmin: false });
  }
  if (p === "/auth/logout") { res.setHeader("set-cookie", "immich_access_token=; Path=/; Max-Age=0"); return json(res, { successful: true }); }
  if (!/immich_access_token=demo/.test(req.headers.cookie || "")) return json(res, { message: "Unauthorized" }, 401);

  if (p === "/users/me") return json(res, { id: "demo-user", name: "Demo User", email: "demo@example.com" });
  if (p === "/timeline/buckets") {
    const list = filtered(q), count = new Map();
    for (const a of list) count.set(a.mi, (count.get(a.mi) || 0) + 1);
    return json(res, [...count].sort((a, b) => a[0] - b[0]).map(([mi, c]) => ({ timeBucket: months[mi].iso, count: c })));
  }
  if (p === "/timeline/bucket") {
    const mi = months.findIndex((x) => x.iso === q.get("timeBucket"));
    return json(res, columnar(filtered(q).filter((a) => a.mi === mi).sort((a, b) => (a.date < b.date ? 1 : -1))));
  }
  let mt;
  if ((mt = p.match(/^\/assets\/([^/]+)\/(thumbnail|original|video\/playback)$/))) {
    const a = byId.get(mt[1]); if (!a || mt[2].startsWith("video")) { res.writeHead(404); return res.end(); }
    return svg(res, picture(a.id, THEMES[a.theme], a.ratio));
  }
  if ((mt = p.match(/^\/assets\/([^/]+)$/)) && m === "GET") { const a = byId.get(mt[1]); return a ? json(res, asDto(a)) : json(res, { message: "Not found" }, 404); }
  if (p === "/assets" && (m === "PUT" || m === "DELETE")) { await readBody(req); res.writeHead(204); return res.end(); }
  if (p === "/albums" && m === "GET") {
    return json(res, ALBUMS.map((al) => ({ id: al.id, albumName: al.name, assetCount: al.assets.length, albumThumbnailAssetId: al.assets[Math.floor(al.assets.length / 3)].id, endDate: al.assets[0].date })));
  }
  if ((mt = p.match(/^\/albums\/([^/]+)\/assets$/)) && m === "PUT") { const b = await readBody(req); return json(res, (b.ids || []).map((id) => ({ id, success: true }))); }
  if (p === "/search/metadata" && m === "POST") {
    const b = await readBody(req); let list = assets;
    if (b.albumIds) list = ALBUMS.find((a) => a.id === b.albumIds[0])?.assets || [];
    if (b.takenAfter) list = list.filter((a) => a.date >= b.takenAfter && a.date < b.takenBefore);
    if (b.type) list = list.filter((a) => (a.isVideo ? "VIDEO" : "IMAGE") === b.type);
    if (b.isFavorite) list = list.filter((a) => a.isFavorite);
    if (b.isMotion) list = list.filter((a) => a.live);
    if (b.city) list = list.filter((a) => a.city >= 0 && CITIES[a.city][0] === b.city);
    if (b.originalFileName) list = list.filter((a) => a.name.toLowerCase().includes(b.originalFileName.toLowerCase()));
    return json(res, page(list, b, 200));
  }
  if (p === "/search/smart" && m === "POST") {
    const b = await readBody(req), hit = SMART.find(([re]) => re.test(String(b.query || "").toLowerCase()));
    const list = hit ? assets.filter((a) => a.theme === hit[1]) : assets.filter((a) => (a.mi * 31 + a.id.length * 7 + a.ratio * 13) % 11 === 0);
    return json(res, page(list, b, 100));
  }
  if (p === "/search/cities") {
    return json(res, CITIES.map((c, i) => assets.find((a) => a.city === i)).filter(Boolean).map((a) => asDto(a)));
  }
  if (p === "/people") return json(res, { total: PEOPLE.length, hidden: 0, hasNextPage: false, people: PEOPLE.map((x) => ({ id: x.id, name: x.name, isHidden: false })) });
  if ((mt = p.match(/^\/people\/([^/]+)\/thumbnail$/))) return svg(res, avatar(mt[1]));
  if (p === "/map/markers") {
    const marks = assets.filter((a) => a.lat != null).filter((a, i) => i % 3 === 0).map((a) => ({ id: a.id, lat: a.lat, lon: a.lon, city: CITIES[a.city][0], state: null, country: CITIES[a.city][1] }));
    return json(res, marks);
  }
  return json(res, { message: `demo: ${m} ${p} not implemented` }, 404);
});

await new Promise((ok) => api.listen(MOCK_PORT, "127.0.0.1", ok));
process.env.IMMICH_URL = `http://127.0.0.1:${MOCK_PORT}`;
process.env.PORT = process.env.PORT || "8081";
await import("../server.mjs");
console.log(`Demo mode: ${assets.length} dummy photos – sign in with any e-mail and password.`);
