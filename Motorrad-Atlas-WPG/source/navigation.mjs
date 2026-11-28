import { announcement, createTracker, formatDistance, formatDuration, instruction, instructionParts, maneuverIcon } from './nav.mjs';
import { fetchRoute } from './route.mjs';
import { distanceMeters } from './track.mjs';

const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const REROUTE_GAP_MS = 8000;
const SIM_TICK_MS = 250;        // one simulated second every 250 ms (4x speed)

function iconSvg(icon) {
  if (icon.kind === 'flag') return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 42V6M12 8h22l-5 7 5 7H12"/></svg>';
  if (icon.kind === 'uturn') return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 42V18a8 8 0 0 1 16 0v14"/><path d="M25 26l7 7 7-7"/></svg>';
  if (icon.kind === 'roundabout') return '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="22" r="8"/><path d="M24 42V30M30 16l7-7M31 9h6v6"/><text x="24" y="26" text-anchor="middle" font-size="11" font-weight="800" stroke="none" fill="currentColor">' + (icon.exit || '') + '</text></svg>';
  return '<svg viewBox="0 0 48 48" aria-hidden="true" style="transform: rotate(' + icon.angle + 'deg)"><path d="M24 42V8M12 20L24 8l12 12"/></svg>';
}

export function createNavigation(atlas, { subscribeGps, onTrail = () => {}, onEnd = () => {}, insetsChanged = () => {}, toast = () => {} }) {
  const L = window.L;
  const { map } = atlas;
  const $ = id => document.getElementById(id);
  const layers = L.layerGroup();
  const casing = L.polyline([], { color: '#04101f', weight: 13, opacity: .55, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(layers);
  const line = L.polyline([], { color: '#5cd2ff', weight: 7, opacity: 1, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(layers);
  const nextDot = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 3, fillColor: '#04101f', fillOpacity: 1, interactive: false }).addTo(layers);
  const flag = L.marker([0, 0], { icon: L.divIcon({ className: 'pin pin-end', html: '<span><i>Z</i></span>', iconSize: [38, 46], iconAnchor: [19, 44] }), interactive: false, keyboard: false }).addTo(layers);
  let s = null;
  let voiceOn = localStorage.getItem('wpg-atlas-voice') !== 'off';
  let germanVoice = null;

  // ---------- voice ----------
  function pickVoice() {
    const voices = window.speechSynthesis?.getVoices() || [];
    germanVoice = voices.find(v => v.lang === 'de-DE' && /google|anna|helena|katja|petra/i.test(v.name)) || voices.find(v => v.lang?.startsWith('de')) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
  function speak(text, force = false) {
    if ((!voiceOn && !force) || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (germanVoice) u.voice = germanVoice;
    u.rate = 1.03;
    speechSynthesis.speak(u);
  }
  function setVoice(on) {
    voiceOn = on;
    localStorage.setItem('wpg-atlas-voice', on ? 'on' : 'off');
    $('nav-voice').setAttribute('aria-pressed', String(on));
    $('nav-voice').setAttribute('aria-label', on ? 'Sprachansagen ausschalten' : 'Sprachansagen einschalten');
    if (!on) window.speechSynthesis?.cancel();
    const pref = $('voice-pref');
    if (pref) pref.checked = on;
  }

  // ---------- HUD ----------
  function renderHud(p, fix) {
    const step = p.step;
    const icon = maneuverIcon(step);
    const iconKey = icon.kind + icon.angle + (icon.exit || '');
    if ($('nav-icon').dataset.key !== iconKey) { $('nav-icon').innerHTML = iconSvg(icon); $('nav-icon').dataset.key = iconKey; }
    const { action, road } = instructionParts(step);
    $('nav-dist').textContent = p.arrived ? '' : formatDistance(p.distanceToNext);
    $('nav-action').textContent = p.arrived ? 'Ziel erreicht' : action;
    $('nav-road').textContent = p.arrived ? s.destinationName : road;
    let then = '';
    if (!p.arrived && p.following && s.tracker.stepAlong[p.stepIndex + 1] - s.tracker.stepAlong[p.stepIndex] < 400) then = 'Danach: ' + instruction(p.following);
    $('nav-then').textContent = then;
    $('nav-then').hidden = !then;
    $('nav-card').classList.toggle('is-close', !p.arrived && p.distanceToNext < 150);
    $('nav-card').classList.toggle('is-arrived', p.arrived);
    $('nav-arrival').textContent = clock.format(Date.now() + p.remainingSeconds * 1000);
    $('nav-remaining').textContent = formatDistance(p.remaining);
    $('nav-left').textContent = formatDuration(p.remainingSeconds);
    $('nav-speed').textContent = Number.isFinite(fix.speed) ? Math.round(fix.speed * 3.6) : '–';
    $('nav-offroute').hidden = !p.offRoute || p.arrived;
    $('nav-offroute').textContent = s.rerouting ? 'Neue Route wird berechnet …' : 'Abseits der Route';
    $('nav-end').textContent = p.arrived ? 'Fertig' : 'Beenden';
  }

  function drawRemaining(p) {
    const coords = s.coords;
    const remaining = [p.snapped];
    for (let i = s.lastSeg + 1; i < coords.length; i++) remaining.push(coords[i]);
    line.setLatLngs(remaining);
    casing.setLatLngs(remaining);
    if (p.step && !p.arrived) nextDot.setLatLng([p.step.lat, p.step.lng]).setStyle({ opacity: 1, fillOpacity: 1 });
    else nextDot.setStyle({ opacity: 0, fillOpacity: 0 });
  }

  function camera(position, heading, speed) {
    if (!s.follow) return;
    const kmh = (speed || 0) * 3.6;
    let zoom = kmh < 35 ? 16.5 : kmh < 75 ? 15.75 : 15;
    if (s.progress && s.progress.distanceToNext < 250) zoom = Math.max(zoom, 16.5);
    atlas.follow(position, zoom, heading, Math.min(innerHeight * .2, 160), Boolean(s.simulate) ? false : true);
  }

  // ---------- fixes ----------
  function onFix(fix) {
    if (!s) return;
    if (s.lastFix && !Number.isFinite(fix.speed) && fix.time > s.lastFix.time) fix.speed = distanceMeters(s.lastFix, fix) / (fix.time - s.lastFix.time);
    s.lastFix = fix;
    const p = s.tracker.update(fix);
    s.progress = p;
    s.lastSeg = p.segment;
    if (p.passedVias > s.passed) s.passed = p.passedVias;

    if (p.offRoute && !p.arrived) {
      s.offCount++;
      if (s.offCount >= 2 && !s.rerouting && Date.now() - s.lastReroute > REROUTE_GAP_MS) reroute(fix);
    } else s.offCount = 0;

    const moving = (fix.speed || 0) > 1.5;
    let heading = s.heading;
    if (Number.isFinite(fix.heading) && moving) heading = fix.heading;
    else if (!p.offRoute) heading = p.routeHeading;
    s.heading = heading;
    const shown = p.offRoute ? { lat: fix.lat, lng: fix.lng } : p.snapped;
    atlas.setRider({ ...shown, heading });
    drawRemaining(p);
    renderHud(p, fix);
    camera(shown, heading, fix.speed);
    if (s.simulate) onTrail({ lat: fix.lat, lng: fix.lng, time: null });

    const prompt = announcement(p, fix.speed, s.spoken);
    if (prompt) {
      s.spoken.add(prompt.key);
      speak(prompt.text);
      if (prompt.key.endsWith('now') || prompt.key === 'arrive') navigator.vibrate?.([40, 60, 40]);
    }
    if (p.arrived && !s.arrived) {
      s.arrived = true;
      if (s.simulate) stopSimulation();
    }
  }

  async function reroute(fix) {
    s.rerouting = true;
    s.lastReroute = Date.now();
    const session = s;
    const targets = session.targets.slice(session.passed);
    const request = new AbortController();
    session.rerouteController = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    speak('Route wird neu berechnet.');
    try {
      const fresh = await fetchRoute([{ lat: fix.lat, lng: fix.lng }, ...targets], { avoidMotorways: session.avoidMotorways, signal: request.signal });
      if (s !== session || request.signal.aborted) return;
      s.targets = targets;
      s.passed = 0;
      useRoute(fresh);
      toast('Neue Route · ' + formatDistance(fresh.distance));
    } catch {
      if (s === session) toast('Neuberechnung fehlgeschlagen. Neuer Versuch gleich.');
    } finally {
      clearTimeout(timeout);
      if (s === session) { s.rerouting = false; s.rerouteController = null; }
    }
  }

  function useRoute(route) {
    s.route = route;
    s.coords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    s.tracker = createTracker(route);
    s.lastSeg = 0;
    s.offCount = 0;
    const keepArrive = s.spoken.has('arrive');
    s.spoken = new Set(keepArrive ? ['arrive'] : []);
    flag.setLatLng(s.coords.at(-1));
  }

  // ---------- simulation ----------
  function startSimulation() {
    const coords = s.coords;
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distanceMeters(coords[i - 1], coords[i]));
    let along = 0, seg = 0, t = Date.now() / 1000;
    s.simTimer = setInterval(() => {
      if (!s) return;
      const speed = 19 + 6 * Math.sin(along / 900);    // 70 to 90 km/h, gently varying
      along += speed;
      t += 1;
      while (seg < coords.length - 2 && cum[seg + 1] < along) seg++;
      const a = coords[seg], b = coords[seg + 1] || a;
      const k = Math.min(1, Math.max(0, (along - cum[seg]) / ((cum[seg + 1] - cum[seg]) || 1)));
      const heading = (Math.atan2((b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
      onFix({ lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k, accuracy: 5, speed, heading, time: t, simulatedSegment: seg });
      if (along >= cum.at(-1)) stopSimulation();
    }, SIM_TICK_MS);
  }
  function stopSimulation() { clearInterval(s?.simTimer); }

  // ---------- public ----------
  async function start({ route, stops, avoidMotorways, simulate, origin }) {
    if (s) stop(false);
    const destination = stops.at(-1);
    s = {
      route: null, coords: [], tracker: null, targets: stops.slice(1), passed: 0, spoken: new Set(),
      offCount: 0, lastReroute: 0, rerouting: false, follow: true, simulate, arrived: false,
      avoidMotorways, lastSeg: 0, heading: 0, destinationName: destination.title || 'Ziel', progress: null, lastFix: null,
    };
    useRoute(route);
    layers.addTo(map);
    line.setLatLngs(s.coords);
    casing.setLatLngs(s.coords);
    document.body.classList.add('is-navigating');
    $('nav-sim-badge').hidden = !simulate;
    $('nav-recenter').hidden = true;
    setVoice(voiceOn);
    insetsChanged();
    const first = route.steps[1] || route.steps[0];
    $('nav-icon').dataset.key = '';
    renderHud({ step: first, following: route.steps[2] || null, stepIndex: 1, distanceToNext: route.steps[0]?.distance || 0, remaining: route.distance, remainingSeconds: route.duration, offRoute: false, arrived: false }, { speed: null });
    // Speech availability and user-activation behavior require real-device testing.
    speak('Navigation gestartet. ' + formatDistance(route.distance).replace('km', 'Kilometer') + ' bis ' + s.destinationName + '.');

    if (simulate) { atlas.follow(s.coords[0], 16, 0, 120, false); startSimulation(); return; }
    // Real navigation: if the rider is far from the planned start, route from here first.
    if (origin && distanceMeters(origin, s.coords[0]) > 400) {
      s.lastReroute = 0;
      reroute({ lat: origin.lat, lng: origin.lng });
    }
    s.unsubscribe = subscribeGps(position => {
      const c = position.coords;
      if (!Number.isFinite(c.accuracy) || c.accuracy > 100) return;
      onFix({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, speed: Number.isFinite(c.speed) ? c.speed : NaN, heading: c.heading, time: position.timestamp / 1000 });
    });
    if (origin) atlas.follow(origin, 16, 0, 120, false);
  }

  function stop(notify = true) {
    if (!s) return;
    const session = s;
    stopSimulation();
    session.unsubscribe?.();
    session.rerouteController?.abort();
    s = null;
    window.speechSynthesis?.cancel();
    layers.remove();
    document.body.classList.remove('is-navigating');
    atlas.setRider(null);
    insetsChanged();
    if (notify) onEnd({ simulated: session.simulate, arrived: session.arrived });
  }

  $('nav-end').addEventListener('click', () => stop());
  $('nav-voice').addEventListener('click', () => { setVoice(!voiceOn); if (voiceOn) speak('Sprachansagen an.'); });
  $('nav-overview').addEventListener('click', () => {
    if (!s) return;
    s.follow = false;
    $('nav-recenter').hidden = false;
    atlas.fitBounds(line.getBounds());
  });
  $('nav-recenter').addEventListener('click', () => {
    if (!s) return;
    s.follow = true;
    $('nav-recenter').hidden = true;
    const p = s.progress;
    if (p) camera(p.offRoute ? s.lastFix : p.snapped, s.heading, s.lastFix?.speed);
  });
  map.on('dragstart', () => { if (s) { s.follow = false; $('nav-recenter').hidden = false; } });
  $('voice-pref')?.addEventListener('change', event => setVoice(event.target.checked));
  if ($('voice-pref')) $('voice-pref').checked = voiceOn;

  return { start, stop, get active() { return Boolean(s); }, speakTest: () => speak('So klingen die Ansagen. In 300 Metern rechts abbiegen.', true) };
}
