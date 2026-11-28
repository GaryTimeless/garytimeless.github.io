import test from 'node:test';
import assert from 'node:assert/strict';
import { announcement, createTracker, formatDistance, instruction, maneuverIcon, offsetPoint } from './nav.mjs';
import { describe } from './geocode.mjs';
import { normalizeRoute } from './route.mjs';

// An L-shaped route: 1 km north, then 1 km east. One right turn.
const A = { lat: 48, lng: 11 };
const B = offsetPoint(A, 0, 1000);
const C = offsetPoint(B, 90, 1000);
const osrm = {
  code: 'Ok',
  waypoints: [{ location: [A.lng, A.lat] }, { location: [C.lng, C.lat] }],
  routes: [{
    distance: 2000, duration: 120,
    geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], [B.lng, B.lat], [C.lng, C.lat]] },
    legs: [{ steps: [
      { maneuver: { type: 'depart', location: [A.lng, A.lat] }, name: 'Seestraße', distance: 1000, duration: 60 },
      { maneuver: { type: 'turn', modifier: 'right', location: [B.lng, B.lat] }, name: 'Kesselbergstraße', ref: 'B 11', distance: 1000, duration: 60 },
      { maneuver: { type: 'arrive', location: [C.lng, C.lat] }, name: '', distance: 0, duration: 0 },
    ] }],
  }],
};
const route = normalizeRoute(osrm);

test('OSRM steps become German instructions', () => {
  assert.equal(instruction(route.steps[1]), 'Rechts abbiegen auf Kesselbergstraße (B 11)');
  assert.equal(instruction({ type: 'roundabout', exit: 2, name: 'Hauptstraße' }), 'Im Kreisverkehr die 2. Ausfahrt nehmen auf Hauptstraße');
  assert.equal(instruction({ type: 'arrive' }), 'Ziel erreicht');
  assert.equal(maneuverIcon(route.steps[1]).angle, 90);
});

test('via points inside a multi-leg route become waypoint steps', () => {
  const two = structuredClone(osrm);
  two.routes[0].legs = [
    { steps: [osrm.routes[0].legs[0].steps[0], { maneuver: { type: 'arrive', location: [B.lng, B.lat] }, name: '', distance: 0 }] },
    { steps: [{ maneuver: { type: 'depart', location: [B.lng, B.lat] }, name: '', distance: 1000 }, osrm.routes[0].legs[0].steps[2]] },
  ];
  assert.deepEqual(normalizeRoute(two).steps.map(s => s.type), ['depart', 'waypoint', 'arrive']);
});

test('tracker measures distance to the next turn and remaining distance', () => {
  const tracker = createTracker(route);
  const p = tracker.update({ ...offsetPoint(A, 0, 400), accuracy: 5 });
  assert.equal(p.offRoute, false);
  assert.equal(p.stepIndex, 1);
  assert.ok(Math.abs(p.distanceToNext - 600) < 5, String(p.distanceToNext));
  assert.ok(Math.abs(p.remaining - 1600) < 5, String(p.remaining));
  assert.ok(Math.abs(p.routeHeading - 0) < 1);
});

test('tracker detects leaving the route and arriving', () => {
  const tracker = createTracker(route);
  tracker.update({ ...offsetPoint(A, 0, 500), accuracy: 5 });
  assert.equal(tracker.update({ ...offsetPoint(offsetPoint(A, 0, 500), 270, 150), accuracy: 5 }).offRoute, true);
  const after = tracker.update({ ...offsetPoint(B, 90, 500), accuracy: 5 });
  assert.equal(after.offRoute, false);
  assert.equal(after.step.type, 'arrive');
  assert.equal(tracker.update({ ...C, accuracy: 5 }).arrived, true);
});

test('a ride along the route speaks each prompt once, in order', () => {
  const tracker = createTracker(route);
  const done = new Set();
  const spoken = [];
  for (let m = 0; m <= 2000; m += 20) {
    const pos = m <= 1000 ? offsetPoint(A, 0, m) : offsetPoint(B, 90, m - 1000);
    const prompt = announcement(tracker.update({ ...pos, accuracy: 5 }), 22, done);
    if (prompt) { done.add(prompt.key); spoken.push(prompt.text); }
  }
  // At 80 km/h: early (~40 s), soon (~14 s) and now (~4 s) before each maneuver.
  assert.deepEqual(spoken, [
    'In 900 Metern rechts abbiegen auf Kesselbergstraße (B 11).',
    'In 300 Metern rechts abbiegen auf Kesselbergstraße (B 11).',
    'Jetzt rechts abbiegen auf Kesselbergstraße (B 11).',
    'In 850 Metern erreichst du dein Ziel.',
    'In 300 Metern erreichst du dein Ziel.',
    'Du hast dein Ziel erreicht.',
  ]);
});

test('distances are rounded for glanceable reading', () => {
  assert.equal(formatDistance(37), '40 m');
  assert.equal(formatDistance(612), '600 m');
  assert.equal(formatDistance(1540), '1,5 km');
  assert.equal(formatDistance(23400), '23 km');
});

test('photon features become readable places', () => {
  const place = describe({ geometry: { coordinates: [11.3378, 47.5925] }, properties: {
    name: 'Walchensee', osm_key: 'natural', osm_value: 'water', city: 'Kochel am See', postcode: '82431', state: 'Bayern', country: 'Deutschland',
  } });
  assert.equal(place.title, 'Walchensee');
  assert.equal(place.subtitle, '82431 Kochel am See');
  assert.equal(place.kind, 'See');
  const fuel = describe({ geometry: { coordinates: [11, 48] }, properties: { name: 'Aral', osm_key: 'amenity', osm_value: 'fuel', street: 'Hauptstraße', housenumber: '3', city: 'Garmisch', country: 'Deutschland' } });
  assert.equal(fuel.subtitle, 'Hauptstraße 3, Garmisch');
  assert.equal(fuel.kind, 'Tankstelle');
});
