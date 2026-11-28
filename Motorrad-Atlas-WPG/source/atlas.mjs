import { createSky } from './sky.mjs';
import { distanceMeters, splitTrack } from './track.mjs';

const GERMANY = [[47.27, 5.85], [55.06, 15.05]];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const EARTH_CIRCUMFERENCE_METERS = 40075017;
const ACCENT = { night: '#ff6a2b', day: '#e24e17' };

export function createAtlas(element, { theme = 'night', reveal = 200, motion = true, insets = () => ({}) } = {}) {
  const L = window.L;
  const map = L.map(element, {
    minZoom: 4, maxZoom: 18, zoomSnap: .25, zoomDelta: .5, wheelPxPerZoomLevel: 110,
    zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
    zoomControl: false, attributionControl: false,
  });
  L.control.attribution({ position: 'topright', prefix: false }).addTo(map);
  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap-Mitwirkende</a>',
  }).addTo(map);

  // The sky gets its own pane: above the tiles, below planned routes and pins.
  const pane = map.createPane('sky');
  pane.style.zIndex = 350;
  pane.style.pointerEvents = 'none';
  const canvas = L.DomUtil.create('canvas', 'sky-canvas', pane);
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  const sky = createSky(map);
  sky.setTheme(theme);
  sky.setMotion(motion);

  let currentTheme = theme;
  let revealMeters = reveal;
  let motionOn = motion;
  let segments = [];
  let riderMarker = null;
  let dirty = true;
  let suspended = false;
  let last = 0;

  function pad() {
    const i = { top: 80, right: 16, bottom: 16, left: 16, ...insets() };
    return { paddingTopLeft: [i.left, i.top], paddingBottomRight: [i.right, i.bottom] };
  }

  function strokePath(pixels) {
    ctx.beginPath();
    ctx.moveTo(pixels[0].x, pixels[0].y);
    for (let i = 1; i < pixels.length; i++) ctx.lineTo(pixels[i].x, pixels[i].y);
    ctx.stroke();
  }

  function draw(now) {
    const { x: width, y: height } = map.getSize();
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.clearRect(0, 0, width, height);

    const lines = segments.map(({ points, highlighted }) => ({
      highlighted, pixels: points.map(p => map.latLngToContainerPoint([p.lat, p.lng])),
    }));
    const metersPerPixel = EARTH_CIRCUMFERENCE_METERS * Math.cos(map.getCenter().lat * Math.PI / 180) / (256 * 2 ** map.getZoom());
    const corridor = Math.max(6, 2 * revealMeters / metersPerPixel);

    // 1. Haze over unexplored land, 2. a feathered clear corridor along every ride.
    sky.drawHaze(ctx, width, height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#000';
    for (const [factor, alpha] of [[1.8, .25], [1.4, .5], [1, 1]]) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = corridor * factor;
      for (const { pixels } of lines) {
        if (pixels.length === 1) {
          ctx.beginPath(); ctx.arc(pixels[0].x, pixels[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
        } else strokePath(pixels);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 3. Floating clouds. Clouds touched by a ride are gone (or dissolving right now).
    sky.draw(ctx, width, height, now);

    // 4. Glowing ride trails.
    const accent = ACCENT[currentTheme] || ACCENT.night;
    for (const { pixels, highlighted } of lines) {
      if (pixels.length < 2) continue;
      ctx.globalAlpha = highlighted ? 1 : .72;
      ctx.shadowColor = accent;
      ctx.shadowBlur = highlighted ? 14 : 6;
      ctx.strokeStyle = accent;
      ctx.lineWidth = highlighted ? 4.5 : 2.5;
      strokePath(pixels);
      ctx.shadowBlur = 0;
      if (highlighted) {
        ctx.globalAlpha = .9;
        ctx.strokeStyle = '#ffe6d6';
        ctx.lineWidth = 1.3;
        strokePath(pixels);
      }
    }
    ctx.globalAlpha = 1;

  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || suspended) return;
    const animating = motionOn || sky.busy();
    if (!dirty && !animating) return;
    if (!dirty && now - last < 33) return;   // ~30 fps is plenty for drifting clouds and saves battery
    last = now;
    dirty = false;
    draw(now);
  }
  requestAnimationFrame(frame);
  const invalidate = () => { dirty = true; };
  map.on('move zoom resize viewreset', invalidate);
  map.fitBounds(GERMANY, { ...pad(), animate: false });

  function focusCenter(latlng, zoom) {
    const i = { top: 80, right: 0, bottom: 0, left: 0, ...insets() };
    const size = map.getSize();
    const visible = L.point((i.left + size.x - i.right) / 2, (i.top + size.y - i.bottom) / 2);
    const offset = visible.subtract(size.divideBy(2));
    return map.unproject(map.project(latlng, zoom).subtract(offset), zoom);
  }

  return {
    map,
    invalidate,
    suspend(on) { suspended = on; canvas.hidden = on; dirty = true; },
    showGermany(animate = motionOn) {
      if (animate) map.flyToBounds(GERMANY, { ...pad(), duration: 1.1 });
      else map.fitBounds(GERMANY, { ...pad(), animate: false });
    },
    showTracks(rides, highlightId) {
      segments = rides.flatMap(ride => splitTrack(ride.points).map(points => ({ points, highlighted: ride.id === highlightId })));
      segments.sort((a, b) => Number(a.highlighted) - Number(b.highlighted));
      sky.setTracks(segments.map(s => s.points), revealMeters);
      dirty = true;
    },
    fitTracks(rides, animate = motionOn) {
      const points = rides.flatMap(ride => ride.points.map(p => [p.lat, p.lng]));
      if (!points.length) return;
      const options = { ...pad(), maxZoom: 14 };
      if (animate) map.flyToBounds(points, { ...options, duration: 1 });
      else map.fitBounds(points, { ...options, animate: false });
    },
    fitBounds(bounds, animate = motionOn) {
      if (animate) map.flyToBounds(bounds, { ...pad(), maxZoom: 15, duration: .9 });
      else map.fitBounds(bounds, { ...pad(), maxZoom: 15, animate: false });
    },
    focus(latlng, zoom = map.getZoom(), animate = motionOn) {
      map.setView(focusCenter(latlng, zoom), zoom, { animate, duration: .6 });
    },
    // Rider puck as a marker so it sits above route lines. Heading rotates the cone.
    setRider(next) {
      if (!next) { riderMarker?.remove(); riderMarker = null; return; }
      if (!riderMarker) {
        riderMarker = L.marker([next.lat, next.lng], {
          icon: L.divIcon({ className: 'rider', html: '<span class="rider-cone"></span><span class="rider-pulse"></span><span class="rider-dot"></span>', iconSize: [96, 96], iconAnchor: [48, 48] }),
          interactive: false, keyboard: false, zIndexOffset: 1000,
        }).addTo(map);
      } else riderMarker.setLatLng([next.lat, next.lng]);
      const el = riderMarker.getElement();
      if (el) {
        el.classList.toggle('has-heading', Number.isFinite(next.heading));
        el.style.setProperty('--heading', (Number.isFinite(next.heading) ? next.heading : 0) + 'deg');
      }
    },
    // Navigation camera: rider sits behind the screen centre, looking in riding direction.
    follow(latlng, zoom, heading = 0, lookahead = 120, animate = true) {
      const size = map.getSize();
      const i = { top: 0, bottom: 0, left: 0, right: 0, ...insets() };
      const visibleCenter = L.point((i.left + size.x - i.right) / 2, (i.top + size.y - i.bottom) / 2);
      const h = heading * Math.PI / 180;
      const riderAt = visibleCenter.subtract(L.point(Math.sin(h) * lookahead, -Math.cos(h) * lookahead));
      const center = map.unproject(map.project(latlng, zoom).subtract(riderAt.subtract(size.divideBy(2))), zoom);
      if (!animate || Math.abs(map.getZoom() - zoom) > .01) map.setView(center, zoom, { animate: false });
      else map.panTo(center, { animate: true, duration: .9, easeLinearity: 1, noMoveStart: true });
    },
    setTheme(name) { currentTheme = name; sky.setTheme(name); dirty = true; },
    setMotion(on) { motionOn = on; sky.setMotion(on); dirty = true; },
    setReveal(meters) {
      revealMeters = meters;
      sky.setTracks(segments.map(s => s.points), revealMeters);
      dirty = true;
    },
    // Share of a planned route that leads through still clouded land.
    unexploredShare(latlngs) {
      if (latlngs.length < 2) return null;
      let total = 0, fresh = 0, carry = 0;
      for (let i = 1; i < latlngs.length; i++) {
        carry += distanceMeters(latlngs[i - 1], latlngs[i]);
        if (carry < 150 && i < latlngs.length - 1) continue;
        total += carry;
        if (!sky.nearTrack(latlngs[i].lat, latlngs[i].lng, revealMeters)) fresh += carry;
        carry = 0;
      }
      return total ? fresh / total : null;
    },
  };
}
