"use strict";
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const tr = I18n.t; // "t" is used as a local variable name in many places
// Formatters depend on the chosen language; created in setupFormats() once the language is known.
let fmt, monthFmt, dateFmt, nf, MONTHS;
function setupFormats() {
  const loc = I18n.lang;
  fmt = (o) => new Intl.DateTimeFormat(loc, { ...o, timeZone: "UTC" });
  monthFmt = fmt({ month: "long", year: "numeric" });
  dateFmt = fmt({ dateStyle: "long", timeStyle: "short" });
  nf = new Intl.NumberFormat(loc);
  MONTHS = Array.from({ length: 12 }, (_, i) => fmt({ month: "long" }).format(new Date(Date.UTC(2000, i, 1))));
}
const img = (id, size) => `/api/assets/${id}/thumbnail?size=${size}`;
const fmtBytes = (n) => (n >= 1e6
  ? tr("bytes.mb", { n: new Intl.NumberFormat(I18n.lang, { maximumFractionDigits: 1 }).format(n / 1e6) })
  : tr("bytes.kb", { n: nf.format(Math.max(1, Math.round(n / 1e3))) }));

// ---------- Netzwerk ----------
async function rawFetch(path, opts = {}) {
  let r;
  try {
    r = await fetch("/api" + path, { credentials: "same-origin", ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  } catch { throw new Error(tr("error.unreachable")); }
  if (r.status === 401) { showLogin(tr("login.expired")); throw new Error("401"); }
  if (!r.ok) {
    let msg = ""; try { msg = (await r.json()).message || ""; } catch {}
    throw new Error(`${r.status} ${Array.isArray(msg) ? msg.join(", ") : msg}`.trim());
  }
  return r;
}
async function api(path, opts) {
  const r = await rawFetch(path, opts);
  return r.status === 204 || !(r.headers.get("content-type") || "").includes("json") ? null : r.json();
}
let toastTimer;
function toast(msg, isErr) {
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("err", !!isErr); t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), isErr ? 6000 : 3000);
}
function showError(msg) {
  $("#empty").classList.remove("hidden"); $("#empty h2").textContent = msg; $("#retry").classList.remove("hidden");
}
function clearEmpty() { $("#empty").classList.add("hidden"); $("#empty h2").textContent = tr("empty.photos"); $("#retry").classList.add("hidden"); }
$("#retry").onclick = () => route();

// ---------- Anmeldung ----------
function showLogin(msg) {
  if (msg && !$("#app").classList.contains("hidden")) $("#loginError").textContent = msg;
  state.buckets = null; state.userId = null; state.albums = null;
  $("#app").classList.add("hidden"); $("#login").classList.remove("hidden");
}
async function showApp() {
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  api("/users/me").then((u) => { if (u && !state.userId) { state.userId = u.id; if (state.feed && grid.el && state.partnerBadge) gridRelayout(); } }).catch(() => {});
  loadSidebarAlbums(); route();
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); $("#loginError").textContent = "";
  const f = new FormData(e.target);
  try {
    const r = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.get("email"), password: f.get("password") }) });
    if (!r.ok) throw new Error(r.status === 401 ? tr("login.wrong") : tr("login.error", { status: r.status }));
    e.target.reset(); showApp();
  } catch (err) { $("#loginError").textContent = err instanceof TypeError ? tr("error.unreachable") : err.message; }
});
$("#logout").addEventListener("click", async () => {
  try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch {}
  showLogin();
});

