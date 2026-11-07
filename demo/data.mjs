// Deterministic fake library: ~6,000 dummy assets spread over 8 years, with albums, people and places.
import { rng, THEMES } from "./art.mjs";

export const CITIES = [
  ["Hamburg", "Germany", 53.55, 9.99], ["Berlin", "Germany", 52.52, 13.4], ["Munich", "Germany", 48.14, 11.58], ["Rome", "Italy", 41.9, 12.5],
  ["Florence", "Italy", 43.77, 11.25], ["Lisbon", "Portugal", 38.72, -9.14], ["Barcelona", "Spain", 41.39, 2.17], ["Paris", "France", 48.86, 2.35],
  ["Vienna", "Austria", 48.21, 16.37], ["Zurich", "Switzerland", 47.37, 8.54], ["Copenhagen", "Denmark", 55.68, 12.57], ["Amsterdam", "Netherlands", 52.37, 4.9],
  ["Prague", "Czechia", 50.08, 14.44], ["Athens", "Greece", 37.98, 23.73], ["Edinburgh", "United Kingdom", 55.95, -3.19], ["Reykjavik", "Iceland", 64.15, -21.94],
];
export const PEOPLE = ["Anna", "Ben", "Clara", "David", "Emma", "Felix", "Greta", "Hannah", "Jonas", "Lea", "", ""].map((name, i) => ({ id: "p" + i, name }));
const ASPECTS = [4 / 3, 4 / 3, 3 / 2, 3 / 2, 16 / 9, 3 / 4, 2 / 3, 1, 4 / 5, 9 / 16];
const START = { y: 2019, m: 0 }, END = { y: 2026, m: 10 };

export const months = []; // [{ year, month, iso, count }]
export const assets = [];
for (let y = END.y; y >= START.y; y--) for (let m = y === END.y ? END.m : 11; m >= (y === START.y ? START.m : 0); m--) {
  const mi = months.length, r = rng(`m${y}-${m}`), count = Math.round(30 + r() * 150 + (y >= 2024 ? 60 : 0) + (m === 7 || m === 11 ? 80 : 0));
  months.push({ year: y, month: m, iso: new Date(Date.UTC(y, m, 1)).toISOString(), count });
  const theme0 = (mi * 3) % THEMES.length, city0 = Math.floor(r() * CITIES.length);
  for (let k = 0; k < count; k++) {
    const a = rng(`a${y}-${m}-${k}`), day = 1 + Math.floor((k / count) * 27), t = new Date(Date.UTC(y, m, day, 8 + Math.floor(a() * 12), Math.floor(a() * 60)));
    const isVideo = a() < 0.07, theme = a() < 0.4 ? theme0 : Math.floor(a() * THEMES.length);
    const withPlace = a() < 0.45, city = withPlace ? (a() < 0.7 ? city0 : Math.floor(a() * CITIES.length)) : -1;
    const person = a() < 0.3 ? Math.floor(a() * 10) : -1;
    assets.push({
      id: `d${mi}_${k}`, mi, theme, ratio: ASPECTS[Math.floor(a() * ASPECTS.length)], isVideo, duration: isVideo ? 4000 + Math.floor(a() * 70000) : null,
      isFavorite: a() < 0.06, live: !isVideo && a() < 0.1, date: t.toISOString(), city,
      lat: city >= 0 ? CITIES[city][2] + (a() - 0.5) * 0.12 : null, lon: city >= 0 ? CITIES[city][3] + (a() - 0.5) * 0.12 : null, person,
      name: `${isVideo ? "VID" : "IMG"}_${String(1000 + ((mi * 191 + k * 7) % 9000))}.${isVideo ? "MOV" : "JPG"}`,
    });
  }
}
export const byId = new Map(assets.map((a) => [a.id, a]));

export const ALBUMS = [
  { id: "al1", name: "Summer in Italy", match: (a) => a.city >= 3 && a.city <= 4 && a.mi < 60 && a.mi > 50 },
  { id: "al2", name: "Weekend trips", match: (a) => a.city >= 0 && a.theme === 1 },
  { id: "al3", name: "Hiking", match: (a) => a.theme === 0 || a.theme === 3 },
  { id: "al4", name: "Sunsets", match: (a) => a.theme === 4 },
  { id: "al5", name: "City lights", match: (a) => a.theme === 2 },
  { id: "al6", name: "Family", match: (a) => a.person >= 0 && a.person < 4 },
  { id: "al7", name: "Night sky", match: (a) => a.theme === 6 },
].map((al) => ({ ...al, assets: assets.filter(al.match) })).filter((al) => al.assets.length);

/** Columnar response of /timeline/bucket for the given assets (newest first). */
// every 4th photo belongs to a "partner" (shows the shared-library badge)
const ownerOf = (a) => (parseInt(String(a.id).replace(/\D/g, "") || "0", 10) % 4 === 0 ? "partner" : "demo-user");
export function columnar(list) {
  const col = (f) => list.map(f);
  return {
    id: col((a) => a.id), ownerId: col((a) => ownerOf(a)), ratio: col((a) => a.ratio), isFavorite: col((a) => a.isFavorite), visibility: col(() => "timeline"),
    isTrashed: col(() => false), isImage: col((a) => !a.isVideo), thumbhash: col(() => null), createdAt: col((a) => a.date), fileCreatedAt: col((a) => a.date),
    localOffsetHours: col(() => 0), duration: col((a) => a.duration), stack: col(() => null), projectionType: col(() => null), livePhotoVideoId: col((a) => (a.live ? "live" : null)),
    city: col((a) => (a.city >= 0 ? CITIES[a.city][0] : null)), country: col((a) => (a.city >= 0 ? CITIES[a.city][1] : null)), latitude: col((a) => a.lat), longitude: col((a) => a.lon),
  };
}
export const asDto = (a) => ({
  id: a.id, ownerId: ownerOf(a), type: a.isVideo ? "VIDEO" : "IMAGE", originalFileName: a.name, localDateTime: a.date, fileCreatedAt: a.date, duration: a.duration, isFavorite: a.isFavorite,
  width: Math.round(1600 * Math.max(1, a.ratio)), height: Math.round((1600 * Math.max(1, a.ratio)) / a.ratio), livePhotoVideoId: a.live ? "live" : null, thumbhash: null,
  originalMimeType: a.isVideo ? "video/quicktime" : "image/jpeg", owner: { name: "Demo User" },
  exifInfo: { make: "Demo", model: "Camera X1", lensModel: "35mm f/1.8", fNumber: 1.8, exposureTime: "1/250", iso: 100, focalLength: 35, fileSizeInByte: 4300000 + (a.mi * 7919) % 3000000,
    exifImageWidth: 6000, exifImageHeight: Math.round(6000 / a.ratio), city: a.city >= 0 ? CITIES[a.city][0] : null, country: a.city >= 0 ? CITIES[a.city][1] : null, latitude: a.lat, longitude: a.lon },
});
