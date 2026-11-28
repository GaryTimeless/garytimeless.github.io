// Sky layer: soft cumulus sprites anchored to the map that dissolve where you have ridden.
// Clouds live on one world grid per zoom level. They stay put while panning, grow while
// zooming and cross-fade into the next level, like descending through a cloud deck.

const CELL = 118;               // grid spacing of one cloud level, in screen pixels at its native zoom
const SPRITE_W = 360;
const SPRITE_H = 220;
const VARIANTS = 8;
const DISSOLVE_MS = 1100;
const DENSITY = 0.8;            // share of grid cells that carry a cloud
const CLEAR_CORE = 0.4;         // a cloud vanishes when a ride passes within this share of its radius
const BUCKET = 0.004;           // spatial index bucket in Web-Mercator zoom-0 units (~400 m in DE)
const EARTH = 40075016.686;

export const PALETTES = {
  night: { light: '#ffffff', mid: '#dde1f2', shade: '#8189ad', rim: 'rgba(255,255,255,.8)', shadow: 'rgba(0,2,10,.6)', haze: 'rgba(6,9,20,.46)', alpha: .93 },
  day:   { light: '#ffffff', mid: '#f3f6fb', shade: '#aebbd0', rim: 'rgba(255,255,255,.95)', shadow: 'rgba(20,38,70,.26)', haze: 'rgba(228,235,246,.42)', alpha: .97 },
};

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Web Mercator at zoom 0 (256 units around the world) without touching Leaflet.
export function project0(lat, lng) {
  const phi = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
  return [(lng + 180) / 360 * 256, (0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)) * 256];
}
export function latOf(y0) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y0 / 256))) * 180 / Math.PI; }
const metersPerUnit = lat => EARTH * Math.cos(lat * Math.PI / 180) / 256;

export function segmentDistance(px, py, s) {
  const dx = s[2] - s[0], dy = s[3] - s[1];
  const l = dx * dx + dy * dy;
  let t = l ? ((px - s[0]) * dx + (py - s[1]) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = s[0] + t * dx - px, ey = s[1] + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

// Spatial index of ridden segments. Pure maths, testable in Node.
export function createTrackIndex() {
  let segs = [];
  let grid = null;
  let long = [];
  return {
    get empty() { return !segs.length; },
    set(segments) {
      segs = []; grid = null; long = [];
      for (const points of segments) {
        const p = points.map(pt => project0(pt.lat, pt.lng));
        if (p.length === 1) segs.push([p[0][0], p[0][1], p[0][0], p[0][1]]);
        for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
      }
      if (!segs.length) return;
      grid = new Map();
      segs.forEach((s, index) => {
        const i0 = Math.floor(Math.min(s[0], s[2]) / BUCKET), i1 = Math.floor(Math.max(s[0], s[2]) / BUCKET);
        const j0 = Math.floor(Math.min(s[1], s[3]) / BUCKET), j1 = Math.floor(Math.max(s[1], s[3]) / BUCKET);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) { long.push(index); return; }
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const key = i * 70000 + j;
          const list = grid.get(key);
          if (list) list.push(index); else grid.set(key, [index]);
        }
      });
    },
    // Distance (zoom-0 units) to the closest ridden segment, searched up to radius r.
    nearest(x, y, r) {
      if (!grid) return Infinity;
      let best = Infinity;
      const i0 = Math.floor((x - r) / BUCKET), i1 = Math.floor((x + r) / BUCKET);
      const j0 = Math.floor((y - r) / BUCKET), j1 = Math.floor((y + r) / BUCKET);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 2500) {
        for (const s of segs) { const d = segmentDistance(x, y, s); if (d < best) best = d; }
        return best;
      }
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const list = grid.get(i * 70000 + j);
        if (list) for (const index of list) { const d = segmentDistance(x, y, segs[index]); if (d < best) best = d; }
      }
      for (const index of long) { const d = segmentDistance(x, y, segs[index]); if (d < best) best = d; }
      return best;
    },
    nearTrack(lat, lng, meters) {
      const [x, y] = project0(lat, lng);
      const r = meters / metersPerUnit(lat);
      return this.nearest(x, y, r) <= r;
    },
  };
}