// ---------- Daten ----------
class Feed {
  constructor(filters, { endpoint = "/search/metadata", fallback = null, size = 200 } = {}) {
    Object.assign(this, { filters, endpoint, fallback, size, page: 1, done: false, loading: false, items: [] });
  }
  body() {
    const b = { ...this.filters, size: this.size, page: this.page };
    if (this.endpoint === "/search/metadata") b.order = "desc";
    return b;
  }
  async more() {
    this.loading = true;
    try {
      let res;
      try { res = await api(this.endpoint, { method: "POST", body: JSON.stringify(this.body()) }); }
      catch (e) {
        // Smart search unavailable (e.g. machine-learning service off): search by file name instead.
        if (this.fallback && this.page === 1 && e.message !== "401") {
          ({ endpoint: this.endpoint, filters: this.filters } = this.fallback); this.fallback = null; this.fellBack = true;
          res = await api(this.endpoint, { method: "POST", body: JSON.stringify(this.body()) });
        } else throw e;
      }
      const start = this.items.length;
      for (const a of res.assets.items) this.items.push(prepare(a));
      if (res.assets.nextPage) this.page = Number(res.assets.nextPage); else this.done = true;
      if (!res.assets.items.length) this.done = true;
      return this.items.slice(start);
    } finally { this.loading = false; }
  }
}
function parseDuration(d) {
  if (d == null) return 0;
  if (typeof d === "number") return d / 1000; // Immich 3: Millisekunden
  const m = String(d).match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
}
const fmtDuration = (s) => {
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
function prepare(a) {
  const d = new Date(a.localDateTime || a.fileCreatedAt);
  a._date = isNaN(d) ? null : d;
  const r = a.width > 0 && a.height > 0 ? a.width / a.height : 1;
  a._ratio = Math.min(3, Math.max(0.4, r));
  return a;
}

// Column-oriented response of /timeline/bucket (this is how the Immich web UI loads photos):
// one request per month instead of many pages of full asset objects.
function fromBucket(d, byAdded) {
  const out = [], n = (d.id || []).length;
  for (let i = 0; i < n; i++) {
    const created = Date.parse(d.fileCreatedAt && d.fileCreatedAt[i]);
    const local = isNaN(created) ? null : new Date(created + ((d.localOffsetHours && d.localOffsetHours[i]) || 0) * 3600e3);
    const ratio = d.ratio && d.ratio[i] > 0 ? d.ratio[i] : 1;
    const a = {
      id: d.id[i], type: d.isImage && d.isImage[i] === false ? "VIDEO" : "IMAGE", duration: d.duration && d.duration[i],
      isFavorite: !!(d.isFavorite && d.isFavorite[i]), livePhotoVideoId: d.livePhotoVideoId && d.livePhotoVideoId[i],
      thumbhash: d.thumbhash && d.thumbhash[i], originalFileName: "",
    };
    a.ownerId = d.ownerId && d.ownerId[i];
    a._date = byAdded && d.createdAt && !isNaN(Date.parse(d.createdAt[i])) ? new Date(d.createdAt[i]) : local; a._ratio = Math.min(3, Math.max(0.4, ratio));
    out.push(a);
  }
  return out;
}
class BucketFeed {
  /** params: query parameters for Immich; buckets: list of months (optional); fallback: { filters, opts } for the search API */
  constructor(params, { buckets = null, fallback = null, minBatch = 150, prepare = null } = {}) {
    Object.assign(this, { params, queue: buckets && buckets.slice(), fallback, minBatch, prepare, done: false, loading: false, items: [], next: null, delegate: null });
  }
  qs(extra) { return new URLSearchParams({ ...this.params, ...extra }).toString(); }
  fetchBucket(raw) { return api(`/timeline/bucket?${this.qs({ timeBucket: raw })}`).then((d) => fromBucket(d, this.params.orderBy === "createdAt")); }
  async more() {
    if (this.delegate) { const r = await this.delegate.more(); this.done = this.delegate.done; return r; }
    this.loading = true;
    try {
      if (this.prepare) { const p = this.prepare; this.prepare = null; await p(this); }
      if (!this.queue) this.queue = (await api(`/timeline/buckets?${this.qs({})}`)).map((b) => b.timeBucket);
      const start = this.items.length;
      while (this.queue.length && this.items.length - start < this.minBatch) {
        const raw = this.queue.shift();
        const got = await (this.next && this.next.raw === raw ? this.next.p : this.fetchBucket(raw));
        this.next = null;
        this.items.push(...got);
        // Prefetch the next month in the background while the current one is being drawn.
        if (this.queue.length) { const nr = this.queue[0]; this.next = { raw: nr, p: this.fetchBucket(nr) }; this.next.p.catch(() => {}); }
      }
      if (!this.queue.length) this.done = true;
      return this.items.slice(start);
    } catch (e) {
      // Internal endpoint unavailable (e.g. after an Immich update): fall back to the stable search API.
      if (this.fallback && !this.items.length && e.message !== "401") {
        this.delegate = new Feed(this.fallback.filters, this.fallback.opts); this.delegate.items = this.items; this.fellBack = "bucket";
        const r = await this.delegate.more(); this.done = this.delegate.done; return r;
      }
      throw e;
    } finally { this.loading = false; }
  }
}

window.__logContext = () => ({ view: state.view, mode: state.mode, zoom: state.zoom, rev: state.rev, items: state.feed ? state.feed.items.length : 0, tiles: document.querySelectorAll(".vgrid .tile").length, viewer: vIndex >= 0 });
// ---------- Zustand ----------
// Three zoom steps in "All Photos" (5 / 3 / 1 photos per row on a phone) and two grid shapes (square or original aspect ratio).
const ZOOM_STEPS = 3;
const state = {
  mode: store.get("mode", "months"), zoom: Math.min(ZOOM_STEPS - 1, +store.get("zoom4", 1) || 0), shape: store.get("shape", "square") === "aspect" ? "aspect" : "square", sort: store.get("sort", "taken") === "added" ? "added" : "taken", filter: "all", partnerBadge: store.get("partnerBadge", true) !== false, feed: null, buckets: null, albums: null, userId: null,
  scroll: {}, view: "", noDate: false, overviewToken: 0, pendingYear: null,
  rev: false, sel: { on: false, ids: new Set() },
};
const gapPx = () => (state.shape === "square" ? 2 : 6); // spacing between photos
const marginPx = () => (state.shape === "square" ? 0 : 6); // square grid runs edge to edge

// ---------- Virtualisiertes Raster ----------
// Rows are always laid out newest-first (index 0 = newest, as the API delivers). With state.rev (date-ordered views) they are
// drawn mirrored: the newest row at the bottom, older photos above, left = older within a row, like the iOS Photos app.
const grid = { el: null, rows: [], ratios: [], W: 0, H: 0, rendered: new Map() };
const vtop = (r) => (state.rev ? grid.H - r.top - r.h : r.top);
// Maps a y position in the scroll content (relative to the grid) to the layout coordinate of the rows.
const ly = (y) => (state.rev ? grid.H - y : y);
const gridWidth = () => Math.max(100, $("#content").clientWidth - marginPx() * 2);
// Reads zoom step and shape into the grid (call before every full layout).
function gridConfig() {
  grid.W = gridWidth(); grid.gap = gapPx(); grid.cols = Layout.columnsFor(grid.W, state.zoom);
  grid.cell = grid.cols === 1 ? grid.W : (grid.W - grid.gap * (grid.cols - 1)) / grid.cols;
  if (grid.el) { grid.el.style.margin = marginPx() + "px"; grid.el.classList.toggle("sq", state.shape === "square"); }
}

function gridInit() {
  $("#content").replaceChildren();
  grid.el = el("div", "vgrid"); $("#content").append(grid.el);
  Object.assign(grid, { rows: [], ratios: [], H: 0 });
  grid.rendered.clear(); gridConfig();
  grid.el.style.height = "0px";
}
function gridInvalidateFrom(idx) {
  for (const [i, node] of grid.rendered) if (i >= idx) { node.remove(); grid.rendered.delete(i); }
}
function gridAppend(items) {
  if (!grid.el || !items.length) return;
  for (const a of items) grid.ratios.push(a._ratio);
  const from = grid.rows.length && !grid.rows.at(-1).full ? grid.rows.length - 1 : grid.rows.length;
  const main = $("#main"), prevH = grid.H, first = !grid.rows.length;
  Layout.layoutColumns(grid.ratios, grid.W, grid.cols, grid.gap, grid.rows);
  grid.H = Layout.totalHeight(grid.rows);
  gridInvalidateFrom(state.rev ? 0 : from); // mirrored: every row moves when the height changes
  grid.el.style.height = grid.H + "px";
  // Mirrored: older photos are added above. Open at the end (newest), afterwards keep the view where it was.
  if (state.rev) main.scrollTop = first ? main.scrollHeight : main.scrollTop + (grid.H - prevH);
  renderVisible(); updateDate();
}
// Recompute everything (zoom, window size, deleted photos) and keep the current position in view.
// Animated: visible tiles glide from their old to their new position and size (FLIP), new ones fade in.
function gridRelayout(animate) {
  if (!grid.el || !state.feed) return;
  let olds = null;
  if (animate) {
    olds = new Map();
    for (const row of grid.rendered.values()) for (const t of row.children) {
      const r = t.getBoundingClientRect();
      if (r.bottom > -50 && r.top < innerHeight + 50) olds.set(t.dataset.id, { t, r });
    }
    grid.reuse = new Map([...olds].map(([id, o]) => [id, o.t]));
  }
  const main = $("#main"), viewTop = main.scrollTop - grid.el.offsetTop;
  const ar = Layout.rowAt(grid.rows, ly(viewTop)), anchor = ar >= 0 ? grid.rows[ar].start : 0;
  const atEnd = state.rev && main.scrollHeight - main.scrollTop - main.clientHeight < 4;
  gridInvalidateFrom(0);
  gridConfig();
  grid.ratios = state.feed.items.map((a) => a._ratio);
  grid.rows = Layout.layoutColumns(grid.ratios, grid.W, grid.cols, grid.gap, []);
  grid.H = Layout.totalHeight(grid.rows);
  grid.el.style.height = grid.H + "px";
  const nr = grid.rows.find((r) => anchor >= r.start && anchor < r.end);
  if (atEnd) main.scrollTop = main.scrollHeight;
  else if (nr) main.scrollTop = grid.el.offsetTop + vtop(nr);
  renderVisible(); updateDate(); loadIfNearEnd();
  if (olds) { grid.reuse = null; flipTiles(olds); }
}
function flipTiles(olds) {
  const moved = [];
  for (const row of grid.rendered.values()) for (const t of row.children) {
    const o = olds.get(t.dataset.id), n = t.getBoundingClientRect();
    t.style.transition = "none"; t.style.transformOrigin = "0 0";
    if (o && n.width && n.height) t.style.transform = `translate(${o.r.left - n.left}px,${o.r.top - n.top}px) scale(${o.r.width / n.width},${o.r.height / n.height})`;
    else if (n.bottom > 0 && n.top < innerHeight) t.style.opacity = "0";
    else continue;
    moved.push(t);
  }
  if (!moved.length) return;
  document.body.offsetWidth; // apply the start state, then animate to the new one
  for (const t of moved) { t.style.transition = "transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s"; t.style.transform = ""; t.style.opacity = ""; }
  setTimeout(() => { for (const t of moved) { t.style.transition = ""; t.style.transformOrigin = ""; } }, 320);
}
function makeTile(a, idx) {
  const size = grid.cell > 180 ? "preview" : "thumbnail";
  // Zoom animation: keep the already loaded tile (no reload, no flash) if it has the same image size.
  const old = grid.reuse && grid.reuse.get(a.id);
  if (old && old.dataset.sz === size) { grid.reuse.delete(a.id); old.dataset.idx = idx; old.classList.toggle("sel", state.sel.ids.has(a.id)); return old; }
  const t = el("button", "tile"); t.dataset.sz = size;
  t.dataset.id = a.id; t.dataset.idx = idx;
  t.setAttribute("aria-label", a.originalFileName || tr("common.photo"));
  const i = el("img"); i.decoding = "async"; i.alt = "";
  const hash = ThumbHash.toDataURL(a.thumbhash); // blurred preview until the real image has loaded
  if (hash) t.style.backgroundImage = `url(${hash})`;
  i.onload = () => i.classList.add("loaded");
  i.onerror = () => t.classList.add("missing"); // thumbnail missing on the server: show a placeholder instead of a gap
  i.src = img(a.id, size);
  t.append(i, el("span", "check"));
  if (a.type === "VIDEO") { const s = parseDuration(a.duration); t.append(el("span", "badge b-dur", s ? fmtDuration(s) : "▶")); }
  if (a.isFavorite) t.append(el("span", "badge b-fav", "♥"));
  if (a.livePhotoVideoId) t.append(el("span", "badge b-live", "◎"));
  if (state.partnerBadge && state.userId && a.ownerId && a.ownerId !== state.userId) t.append(el("span", "b-shared")); // photo of a partner library
  if (state.sel.ids.has(a.id)) t.classList.add("sel");
  return t;
}
function makeRowEl(r) {
  const items = state.feed.items, { W, cols, gap, cell } = grid, square = state.shape === "square";
  const row = el("div", "row");
  row.style.top = vtop(r) + "px"; row.style.height = r.h + "px"; row.style.width = W + "px";
  for (let k = 0; k < r.end - r.start; k++) {
    const i = state.rev ? r.end - 1 - k : r.start + k; // mirrored: oldest on the left
    const ratio = items[i]._ratio, t = makeTile(items[i], i);
    let x = k * (cell + gap), y = 0, w = cell, h = r.h;
    if (cols === 1) { x = 0; w = W; }
    else if (!square) { // fit the photo into its square cell, centred
      if (ratio >= 1) h = cell / ratio; else w = cell * ratio;
      x += (cell - w) / 2; y = (r.h - h) / 2;
    }
    Object.assign(t.style, { position: "absolute", left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
    row.append(t);
  }
  return row;
}
function renderVisible() {
  if (!grid.el || !state.feed) return;
  const main = $("#main"), viewTop = main.scrollTop - grid.el.offsetTop;
  const lo = viewTop - 800, hi = viewTop + main.clientHeight + 800;
  const [yLo, yHi] = state.rev ? [ly(hi), ly(lo)] : [lo, hi];
  const first = Layout.rowAt(grid.rows, yLo);
  if (first < 0) return;
  let i = first;
  for (; i < grid.rows.length && grid.rows[i].top <= yHi; i++) {
    if (!grid.rendered.has(i)) { const n = makeRowEl(grid.rows[i]); grid.el.append(n); grid.rendered.set(i, n); }
  }
  const last = i - 1;
  for (const [k, node] of grid.rendered) if (k < first || k > last) { node.remove(); grid.rendered.delete(k); }
}
// Click on a tile (event delegation; the tiles themselves have no handlers)
$("#content").addEventListener("click", (e) => {
  const t = e.target.closest(".tile"); if (!t || !state.feed) return;
  const a = state.feed.items[+t.dataset.idx]; if (!a) return;
  if (state.sel.on) toggleSelect(a, t); else openViewer(+t.dataset.idx);
});

let dateRaf = 0;
function updateDate() {
  if (dateRaf) return;
  dateRaf = requestAnimationFrame(() => {
    dateRaf = 0;
    if (state.noDate || !state.feed || !grid.rows.length || state.view === "overview") return;
    const y = ly($("#main").scrollTop - grid.el.offsetTop + 70);
    const r = grid.rows[Math.max(0, Layout.rowAt(grid.rows, y))];
    const a = r && state.feed.items[r.start];
    $("#tDate").textContent = a && a._date ? monthFmt.format(a._date) : "";
  });
}
$("#main").addEventListener("scroll", () => { renderVisible(); updateDate(); loadIfNearEnd(); }, { passive: true });
// Start loading well before the end of the loaded photos (about two screens). Checked on every scroll and after every
// load, so a scroll that happens while a request is running is not lost (an IntersectionObserver would not fire again).
function loadIfNearEnd() {
  const f = state.feed, m = $("#main");
  if (!f || f.loading || f.done || !grid.el) return;
  const lead = Math.max(1600, m.clientHeight * 2);
  // Mirrored: older photos lie above, so the load-more edge is the top.
  if ((state.rev ? m.scrollTop - grid.el.offsetTop : m.scrollHeight - (m.scrollTop + m.clientHeight)) < lead) loadMore();
}

async function loadMore() {
  const f = state.feed;
  if (!f || f.loading || f.done) return; // never recurse
  let failed = false;
  const items = await f.more().catch((e) => { failed = true; if (e.message !== "401") showError(tr("error.generic", { message: e.message })); return []; });
  if (f !== state.feed) return;
  if (f.fellBack === "bucket") { f.fellBack = false; console.warn("Timeline API not available, falling back to search"); }
  else if (f.fellBack) { f.fellBack = false; toast(tr("search.fallback")); }
  gridAppend(items);
  if (!failed) { f.items.length ? clearEmpty() : ($("#empty").classList.remove("hidden"), $("#retry").classList.add("hidden")); }
  if (!failed && items.length && !f.done) requestAnimationFrame(() => { if (f === state.feed) loadIfNearEnd(); });
}
new IntersectionObserver((en) => { if (en[0].isIntersecting) loadIfNearEnd(); }, { rootMargin: "1600px" }).observe($("#sentinel"));
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.feed && grid.el && gridRelayout(), 150); });

// ---------- Selection and actions ----------
function updateSelUI() {
  $("#content").classList.toggle("selecting", state.sel.on);
  $("#selbar").classList.toggle("hidden", !state.sel.on);
  $("#selToggle").textContent = state.sel.on ? tr("select.done") : tr("select.start");
  $("#selCount").textContent = tr("select.count", { count: state.sel.ids.size });
  for (const b of ["#selFav", "#selAlbum", "#selDl", "#selDel"]) $(b).disabled = state.sel.ids.size === 0;
}
function exitSelect() { state.sel.on = false; state.sel.ids.clear(); document.querySelectorAll(".tile.sel").forEach((t) => t.classList.remove("sel")); updateSelUI(); }
function toggleSelect(a, tile) {
  if (state.sel.ids.has(a.id)) state.sel.ids.delete(a.id); else state.sel.ids.add(a.id);
  tile.classList.toggle("sel", state.sel.ids.has(a.id)); updateSelUI();
}
$("#selToggle").onclick = () => (state.sel.on ? exitSelect() : (state.sel.on = true, updateSelUI()));
$("#selCancel").onclick = exitSelect;
const selectedItems = () => state.feed.items.filter((a) => state.sel.ids.has(a.id));

