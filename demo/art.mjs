// Procedurally generated dummy pictures (SVG) – no real photos involved.
function rng(seed) { // small deterministic PRNG (mulberry32) seeded from a string
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
export const THEMES = ["mountains", "beach", "city", "forest", "sunset", "meadow", "night"];

/** Landscape-ish picture for a theme; `ratio` = width/height. */
export function picture(id, theme, ratio) {
  const r = rng(id), W = 600, H = Math.round(W / ratio), px = (x) => (x * W) / 600, py = (y) => (y * H) / 400;
  const hue = r() * 40 - 20, parts = [];
  const sky = (a, b) => `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#s)"/>`;
  const sun = (cx, cy, rad, col) => `<circle cx="${px(cx)}" cy="${py(cy)}" r="${py(rad)}" fill="${col}"/>`;
  const hills = (n, base, amp, col, lightStep) => { let out = ""; for (let k = 0; k < n; k++) { const y0 = base + k * 40; let d = `M0 ${H}`; for (let x = 0; x <= 600; x += 50) d += ` L${px(x)} ${py(y0 - amp * r() * (k + 1) / n)}`; d += ` L${W} ${H} Z`; out += `<path d="${d}" fill="${hsl(col[0] + hue, col[1], col[2] - k * lightStep)}"/>`; } return out; };
  switch (theme) {
    case "mountains": {
      parts.push(sky(hsl(205 + hue, 70, 62), hsl(30 + hue, 80, 85)), sun(120 + r() * 360, 110, 28, "#fff7d6"));
      let far = `M0 ${H}`; for (let x = 0; x <= 600; x += 60) far += ` L${px(x)} ${py(150 + r() * 90)}`; far += ` L${W} ${H} Z`;
      parts.push(`<path d="${far}" fill="${hsl(215 + hue, 25, 62)}"/>`, hills(2, 270, 120, [220, 22, 40], 8));
      break; }
    case "beach":
      parts.push(sky(hsl(195 + hue, 80, 68), hsl(190 + hue, 70, 88)), sun(480, 90, 30, "#fffbe0"),
        `<rect y="${py(190)}" width="${W}" height="${py(120)}" fill="${hsl(200 + hue, 70, 48)}"/>`,
        `<path d="M0 ${py(300)} Q${px(150)} ${py(280)} ${px(300)} ${py(300)} T${W} ${py(295)} L${W} ${H} L0 ${H} Z" fill="${hsl(42 + hue, 60, 78)}"/>`);
      break;
    case "city": {
      parts.push(sky(hsl(250 + hue, 45, 25), hsl(15 + hue, 85, 62)));
      for (let x = 0, k = 0; x < 600; x += 40 + r() * 30, k++) {
        const w = 36 + r() * 36, h = 90 + r() * 200, col = hsl(235 + hue, 25, 14 + (k % 3) * 5);
        parts.push(`<rect x="${px(x)}" y="${py(400 - h)}" width="${px(w)}" height="${py(h) + 5}" fill="${col}"/>`);
        for (let wy = 400 - h + 12; wy < 390; wy += 22) for (let wx = x + 6; wx < x + w - 6; wx += 12) if (r() > 0.55) parts.push(`<rect x="${px(wx)}" y="${py(wy)}" width="${px(5)}" height="${py(8)}" fill="#ffd77a"/>`);
      }
      break; }
    case "forest": {
      parts.push(sky(hsl(150 + hue, 40, 75), hsl(100 + hue, 45, 88)));
      for (let k = 0; k < 3; k++) for (let x = -20 + k * 15; x < 640; x += 38 + r() * 14) {
        const h = 120 + r() * 120 + k * 20, y = 250 + k * 45, w = h * 0.38;
        parts.push(`<path d="M${px(x)} ${py(y)} l${px(w / 2)} ${-py(h)} l${px(w / 2)} ${py(h)} Z" fill="${hsl(140 + hue + r() * 20, 45, 22 + k * 9)}"/>`);
      }
      break; }
    case "sunset":
      parts.push(sky(hsl(285 + hue, 50, 38), hsl(20 + hue, 95, 62)), sun(300, 240, 46, "#ffe9a8"), hills(2, 300, 70, [275, 35, 20], 6));
      break;
    case "meadow": {
      parts.push(sky(hsl(205 + hue, 75, 70), hsl(200 + hue, 70, 92)), hills(3, 240, 80, [105, 50, 48], 9));
      for (let k = 0; k < 70; k++) parts.push(`<circle cx="${px(r() * 600)}" cy="${py(270 + r() * 130)}" r="${py(3 + r() * 4)}" fill="${hsl(r() * 360, 85, 62)}"/>`);
      break; }
    default: { // night
      parts.push(sky(hsl(235 + hue, 55, 10), hsl(255 + hue, 45, 24)), sun(460, 90, 24, "#f4f1de"));
      for (let k = 0; k < 90; k++) parts.push(`<circle cx="${px(r() * 600)}" cy="${py(r() * 260)}" r="${(r() * 1.6 + 0.4).toFixed(1)}" fill="#fff" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`);
      parts.push(hills(2, 320, 60, [240, 30, 8], 3));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${parts.join("")}</svg>`;
}

/** Cartoon face avatar for the "People" screens. */
export function avatar(id) {
  const r = rng("p" + id), skin = hsl(18 + r() * 20, 55, 70 + r() * 12), hair = hsl(r() * 60, 45, 12 + r() * 32), bg = hsl(r() * 360, 45, 82);
  const long = r() > 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/>
  ${long ? `<rect x="42" y="60" width="116" height="120" rx="50" fill="${hair}"/>` : ""}
  <ellipse cx="100" cy="190" rx="70" ry="48" fill="${hsl(r() * 360, 50, 55)}"/>
  <circle cx="100" cy="98" r="48" fill="${skin}"/>
  <path d="M50 92 Q52 44 100 42 Q148 44 150 92 Q130 66 100 66 Q70 66 50 92 Z" fill="${hair}"/>
  <circle cx="82" cy="102" r="5" fill="#2b2b2b"/><circle cx="118" cy="102" r="5" fill="#2b2b2b"/>
  <path d="M82 122 Q100 138 118 122" stroke="#8a3b3b" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
}
export { rng };