// One cumulus sprite: soft puffs, lit from the upper left, flat shaded base.
function buildCloud(seed, pal) {
  const r = mulberry32(seed);
  const c = makeCanvas(SPRITE_W, SPRITE_H);
  const g = c.getContext('2d');
  const base = SPRITE_H * .72;
  const span = SPRITE_W * (.5 + r() * .18);
  const x0 = (SPRITE_W - span) / 2;
  const puffs = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const bell = Math.sin(Math.PI * (.12 + t * .76));
    const rad = (26 + bell * 46) * (.8 + r() * .4);
    puffs.push({ x: x0 + t * span + (r() - .5) * 16, y: base - rad * .62 - bell * 10, r: rad });
  }
  const tops = 1 + Math.floor(r() * 2);
  for (let k = 0; k < tops; k++) puffs.push({ x: SPRITE_W / 2 + (r() - .5) * span * .45, y: base - 84 - r() * 18, r: 30 + r() * 20 });

  for (const p of puffs) {
    const grad = g.createRadialGradient(p.x, p.y, p.r * .45, p.x, p.y, p.r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(.72, 'rgba(255,255,255,.88)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
  }
  // A soft slab fuses the puffs into one body.
  g.save();
  g.translate(SPRITE_W / 2, base - 14);
  g.scale(1, .28);
  const slab = g.createRadialGradient(0, 0, span * .2, 0, 0, span * .58);
  slab.addColorStop(0, 'rgba(255,255,255,1)');
  slab.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = slab;
  g.beginPath(); g.arc(0, 0, span * .58, 0, Math.PI * 2); g.fill();
  g.restore();

  // Volume shading keeps the alpha and recolours the body.
  g.globalCompositeOperation = 'source-atop';
  const body = g.createLinearGradient(0, base - 150, 0, base + 8);
  body.addColorStop(0, pal.light);
  body.addColorStop(.5, pal.mid);
  body.addColorStop(1, pal.shade);
  g.fillStyle = body;
  g.fillRect(0, 0, SPRITE_W, SPRITE_H);
  for (const p of puffs) {
    const hx = p.x - p.r * .3, hy = p.y - p.r * .42;
    const hl = g.createRadialGradient(hx, hy, 0, hx, hy, p.r * .85);
    hl.addColorStop(0, pal.rim);
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, SPRITE_W, SPRITE_H);
  }
  // Flatten and soften the base.
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, base - 6, 0, base + 18);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut;
  g.fillRect(0, base - 6, SPRITE_W, SPRITE_H);
  return c;
}

// Tiny silhouette; scaling it up with smoothing gives a free, very soft blur.
function buildShadow(cloud, pal) {
  const s = makeCanvas(36, 22);
  const g = s.getContext('2d');
  g.drawImage(cloud, 0, 0, 36, 22);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = pal.shadow;
  g.fillRect(0, 0, 36, 22);
  return s;
}