async function setFavorite(items, value) {
  await api("/assets", { method: "PUT", body: JSON.stringify({ ids: items.map((a) => a.id), isFavorite: value }) });
  items.forEach((a) => (a.isFavorite = value));
  if (state.view === "favorites" && !value) removeItems(new Set(items.map((a) => a.id)));
  else { gridInvalidateFrom(0); renderVisible(); }
}
function removeItems(ids) {
  state.feed.items = state.feed.items.filter((a) => !ids.has(a.id));
  state.buckets = null; // the counts of the overview are stale now
  gridRelayout();
  if (!state.feed.items.length) $("#empty").classList.remove("hidden");
}
async function deleteItems(items) {
  if (!items.length) return false;
  const n = items.length;
  if (!confirm(tr("actions.deleteConfirm", { count: n }))) return false;
  await api("/assets", { method: "DELETE", body: JSON.stringify({ ids: items.map((a) => a.id), force: false }) });
  removeItems(new Set(items.map((a) => a.id)));
  toast(tr("actions.deleted", { count: n }));
  return true;
}
async function downloadItems(items) {
  if (items.length === 1) return triggerDownload(`/api/assets/${items[0].id}/original`, items[0].originalFileName || "foto");
  toast(tr("actions.archive"));
  const r = await rawFetch("/download/archive", { method: "POST", body: JSON.stringify({ assetIds: items.map((a) => a.id) }) });
  const url = URL.createObjectURL(await r.blob());
  triggerDownload(url, "Fotos.zip"); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function triggerDownload(href, name) { const a = el("a"); a.href = href; a.download = name; document.body.append(a); a.click(); a.remove(); }
async function pickAlbum() {
  if (!state.albums) await loadSidebarAlbums();
  return new Promise((resolve) => {
    const dlg = $("#albumDialog"), list = $("#albumList"); list.replaceChildren();
    for (const a of state.albums || []) {
      const b = el("button"); const i = a.albumThumbnailAssetId ? el("img") : el("span", "ph");
      if (a.albumThumbnailAssetId) { i.alt = ""; i.src = img(a.albumThumbnailAssetId, "thumbnail"); }
      b.append(i, el("span", null, a.albumName)); b.onclick = () => { dlg.close(); resolve(a); }; list.append(b);
    }
    if (!(state.albums || []).length) list.append(el("p", null, tr("empty.albums")));
    dlg.onclose = () => resolve(null); $("#albumCancel").onclick = () => dlg.close(); dlg.showModal();
  });
}
async function addToAlbum(items) {
  const album = await pickAlbum(); if (!album) return;
  const res = await api(`/albums/${album.id}/assets`, { method: "PUT", body: JSON.stringify({ ids: items.map((a) => a.id) }) });
  const ok = (res || []).filter((x) => x.success).length, dup = (res || []).filter((x) => x.error === "duplicate").length;
  toast(dup ? tr("albums.addedDup", { added: ok, album: album.albumName, count: dup }) : tr("albums.added", { count: ok, album: album.albumName }));
}
const guard = (fn) => async () => { try { await fn(); } catch (e) { if (e.message !== "401") toast(tr("error.generic", { message: e.message }), true); } };
$("#selFav").onclick = guard(async () => { const it = selectedItems(); await setFavorite(it, !it.every((a) => a.isFavorite)); });
$("#selAlbum").onclick = guard(async () => addToAlbum(selectedItems()));
$("#selDl").onclick = guard(async () => downloadItems(selectedItems()));
$("#selDel").onclick = guard(async () => { if (await deleteItems(selectedItems())) exitSelect(); });

// ---------- Ansichten ----------
function setHeader(title, { back = false, seg = false, zoom = false, select = false, edit = false } = {}) {
  $("#personEdit").classList.toggle("hidden", !edit);
  $("#tTitle").textContent = title; $("#tDate").textContent = "";
  $("#back").classList.toggle("hidden", !back);
  $("#seg").classList.toggle("hidden", !seg);
  $("#zoom").classList.toggle("hidden", !zoom);
  $("#selToggle").classList.toggle("hidden", !select);
}
function resetView() {
  state.overviewToken++; coverQueue.waiting.length = 0;
  exitSelect(); clearEmpty(); $("#main").style.overflow = "";
  $("#content").replaceChildren(); grid.el = null; grid.rendered.clear();
  state.feed = null; state.noDate = false; $("#main").scrollTop = 0;
}
function syncControls() {
  document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));

}
function showFeed(filters, title, { back = false, seg = false, feedOpts, noDate = false, makeFeed } = {}) {
  resetView();
  state.view = state.view || "feed";
  setHeader(title, { back, seg, zoom: true, select: true });
  syncControls(); gridInit();
  state.noDate = noDate;
  state.rev = !noDate; // search results stay in relevance order, top to bottom
  state.feed = makeFeed ? makeFeed() : new Feed(filters, feedOpts);
  loadMore();
}
// Zoom steps. In the library they run through Years -> Months -> All Photos (small ... large);
// everywhere else only through the grid sizes.
function level() { return state.view === "library" ? (state.mode === "years" ? 0 : state.mode === "months" ? 1 : 2 + state.zoom) : state.zoom; }
function maxLevel() { return state.view === "library" ? 1 + ZOOM_STEPS : ZOOM_STEPS - 1; }
function zoom(d) { zoomTo(level() + d); }
function zoomTo(target) {
  const t0 = performance.now(); zoomToInner(target); Log.log("zoom", { to: target, ms: Math.round(performance.now() - t0) });
}
function zoomToInner(target) {
  const lib = state.view === "library", cur = level(), n = Math.min(maxLevel(), Math.max(0, target));
  if (n === cur) return;
  if (!lib) { state.zoom = n; store.set("zoom4", n); syncControls(); gridRelayout(true); return; }
  const mode = n === 0 ? "years" : n === 1 ? "months" : "all", z = n >= 2 ? n - 2 : state.zoom;
  const modeChanged = mode !== state.mode;
  state.mode = mode; state.zoom = z; store.set("mode", mode); store.set("zoom4", z);
  if (modeChanged) showLibrary(); else { syncControls(); gridRelayout(true); }
}
// Display menu (top right, like the iOS Photos app): sort, filter, zoom, grid shape, badge.
const gridPop = $("#gridPop"), closePop = () => { gridPop.classList.add("hidden"); $("#gMenu").setAttribute("aria-expanded", "false"); };
const ICON = {
  in: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5"/></svg>',
  out: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2M8.5 11h5"/></svg>',
  shape: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>',
};
function buildGridMenu() {
  const items = [];
  const add = (label, { checked = null, icon = "", disabled = false, head = false, run } = {}) => items.push({ label, checked, icon, disabled, head, run });
  const feed = state.feed, lib = feed && feed.isLibrary;
  const reload = () => { closePop(); route(); };
  if (lib && feed.sortable) {
    add(tr("sort.added"), { checked: state.sort === "added", run: () => { state.sort = "added"; store.set("sort", "added"); reload(); } });
    add(tr("sort.taken"), { checked: state.sort === "taken", run: () => { state.sort = "taken"; store.set("sort", "taken"); reload(); } });
  }
  if (lib) {
    add(tr("filter.title"), { head: true });
    add(tr("filter.all"), { checked: state.filter === "all", run: () => { state.filter = "all"; reload(); } });
    add(tr("nav.favorites"), { checked: state.filter === "favorites", run: () => { state.filter = "favorites"; reload(); } });
    add(tr("filter.photos"), { checked: state.filter === "photos", run: () => { state.filter = "photos"; reload(); } });
    add(tr("nav.videos"), { checked: state.filter === "videos", run: () => { state.filter = "videos"; reload(); } });
  }
  add(tr("grid.options"), { head: true });
  add(tr("zoom.in"), { icon: ICON.in, disabled: level() >= maxLevel(), run: () => { zoom(1); closePop(); } });
  add(tr("zoom.out"), { icon: ICON.out, disabled: level() <= 0, run: () => { zoom(-1); closePop(); } });
  add(state.shape === "square" ? tr("grid.aspect") : tr("grid.square"), { icon: ICON.shape, run: () => {
    state.shape = state.shape === "square" ? "aspect" : "square"; store.set("shape", state.shape); closePop();
    if (state.feed && grid.el) gridRelayout(true);
  } });
  add(tr("menu.show"), { head: true });
  add(tr("menu.partnerBadge"), { checked: state.partnerBadge, run: () => {
    state.partnerBadge = !state.partnerBadge; store.set("partnerBadge", state.partnerBadge); closePop(); if (state.feed && grid.el) gridRelayout();
  } });
  gridPop.replaceChildren(...items.map((it) => {
    if (it.head) return el("div", "gp-head", it.label);
    const b = el("button"); b.setAttribute("role", "menuitem"); b.disabled = it.disabled;
    const mark = el("span", "gp-check", it.checked ? "✓" : ""); const ic = el("span", "gp-icon"); ic.innerHTML = it.icon;
    b.append(mark, ic, el("span", null, it.label)); b.onclick = it.run; return b;
  }));
}
$("#gMenu").onclick = (e) => {
  e.stopPropagation();
  const open = gridPop.classList.contains("hidden");
  if (open) buildGridMenu();
  gridPop.classList.toggle("hidden", !open); $("#gMenu").setAttribute("aria-expanded", String(open));
};
addEventListener("click", (e) => { if (!e.target.closest("#zoom")) closePop(); });
addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });

// ---------- Library: Years / Months (overview cards) and All Photos ----------
const coverQueue = { running: 0, waiting: [] };
function pumpCovers() {
  while (coverQueue.running < 4 && coverQueue.waiting.length) {
    const job = coverQueue.waiting.shift(); coverQueue.running++;
    job().catch(() => {}).finally(() => { coverQueue.running--; pumpCovers(); });
  }
}
const coverObserver = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const card = en.target; coverObserver.unobserve(card);
    const { after, before, size } = card.dataset, token = state.overviewToken;
    coverQueue.waiting.push(async () => {
      if (token !== state.overviewToken) return;
      const r = await api("/search/metadata", { method: "POST", body: JSON.stringify({ visibility: "timeline", type: "IMAGE", takenAfter: after, takenBefore: before, order: "desc", size: 1, page: 1 }) });
      const a = r.assets.items[0];
      if (!a || token !== state.overviewToken) return;
      const hash = ThumbHash.toDataURL(a.thumbhash); if (hash) card.style.backgroundImage = `url(${hash})`;
      const i = el("img"); i.alt = ""; i.onload = () => i.classList.add("loaded"); i.src = img(a.id, size); i.onerror = () => i.remove(); card.prepend(i);
    });
    pumpCovers();
  }
}, { rootMargin: "400px" });

