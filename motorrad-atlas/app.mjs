import { setupGarage } from './garage.mjs?v=ferrolive4';
import { createAtlas } from './atlas.mjs?v=garage1';
import { DEMO_RIDE, parseBackup, parseGpx } from './formats.mjs';
import { checkedFix } from './gps.mjs';
import { openJournal, readJournal, writeJournal } from './storage.mjs';
import { summarize } from './track.mjs';

const ui = id => document.getElementById(id);
const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
const km = value => number.format(value) + ' km';
const setStatus = text => { if (ui('status').textContent !== text) ui('status').textContent = text; };

const atlas = createAtlas(ui('map'));
const garage = setupGarage(atlas);
let journal = { rides: [], draft: null };
let database;
let watchId = null;
let wakeLock = null;
let interrupted = false;
let showDemo = false;
let selectedId = null;
let busy = false;

function shownRides() {
  if (showDemo) return [...journal.rides, DEMO_RIDE];
  if (journal.draft) return [...journal.rides, journal.draft];
  return journal.rides;
}

function renderMap() {
  const rides = shownRides();
  atlas.showTracks(rides, showDemo ? DEMO_RIDE.id : journal.draft?.id ?? selectedId ?? journal.rides[0]?.id);
  ui('fit').hidden = !rides.some(ride => ride.points.length);
}

function render() {
  const recording = watchId !== null;
  ui('ride-label').textContent = recording ? 'Zur laufenden Aufnahme' : journal.draft ? 'Gesicherter Fahrtentwurf' : 'Aufzeichnung';
  ui('record').textContent = recording ? 'Fahrt beenden' : journal.draft ? 'Entwurf speichern' : 'Fahrt starten';
  ui('record').setAttribute('aria-pressed', String(recording));
  ui('record').disabled = busy || !database;
  ui('import').disabled = busy || Boolean(journal.draft) || !database;
  ui('restore').disabled = ui('import').disabled;
  ui('export').disabled = !journal.rides.length;
  ui('demo').disabled = Boolean(journal.draft);
  ui('demo').textContent = showDemo ? 'Beispieltour ausblenden' : 'Beispieltour anzeigen';
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
    const button = document.createElement('button');
    const label = document.createElement('span');
    const distance = document.createElement('span');
    label.textContent = ride.name || ('Fahrt vom ' + date.format(ride.startedAt));
    distance.textContent = km(stats.distanceKm);
    button.append(label, distance);
    button.addEventListener('click', () => {
      showDemo = false;
      selectedId = ride.id;
      render();
      garage.openRecording();
      atlas.fitTracks([ride]);
      ui('map').scrollIntoView({ block: 'start' });
    });
    item.append(button);
    ui('rides').append(item);
  }
  ui('empty').hidden = journal.rides.length > 0;
  ui('tour-pin').hidden = journal.rides.length === 0;
  ui('pin-title').textContent = totals.distanceKm >= 1000 ? 'Tausender-Club' : totals.distanceKm >= 100 ? 'Die ersten 100 km' : 'Erste Ausfahrt';
  ui('odo').textContent = String(Math.floor(totals.distanceKm)).padStart(6,'0');
  ui('home-link').textContent = recording ? '● Aufnahme läuft · Garage' : 'Zur Garage';
  ui('total').textContent = km(totals.distanceKm);
  ui('average-distance').textContent = journal.rides.length ? km(totals.distanceKm / journal.rides.length) : '–';
  ui('average-speed').textContent = totals.movingSeconds
    ? number.format(totals.movingKm / (totals.movingSeconds / 3600)) + ' km/h'
    : '–';
  ui('year-progress').textContent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(totals.yearKm / 40075 * 100) + ' %';
  renderMap();
}

async function save(nextJournal) {
  await writeJournal(database, nextJournal);
  journal = nextJournal;
}

