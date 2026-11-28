import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFavorites, matchFavorites, saveFavorite } from './favorites.mjs';
import { routeToGpx } from './formats.mjs';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('favourites are stored without extra fields and can be cleared', () => {
  const storage = memory();
  saveFavorite('home', { title: 'Daheim', subtitle: 'Kochel', lat: 47.6, lng: 11.4, current: true, recent: true }, storage);
  assert.deepEqual(loadFavorites(storage).home, { title: 'Daheim', subtitle: 'Kochel', kind: '', lat: 47.6, lng: 11.4 });
  assert.equal(loadFavorites(storage).work, null);
  saveFavorite('home', null, storage);
  assert.equal(loadFavorites(storage).home, null);
});

test('broken storage gives empty favourites', () => {
  const storage = memory();
  storage.setItem('atlas-favorites', '{nope');
  assert.deepEqual(loadFavorites(storage), { home: null, work: null });
});

test('typing a favourite name suggests it, only if it is set', () => {
  const favorites = { home: { lat: 1, lng: 1 }, work: null };
  assert.deepEqual(matchFavorites('zuh', favorites), ['home']);
  assert.deepEqual(matchFavorites('Nach Hause', favorites), ['home']);
  assert.deepEqual(matchFavorites('arb', favorites), []);
  assert.deepEqual(matchFavorites('arb', { ...favorites, work: { lat: 2, lng: 2 } }), ['work']);
  assert.deepEqual(matchFavorites('Walchensee', favorites), []);
});

test('a planned route becomes a GPX file with stops and the full track', () => {
  const route = { distance: 12345, duration: 900, geometry: { coordinates: [[11.4, 47.7], [11.41, 47.71], [11.42, 47.72]] } };
  const stops = [
    { title: 'Mein Standort', current: true, lat: 47.7, lng: 11.4 },
    { title: 'Café „Seeblick“ & Biergarten <Ost>', lat: 47.71, lng: 11.41 },
    { title: 'Walchensee', lat: 47.72, lng: 11.42 },
  ];
  const gpx = routeToGpx(route, stops, { createdAt: new Date('2026-05-01T08:00:00Z') });
  assert.match(gpx, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<gpx version="1.1" creator="Motorrad-Atlas"/);
  assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
  assert.equal((gpx.match(/<wpt /g) || []).length, 3);
  assert.match(gpx, /<wpt lat="47.710000" lon="11.410000"><name>Café „Seeblick“ &amp; Biergarten &lt;Ost&gt;<\/name><desc>Zwischenziel 1<\/desc>/);
  assert.match(gpx, /<name>Start<\/name><desc>Start<\/desc>/);
  assert.match(gpx, /<trk><name>Start – Walchensee<\/name>/);
  assert.match(gpx, /12,3 km/);
  assert.match(gpx, /<time>2026-05-01T08:00:00.000Z<\/time>/);
  assert.ok(gpx.trim().endsWith('</gpx>'));
});