async function loadBuckets() {
  if (state.buckets && Date.now() - (state.bucketsAt || 0) > 60000) state.buckets = null; // reload after 1 minute
  if (!state.buckets) {
    // With userId + withPartners Immich also counts photos shared by partners (e.g. a family library),
    // just like the search used for "All Photos". Immich marks this endpoint as "internal".
    if (!state.userId) state.userId = (await api("/users/me")).id;
    const list = await api(`/timeline/buckets?visibility=timeline&order=desc&userId=${state.userId}&withPartners=true`);
    state.buckets = list.map((b) => {
      const d = new Date(b.timeBucket), y = d.getUTCFullYear(), m = d.getUTCMonth();
      return { raw: b.timeBucket, year: y, month: m, count: b.count, start: new Date(Date.UTC(y, m, 1)).toISOString(), end: new Date(Date.UTC(y, m + 1, 1)).toISOString() };
    }).sort((a, b) => b.year - a.year || b.month - a.month);
    state.bucketsAt = Date.now();
  }
  return state.buckets;
}
function makeCard(label, sub, after, before, size, big, onClick) {
  const c = el("button", "card" + (big ? " big" : ""));
  Object.assign(c.dataset, { after, before, size });
  const cap = el("div", "card-cap"); cap.append(el("b", null, label), el("span", null, sub));
  c.append(cap); c.onclick = onClick; coverObserver.observe(c);
  return c;
}
async function showOverview(restore) {
  const mode = state.mode, token = ++state.overviewToken;
  let buckets;
  try { buckets = await loadBuckets(); } catch (e) { if (e.message !== "401" && token === state.overviewToken) showError(tr("error.generic", { message: e.message })); return; }
  if (token !== state.overviewToken || state.view !== "library" || mode !== state.mode) return;
  if (!buckets.length) $("#empty").classList.remove("hidden");
  const content = $("#content"); content.replaceChildren();
  const wrap = el("div", "overview" + (mode === "years" ? " years" : ""));
  for (const y of [...new Set(buckets.map((b) => b.year))]) {
    const ofYear = buckets.filter((b) => b.year === y), total = ofYear.reduce((n, b) => n + b.count, 0);
    if (mode === "years") {
      wrap.append(makeCard(String(y), tr("count.items", { count: total, n: nf.format(total) }), new Date(Date.UTC(y, 0, 1)).toISOString(), new Date(Date.UTC(y + 1, 0, 1)).toISOString(), "preview", true, () => {
        state.mode = "months"; store.set("mode", "months"); state.pendingYear = y; showLibrary();
      }));
    } else {
      const head = el("div", "ov-year", String(y)); head.id = "y" + y; wrap.append(head);
      const g = el("div", "cards");
      for (const b of ofYear) {
        g.append(makeCard(MONTHS[b.month], tr("count.items", { count: b.count, n: nf.format(b.count) }), b.start, b.end, "thumbnail", false, () => {
          state.scroll.months = $("#main").scrollTop;
          location.hash = `#/month/${b.year}-${String(b.month + 1).padStart(2, "0")}`;
        }));
      }
      wrap.append(g);
    }
  }
  content.append(wrap);
  const main = $("#main");
  if (state.pendingYear != null) { const t = document.getElementById("y" + state.pendingYear); state.pendingYear = null; if (t) main.scrollTop = t.offsetTop - 70; }
  else main.scrollTop = restore ? state.scroll[mode] || 0 : 0;
}
function showLibrary(restore) {
  state.view = "library";
  if (state.mode === "all") {
    showFeed({ visibility: "timeline" }, tr("nav.library"), { seg: true, makeFeed: () => libraryFeed(null, { visibility: "timeline" }) }); state.view = "library";
  } else {
    resetView(); state.view = "library";
    setHeader(tr("nav.library"), { seg: true, zoom: true }); syncControls();
    showOverview(restore);
  }
}
// Library parameters. Sorting by "added" and the favorites filter map to timeline query parameters
// (Immich does not combine partner photos with favorites, so favorites are the own ones only).
const libParams = () => {
  const p = { visibility: "timeline", order: "desc", userId: state.userId, withPartners: "true" };
  if (state.sort === "added") p.orderBy = "createdAt";
  if (state.filter === "favorites") { p.isFavorite = "true"; delete p.withPartners; }
  return p;
};
// Library feed through the timeline API (userId + withPartners: partner photos are included, like in the search).
// Photos / videos filters use the search API (type filter), because the timeline has none.
const libraryFeed = (buckets, fallbackFilters) => {
  const type = state.filter === "photos" ? "IMAGE" : state.filter === "videos" ? "VIDEO" : null;
  let f;
  if (type) f = new Feed({ ...fallbackFilters, type });
  else f = new BucketFeed({}, {
    buckets, fallback: { filters: state.filter === "favorites" ? { ...fallbackFilters, isFavorite: true } : fallbackFilters, opts: {} },
    prepare: async (x) => { if (!state.userId) state.userId = (await api("/users/me")).id; x.params = libParams(); },
  });
  f.isLibrary = true; f.sortable = !buckets;
  return f;
};
function showMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const raw = (state.buckets && (state.buckets.find((b) => b.year === y && b.month === m) || {}).raw) || new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const fb = { visibility: "timeline", takenAfter: new Date(Date.UTC(y, m - 1, 1)).toISOString(), takenBefore: new Date(Date.UTC(y, m, 1)).toISOString() };
  showFeed({}, `${MONTHS[m - 1]} ${y}`, { back: true, makeFeed: () => libraryFeed([raw], fb) });
}
function showSearch(q) {
  state.view = "search";
  $("#searchInput").value = q;
  showFeed({ query: q, visibility: "timeline" }, tr("search.title", { q }), {
    back: true, noDate: true,
    feedOpts: { endpoint: "/search/smart", size: 100, fallback: { endpoint: "/search/metadata", filters: { originalFileName: q, visibility: "timeline" } } },
  });
}
async function showAlbums() {
  resetView(); setHeader(tr("nav.albums"));
  let albums;
  try { albums = await loadSidebarAlbums(); } catch (e) { if (e.message !== "401") showError(tr("error.generic", { message: e.message })); return; }
  if (location.hash !== "#/albums") return;
  const wrap = el("div", "albums");
  for (const a of [...albums].sort((x, y) => (y.endDate || "").localeCompare(x.endDate || ""))) {
    const b = el("button", "album"), cover = el("div", "cover");
    if (a.albumThumbnailAssetId) { const i = el("img"); i.loading = "lazy"; i.alt = ""; i.src = img(a.albumThumbnailAssetId, "thumbnail"); i.onerror = () => i.remove(); cover.append(i); }
    b.append(cover, el("b", null, a.albumName), el("small", null, tr("count.items", { count: a.assetCount, n: nf.format(a.assetCount) })));
    b.onclick = () => (location.hash = "#/album/" + a.id + "/" + encodeURIComponent(a.albumName));
    wrap.append(b);
  }
  $("#content").append(wrap);
  if (!albums.length) $("#empty").classList.remove("hidden");
}
const albumsSig = (list) => JSON.stringify((list || []).map((a) => [a.id, a.albumName, a.assetCount, a.albumThumbnailAssetId]));
async function loadSidebarAlbums() {
  const albums = await api("/albums");
  state.albumsSig = albumsSig(albums); state.albumsAt = Date.now();
  state.albums = [...albums].sort((x, y) => x.albumName.localeCompare(y.albumName, "de"));
  const nav = $("#sideAlbums"); nav.replaceChildren();
  for (const a of state.albums) {
    const link = el("a"); link.href = "#/album/" + a.id + "/" + encodeURIComponent(a.albumName); link.dataset.albumId = a.id;
    if (a.albumThumbnailAssetId) { const i = el("img"); i.loading = "lazy"; i.alt = ""; i.src = img(a.albumThumbnailAssetId, "thumbnail"); i.onerror = () => i.remove(); link.append(i); }
    else link.append(el("span", "ph"));
    link.append(el("span", null, a.albumName)); nav.append(link);
  }
  markActive();
  return albums;
}

// Keep albums up to date when they change (also from other windows or the Immich web UI):
// when the tab regains focus, on navigation and every 60 seconds.
let albumsBusy = false;
async function refreshAlbums(force) {
  if (albumsBusy || $("#app").classList.contains("hidden")) return;
  if (!force && Date.now() - (state.albumsAt || 0) < 8000) return;
  albumsBusy = true;
  try {
    const before = state.albumsSig;
    await loadSidebarAlbums();
    if (before && before !== state.albumsSig) {
      state.buckets = null;
      const [, name, id] = location.hash.split("/");
      if (name === "albums" || name === "collections") route();
      else if (name === "album") {
        const cur = state.albums.find((a) => a.id === id), old = JSON.parse(before).find((a) => a[0] === id);
        if (cur && old && cur.assetCount !== old[2]) route(); // the content of the open album changed
      }
    }
  } catch {} finally { albumsBusy = false; }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAlbums(true); });
addEventListener("focus", () => refreshAlbums(false));
setInterval(() => { if (!document.hidden) refreshAlbums(true); }, 60000);

// ---------- Personen ----------
const personAvatar = (id, cls) => { const i = el("img"); i.alt = ""; i.loading = "lazy"; i.src = `/api/people/${id}/thumbnail`; i.onerror = () => { const ph = el("span", "ph"); i.replaceWith(ph); }; return i; };
function personCard(p) {
  const b = el("button", "person"); b.append(personAvatar(p.id), el("b", null, p.name || tr("people.unnamed")));
  b.onclick = () => (location.hash = `#/person/${p.id}/${encodeURIComponent(p.name || "Person")}`); return b;
}
// Keep the order the Immich API returns: favorites first, then named people, then by number of photos.
async function showPeople(withHidden = false) {
  resetView(); setHeader(tr("nav.people")); const token = state.overviewToken;
  const bar = el("div", "people-bar"), toggle = el("button", "pill", withHidden ? tr("people.hideHidden") : tr("people.showHidden"));
  toggle.onclick = () => showPeople(!withHidden);
  const share = el("button", "pill", tr("people.share")); share.onclick = guard(sharePeople);
  bar.append(share, toggle);
  const wrap = el("div", "people"); $("#content").append(bar, wrap);
  // People other users shared with you (Immich keeps people per account).
  const sharedBox = el("div", "people-shared");
  (async () => {
    try {
      if (!state.userId) state.userId = (await api("/users/me")).id;
      const r = await api(`/people?sharedWithId=${state.userId}&withHidden=${withHidden}&size=500&page=1`);
      if (token !== state.overviewToken || !r.people.length) return;
      const g = el("div", "people"); for (const p of r.people) g.append(personCard(p));
      sharedBox.append(el("h3", "people-h", tr("people.sharedWithYou")), g); $("#content").append(sharedBox);
    } catch {}
  })();
  let page = 1, more = null;
  const load = async () => {
    try {
      const r = await api(`/people?withHidden=${withHidden}&size=120&page=${page}`);
      if (token !== state.overviewToken) return;
      for (const p of r.people) { const c = personCard(p); if (p.isHidden) c.classList.add("is-hidden"); wrap.append(c); }
      if (more) more.remove(); more = null;
      if (r.hasNextPage) { page++; more = el("button", "pill more", tr("people.more")); more.onclick = load; $("#content").append(more); }
      if (page === 1 && !r.people.length) $("#empty").classList.remove("hidden");
    } catch (e) { if (e.message !== "401") showError(tr("error.generic", { message: e.message })); }
  };
  await load();
}
function showPerson(id, name) {
  showFeed({ personIds: [id], visibility: "timeline" }, name, {
    back: true,
    // userId + withPartners: people shared by another account (e.g. the family library) own their photos there
    makeFeed: () => new BucketFeed({ personId: id, order: "desc" }, { prepare: async (f) => { if (!state.userId) state.userId = (await api("/users/me")).id; f.params = { personId: id, order: "desc", visibility: "timeline", userId: state.userId, withPartners: "true" }; }, fallback: { filters: { personIds: [id], visibility: "timeline" }, opts: {} } }),
  });
  state.person = { id, name }; $("#personEdit").classList.remove("hidden");
}

