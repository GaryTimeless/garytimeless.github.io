// Regression baseline for Motorrad-Atlas 2.2.
// Put next to the application modules and run: node --test pre-pitch.regression.test.mjs
// Red tests are intentional against the original 2.2 implementation.
// Navigation integration uses small DOM/Leaflet/fetch stubs, NOT a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker, offsetPoint } from './nav.mjs';
import { fetchRoute } from './route.mjs';
import { createNavigation } from './navigation.mjs';

const A = { lat: 48, lng: 11 };
const B = offsetPoint(A, 0, 1000);
const C = offsetPoint(A, 0, 2000);
const D = offsetPoint(A, 0, 3000);
function route(coords, steps) {
  return {
    geometry: { type: 'LineString', coordinates: coords.map(p => [p.lng, p.lat]) },
    steps: steps.map(([p, type]) => ({ ...p, type, name: '', modifier: '', distance: 1000, duration: 60 })),
    duration: 180, distance: 3000,
  };
}
const roundtrip = () => route([A, B, A], [[A, 'depart'], [B, 'waypoint'], [A, 'arrive']]);

test('F01: roundtrip must not arrive at its starting point before riding', () => {
  const progress = createTracker(roundtrip()).update({ ...A, accuracy: 5 });
  assert.equal(progress.arrived, false, 'Start equals destination, but route progress is zero');
});

test('F01: repeated coordinate must not move final maneuver behind intermediate stop', () => {
  const tracker = createTracker(roundtrip());
  assert.ok(tracker.stepAlong[2] > tracker.stepAlong[1],
    `Expected ordered maneuvers, received ${JSON.stringify(tracker.stepAlong)}`);
});

test('F02: failed reroute must preserve every still-unvisited target on retry', async () => {
  const names = ['fetch', 'document', 'navigator', 'window', 'localStorage', 'innerHeight'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const set = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const originalNow = Date.now;
  let navigation;
  try {
    const elements = new Map();
    const element = () => ({ dataset: {}, hidden: false, textContent: '', checked: false,
      classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    set('document', { getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }, body: { classList: { add() {}, remove() {} } } });
    set('localStorage', { getItem() { return 'off'; }, setItem() {} });
    set('navigator', {});
    set('innerHeight', 800);
    const layer = () => ({ addTo() { return this; }, setLatLngs() { return this; },
      setLatLng() { return this; }, setStyle() { return this; }, remove() {}, getBounds() { return {}; } });
    set('window', { L: { layerGroup: layer, polyline: layer, circleMarker: layer, marker: layer, divIcon: x => x } });
    const urls = [];
    set('fetch', async url => { urls.push(String(url)); return { ok: false, json: async () => ({ code: 'NoRoute' }) }; });
    let receive;
    let now = 100000;
    Date.now = () => now;
    const atlas = { map: { on() {} }, follow() {}, setRider() {}, fitBounds() {} };
    navigation = createNavigation(atlas, {
      subscribeGps(fn) { receive = fn; return () => {}; }, toast() {},
    });
    await navigation.start({
      route: route([A, B, C, D], [[A, 'depart'], [B, 'waypoint'], [C, 'waypoint'], [D, 'arrive']]),
      stops: [A, B, C, D], simulate: false, avoidMotorways: false, origin: A,
    });
    const fix = p => receive({ coords: { latitude: p.lat, longitude: p.lng, accuracy: 5, speed: 15, heading: 0 }, timestamp: now });
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    const pastB = offsetPoint(A, 0, 1100);
    fix(pastB);
    const outside = offsetPoint(pastB, 90, 200);
    fix(outside); fix(outside); await flush();
    now += 9000;
    fix(outside);
    // The OSRM queue uses a monotonic clock independent of the mocked Date.now.
    const deadline = performance.now() + 3000;
    while (urls.length < 2 && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(urls.length, 2, 'Expected two rerouting attempts');
    const targets = url => new URL(url).pathname.split('/').at(-1).split(';').slice(1);
    assert.equal(targets(urls[0]).length, 2, 'C and D must remain after passing B');
    assert.deepEqual(targets(urls[1]), targets(urls[0]), 'Failed attempt must not consume C');
  } finally {
    navigation?.stop();
    Date.now = originalNow;
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('F09: motorway fallback must not issue two network requests within one second', async () => {
  const previous = globalThis.fetch;
  const started = [];
  try {
    globalThis.fetch = async () => {
      started.push(performance.now());
      return { ok: false, json: async () => ({ code: 'InvalidValue' }) };
    };
    await assert.rejects(fetchRoute([A, B], { avoidMotorways: true }));
    assert.ok(started.length <= 2, 'No uncontrolled retries');
    if (started.length === 2) {
      const gap = started[1] - started[0];
      assert.ok(gap >= 1000, `Fallback request gap was ${gap.toFixed(2)} ms, expected >= 1000 ms`);
    }
  } finally { globalThis.fetch = previous; }
});