export function createSky(map) {
  let palette = PALETTES.night;
  let sprites = [];
  let shadows = [];
  let motion = true;
  let revealMeters = 200;
  const index = createTrackIndex();
  const cache = new Map();
  const lastState = new Map();
  const dying = new Map();

  function setTheme(name) {
    palette = PALETTES[name] || PALETTES.night;
    sprites = []; shadows = [];
    for (let i = 0; i < VARIANTS; i++) {
      const cloud = buildCloud(9001 + i * 7919, palette);
      sprites.push(cloud);
      shadows.push(buildShadow(cloud, palette));
    }
  }
  setTheme('night');

  function cloudAt(L, cx, cy) {
    const r = mulberry32(hash3(L, cx, cy));
    if (r() > DENSITY) return null;
    return {
      jx: .15 + r() * .7, jy: .15 + r() * .7, size: .55 + r() * .5,
      variant: Math.floor(r() * VARIANTS), phase: r() * Math.PI * 2,
      period: 9 + r() * 12, alt: .4 + r() * .6, flip: r() < .5,
    };
  }

  function isCleared(L, cx, cy, c) {
    const scale = 2 ** L;
    const x0 = (cx + c.jx) * CELL / scale, y0 = (cy + c.jy) * CELL / scale;
    const reveal0 = revealMeters / metersPerUnit(latOf(y0));
    const r0 = CELL * 1.5 * c.size * .5 / scale;
    const limit = reveal0 + r0 * CLEAR_CORE;
    return index.nearest(x0, y0, limit) < limit;
  }

  function draw(ctx, w, h, now) {
    const z = map.getZoom();
    const L0 = Math.floor(z);
    const f = z - L0;
    const fade = smooth((f - .55) / .45);
    const origin = map.getPixelBounds().min;
    const t = motion ? now / 1000 : 0;
    const items = [];
    if (lastState.size > 6000) lastState.clear();

    for (const [L, layerAlpha] of [[L0, 1 - fade], [L0 + 1, fade]]) {
      if (layerAlpha < .02) continue;
      const k = 2 ** (z - L);
      const cs = CELL * k;
      const maxCell = Math.ceil(256 * 2 ** L / CELL);
      const cx0 = Math.max(0, Math.floor((origin.x - cs) / cs)), cx1 = Math.min(maxCell, Math.floor((origin.x + w + cs) / cs));
      const cy0 = Math.max(0, Math.floor((origin.y - cs) / cs)), cy1 = Math.min(maxCell, Math.floor((origin.y + h + cs) / cs));
      const grow = L === L0 ? 1 + fade * .35 : 1;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = cloudAt(L, cx, cy);
        if (!c) continue;
        const key = L + ':' + cx + ':' + cy;
        let cleared = false;
        if (!index.empty) {
          cleared = cache.get(key);
          if (cleared === undefined) { cleared = isCleared(L, cx, cy, c); cache.set(key, cleared); }
        }
        const prev = lastState.get(key);
        lastState.set(key, cleared);
        let e = -1;
        if (cleared) {
          if (prev === false && motion && layerAlpha > .4) dying.set(key, now);
          const start = dying.get(key);
          if (start === undefined) continue;
          e = (now - start) / DISSOLVE_MS;
          if (e >= 1) { dying.delete(key); continue; }
        } else dying.delete(key);

        const w0 = CELL * 1.5 * c.size * k * grow;
        let scale = 1, alpha = layerAlpha * palette.alpha, lift = 0;
        if (motion) scale += Math.sin(t * 2 * Math.PI / (c.period * 1.7) + c.phase) * .018;
        if (e >= 0) { alpha *= (1 - e) ** 1.6; scale *= 1 + e * .45; lift = e * 18; }
        const bx = motion ? Math.sin(t * 2 * Math.PI / c.period + c.phase) * 6 : 0;
        const by = motion ? Math.cos(t * 2 * Math.PI / (c.period * 1.25) + c.phase) * 3 : 0;
        items.push({
          c, e, alpha, x: (cx + c.jx) * cs - origin.x + bx, y: (cy + c.jy) * cs - origin.y + by - lift,
          w: w0 * scale, h: w0 * scale * SPRITE_H / SPRITE_W,
        });
      }
    }
    items.sort((a, b) => a.c.alt - b.c.alt);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (const it of items) {
      const off = it.c.alt * it.w * .14;
      ctx.globalAlpha = it.alpha * (it.e >= 0 ? .45 : .8);
      ctx.drawImage(shadows[it.c.variant], it.x - it.w * .52 + off, it.y - it.h * .38 + off * 1.5, it.w * 1.05, it.h);
    }
    for (const it of items) {
      ctx.globalAlpha = it.alpha;
      const img = sprites[it.c.variant];
      if (it.c.flip) {
        ctx.save(); ctx.translate(it.x, 0); ctx.scale(-1, 1);
        ctx.drawImage(img, -it.w / 2, it.y - it.h / 2, it.w, it.h);
        ctx.restore();
      } else ctx.drawImage(img, it.x - it.w / 2, it.y - it.h / 2, it.w, it.h);
      if (it.e >= 0) {
        // Burst: small puffs drift apart while the cloud thins out.
        for (let p = 0; p < 6; p++) {
          const ang = p * 1.047 + it.c.phase;
          const dist = it.e * it.w * .55;
          const s = it.w * (.22 + .08 * (p % 2)) * (1 - it.e * .3);
          ctx.globalAlpha = (1 - it.e) ** 2 * it.alpha * .85;
          ctx.drawImage(sprites[(it.c.variant + p) % VARIANTS], it.x + Math.cos(ang) * dist - s / 2,
            it.y + Math.sin(ang) * dist * .6 - it.e * 12 - s * .3, s, s * SPRITE_H / SPRITE_W);
        }
      }
    }
    ctx.restore();
  }

  return {
    setTheme, draw,
    drawHaze(ctx, w, h) { ctx.fillStyle = palette.haze; ctx.fillRect(0, 0, w, h); },
    setTracks(segments, meters) { revealMeters = meters; cache.clear(); index.set(segments); },
    nearTrack: (lat, lng, meters = revealMeters) => index.nearTrack(lat, lng, meters),
    setMotion(on) { motion = on; if (!on) dying.clear(); },
    busy: () => dying.size > 0,
  };
}