// ---------- Edit people (name, birthday, favorite, hidden, merge, delete, faces) ----------
function modal(title, build) {
  return new Promise((resolve) => {
    const d = el("dialog", "dlg"); d.append(el("h3", null, title));
    build(d, (v) => { resolve(v); d.close(); });
    d.onclose = () => { resolve(null); d.remove(); };
    document.body.append(d); d.showModal();
  });
}
const field = (label, input) => { const l = el("label", "fld"); l.append(el("span", null, label), input); return l; };
const putPerson = (id, body) => api(`/people/${id}`, { method: "PUT", body: JSON.stringify(body) });
async function allPeople() {
  const out = []; for (let page = 1; page <= 20; page++) {
    const r = await api(`/people?withHidden=true&size=500&page=${page}`); out.push(...r.people); if (!r.hasNextPage) break;
  }
  return out;
}
// Choose a person from a searchable list; "New person" returns { create: name }.
async function pickPerson({ exclude = "", allowNew = false } = {}) {
  const people = (await allPeople()).filter((p) => p.id !== exclude);
  return modal(tr("people.choose"), (d, done) => {
    const q = el("input"); q.type = "search"; q.placeholder = tr("people.search"); q.className = "dlg-input";
    const list = el("div", "dlg-list");
    const draw = () => {
      const t = q.value.trim().toLowerCase(); list.replaceChildren();
      if (allowNew && t) { const b = el("button", null, tr("people.createNamed", { name: q.value.trim() })); b.onclick = () => done({ create: q.value.trim() }); list.append(b); }
      for (const p of people.filter((p) => (p.name || "").toLowerCase().includes(t) && (t || p.name)).slice(0, 80)) {
        const b = el("button"); b.append(personAvatar(p.id), el("span", null, p.name || tr("people.unnamed"))); b.onclick = () => done(p); list.append(b);
      }
      if (!list.children.length) list.append(el("p", "dim", tr("people.none")));
    };
    q.oninput = draw; draw();
    const c = el("button", "pill", tr("common.cancel")); c.onclick = () => done(null);
    d.append(q, list, c); q.focus();
  });
}
async function editPerson() {
  const cur = state.person; if (!cur) return;
  const p = await api(`/people/${cur.id}`);
  const name = el("input"), birth = el("input"), fav = el("input"), hid = el("input");
  name.value = p.name || ""; birth.type = "date"; birth.value = p.birthDate || ""; birth.max = new Date().toISOString().slice(0, 10);
  fav.type = "checkbox"; fav.checked = !!p.isFavorite; hid.type = "checkbox"; hid.checked = !!p.isHidden;
  const res = await modal(tr("people.editTitle"), (d, done) => {
    const row = (label, input) => { const l = el("label", "chk"); l.append(input, el("span", null, label)); return l; };
    const merge = el("button", "pill", tr("people.merge")), del = el("button", "pill danger", tr("people.delete"));
    merge.onclick = () => done({ merge: true }); del.onclick = () => done({ del: true });
    const save = el("button", "pill primary", tr("common.save")), cancel = el("button", "pill", tr("common.cancel"));
    save.onclick = () => done({ save: true }); cancel.onclick = () => done(null);
    d.onkeydown = (e) => { if (e.key === "Enter" && e.target === name) done({ save: true }); };
    d.append(field(tr("people.name"), name), field(tr("people.birthday"), birth), row(tr("people.favorite"), fav), row(tr("people.hidden"), hid),
      el("p", "dim", tr("people.coverHint")), el("div", "dlg-row", ""), el("div", "dlg-row"));
    d.children[d.children.length - 2].append(merge, del); d.lastChild.append(cancel, save);
  });
  if (!res) return;
  if (res.merge) {
    const other = await pickPerson({ exclude: cur.id }); if (!other || other.create) return;
    if (!confirm(tr("people.mergeConfirm", { from: other.name || tr("people.unnamed"), to: cur.name }))) return;
    await api(`/people/${cur.id}/merge`, { method: "POST", body: JSON.stringify({ ids: [other.id] }) });
    toast(tr("people.merged")); return route();
  }
  if (res.del) {
    if (!confirm(tr("people.deleteConfirm", { name: cur.name }))) return;
    await api(`/people/${cur.id}`, { method: "DELETE", body: JSON.stringify({}) });
    toast(tr("people.deleted")); location.hash = "#/people"; return;
  }
  const n = name.value.trim();
  await putPerson(cur.id, { name: n, birthDate: birth.value || null, isFavorite: fav.checked, isHidden: hid.checked });
  toast(tr("people.saved"));
  if (hid.checked) { location.hash = "#/people"; return; }
  cur.name = n || tr("people.unnamed"); $("#tTitle").textContent = cur.name;
  history.replaceState(null, "", `#/person/${cur.id}/${encodeURIComponent(cur.name)}`);
}
$("#personEdit").onclick = guard(editPerson);
// Give other users access to all your people (Immich: PUT /people/users, type "everyone").
async function sharePeople() {
  const me = state.userId || (state.userId = (await api("/users/me")).id);
  const users = (await api("/users")).filter((u) => u.id !== me);
  if (!users.length) return toast(tr("people.shareNoUsers"), true);
  const res = await modal(tr("people.shareTitle"), (d, done) => {
    const checks = users.map((u) => { const c = el("input"); c.type = "checkbox"; const l = el("label", "chk"); l.append(c, el("span", null, `${u.name || u.email} (${u.email})`)); d.append(l); return [u, c]; });
    const role = el("select", "dlg-input"); for (const [r, label] of [["read", tr("people.role.read")], ["write", tr("people.role.write")], ["admin", tr("people.role.admin")]]) { const o = el("option", null, label); o.value = r; role.append(o); }
    const save = el("button", "pill primary", tr("people.shareGo")), cancel = el("button", "pill", tr("common.cancel"));
    save.onclick = () => done({ ids: checks.filter(([, c]) => c.checked).map(([u]) => u.id), role: role.value }); cancel.onclick = () => done(null);
    const row = el("div", "dlg-row"); row.append(cancel, save);
    d.append(el("p", "dim", tr("people.shareHint")), field(tr("people.shareRole"), role), row);
  });
  if (!res || !res.ids.length) return;
  await api("/people/users", { method: "PUT", body: JSON.stringify({ sharedWithIds: res.ids, role: res.role, type: "everyone" }) });
  toast(tr("people.shared", { count: res.ids.length }));
}

// Faces of the photo in the info panel: assign to a person, use as cover, remove.
const faceCrop = (a, f) => {
  const side = Math.max(f.boundingBoxX2 - f.boundingBoxX1, f.boundingBoxY2 - f.boundingBoxY1) * 1.3, k = 44 / side;
  const cx = (f.boundingBoxX1 + f.boundingBoxX2) / 2, cy = (f.boundingBoxY1 + f.boundingBoxY2) / 2;
  const d = el("span", "face-crop");
  d.style.backgroundImage = `url(${img(a.id, "preview")})`;
  d.style.backgroundSize = `${f.imageWidth * k}px ${f.imageHeight * k}px`;
  d.style.backgroundPosition = `${-(cx - side / 2) * k}px ${-(cy - side / 2) * k}px`;
  return d;
};
async function loadFaces(a, box) {
  let faces; try { faces = await api(`/faces?id=${a.id}`); } catch { return; }
  if (curItem()?.id !== a.id) return;
  box.replaceChildren();
  if (!faces.length) return;
  box.append(el("h5", null, tr("people.inPhoto")));
  for (const f of faces) {
    const row = el("div", "face"), who = f.person;
    const label = el("div", "face-name", who ? (who.name || tr("people.unnamed")) : tr("people.unknown"));
    if (who) { label.style.cursor = "pointer"; label.onclick = () => { closeViewer(); location.hash = `#/person/${who.id}/${encodeURIComponent(who.name || "Person")}`; }; }
    const acts = el("div", "face-acts");
    const assign = el("button", null, who ? tr("people.change") : tr("people.assign"));
    assign.onclick = guard(async () => {
      const pick = await pickPerson({ exclude: who ? who.id : "", allowNew: true }); if (!pick) return;
      const target = pick.create ? await api("/people", { method: "POST", body: JSON.stringify({ name: pick.create }) }) : pick;
      await api(`/faces/${target.id}`, { method: "PUT", body: JSON.stringify({ id: f.id }) });
      toast(tr("people.assigned", { name: target.name || tr("people.unnamed") })); loadFaces(a, box);
    });
    acts.append(assign);
    if (who) {
      const cover = el("button", null, tr("people.cover"));
      cover.onclick = guard(async () => { await putPerson(who.id, { featureFaceAssetId: a.id }); toast(tr("people.coverSet")); });
      acts.append(cover);
    }
    const rm = el("button", "danger", "✕"); rm.title = tr("people.removeFace"); rm.setAttribute("aria-label", tr("people.removeFace"));
    rm.onclick = guard(async () => {
      if (!confirm(tr("people.removeFaceConfirm"))) return;
      await api(`/faces/${f.id}`, { method: "DELETE", body: JSON.stringify({ force: true }) }); loadFaces(a, box);
    });
    acts.append(rm);
    const info = el("div", "face-info"); info.append(label, acts);
    row.append(faceCrop(a, f), info); box.append(row);
  }
}

// ---------- Sammlungen ----------
async function showCollections() {
  resetView(); setHeader(tr("nav.collections"));
  const token = state.overviewToken, root = el("div", "coll"); $("#content").append(root);
  const section = (title, link) => { const h = el("h3"); h.append(el("span", null, title)); if (link) { const a = el("a", null, tr("collections.showAll")); a.href = link; h.append(a); } const strip = el("div", "strip"); root.append(h, strip); return strip; };
  const alive = () => token === state.overviewToken;
  const quick = section(tr("collections.mediaTypes")), qs = el("div", "maprow"); quick.replaceWith(qs);
  for (const [label, href] of [[tr("nav.favorites"), "#/favorites"], [tr("nav.videos"), "#/videos"], [tr("nav.live"), "#/live"], [tr("nav.map"), "#/map"]]) { const a = el("a", null, label); a.href = href; qs.append(a); }
  const people = section(tr("nav.people"), "#/people"), places = section(tr("collections.places")), albums = section(tr("nav.albums"), "#/albums");
  const drop = (strip) => { if (strip.previousSibling) strip.previousSibling.remove(); strip.remove(); }; // leere Abschnitte ausblenden
  api("/people?withHidden=false&size=40&page=1").then((r) => { if (!alive()) return; for (const p of r.people.filter((p) => p.name).slice(0, 20)) people.append(personCard(p)); if (!people.children.length) drop(people); }).catch(() => drop(people));
  api("/search/cities").then((r) => {
    if (!alive()) return;
    for (const a of r.slice(0, 60)) {
      const city = a.exifInfo && a.exifInfo.city; if (!city) continue;
      const b = el("button", "tilecard"); const hash = ThumbHash.toDataURL(a.thumbhash); if (hash) b.style.backgroundImage = `url(${hash})`;
      const i = el("img"); i.alt = ""; i.loading = "lazy"; i.src = img(a.id, "thumbnail"); i.onerror = () => i.remove(); b.append(i, el("span", null, city));
      b.onclick = () => (location.hash = "#/place/" + encodeURIComponent(city)); places.append(b);
    }
    if (!places.children.length) drop(places);
  }).catch(() => drop(places));
  const albumList = state.albums || await loadSidebarAlbums().then(() => state.albums).catch(() => []);
  if (alive()) {
    for (const a of albumList.slice(0, 30)) {
      const b = el("button", "tilecard"); if (a.albumThumbnailAssetId) { const i = el("img"); i.alt = ""; i.loading = "lazy"; i.src = img(a.albumThumbnailAssetId, "thumbnail"); i.onerror = () => i.remove(); b.append(i); }
      b.append(el("span", null, a.albumName)); b.onclick = () => (location.hash = "#/album/" + a.id + "/" + encodeURIComponent(a.albumName)); albums.append(b);
    }
    if (!albums.children.length) drop(albums);
  }
}

