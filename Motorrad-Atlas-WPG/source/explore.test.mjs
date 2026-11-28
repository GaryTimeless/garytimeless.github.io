import test from 'node:test';
import assert from 'node:assert/strict';
import { badgesFor, exploredAreaKm2, exploredCells } from './explore.mjs';
import { createTrackIndex, latOf, project0 } from './sky.mjs';

const line = (km, lat = 48) => ({ id: 'x', startedAt: null, points: [
  { lat, lng: 11, time: null }, { lat, lng: 11 + km / (111.32 * Math.cos(lat * Math.PI / 180)), time: null },
] });

test('a straight 10 km ride explores roughly 10 km × 0.4 km', () => {
  const area = exploredAreaKm2([line(10)]);
  assert.ok(area > 3.6 && area < 5.2, String(area));
});

test('riding the same road twice does not count twice', () => {
  assert.equal(exploredCells([line(10), line(10)]).size, exploredCells([line(10)]).size);
});

test('gaps between segments stay unexplored', () => {
  const ride = { id: 'g', startedAt: null, points: [
    { lat: 48, lng: 11, time: 0 }, { lat: 48, lng: 11.001, time: 5 },
    { lat: 48, lng: 11.5, time: 10, breakBefore: true }, { lat: 48, lng: 11.501, time: 15 },
  ] };
  assert.ok(exploredCells([ride]).size <= 4);
});

test('badges unlock from totals', () => {
  const got = Object.fromEntries(badgesFor([line(5, 47.6)], { distanceKm: 150, areaKm2: 2 }).map(b => [b.id, b.got]));
  assert.deepEqual(got, { first: true, hundred: true, thousand: false, clouds: false, alps: true, night: false });
});

test('mercator projection round-trips latitude', () => {
  const [, y] = project0(48.137, 11.575);
  assert.ok(Math.abs(latOf(y) - 48.137) < 1e-9);
});

test('track index finds points within the reveal radius only', () => {
  const index = createTrackIndex();
  index.set([line(10).points]);
  assert.equal(index.nearTrack(48.0015, 11.05, 200), true);   // ~170 m north of the road
  assert.equal(index.nearTrack(48.0030, 11.05, 200), false);  // ~330 m north of the road
  assert.equal(index.nearTrack(48, 11.3, 200), false);        // beyond the end of the ride
});
