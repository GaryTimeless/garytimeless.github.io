import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, splitTrack, summarize } from './track.mjs';

test('distanceMeters uses the haversine formula', () => {
  const meters = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });

  assert.ok(Math.abs(meters - 111_194.93) < 0.5);
});

test('splitTrack starts a new segment before a breakBefore point', () => {
  const first = { lat: 0, lng: 0, time: 0 };
  const second = { lat: 0, lng: 0.001, time: 10 };
  const third = { lat: 0, lng: 0.002, time: 20, breakBefore: true };

  assert.deepEqual(splitTrack([first, second, third]), [
    [first, second],
    [third],
  ]);
});

test('splitTrack splits only when the time gap is more than 20 seconds', () => {
  const first = { lat: 0, lng: 0, time: 0 };
  const second = { lat: 0, lng: 0.001, time: 20 };
  const third = { lat: 0, lng: 0.002, time: 41 };

  assert.deepEqual(splitTrack([first, second, third]), [
    [first, second],
    [third],
  ]);
});

test('splitTrack does not split an interval with a missing timestamp', () => {
  const first = { lat: 0, lng: 0, time: null };
  const second = { lat: 0, lng: 0.001, time: 100 };
  const third = { lat: 0, lng: 0.002, time: null };

  assert.deepEqual(splitTrack([first, second, third]), [[first, second, third]]);
});

test('summarize keeps distance and movement inside segments', () => {
  const first = { lat: 0, lng: 0, time: 0 };
  const second = { lat: 0, lng: 0.001, time: 10 };
  const third = { lat: 0, lng: 0.002, time: 20, breakBefore: true };
  const fourth = { lat: 0, lng: 0.003, time: 30 };

  const summary = summarize([first, second, third, fourth]);

  assert.ok(Math.abs(summary.distanceKm - 0.2223899) < 0.0001);
  assert.equal(summary.movingSeconds, 20);
  assert.ok(Math.abs(summary.movingKm - 0.2223899) < 0.0001);
  assert.ok(Math.abs(summary.averageKmh - 40.03017) < 0.01);
});

test('summarize counts timed movement only at 5 km/h or faster', () => {
  const first = { lat: 0, lng: 0, time: 0 };
  const second = { lat: 0, lng: 0.0001, time: 10 };
  const third = { lat: 0, lng: 0.0002, time: 20 };
  const fourth = { lat: 0, lng: 0.0004, time: 30 };

  const summary = summarize([first, second, third, fourth]);

  assert.ok(Math.abs(summary.distanceKm - 0.0444780) < 0.0001);
  assert.equal(summary.movingSeconds, 10);
  assert.ok(Math.abs(summary.movingKm - 0.0222390) < 0.0001);
  assert.ok(Math.abs(summary.averageKmh - 8.00603) < 0.01);
});

test('summarize sums distance but reports no timing when times are missing', () => {
  const first = { lat: 0, lng: 0, time: null };
  const second = { lat: 0, lng: 0.001, time: null };
  const third = { lat: 0, lng: 0.002, time: null };

  const summary = summarize([first, second, third]);

  assert.ok(Math.abs(summary.distanceKm - 0.2223899) < 0.0001);
  assert.equal(summary.movingSeconds, 0);
  assert.equal(summary.movingKm, 0);
  assert.equal(summary.averageKmh, null);
});