// ---------- Map (small built-in map view using OpenStreetMap tiles) ----------
const WORLD = (z) => 256 * 2 ** z;
const lon2x = (lon, z) => ((lon + 180) / 360) * WORLD(z);
const lat2y = (lat, z) => { const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * WORLD(z); };
const x2lon = (x, z) => (x / WORLD(z)) * 360 - 180;
const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / WORLD(z)))) * 180) / Math.PI;
async function showMap() {
  resetView(); setHeader(tr("nav.map"));
  const wrap = el("div", "mapwrap"), tilesEl = el("div", "tiles"), pinsEl = el("div", "pins");
  const ctl = el("div", "map-ctl"), zi = el("button", null, "+"), zo = el("button", null, "−"); ctl.append(zi, zo);
  const attr = el("div", "map-attr"); attr.append("© "); const ol = el("a", null, "OpenStreetMap"); ol.href = "https://www.openstreetmap.org/copyright"; ol.target = "_blank"; ol.rel = "noopener"; attr.append(ol);
  wrap.append(tilesEl, pinsEl, ctl, attr); $("#content").append(wrap);
  const token = state.overviewToken; $("#main").style.overflow = "hidden";
  let markers;
  try {
    if (!state.markers || Date.now() - state.markersAt > 300000) { state.markers = await api("/map/markers?withPartners=true"); state.markersAt = Date.now(); }
    markers = state.markers;
  } catch (e) { $("#main").style.overflow = ""; if (e.message !== "401") showError(tr("error.generic", { message: e.message })); return; }
  if (token !== state.overviewToken) { return; }
  if (!markers.length) { $("#empty h2").textContent = tr("empty.photosWithLocation"); $("#empty").classList.remove("hidden"); wrap.remove(); $("#main").style.overflow = ""; return; }
  const pts = markers.filter((m) => m.lat != null && m.lon != null);
  let W = wrap.clientWidth, H = wrap.clientHeight;
  // Initial view: last position, otherwise fit all photos
  let view = state.mapView;
  if (!view) {
    const minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat)), minLon = Math.min(...pts.map((p) => p.lon)), maxLon = Math.max(...pts.map((p) => p.lon));
    let z = 16; while (z > 2 && (lon2x(maxLon, z) - lon2x(minLon, z) > W * 0.85 || lat2y(minLat, z) - lat2y(maxLat, z) > H * 0.85)) z--;
    view = { z, cx: (lon2x(minLon, z) + lon2x(maxLon, z)) / 2, cy: (lat2y(minLat, z) + lat2y(maxLat, z)) / 2 };
  }
  state.mapView = view;
  let clusters = null, clusterZ = -1;
  const buildClusters = () => {
    const z = view.z, cell = 64, map = new Map();
    for (const p of pts) {
      const x = lon2x(p.lon, z), y = lat2y(p.lat, z), key = Math.floor(x / cell) * 100003 + Math.floor(y / cell);
      let c = map.get(key);
      if (!c) map.set(key, (c = { n: 0, sx: 0, sy: 0, minLat: p.lat, maxLat: p.lat, minLon: p.lon, maxLon: p.lon, id: p.id }));
      c.n++; c.sx += x; c.sy += y; c.minLat = Math.min(c.minLat, p.lat); c.maxLat = Math.max(c.maxLat, p.lat); c.minLon = Math.min(c.minLon, p.lon); c.maxLon = Math.max(c.maxLon, p.lon);
    }
    clusters = [...map.values()].map((c) => ({ ...c, x: c.sx / c.n, y: c.sy / c.n })); clusterZ = z;
  };
  const tileNodes = new Map(), pinNodes = new Map();
  const render = () => {
    if (token !== state.overviewToken) return;
    W = wrap.clientWidth; H = wrap.clientHeight;
    const z = view.z, left = view.cx - W / 2, top = view.cy - H / 2, n = 2 ** z;
    // Kacheln
    const x0 = Math.floor(left / 256), x1 = Math.floor((left + W) / 256), y0 = Math.max(0, Math.floor(top / 256)), y1 = Math.min(n - 1, Math.floor((top + H) / 256));
    const want = new Set();
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const key = `${z}/${tx}/${ty}`; want.add(key);
      let node = tileNodes.get(key);
      if (!node) { node = el("img"); node.alt = ""; node.draggable = false; node.src = `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`; tilesEl.append(node); tileNodes.set(key, node); }
      node.style.transform = `translate(${tx * 256 - left}px,${ty * 256 - top}px)`;
    }
    for (const [k, node] of tileNodes) if (!want.has(k)) { node.remove(); tileNodes.delete(k); }
    // Fotogruppen
    if (clusterZ !== z) { buildClusters(); for (const nd of pinNodes.values()) nd.remove(); pinNodes.clear(); }
    const seen = new Set();
    clusters.forEach((c, idx) => {
      const px = c.x - left, py = c.y - top; if (px < -60 || py < -60 || px > W + 60 || py > H + 60) return;
      seen.add(idx); let nd = pinNodes.get(idx);
      if (!nd) {
        nd = el("button", "pin"); const i = el("img"); i.alt = ""; i.src = img(c.id, "thumbnail"); i.onerror = () => i.remove(); nd.append(i);
        if (c.n > 1) nd.append(el("b", null, c.n > 999 ? Math.round(c.n / 100) / 10 + "k" : String(c.n)));
        nd.onclick = (e) => { e.stopPropagation(); const pad = 0.0005; state.mapView = view; location.hash = `#/bbox/${[c.minLon - pad, c.minLat - pad, c.maxLon + pad, c.maxLat + pad].map((v) => v.toFixed(5)).join(",")}`; };
        pinsEl.append(nd); pinNodes.set(idx, nd);
      }
      nd.style.transform = `translate(${px}px,${py}px)`; nd.style.left = "0"; nd.style.top = "0";
    });
    for (const [k, nd] of pinNodes) if (!seen.has(k)) { nd.remove(); pinNodes.delete(k); }
  };
  let raf = 0; const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
  const zoomTo = (nz, sx, sy) => {
    nz = Math.max(2, Math.min(18, nz)); if (nz === view.z) return;
    const k = 2 ** (nz - view.z), ox = sx - W / 2, oy = sy - H / 2;
    view.cx = (view.cx + ox) * k - ox; view.cy = (view.cy + oy) * k - oy; view.z = nz; schedule();
  };
  zi.onclick = () => zoomTo(view.z + 1, W / 2, H / 2); zo.onclick = () => zoomTo(view.z - 1, W / 2, H / 2);
  let wheelAt = 0;
  wrap.addEventListener("wheel", (e) => { e.preventDefault(); if (Date.now() - wheelAt < 220) return; wheelAt = Date.now(); const r = wrap.getBoundingClientRect(); zoomTo(view.z + (e.deltaY < 0 ? 1 : -1), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  wrap.addEventListener("dblclick", (e) => { const r = wrap.getBoundingClientRect(); zoomTo(view.z + 1, e.clientX - r.left, e.clientY - r.top); });
  const ptr = new Map(); let pd = 0;
  wrap.addEventListener("pointerdown", (e) => { if (e.target.closest(".pin,.map-ctl")) return; wrap.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pd = Math.hypot(a.x - b.x, a.y - b.y); } });
  wrap.addEventListener("pointermove", (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    if (ptr.size === 1) { view.cx -= e.clientX - p.x; view.cy -= e.clientY - p.y; schedule(); }
    p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = wrap.getBoundingClientRect(); if (pd && (d / pd > 1.5 || d / pd < 0.67)) { zoomTo(view.z + (d > pd ? 1 : -1), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pd = d; } }
  });
  const up = (e) => { ptr.delete(e.pointerId); pd = 0; };
  wrap.addEventListener("pointerup", up); wrap.addEventListener("pointercancel", up);
  render();
}
function showBBox(bbox) {
  showFeed({}, tr("map.placeTitle"), {
    back: true,
    makeFeed: () => new BucketFeed({}, {
      prepare: async (f) => { if (!state.userId) state.userId = (await api("/users/me")).id; f.params = { visibility: "timeline", order: "desc", userId: state.userId, withPartners: "true", bbox }; },
    }),
  });
}

// ---------- Routing ----------
function markActive() {
  const [, name = "photos", id] = location.hash.split("/");
  const main = { month: "photos", person: "people", bbox: "map", place: "collections" }[name] ?? name;
  document.querySelectorAll("aside a[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === main));
  document.querySelectorAll("#sideAlbums a").forEach((a) => a.classList.toggle("active", name === "album" && a.dataset.albumId === id));
  const tab = ["photos", "month", "favorites", "search"].includes(name) ? "photos" : "collections";
  document.querySelectorAll("#tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  if (name === "album") setGroup("albums", true);
  if (name === "videos" || name === "live") setGroup("media", true);
}
// Collapsible sidebar groups (Albums, Media types), remembered per browser.
function setGroup(key, open) {
  const sub = key === "albums" ? $("#sideAlbums") : $("#mediaNav");
  sub.classList.toggle("hidden", !open);
  document.querySelector(`.chev[data-toggle="${key}"]`).setAttribute("aria-expanded", String(open));
  store.set("group." + key, open);
}
document.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => setGroup(b.dataset.toggle, b.parentElement.querySelector(".chev").getAttribute("aria-expanded") !== "true")));
["albums", "media"].forEach((k) => setGroup(k, store.get("group." + k, false)));
let lastName = "";
function route() {
  const [, name = "photos", id, title] = location.hash.split("/");
  markActive(); refreshAlbums(false);
  const restore = lastName === "month" && name === "photos"; // back from a month: restore the scroll position
  lastName = name; state.view = name;
  if (name !== "search") $("#searchInput").value = "";
  if (name === "albums") showAlbums();
  else if (name === "album") showFeed({ albumIds: [id] }, decodeURIComponent(title || "Album"), { back: true, makeFeed: () => new BucketFeed({ albumId: id, order: "desc" }, { fallback: { filters: { albumIds: [id] }, opts: {} } }) });
  else if (name === "month") showMonth(id);
  else if (name === "search") showSearch(decodeURIComponent(id || ""));
  else if (name === "collections") showCollections();
  else if (name === "people") showPeople();
  else if (name === "person") showPerson(id, decodeURIComponent(title || "Person"));
  else if (name === "map") showMap();
  else if (name === "bbox") showBBox(decodeURIComponent(id || ""));
  else if (name === "place") { const c = decodeURIComponent(id || ""); showFeed({ city: c, visibility: "timeline" }, c, { back: true }); }
  else if (name === "live") showFeed({ isMotion: true, visibility: "timeline" }, tr("nav.live"), { back: true });
  else if (name === "favorites") { showFeed({ isFavorite: true }, tr("nav.favorites")); state.view = "favorites"; }
  else if (name === "videos") { showFeed({ type: "VIDEO", visibility: "timeline" }, tr("nav.videos")); state.view = "videos"; }
  else showLibrary(restore);
}
addEventListener("hashchange", () => { if (!$("#app").classList.contains("hidden")) route(); });
$("#back").onclick = () => history.back();
$("#seg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || b.dataset.mode === state.mode) return;
  state.mode = b.dataset.mode; store.set("mode", state.mode); showLibrary();
});
$("#searchBtn").addEventListener("click", () => {
  const side = $("#sidebar"); side.classList.toggle("search-open");
  if (side.classList.contains("search-open")) $("#searchInput").focus();
});
$("#searchForm").addEventListener("submit", (e) => {
  $("#sidebar").classList.remove("search-open");
  e.preventDefault(); const q = $("#searchInput").value.trim();
  if (q) location.hash = "#/search/" + encodeURIComponent(q);
});

