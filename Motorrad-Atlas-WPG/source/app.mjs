import { createAtlas } from './atlas.mjs?v=3';
import { badgesFor, exploredAreaKm2 } from './explore.mjs';
import { DEMO_RIDE, parseBackup, parseGpx } from './formats.mjs';
import { checkedFix } from './gps.mjs';
import { createNavigation } from './navigation.mjs';
import { FAVORITES } from './favorites.mjs';
import { createPlanner } from './planner.mjs';
import { openJournal, readJournal, writeJournal } from './storage.mjs';
import { distanceMeters, summarize } from './track.mjs';

const ui = id => document.getElementById(id);
const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const one = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
const km = value => number.format(value) + ' km';
const VIEWS = ['ride', 'plan', 'log', 'garage'];
const GOAL_KM2 = 100;   // ring in the top bar fills up at 100 km² explored

// ---------- preferences ----------
const prefs = {
  theme: localStorage.getItem('wpg-atlas-theme') || 'auto',
  reveal: Number(localStorage.getItem('wpg-atlas-reveal')) || 200,
  motion: localStorage.getItem('wpg-atlas-clouds') === null
    ? !matchMedia('(prefers-reduced-motion: reduce)').matches
    : localStorage.getItem('wpg-atlas-clouds') === 'on',
};
function resolvedTheme() {
  if (prefs.theme !== 'auto') return prefs.theme;
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? 'day' : 'night';
}
function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'day' ? '#eef1f6' : '#07090f';
  atlas?.setTheme(theme);
}

const sheetInsets = () => {
  if (document.body.classList.contains('is-navigating')) {
    const wide = innerWidth >= 900;
    return { top: wide ? 40 : 150, left: wide ? 470 : 16, right: 16, bottom: wide ? 40 : 110 };
  }
  const sheet = ui('sheet').getBoundingClientRect();
  if (innerWidth >= 900) return { left: sheet.right + 16, top: 96, right: 84, bottom: 24 };
  return { top: 160, left: 16, right: 84, bottom: innerHeight - sheet.top + 16 };
};

let atlas = null;
applyTheme();
atlas = createAtlas(ui('map'), { theme: resolvedTheme(), reveal: prefs.reveal, motion: prefs.motion, insets: sheetInsets });