function onPosition(position) {
  if (watchId === null) return;
  const points = journal.draft.points;
  const point = checkedFix(position, points.at(-1), interrupted);
  if (!point) {
    setStatus('Aufnahme läuft · Warte auf ein besseres GPS-Signal.');
    return;
  }
  interrupted = false;
  points.push(point);
  // IndexedDB transactions complete in order, including the final save.
  writeJournal(database, journal).catch(storageError);
  setStatus('Aufnahme läuft · GPS etwa ±' + Math.round(point.accuracy) + ' m');
  renderMap();
  if (points.length === 1) atlas.fitTracks([journal.draft]);
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function storageError() {
  stopWatch();
  render();
  setStatus('Der Browser konnte nicht speichern. Ein vorhandener Entwurf bleibt zur Sicherung geöffnet.');
}

function onGpsError(error) {
  if (watchId === null) return;
  if (error.code === 1) {
    stopWatch();
    finishRide('Standortfreigabe fehlt. Erlaube sie in Chrome und starte erneut.').catch(storageError);
    return;
  }
  interrupted = true;
  setStatus('GPS unterbrochen · Warte auf ein neues Signal.');
}

async function keepScreenOn() {
  if (watchId === null || document.hidden || !navigator.wakeLock || wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (watchId === null || document.hidden) {
      await lock.release();
      return;
    }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch {
    // The OS can reject the request. Recording continues while Chrome remains visible.
  }
}

async function startRide() {
  if (!window.isSecureContext || !navigator.geolocation) {
    setStatus('GPS braucht auf dem Handy eine HTTPS-Adresse.');
    return;
  }
  showDemo = false;
  interrupted = false;
  const draft = { id: crypto.randomUUID(), name: '', startedAt: Date.now(), points: [] };
  await save({ ...journal, draft });
  watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 15000,
  });
  setStatus('Aufnahme läuft · Suche GPS. Lass Chrome sichtbar.');
  keepScreenOn();
}

async function finishRide(message) {
  stopWatch();
  const { draft, rides } = journal;
  if (draft?.points.length) {
    await save({ rides: [draft, ...rides], draft: null });
    selectedId = draft.id;
    atlas.fitTracks([draft]);
    setStatus(message ?? 'Fahrt gespeichert · ' + km(summarize(draft.points).distanceKm));
  } else {
    await save({ rides, draft: null });
    setStatus(message ?? 'Keine GPS-Punkte erfasst.');
  }
  render();
}

async function exclusive(action, onError = storageError) {
  if (busy || !database) return;
  busy = true;
  render();
  try {
    await action();
  } catch (error) {
    onError(error);
  } finally {
    busy = false;
    render();
  }
}

function useFile(button, input, consume) {
  ui(button).addEventListener('click', () => ui(input).click());
  ui(input).addEventListener('change', () => {
    const file = ui(input).files[0];
    ui(input).value = '';
    if (!file || journal.draft) return;
    exclusive(
      async () => consume(await file.text(), file.name),
      error => setStatus(error.message || 'Die Datei konnte nicht eingelesen werden.'),
    );
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

document.addEventListener('visibilitychange', () => {
  if (watchId === null) return;
  if (document.hidden) interrupted = true;
  else {
    setStatus('Chrome ist wieder sichtbar · Warte auf GPS.');
    keepScreenOn();
  }
});

ui('record').addEventListener('click', () => exclusive(journal.draft ? finishRide : startRide));
ui('germany').addEventListener('click', atlas.showGermany);
ui('fit').addEventListener('click', () => atlas.fitTracks(shownRides()));
ui('demo').addEventListener('click', () => {
  showDemo = !showDemo;
  render();
  if (showDemo) atlas.fitTracks([DEMO_RIDE]);
  else atlas.showGermany();
});
ui('export').addEventListener('click', downloadBackup);

useFile('import', 'gpx-file', async (content, filename) => {
  const ride = parseGpx(content, filename);
  await save({ ...journal, rides: [ride, ...journal.rides] });
  showDemo = false;
  selectedId = ride.id;
  atlas.fitTracks([ride]);
  setStatus('GPX-Fahrt gespeichert · ' + km(summarize(ride.points).distanceKm));
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
  if (newRides.length === 0) setStatus('Alle Fahrten aus der Sicherung sind bereits vorhanden.');
  else if (newRides.length === 1) setStatus('Eine neue Fahrt eingelesen.');
  else setStatus(newRides.length + ' neue Fahrten eingelesen.');
});

try {
  const db = await openJournal();
  journal = await readJournal(db);
  if (navigator.locks) {
    // Keep two tabs from replacing the same local journal with different copies.
    const writable = await new Promise((resolve, reject) => {
      navigator.locks.request('motorrad-atlas-journal', { ifAvailable: true }, lock => {
        resolve(Boolean(lock));
        if (lock) return new Promise(() => {});
      }).catch(reject);
    });
    if (!writable) throw new Error('Der Atlas ist in einem anderen Tab geöffnet. Lade diese Seite nach dem Schließen neu.');
    journal = await readJournal(db);
  }
  database = db;
  if (journal.draft) setStatus('Entwurf gefunden. Du kannst die bisherige Fahrt speichern.');
} catch (error) {
  setStatus(error.message || 'Der lokale Fahrtspeicher ist nicht verfügbar.');
}
render();