// Pinch (touch) or ctrl+wheel (trackpad pinch) on the library changes the zoom step.
{
  let d0 = 0, busy = false;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const m = $("#main");
  m.addEventListener("touchstart", (e) => { if (e.touches.length === 2) d0 = dist(e.touches); }, { passive: true });
  m.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2 || !d0 || !$("#viewer").classList.contains("hidden")) return;
    const r = dist(e.touches) / d0;
    if (r > 1.14) { zoom(1); d0 = dist(e.touches); } else if (r < 0.88) { zoom(-1); d0 = dist(e.touches); }
  }, { passive: true });
  m.addEventListener("touchend", () => { d0 = 0; }, { passive: true });
  m.addEventListener("wheel", (e) => {
    if (!e.ctrlKey || !$("#zoom") || $("#zoom").classList.contains("hidden")) return;
    e.preventDefault();
    if (busy) return; busy = true; setTimeout(() => (busy = false), 350);
    zoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
}

// ---------- Viewer ----------
let vIndex = -1;
const vz = { s: 1, x: 0, y: 0 };
const infoCache = new Map();
const curItem = () => (state.feed && vIndex >= 0 ? state.feed.items[vIndex] : null);
function openViewer(i) { vIndex = i; $("#viewer").classList.remove("hidden"); showViewer(); }
function closeViewer() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  liveStop(); $("#vLiveVideo").removeAttribute("src"); vIndex = -1; $("#viewer").classList.remove("immersive", "info-open", "closing"); $("#viewer").classList.add("hidden"); $("#vStage").replaceChildren(); $("#vPanel").classList.add("hidden");
  for (const e of [$("#vStage"), $("#vPanel"), $("#viewer")]) e.removeAttribute("style"); // leftovers of a swipe gesture
}
// Live Photos: hold the photo (finger or mouse) to play the short video, release to stop.
let liveTimer = 0, livePlaying = false;
function liveStop() {
  clearTimeout(liveTimer); liveTimer = 0;
  const vid = $("#vLiveVideo"); vid.classList.remove("on"); vid.pause(); livePlaying = false;
}
function livePlay(untilEnd) {
  const a = curItem(), vid = $("#vLiveVideo");
  if (!a || !a.livePhotoVideoId || vz.s !== 1 || $("#viewer").classList.contains("info-open")) return;
  const src = `/api/assets/${a.livePhotoVideoId}/video/playback`;
  if (!vid.src.endsWith(src)) vid.src = src;
  vid.currentTime = 0; vid.muted = false; livePlaying = true; moved = true; // a hold is not a tap
  vid.onended = untilEnd ? liveStop : null;
  const go = () => vid.play().then(() => { if (livePlaying) vid.classList.add("on"); });
  go().catch(() => { vid.muted = true; go().catch(() => {}); }); // sound needs a user gesture; fall back to muted
}
$("#vLive").onclick = () => (livePlaying ? liveStop() : livePlay(true));
// Closing like the iOS Photos app: the photo shrinks and flies back to its place in the timeline.
function tileFor(idx) {
  if (!grid.el || !state.feed) return null;
  const row = grid.rows.find((r) => idx >= r.start && idx < r.end); if (!row) return null;
  const main = $("#main"), top = grid.el.offsetTop + vtop(row);
  if (top < main.scrollTop + 60 || top + row.h > main.scrollTop + main.clientHeight - 20) { // not in view: bring it to the middle first
    main.scrollTop = top - (main.clientHeight - row.h) / 2; renderVisible();
  }
  return grid.el.querySelector(`.tile[data-idx="${idx}"]`);
}
function closeToTile() {
  const v = $("#viewer"), stage = $("#vStage"), el = currentEl(), tile = tileFor(vIndex);
  if (!el || !tile || v.classList.contains("hidden")) return false;
  const T = tile.getBoundingClientRect(); if (!T.width) return false;
  const ow = el.offsetWidth || T.width, oh = el.offsetHeight || T.height;
  const cx = stage.offsetLeft + stage.offsetWidth / 2, cy = stage.offsetTop + stage.offsetHeight / 2;
  const S = Math.max(T.width / ow, T.height / oh);
  v.classList.add("closing"); tile.style.opacity = "0"; // the flying photo takes the tile's place
  stage.style.transition = "transform .42s cubic-bezier(.3,.7,.2,1)";
  stage.style.transform = `translate(${T.left + T.width / 2 - cx}px,${T.top + T.height / 2 - cy}px) scale(${S})`;
  v.style.transition = "background-color .42s"; v.style.backgroundColor = "rgba(0,0,0,0)";
  setTimeout(() => { closeViewer(); tile.style.opacity = ""; }, 430);
  return true;
}
const closeAnimated = () => { if (vIndex >= 0 && !closeToTile()) closeViewer(); };
// Maximize: real fullscreen where the browser allows it (e.g. Mac, PC, iPad), otherwise just hide all controls.
const setImmersive = (on) => $("#viewer").classList.toggle("immersive", on);
function toggleFullscreen() {
  const v = $("#viewer");
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (v.classList.contains("immersive")) setImmersive(false);
  else if (v.requestFullscreen) {
    // If fullscreen is refused or not implemented (e.g. iPhone, embedded browsers), hiding the controls is enough.
    v.requestFullscreen().catch(() => setImmersive(true));
    setTimeout(() => { if (!document.fullscreenElement) setImmersive(true); }, 350);
  } else setImmersive(true);
}
document.addEventListener("fullscreenchange", () => setImmersive(!!document.fullscreenElement));
$("#vFull").onclick = toggleFullscreen;
function applyZoom() {
  const i = $("#vStage img"); if (i) i.style.transform = vz.s === 1 ? "" : `translate(${vz.x}px,${vz.y}px) scale(${vz.s})`;
  $("#vStage").classList.toggle("zoomed", vz.s > 1);
}
function resetZoom() { vz.s = 1; vz.x = vz.y = 0; applyZoom(); }
function zoomAt(cx, cy, factor) {
  const r = $("#vStage").getBoundingClientRect(), ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
  const ns = Math.min(8, Math.max(1, vz.s * factor));
  if (ns === 1) { vz.x = vz.y = 0; } else { vz.x = ox - ((ox - vz.x) * ns) / vz.s; vz.y = oy - ((oy - vz.y) * ns) / vz.s; }
  vz.s = ns; applyZoom();
}
function showViewer(reuse, keep) {
  const a = curItem(); if (!a) return closeViewer();
  const stage = $("#vStage"); stage.replaceChildren(); resetZoom(); liveStop();
  $("#vLive").classList.toggle("hidden", !(a.livePhotoVideoId && a.type !== "VIDEO"));
  if (a.type === "VIDEO") {
    const v = el("video"); v.controls = true; v.autoplay = true; v.playsInline = true;
    v.poster = img(a.id, "preview"); v.src = `/api/assets/${a.id}/video/playback`; stage.append(v);
  } else {
    // reuse: the neighbour image that was just slid into place (no reload, no flicker)
    const i = reuse || el("img"); i.alt = ""; i.draggable = false; i.classList.remove("nb"); delete i.dataset.d; i.style.transition = i.style.transform = "";
    if (!reuse) i.src = img(a.id, "preview");
    i.onerror = () => { stage.replaceChildren(el("p", null, tr("viewer.noPreview"))); stage.firstChild.style.color = "#fff"; };
    stage.append(i);
  }
  $("#vFav").textContent = a.isFavorite ? "♥" : "♡";
  const infoLine = () => $("#vInfo").replaceChildren(el("span", null, `${a.originalFileName || ""}${a._date ? " · " + dateFmt.format(a._date) : ""}`));
  infoLine();
  if (!a.originalFileName) { // timeline data contains no file name: load it on demand
    (infoCache.get(a.id) ? Promise.resolve(infoCache.get(a.id)) : api(`/assets/${a.id}`).then((i) => (infoCache.set(a.id, i), i)))
      .then((i) => { a.originalFileName = i.originalFileName || ""; if (curItem() === a) infoLine(); }).catch(() => {});
  }
  if (!$("#vPanel").classList.contains("hidden")) showInfoPanel();
  if (vIndex > state.feed.items.length - 20) loadMore();
  ensureNeighbours(keep);
}
// d is the visual direction (1 = right). In the mirrored grid the right neighbour is the newer photo.
const idxFor = (d) => { const n = vIndex + (state.rev ? -d : d); return n >= 0 && n < state.feed.items.length ? n : -1; };
let paging = false; // a slide animation is running
// Both neighbours stay in the viewer permanently, decoded and parked beside the current photo (like PhotoSwipe / Swiper):
// swiping then only changes transforms and never has to load or decode an image in the middle of the gesture.
const slideW = () => $("#vStage").clientWidth + SLIDE_GAP;
const restX = (d) => `translate3d(${d * slideW()}px,0,0)`;
function ensureNeighbours(keep) {
  const stage = $("#vStage");
  for (const n of stage.querySelectorAll(".nb")) if (!keep || n !== keep.el) n.remove();
  for (const d of [-1, 1]) {
    const n = idxFor(d); if (n < 0) continue;
    let i = keep && keep.d === d ? keep.el : null; // the photo we just left is already loaded: keep it
    if (!i) { i = el("img", "nb"); i.alt = ""; i.draggable = false; i.src = img(state.feed.items[n].id, "preview"); if (i.decode) i.decode().catch(() => {}); }
    i.classList.add("nb"); i.dataset.d = d; i.style.transition = "none"; i.style.transform = restX(d);
    stage.append(i);
  }
}
const makeNeighbour = (d) => $("#vStage").querySelector(`.nb[data-d="${d}"]`);
addEventListener("resize", () => { if (vIndex >= 0) for (const n of $("#vStage").querySelectorAll(".nb")) n.style.transform = restX(+n.dataset.d); });
const currentEl = () => $("#vStage").querySelector(":scope > :not(.nb)");
const SLIDE_GAP = 24; // black gap between two photos while sliding
const SLIDE = "transform .42s cubic-bezier(.22,.7,.2,1)"; // settle after letting go
// Finishes the slide: commit = switch to the neighbour, otherwise spring back.
function finishPage(d, nb, commit) {
  const cur = currentEl(); paging = true;
  for (const e of [cur, nb]) if (e) e.style.transition = SLIDE;
  if (cur) cur.style.transform = commit ? `translate3d(${-d * slideW()}px,0,0)` : "translate3d(0,0,0)";
  if (nb) nb.style.transform = commit ? "translate3d(0,0,0)" : restX(d);
  setTimeout(() => {
    paging = false;
    if (commit && nb) {
      vIndex = idxFor(d);
      showViewer(curItem().type === "VIDEO" ? null : nb, cur && cur.tagName === "IMG" ? { el: cur, d: -d } : null);
    } else if (cur) { cur.style.transition = ""; cur.style.transform = ""; }
  }, 430);
}
// d is the visual direction (1 = right); used by keys and buttons.
const step = (d) => {
  if (vIndex < 0 || paging) return;
  const nb = makeNeighbour(d); if (!nb) return;
  finishPage(d, nb, true);
};
async function showInfoPanel() {
  const a = curItem(), panel = $("#vPanel"); if (!a) return;
  panel.classList.remove("hidden"); panel.replaceChildren(el("p", null, tr("common.loading")));
  let info = infoCache.get(a.id);
  try { if (!info) { info = await api(`/assets/${a.id}`); infoCache.set(a.id, info); } } catch (e) { panel.replaceChildren(el("p", null, tr("error.generic", { message: e.message }))); return; }
  if (curItem()?.id !== a.id) return;
  const x = info.exifInfo || {}, dl = el("dl");
  const add = (k, v) => { if (v != null && v !== "") { dl.append(el("dt", null, k)); const dd = el("dd"); if (v instanceof Node) dd.append(v); else dd.textContent = v; dl.append(dd); } };
  const d = new Date(info.localDateTime || info.fileCreatedAt);
  add(tr("info.date"), isNaN(d) ? null : dateFmt.format(d));
  add(tr("info.size"), x.fileSizeInByte ? fmtBytes(x.fileSizeInByte) : null);
  add(tr("info.resolution"), x.exifImageWidth && x.exifImageHeight ? tr("info.resolutionValue", { w: x.exifImageWidth, h: x.exifImageHeight, mp: new Intl.NumberFormat(I18n.lang, { maximumFractionDigits: 1 }).format((x.exifImageWidth * x.exifImageHeight) / 1e6) }) : null);
  add(tr("info.camera"), [x.make, x.model].filter(Boolean).join(" "));
  add(tr("info.lens"), x.lensModel);
  add(tr("info.exposure"), [x.fNumber && `ƒ/${x.fNumber}`, x.exposureTime && `${x.exposureTime} s`, x.iso && `ISO ${x.iso}`, x.focalLength && `${x.focalLength} mm`].filter(Boolean).join("  ·  "));
  add(tr("info.place"), [x.city, x.state, x.country].filter(Boolean).join(", "));
  if (x.latitude != null && x.longitude != null) { const l = el("a", null, `${x.latitude.toFixed(4)}, ${x.longitude.toFixed(4)}`); l.href = `https://www.openstreetmap.org/?mlat=${x.latitude}&mlon=${x.longitude}#map=15/${x.latitude}/${x.longitude}`; l.target = "_blank"; l.rel = "noopener"; add(tr("info.coordinates"), l); }
  add(tr("info.description"), x.description);
  add(tr("info.owner"), info.owner && info.owner.name);
  add(tr("info.type"), info.originalMimeType);
  const facesBox = el("div", "faces");
  panel.replaceChildren(el("h4", null, info.originalFileName || a.originalFileName || ""), dl, facesBox);
  loadFaces(a, facesBox);
}
$("#vClose").onclick = closeAnimated;
// Touch devices: the info panel is a bottom sheet (swipe up on the photo, swipe down to close), like in the iOS Photos app.
const touchUI = () => matchMedia("(pointer: coarse)").matches;
function closeInfoSheet() {
  const v = $("#viewer"), panel = $("#vPanel"); v.classList.remove("info-open");
  setTimeout(() => { if (!v.classList.contains("info-open")) { panel.classList.add("hidden"); panel.style.transition = panel.style.transform = ""; } }, 360);
}
$("#vInfoBtn").onclick = () => {
  const panel = $("#vPanel"), hidden = panel.classList.contains("hidden");
  if (touchUI()) { if (hidden) { showInfoPanel(); $("#viewer").classList.add("info-open"); } else closeInfoSheet(); }
  else hidden ? showInfoPanel() : panel.classList.add("hidden");
};
$("#vFav").onclick = guard(async () => { const a = curItem(); if (!a) return; await setFavorite([a], !a.isFavorite); $("#vFav").textContent = a.isFavorite ? "♥" : "♡"; });
$("#vDl").onclick = guard(async () => { const a = curItem(); if (a) await downloadItems([a]); });
$("#vDel").onclick = guard(async () => {
  const a = curItem(); if (!a) return; const idx = vIndex;
  if (await deleteItems([a])) { if (!state.feed.items.length) return closeViewer(); vIndex = Math.min(idx, state.feed.items.length - 1); showViewer(); }
});
addEventListener("keydown", (e) => {
  if (vIndex < 0 || (e.target.closest && e.target.closest("input,textarea"))) return;
  if (e.key === "Escape") { if ($("#viewer").classList.contains("immersive")) setImmersive(false); else closeAnimated(); }
  else if (e.key === "f" || e.key === "F") toggleFullscreen(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
  else if (e.key === "i") $("#vInfoBtn").click(); else if (e.key === "+" || e.key === "=") zoomAt(innerWidth / 2, innerHeight / 2, 1.4); else if (e.key === "-") zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.4);
});
// Zoom (mouse wheel, double click, two-finger gesture), pan, swipe to navigate
const stage = $("#vStage"), ptrs = new Map();
let pinch0 = 0, pinchS = 1, downX = 0, downY = 0, moved = false;
// Two-finger horizontal swipe on a trackpad (wheel events with deltaX) pages through photos, following the fingers like a touch swipe.
let wheelSwipe = null, wheelIdle = 0, wheelLocked = false;
function wheelPage(e) {
  clearTimeout(wheelIdle); wheelIdle = setTimeout(() => { wheelSwipe = null; wheelLocked = false; }, 140);
  if (wheelLocked || paging) return;
  if (!wheelSwipe) wheelSwipe = { acc: 0, d: 0, nb: null, last: 0 };
  const w = wheelSwipe; w.acc -= e.deltaX; w.last = e.deltaX;
  const d = w.acc < 0 ? 1 : -1;
  if (d !== w.d) { w.d = d; w.nb = makeNeighbour(d); }
  const tx = w.nb ? w.acc : w.acc * 0.3, cur = currentEl();
  if (cur) { cur.style.transition = "none"; cur.style.transform = `translate3d(${tx}px,0,0)`; }
  if (w.nb) { w.nb.style.transition = "none"; w.nb.style.transform = `translate3d(${d * slideW() + w.acc}px,0,0)`; }
  clearTimeout(w.t);
  w.t = setTimeout(() => { // fingers lifted (no event for a moment): settle
    if (wheelSwipe !== w) return;
    wheelLocked = true; const commit = !!w.nb && Math.abs(w.acc) > stage.clientWidth * 0.25;
    Log.log("wheel-swipe", { acc: Math.round(w.acc), commit });
    finishPage(w.d, w.nb, commit);
  }, 90);
}
stage.addEventListener("wheel", (e) => { if (e.target.tagName === "VIDEO") return; e.preventDefault();
  if (!e.ctrlKey && vz.s === 1 && !$("#viewer").classList.contains("info-open") && (wheelSwipe || Math.abs(e.deltaX) > Math.abs(e.deltaY))) { wheelPage(e); return; } zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018))); }, { passive: false });