// ---------- one shared GPS watch for recording and navigation ----------
const gpsListeners = new Set();
let gpsWatch = null;
let lastPosition = null;
function subscribeGps(listener, onError) {
  const entry = { listener, onError };
  gpsListeners.add(entry);
  if (gpsWatch === null && navigator.geolocation) {
    gpsWatch = navigator.geolocation.watchPosition(position => {
      lastPosition = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, at: Date.now() };
      for (const e of [...gpsListeners]) e.listener(position);
    }, error => { for (const e of [...gpsListeners]) e.onError?.(error); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  return () => {
    gpsListeners.delete(entry);
    if (!gpsListeners.size && gpsWatch !== null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }
  };
}
function getPosition() {
  if (lastPosition && Date.now() - lastPosition.at < 10000) return Promise.resolve(lastPosition);
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) { reject(new Error('Dein Standort ist auf dieser Adresse nicht verfügbar. Öffne die App über ihre https-Adresse.')); return; }
    navigator.geolocation.getCurrentPosition(
      p => { lastPosition = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() }; resolve(lastPosition); },
      error => reject(new Error(error.code === 1 ? 'Die App darf deinen Standort nicht sehen. Erlaube ihn in den Browser-Einstellungen.' : 'Standort gerade nicht gefunden. Versuch es draußen noch einmal.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

let simTrail = null;
let simFrame = 0;
let navStartedRecording = false;
const navigation = createNavigation(atlas, {
  subscribeGps,
  toast: text => toast(text),
  insetsChanged: () => atlas.invalidate(),
  onTrail: point => {
    if (!simTrail) simTrail = { id: 'simulation', name: 'Simulation', startedAt: null, points: [] };
    simTrail.points.push(point);
    if (++simFrame % 3 === 0) renderMap();
  },
  onEnd: async ({ simulated, arrived }) => {
    atlas.suspend(false);
    view();
    releaseWakeLock();
    if (simulated) {
      toast(simTrail ? 'Probefahrt beendet · so viel neue Strecke wäre das' : 'Probefahrt beendet');
      setTimeout(() => { simTrail = null; renderMap(); }, 2500);
    } else toast(arrived ? 'Angekommen. Gute Pause!' : 'Navigation beendet');
    const recorded = navStartedRecording && watchId !== null;
    navStartedRecording = false;
    if (recorded) await exclusive(() => finishRide());
    location.hash = recorded || arrived ? '#ride' : '#plan';
    render();
  },
});
const planner = createPlanner(atlas, {
  getPosition,
  lastPosition: () => lastPosition,
  toast: text => toast(text),
  onFavoritesChange: favorites => renderPlaces(favorites),
  onNavigate: async ({ route, stops, avoidMotorways, simulate, isCurrent }) => {
    if (navigation.active || !isCurrent()) return;
    if (!simulate) {
      if (watchId !== null || journal.draft) { toast('Bitte zuerst die laufende Fahrt speichern. Der erste Live-Adapter zeichnet noch nicht in den Atlas auf.'); return; }
      if (avoidMotorways) { toast('Die Live-Führung unterstützt „Autobahnen meiden“ noch nicht. Die Vorschau und der GPX-Export behalten deine Vorgabe.'); return; }
      sessionStorage.setItem('wpg-live-waypoints',JSON.stringify(stops));
      location.assign('../motorrad-atlas/ferrostar-test/?fahrt=live&von=wpg');
      return;
    }
    if (watchId !== null) { toast('Bitte erst die Aufnahme beenden, bevor du eine Probefahrt ansiehst.'); return; }
    showDemo = false; stopDemo(); simTrail = null; simFrame = 0;
    planner.activate(false); atlas.suspend(true);
    await navigation.start({ route, stops, avoidMotorways, simulate: true, origin: null });
    keepScreenOn();
  },
});

let journal = { rides: [], draft: null };
let database;
let watchId = null;
let wakeLock = null;
let interrupted = false;
let showDemo = false;
let demoAnimation = null;
let selectedId = null;
let busy = false;
let follow = true;
let lastFix = null;
let clock = null;
let unsubscribeRecording = null;

// ---------- small helpers ----------
let toastTimer;
function toast(text) {
  const element = ui('toast');
  element.textContent = text;
  element.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('is-on'), 2600);
}
const setStatus = text => { if (ui('status').textContent !== text) ui('status').textContent = text; };
const haptic = pattern => navigator.vibrate?.(pattern);

function sparkline(points) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 46 34');
  svg.setAttribute('class', 'ride-spark');
  svg.setAttribute('aria-hidden', 'true');
  if (points.length > 1) {
    const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const span = Math.max(maxLat - minLat, (maxLng - minLng) * .67, 1e-6);
    const step = Math.max(1, Math.floor(points.length / 60));
    const d = points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p, i) => {
      const x = 23 + ((p.lng - (minLng + maxLng) / 2) * .67 / span) * 40;
      const y = 17 - ((p.lat - (minLat + maxLat) / 2) / span) * 28;
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join('');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// ---------- rendering ----------
function shownRides() {
  const rides = [...journal.rides];
  if (journal.draft) rides.push(journal.draft);
  if (simTrail) rides.push(simTrail);
  if (showDemo) rides.push(demoAnimation ? { ...DEMO_RIDE, points: DEMO_RIDE.points.slice(0, demoAnimation.count) } : DEMO_RIDE);
  return rides;
}

function renderMap() {
  const rides = shownRides();
  const highlight = simTrail ? simTrail.id : showDemo ? DEMO_RIDE.id : journal.draft?.id ?? selectedId ?? journal.rides[0]?.id;
  atlas.showTracks(rides, highlight);
  ui('fit').hidden = !rides.some(ride => ride.points.length);
  const area = exploredAreaKm2(rides);
  ui('explored-km2').textContent = area < 10 ? one.format(area) : number.format(Math.round(area));
  ui('explored-ring').style.setProperty('--p', Math.min(100, area / GOAL_KM2 * 100).toFixed(1));
  planner.refresh();
}

function renderRideButton() {
  const recording = watchId !== null;
  const button = ui('record');
  button.setAttribute('aria-pressed', String(recording));
  button.classList.toggle('is-draft', !recording && Boolean(journal.draft));
  ui('record-label').textContent = recording ? 'Fahrt beenden' : journal.draft ? 'Fahrt jetzt speichern' : 'Fahrt starten';
  button.disabled = busy || !database;
  ui('ride-eyebrow').innerHTML = recording ? '<span class="live-dot"></span> Fahrt läuft' : journal.draft ? 'Fahrt nicht gespeichert' : 'Bereit';
  ui('ride-title').textContent = recording ? 'Gute Fahrt.' : journal.draft ? 'Fahrt sichern?' : 'Fahr die Wolken weg.';
  ui('ride-lede').textContent = recording
    ? 'Lass den Browser sichtbar und das Display an. Die Wolken lösen sich hinter dir auf.'
    : 'Jede Strecke, die du fährst, reißt die Wolkendecke auf. Was frei ist, hast du selbst erfahren.';
  document.body.classList.toggle('is-recording', recording);
  ui('hud').hidden = !recording;
}

function render() {
  renderRideButton();
  ui('import').disabled = busy || Boolean(journal.draft) || !database;
  ui('restore').disabled = ui('import').disabled;
  ui('export').disabled = !journal.rides.length;
  ui('demo').disabled = Boolean(journal.draft) || watchId !== null;
  ui('demo-label').textContent = showDemo ? 'Beispieltour ausblenden' : 'Beispieltour abspielen';
  ui('demo').setAttribute('aria-pressed', String(showDemo));

  const totals = { distanceKm: 0, movingKm: 0, movingSeconds: 0, yearKm: 0 };
  const year = new Date().getFullYear();
  ui('rides').replaceChildren();
  for (const ride of journal.rides) {
    const stats = summarize(ride.points);
    totals.distanceKm += stats.distanceKm;
    totals.movingKm += stats.movingKm;
    totals.movingSeconds += stats.movingSeconds;
    if (ride.startedAt !== null && new Date(ride.startedAt).getFullYear() === year) totals.yearKm += stats.distanceKm;

    const item = document.createElement('li');
    item.className = 'ride-item' + (ride.id === selectedId ? ' is-selected' : '');
    const open = document.createElement('button');
    open.className = 'ride-open';
    const text = document.createElement('span');
    const title = document.createElement('strong');
    const meta = document.createElement('small');
    title.textContent = ride.name || 'Fahrt vom ' + (ride.startedAt ? date.format(ride.startedAt) : 'unbekannten Datum');
    meta.textContent = (ride.startedAt ? date.format(ride.startedAt) : 'ohne Datum')
      + (stats.averageKmh ? ' · Ø ' + Math.round(stats.averageKmh) + ' km/h' : '');
    text.append(title, meta);
    const distance = document.createElement('span');
    distance.className = 'km';
    distance.textContent = km(stats.distanceKm);
    open.append(sparkline(ride.points), text, distance);
    open.addEventListener('click', () => {
      showDemo = false;
      stopDemo();
      selectedId = ride.id;
      render();
      atlas.fitTracks([ride]);
      collapseSheetOnMobile();
    });
    const edit = document.createElement('button');
    edit.className = 'ride-edit';
    edit.setAttribute('aria-label', 'Tour umbenennen oder löschen');
    edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
    edit.addEventListener('click', () => editRide(ride));
    item.append(open, edit);
    ui('rides').append(item);
  }
  ui('empty').hidden = journal.rides.length > 0;
  ui('ride-count').textContent = journal.rides.length;
  ui('odo').textContent = String(Math.floor(totals.distanceKm)).padStart(6, '0');
  ui('average-distance').textContent = journal.rides.length ? km(totals.distanceKm / journal.rides.length) : '–';
  ui('average-speed').textContent = totals.movingSeconds ? number.format(totals.movingKm / (totals.movingSeconds / 3600)) + ' km/h' : '–';
  ui('year').textContent = year;
  ui('year-progress').textContent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(totals.yearKm / 40075 * 100) + ' %';

  const badges = badgesFor(journal.rides, { distanceKm: totals.distanceKm, areaKm2: exploredAreaKm2(journal.rides) });
  ui('badges').replaceChildren(...badges.map(badge => {
    const li = document.createElement('li');
    li.className = badge.got ? 'got' : '';
    const icon = document.createElement('b');
    icon.textContent = badge.icon;
    const label = document.createElement('strong');
    label.textContent = badge.label;
    const hint = document.createElement('small');
    hint.textContent = badge.hint;
    li.append(icon, label, hint);
    li.setAttribute('aria-label', badge.label + (badge.got ? ', freigeschaltet' : ', noch offen') + '. ' + badge.hint);
    return li;
  }));
  renderMap();
}

// ---------- views & sheet ----------
function collapseSheetOnMobile() {
  if (innerWidth < 900) setSheet(false);
}
function setSheet(open) {
  ui('sheet').classList.toggle('is-collapsed', !open);
  ui('sheet-handle').setAttribute('aria-expanded', String(open));
}
ui('sheet-handle').addEventListener('click', () => setSheet(ui('sheet').classList.contains('is-collapsed')));

function view() {
  const current = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'ride';
  document.body.dataset.view = current;
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== current;
  for (const tab of document.querySelectorAll('[data-tab]')) {
    if (tab.dataset.tab === current) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  planner.activate(current === 'plan' && !navigation.active);
  setSheet(true);
  ui('sheet').querySelector('.sheet-body').scrollTop = 0;
}
window.addEventListener('hashchange', view);

// ---------- recording ----------
function updateHud(point) {
  const draft = journal.draft;
  if (!draft) return;
  const stats = summarize(draft.points);
  ui('hud-km').textContent = one.format(stats.distanceKm);
  if (point) {
    let speed = point.speed;
    if (!Number.isFinite(speed) && lastFix && point.time > lastFix.time) speed = distanceMeters(lastFix, point) / (point.time - lastFix.time);
    ui('hud-speed').textContent = Number.isFinite(speed) ? Math.round(speed * 3.6) : '–';
    ui('hud-gps').textContent = Math.round(point.accuracy);
  }
  const seconds = Math.max(0, Math.floor((Date.now() - draft.startedAt) / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  ui('hud-time').textContent = h ? h + ':' + String(m).padStart(2, '0') + 'h' : m + ':' + String(s).padStart(2, '0');
}

function onPosition(position) {
  if (watchId === null) return;
  const points = journal.draft.points;
  const point = checkedFix(position, points.at(-1), interrupted);
  const heading = position.coords.heading;
  if (!navigation.active) atlas.setRider({ lat: position.coords.latitude, lng: position.coords.longitude, heading: Number.isFinite(heading) ? heading : null });
  if (!point) {
    setStatus('Standort noch ungenau, einen Moment …');
    return;
  }
  interrupted = false;
  points.push(point);
  writeJournal(database, journal).catch(storageError);
  setStatus('Standort genau auf etwa ' + Math.max(5, Math.round(point.accuracy / 5) * 5) + ' m');
  updateHud({ ...point, speed: position.coords.speed });
  lastFix = point;
  renderMap();
  if (follow && !navigation.active) atlas.focus([point.lat, point.lng], Math.max(atlas.map.getZoom(), 14), points.length > 1);
}

function releaseWakeLock() {
  if (watchId !== null || navigation.active) return;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function stopWatch() {
  unsubscribeRecording?.();
  unsubscribeRecording = null;
  watchId = null;
  clearInterval(clock);
  clock = null;
  releaseWakeLock();
  if (!navigation.active) atlas.setRider(null);
}

function storageError() {
  stopWatch();
  render();
  setStatus('Speichern fehlgeschlagen. Neueste Punkte sind möglicherweise nur im Arbeitsspeicher. Seite nicht schließen.');
  toast('Aufnahme gestoppt: Speichern fehlgeschlagen.');
}

function onGpsError(error) {
  if (watchId === null) return;
  if (error.code === 1) {
    stopWatch();
    finishRide('Die App darf deinen Standort nicht sehen. Erlaube ihn und starte neu.').catch(storageError);
    return;
  }
  interrupted = true;
  setStatus('Standort kurz weg · Warte auf Signal.');
}

async function keepScreenOn() {
  const needed = () => watchId !== null || navigation.active;
  if (!needed() || document.hidden || !navigator.wakeLock || wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!needed() || document.hidden) { await lock.release(); return; }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch {
    // The OS may refuse. Recording continues while the browser stays visible.
  }
}

async function startRide() {
  if (!window.isSecureContext || !navigator.geolocation) {
    setStatus('Hier ist dein Standort nicht verfügbar. Öffne die App über ihre https-Adresse.');
    return;
  }
  showDemo = false;
  stopDemo();
  interrupted = false;
  lastFix = null;
  follow = true;
  const draft = { id: crypto.randomUUID(), name: '', startedAt: Date.now(), points: [] };
  await save({ ...journal, draft });
  watchId = 'recording';
  unsubscribeRecording = subscribeGps(onPosition, onGpsError);
  clock = setInterval(() => updateHud(null), 1000);
  ui('hud-speed').textContent = '–';
  ui('hud-km').textContent = '0,0';
  ui('hud-gps').textContent = '–';
  setStatus('Suche deinen Standort … Lass die App geöffnet.');
  haptic([30, 60, 30]);
  keepScreenOn();
  collapseSheetOnMobile();
}

async function finishRide(message) {
  stopWatch();
  const { draft, rides } = journal;
  if (draft?.points.length) {
    await save({ rides: [draft, ...rides], draft: null });
    selectedId = draft.id;
    atlas.fitTracks([draft]);
    const text = message ?? 'Fahrt gespeichert · ' + km(summarize(draft.points).distanceKm);
    setStatus(text);
    toast(text);
  } else {
    await save({ rides, draft: null });
    setStatus(message ?? 'Kein Standort empfangen, nichts gespeichert.');
  }
  haptic(60);
  setSheet(true);
  render();
}

async function save(nextJournal) {
  await writeJournal(database, nextJournal);
  journal = nextJournal;
}

async function exclusive(action, onError = storageError) {
  if (busy || !database) return;
  busy = true;
  render();
  try { await action(); } catch (error) { onError(error); } finally { busy = false; render(); }
}

// ---------- demo: the sample ride draws itself and clouds burst along the way ----------
function densify(points, stepMeters = 120) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const n = Math.max(1, Math.round(distanceMeters(a, b) / stepMeters));
    for (let s = 1; s <= n; s++) out.push({ lat: a.lat + (b.lat - a.lat) * s / n, lng: a.lng + (b.lng - a.lng) * s / n, time: null });
  }
  return out;
}
const DEMO_DENSE = densify(DEMO_RIDE.points);
DEMO_RIDE.points = DEMO_DENSE;   // same route, finer steps for a smooth reveal
function stopDemo() {
  if (demoAnimation) cancelAnimationFrame(demoAnimation.frame);
  demoAnimation = null;
  if (watchId === null) atlas.setRider(null);
}
function playDemo() {
  stopDemo();
  showDemo = true;
  if (!prefs.motion) { render(); atlas.fitTracks([DEMO_RIDE]); return; }
  atlas.fitTracks([DEMO_RIDE], false);
  const started = performance.now() + 600;
  const duration = 9000;
  demoAnimation = { count: 1, frame: 0 };
  const step = now => {
    if (!demoAnimation) return;
    const t = Math.max(0, Math.min(1, (now - started) / duration));
    const count = Math.max(1, Math.round(t * DEMO_DENSE.length));
    if (count !== demoAnimation.count) {
      demoAnimation.count = count;
      const a = DEMO_DENSE[Math.max(0, count - 2)], b = DEMO_DENSE[count - 1];
      const heading = Math.atan2((b.lng - a.lng) * Math.cos(b.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI;
      atlas.setRider({ lat: b.lat, lng: b.lng, heading });
      renderMap();
    }
    if (t < 1) demoAnimation.frame = requestAnimationFrame(step);
    else {
      demoAnimation = null;
      atlas.setRider(null);
      renderMap();
      toast('Beispieltour · ' + km(summarize(DEMO_RIDE.points).distanceKm) + ' Wolken weggefahren');
    }
  };
  renderMap();
  demoAnimation.frame = requestAnimationFrame(step);
  render();
  collapseSheetOnMobile();
}

// ---------- ride editing ----------
function editRide(ride) {
  const dialog = ui('rename-dialog');
  ui('rename-input').value = ride.name || '';
  dialog.returnValue = '';
  dialog.onclose = () => {
    const action = dialog.returnValue;
    if (action === 'save') {
      const name = ui('rename-input').value.trim();
      exclusive(() => save({ ...journal, rides: journal.rides.map(r => r.id === ride.id ? { ...r, name } : r) }));
    } else if (action === 'delete') {
      if (!confirm('Tour „' + (ride.name || 'ohne Namen') + '“ wirklich löschen? Die Wolken kehren dort zurück.')) return;
      exclusive(async () => {
        await save({ ...journal, rides: journal.rides.filter(r => r.id !== ride.id) });
        if (selectedId === ride.id) selectedId = null;
        toast('Tour gelöscht');
      });
    }
  };
  dialog.showModal();
}

// ---------- files ----------
function useFile(button, input, consume) {
  ui(button).addEventListener('click', () => ui(input).click());
  ui(input).addEventListener('change', () => {
    const file = ui(input).files[0];
    ui(input).value = '';
    if (!file || journal.draft) return;
    exclusive(async () => consume(await file.text(), file.name), error => toast(error.message || 'Die Datei konnte nicht eingelesen werden.'));
  });
}

function downloadBackup() {
  const backup = JSON.stringify({ version: 1, rides: journal.rides }, null, 2);
  const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'motorrad-atlas-sicherung.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

useFile('import', 'gpx-file', async (content, filename) => {
  const ride = parseGpx(content, filename);
  await save({ ...journal, rides: [ride, ...journal.rides] });
  showDemo = false;
  stopDemo();
  selectedId = ride.id;
  atlas.fitTracks([ride]);
  toast('GPX-Fahrt gespeichert · ' + km(summarize(ride.points).distanceKm));
});

useFile('restore', 'backup-file', async content => {
  const imported = parseBackup(content);
  const known = new Set(journal.rides.map(ride => ride.id));
  const newRides = [];
  for (const ride of imported) {
    if (known.has(ride.id)) continue;
    newRides.push(ride);
    known.add(ride.id);
  }
  await save({ ...journal, rides: [...journal.rides, ...newRides] });
  showDemo = false;
  toast(newRides.length === 0 ? 'Alle Fahrten sind bereits vorhanden.' : newRides.length === 1 ? 'Eine neue Fahrt eingelesen.' : newRides.length + ' neue Fahrten eingelesen.');
});

// ---------- settings ----------
function syncSettings() {
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked = input.value === prefs.theme;
  for (const input of document.querySelectorAll('input[name="reveal"]')) input.checked = Number(input.value) === prefs.reveal;
  ui('motion').checked = prefs.motion;
}
document.addEventListener('change', event => {
  const input = event.target;
  if (input.name === 'theme') { prefs.theme = input.value; localStorage.setItem('wpg-atlas-theme', prefs.theme); applyTheme(); }
  if (input.name === 'reveal') { prefs.reveal = Number(input.value); localStorage.setItem('wpg-atlas-reveal', prefs.reveal); atlas.setReveal(prefs.reveal); renderMap(); }
  if (input.id === 'motion') { prefs.motion = input.checked; localStorage.setItem('wpg-atlas-clouds', prefs.motion ? 'on' : 'off'); atlas.setMotion(prefs.motion); }
});
ui('theme-toggle').addEventListener('click', () => {
  prefs.theme = resolvedTheme() === 'night' ? 'day' : 'night';
  localStorage.setItem('wpg-atlas-theme', prefs.theme);
  applyTheme();
  syncSettings();
});
setInterval(() => { if (prefs.theme === 'auto') applyTheme(); }, 5 * 60 * 1000);

ui('check').addEventListener('click', async () => {
  let permission = 'unbekannt';
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    permission = { granted: 'erlaubt', prompt: 'wird beim Start erfragt', denied: 'gesperrt' }[result.state];
  } catch {}
  const rows = [
    ['Standort möglich', window.isSecureContext ? 'ja' : 'nein · https-Adresse nötig', window.isSecureContext],
    ['Standort', permission, permission !== 'gesperrt'],
    ['Display wachhalten', 'wakeLock' in navigator ? 'unterstützt' : 'nicht verfügbar', 'wakeLock' in navigator],
    ['Vibration', 'vibrate' in navigator ? 'verfügbar' : 'nicht verfügbar', 'vibrate' in navigator],
    ['Wolken', prefs.motion ? 'animiert' : 'ruhig', true],
  ];
  ui('check-result').replaceChildren(...rows.map(([label, value, ok]) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = label;
    const state = document.createElement('b');
    state.textContent = value;
    state.dataset.ok = String(ok);
    li.append(name, state);
    return li;
  }));
});

// ---------- map buttons ----------
ui('germany').addEventListener('click', () => { follow = false; atlas.showGermany(); });
ui('fit').addEventListener('click', () => { follow = false; atlas.fitTracks(shownRides()); });
ui('locate').addEventListener('click', () => {
  if (watchId !== null && lastFix) { follow = true; atlas.focus([lastFix.lat, lastFix.lng], 15); return; }
  getPosition()
    .then(p => { atlas.focus([p.lat, p.lng], 14); atlas.setRider({ lat: p.lat, lng: p.lng, heading: null }); })
    .catch(error => toast(error.message));
});
atlas.map.on('dragstart', () => { if (watchId !== null) follow = false; });

ui('hud-stop').addEventListener('click', () => ui('record').click());
ui('record').addEventListener('click', () => exclusive(journal.draft ? finishRide : startRide));
ui('demo').addEventListener('click', () => {
  if (showDemo) { showDemo = false; stopDemo(); render(); atlas.showGermany(); }
  else playDemo();
});
ui('export').addEventListener('click', downloadBackup);
ui('where-to').addEventListener('click', () => { location.hash = '#plan'; planner.focusDestination(); });

// ---------- favourites: one tap from the start screen, managed in the garage ----------
function renderPlaces(favorites) {
  for (const kind of Object.keys(FAVORITES)) {
    const sub = document.getElementById('quick-' + kind + '-sub');
    if (sub) sub.textContent = favorites[kind] ? favorites[kind].title : 'Festlegen';
    document.querySelector('[data-quick="' + kind + '"]')?.classList.toggle('is-empty', !favorites[kind]);
  }
  const box = document.getElementById('places');
  if (!box) return;
  box.replaceChildren(...Object.entries(FAVORITES).map(([kind, meta]) => {
    const row = document.createElement('div');
    row.className = 'place';
    const icon = document.createElement('span');
    icon.className = 'place-icon';
    icon.innerHTML = meta.icon;
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = meta.label;
    const sub = document.createElement('small');
    sub.textContent = favorites[kind] ? favorites[kind].title + (favorites[kind].subtitle ? ', ' + favorites[kind].subtitle : '') : 'Noch nicht festgelegt';
    text.append(title, sub);
    const here = document.createElement('button');
    here.className = 'chip';
    here.textContent = 'Hier bin ich';
    here.setAttribute('aria-label', meta.label + ' auf meinen jetzigen Standort setzen');
    here.addEventListener('click', async () => {
      here.disabled = true;
      try { const place = await planner.favoriteFromHere(kind); toast(meta.label + ' gespeichert: ' + place.title); }
      catch (error) { toast(error.message || 'Standort nicht verfügbar.'); }
      finally { here.disabled = false; }
    });
    row.append(icon, text, here);
    if (favorites[kind]) {
      const remove = document.createElement('button');
      remove.className = 'chip';
      remove.textContent = 'Löschen';
      remove.setAttribute('aria-label', meta.label + ' löschen');
      remove.addEventListener('click', () => { planner.setFavorite(kind, null); toast(meta.label + ' gelöscht'); });
      row.append(remove);
    }
    return row;
  }));
}
for (const button of document.querySelectorAll('[data-quick]')) {
  button.addEventListener('click', async () => {
    const kind = button.dataset.quick;
    if (!planner.favorites()[kind]) {
      toast('Leg „' + FAVORITES[kind].label + '“ einmal fest: Ziel suchen und „Als ' + FAVORITES[kind].label + ' merken“ tippen.');
      location.hash = '#plan';
      planner.focusDestination();
      return;
    }
    if (navigation.active) return;
    button.disabled = true;
    haptic(20);
    try { await planner.quickNavigate(kind); } finally { button.disabled = false; }
  });
}
renderPlaces(planner.favorites());
ui('voice-test').addEventListener('click', () => navigation.speakTest());

document.addEventListener('visibilitychange', () => {
  if (navigation.active && !document.hidden) keepScreenOn();
  if (watchId === null) return;
  if (document.hidden) interrupted = true;
  else { setStatus('Wieder da · Warte auf deinen Standort.'); keepScreenOn(); }
});
addEventListener('resize', () => atlas.invalidate());

// ---------- boot ----------
syncSettings();
view();
try {
  const db = await openJournal();
  journal = await readJournal(db);
  if (navigator.locks) {
    const writable = await new Promise((resolve, reject) => {
      navigator.locks.request('wpg-motorrad-atlas-journal', { ifAvailable: true }, lock => {
        resolve(Boolean(lock));
        if (lock) return new Promise(() => {});
      }).catch(reject);
    });
    if (!writable) throw new Error('Der Atlas ist in einem anderen Tab geöffnet. Lade diese Seite nach dem Schließen neu.');
    journal = await readJournal(db);
  }
  database = db;
  if (journal.draft) setStatus('Eine Fahrt wurde nicht beendet. Du kannst sie jetzt speichern.');
} catch (error) {
  setStatus(error.message || 'Der lokale Fahrtspeicher ist nicht verfügbar.');
}
render();
if (!localStorage.getItem('wpg-atlas-onboarded') && !journal.rides.length) {
  const dialog = ui('onboarding');
  dialog.onclose = () => {
    localStorage.setItem('wpg-atlas-onboarded', '1');
    if (dialog.returnValue === 'demo') playDemo();
  };
  dialog.showModal();
}