let tapTimer = 0;
stage.addEventListener("dblclick", (e) => { clearTimeout(tapTimer); if (e.target.tagName === "VIDEO") return; if (vz.s > 1) resetZoom(); else zoomAt(e.clientX, e.clientY, 2.5); });
let fromVideo = false;
let vdrag = null; // vertical swipe: { mode: openInfo | closeInfo | closeViewer, ty, vy, ... }
let drag = null; // swipe in progress: { d, nb, lx, lt, vx }
let swipeStat = { moves: 0 }; // for diagnostics: how the gesture arrived
stage.addEventListener("pointerdown", (e) => {
  if (paging) return;
  // Videos: swiping works on the picture itself; the bottom strip with the native controls (play, scrubbing) stays untouched.
  const onVideo = e.target.tagName === "VIDEO";
  if (onVideo && e.clientY > e.target.getBoundingClientRect().bottom - 80) return;
  if (!ptrs.size) { drag = null; vdrag = null; } // a gesture that never ended (e.g. lost events) must not block the next one
  // For videos capture only once a swipe has really started, so a plain tap still reaches the video (play / pause).
  if (!onVideo) stage.setPointerCapture(e.pointerId);
  if (!ptrs.size && !onVideo) { clearTimeout(liveTimer); liveTimer = setTimeout(() => livePlay(false), 380); } // hold = play the Live Photo
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) { downX = e.clientX; downY = e.clientY; moved = false; fromVideo = onVideo; }
  if (ptrs.size === 2) {
    liveStop();
    const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchS = vz.s;
    if (drag) { // second finger: pinch instead of swipe
      if (drag.raf) cancelAnimationFrame(drag.raf);
      if (drag.nb) drag.nb.style.transform = restX(drag.d);
      const c = currentEl(); if (c) c.style.transform = ""; drag = null;
    }
  }
});
stage.addEventListener("pointermove", (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinchS * d) / pinch0 / vz.s);
  } else if (vz.s > 1) { vz.x += dx; vz.y += dy; moved = true; applyZoom(); }
  else if (!paging) { // swipe: the photo follows the finger and the neighbour slides in
    const tx = e.clientX - downX, ty = e.clientY - downY;
    if (Math.hypot(tx, ty) > 10 && liveTimer) { clearTimeout(liveTimer); liveTimer = 0; } // moved: swipe, not a hold
    if (Math.hypot(tx, ty) > 24 && livePlaying) liveStop();
    if (!drag && !vdrag && e.pointerType !== "mouse" && Math.abs(ty) > 10 && Math.abs(ty) > Math.abs(tx) * 1.3) startVDrag(e);
    if (vdrag) {
      moved = true; const dt = e.timeStamp - vdrag.lt;
      if (dt > 0) { vdrag.vy = 0.4 * vdrag.vy + 0.6 * ((e.clientY - vdrag.ly) / dt); vdrag.ly = e.clientY; vdrag.lt = e.timeStamp; }
      vdrag.ty = ty; if (!vdrag.raf) vdrag.raf = requestAnimationFrame(() => paintV(vdrag));
      return;
    }
    if (!drag && Math.abs(tx) > 8 && Math.abs(tx) > Math.abs(ty)) { drag = { d: 0, nb: null, lx: e.clientX, lt: e.timeStamp, vx: 0 }; if (fromVideo) { try { stage.setPointerCapture(e.pointerId); } catch {} } }
    if (!drag) return;
    moved = true; swipeStat.moves++;
    const d = tx < 0 ? 1 : -1, cur = currentEl();
    if (d !== drag.d) { if (drag.nb) drag.nb.style.transform = restX(drag.d); drag.d = d; drag.nb = makeNeighbour(d); }
    const dt = e.timeStamp - drag.lt; if (dt > 0) { drag.vx = 0.4 * drag.vx + 0.6 * ((e.clientX - drag.lx) / dt); drag.lx = e.clientX; drag.lt = e.timeStamp; }
    drag.tx = tx; if (!drag.raf) drag.raf = requestAnimationFrame(() => paintDrag(drag)); // at most one update per frame
  }
});
function startVDrag(e) {
  const v = $("#viewer"), panel = $("#vPanel"), ty = e.clientY - downY;
  const open = v.classList.contains("info-open");
  const mode = open ? (ty > 0 ? "closeInfo" : null) : ty < 0 ? "openInfo" : "closeViewer";
  vdrag = { mode, vy: 0, ly: e.clientY, lt: e.timeStamp, ty: 0, raf: 0 };
  if (fromVideo) { try { stage.setPointerCapture(e.pointerId); } catch {} }
  stage.style.transition = "none";
  if (mode === "openInfo") { panel.style.transition = "none"; panel.style.transform = `translateY(${panel.offsetHeight || innerHeight}px)`; showInfoPanel(); }
  if (mode === "closeInfo") panel.style.transition = "none";
}
function paintV(dd) {
  dd.raf = 0; const ty = dd.ty, panel = $("#vPanel"), v = $("#viewer");
  if (dd.mode === "openInfo") { panel.style.transform = `translateY(${Math.max(0, (panel.offsetHeight || innerHeight) + ty)}px)`; stage.style.transform = `translateY(${ty * 0.25}px)`; }
  else if (dd.mode === "closeInfo") panel.style.transform = `translateY(${Math.max(0, ty)}px)`;
  else if (dd.mode === "closeViewer") {
    const y = ty > 0 ? ty : ty * 0.2;
    stage.style.transform = `translateY(${y}px) scale(${1 - Math.max(0, ty) / 2500})`; v.style.backgroundColor = `rgba(0,0,0,${Math.max(0, 1 - Math.max(0, ty) / 450)})`;
  }
}
const SETTLE = "transform .38s cubic-bezier(.22,.7,.2,1)";
function finishV(dd) {
  if (dd.raf) cancelAnimationFrame(dd.raf);
  const { mode, ty, vy } = dd, v = $("#viewer"), panel = $("#vPanel");
  Log.log("vswipe", { mode, ty: Math.round(ty), vy: +vy.toFixed(2) });
  if (mode !== "closeViewer" || !(ty > 110 || vy > 0.6)) { stage.style.transition = SETTLE; stage.style.transform = ""; } // closing animates from the current position instead
  if (mode === "openInfo") {
    panel.style.transition = SETTLE; panel.style.transform = "";
    if (ty < -80 || vy < -0.5) v.classList.add("info-open"); else closeInfoSheet();
  } else if (mode === "closeInfo") {
    panel.style.transition = SETTLE; panel.style.transform = "";
    if (ty > 80 || vy > 0.5) closeInfoSheet();
  } else if (mode === "closeViewer") {
    if (ty > 110 || vy > 0.6) closeAnimated(); // shrink back to the tile in the timeline
    else { v.style.transition = "background-color .3s"; v.style.backgroundColor = ""; }
  }
  setTimeout(() => { if (vIndex >= 0 && !v.classList.contains("closing")) { stage.style.transition = ""; panel.style.transition = ""; v.style.transition = ""; } }, 400);
}
function paintDrag(dd) {
  dd.raf = 0; const cur = currentEl(), tx = dd.tx;
  if (cur) { cur.style.transition = "none"; cur.style.transform = `translate3d(${dd.nb ? tx : tx * 0.3}px,0,0)`; } // resistance without neighbour
  if (dd.nb) { dd.nb.style.transition = "none"; dd.nb.style.transform = `translate3d(${dd.d * slideW() + tx}px,0,0)`; }
}
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const wasSingle = ptrs.size === 1; ptrs.delete(e.pointerId);
  liveStop();
  const dx = e.clientX - downX, dy = e.clientY - downY;
  if (e.type === "pointercancel") Log.log("pointercancel", { dragging: !!drag, moves: swipeStat.moves });
  if (vdrag) { const dd = vdrag; vdrag = null; finishV(dd); }
  else if (drag) {
    const dd = drag; drag = null; if (dd.raf) cancelAnimationFrame(dd.raf);
    const fast = Math.abs(dd.vx) > 0.4 && Math.sign(dd.vx) === -dd.d; // flick in the direction of the neighbour
    const commit = !!dd.nb && (Math.abs(dx) > stage.clientWidth * 0.25 || fast);
    Log.log("swipe", { moves: swipeStat.moves, dx: Math.round(dx), vx: +dd.vx.toFixed(2), commit, neighbour: !!dd.nb, how: e.type });
    swipeStat = { moves: 0 };
    finishPage(dd.d, dd.nb, commit);
  } else if (wasSingle && vz.s === 1 && Math.abs(dx) > 40) Log.log("swipe-nodrag", { dx: Math.round(dx), dy: Math.round(dy), moves: swipeStat.moves, how: e.type });
  else if (wasSingle && !fromVideo && Math.hypot(dx, dy) < 6 && !moved) { // einfacher Klick/Tipp: Bedienelemente aus- bzw. einblenden
    clearTimeout(tapTimer); tapTimer = setTimeout(() => setImmersive(!$("#viewer").classList.contains("immersive")), 260);
  }
  pinch0 = 0;
};
stage.addEventListener("pointerup", endPtr); stage.addEventListener("pointercancel", endPtr);

// ---------- Start ----------
function setupLanguagePickers() {
  document.querySelectorAll("[data-lang-select]").forEach((sel) => {
    sel.replaceChildren(...I18n.languages.map((l) => { const o = el("option", null, l.name); o.value = l.code; o.selected = l.code === I18n.lang; return o; }));
    sel.hidden = I18n.languages.length < 2; // nothing to choose from
    sel.onchange = () => I18n.setLanguage(sel.value);
  });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
I18n.init().then(() => {
  setupFormats(); setupLanguagePickers();
  return fetch("/api/users/me", { credentials: "same-origin" }).then((r) => (r.ok ? showApp() : showLogin())).catch(showLogin);
});
