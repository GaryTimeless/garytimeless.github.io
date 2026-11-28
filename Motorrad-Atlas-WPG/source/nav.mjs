// Turn-by-turn logic without DOM: German instructions, position on route, announcements.
const EARTH = 6371000;

const SIDE = { left: 'links', right: 'rechts', 'slight left': 'links', 'slight right': 'rechts', 'sharp left': 'links', 'sharp right': 'rechts', straight: 'geradeaus', uturn: '' };

function turnText(modifier) {
  switch (modifier) {
    case 'uturn': return 'wenden';
    case 'straight': return 'geradeaus weiter';
    case 'slight left': return 'leicht links halten';
    case 'slight right': return 'leicht rechts halten';
    case 'sharp left': return 'scharf links abbiegen';
    case 'sharp right': return 'scharf rechts abbiegen';
    case 'left': return 'links abbiegen';
    case 'right': return 'rechts abbiegen';
    default: return 'weiterfahren';
  }
}

// { action, road } so the HUD can show the road on its own line.
export function instructionParts(step) {
  const road = step.name && step.ref ? step.name + ' (' + step.ref + ')' : step.name || step.ref || '';
  const side = SIDE[step.modifier] || '';
  let action;
  switch (step.type) {
    case 'depart': action = 'Losfahren'; break;
    case 'arrive': return { action: 'Ziel erreicht', road: '' };
    case 'waypoint': return { action: 'Zwischenziel erreicht', road: '' };
    case 'roundabout':
    case 'rotary':
      action = step.exit ? 'Im Kreisverkehr die ' + step.exit + '. Ausfahrt nehmen' : 'In den Kreisverkehr fahren'; break;
    case 'exit roundabout':
    case 'exit rotary': action = 'Kreisverkehr verlassen'; break;
    case 'fork': action = 'An der Gabelung ' + (side === 'geradeaus' || !side ? 'geradeaus' : side) + ' halten'; break;
    case 'on ramp': action = 'Auffahrt ' + (side && side !== 'geradeaus' ? side + ' ' : '') + 'nehmen'; break;
    case 'off ramp': action = 'Ausfahrt ' + (side && side !== 'geradeaus' ? side + ' ' : '') + 'nehmen'; break;
    case 'merge': action = (side && side !== 'geradeaus' ? side + ' ' : '') + 'einfädeln'; break;
    case 'end of road': action = 'Am Ende der Straße ' + turnText(step.modifier); break;
    case 'new name':
    case 'continue':
    case 'notification':
    case 'use lane':
      action = !step.modifier || step.modifier === 'straight' ? (road ? 'Weiter' : 'Geradeaus weiter') : turnText(step.modifier); break;
    default: action = turnText(step.modifier);
  }
  return { action: action[0].toUpperCase() + action.slice(1), road };
}

export function instruction(step) {
  const { action, road } = instructionParts(step);
  return road ? action + ' auf ' + road : action;
}

// Rotation of the arrow icon in degrees (0 = straight ahead), or a special kind.
export function maneuverIcon(step) {
  if (!step) return { kind: 'arrow', angle: 0 };
  if (step.type === 'arrive' || step.type === 'waypoint') return { kind: 'flag', angle: 0 };
  if (step.type === 'roundabout' || step.type === 'rotary') return { kind: 'roundabout', angle: 0, exit: step.exit };
  if (step.modifier === 'uturn') return { kind: 'uturn', angle: 0 };
  const angles = { straight: 0, 'slight left': -45, 'slight right': 45, left: -90, right: 90, 'sharp left': -135, 'sharp right': 135 };
  return { kind: 'arrow', angle: angles[step.modifier] ?? 0 };
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '–';
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.max(10, Math.round(meters / 10) * 10) : Math.round(meters / 50) * 50;
    return rounded >= 1000 ? '1 km' : rounded + ' m';
  }
  return (meters / 1000).toLocaleString('de-DE', { maximumFractionDigits: meters < 10000 ? 1 : 0 }) + ' km';
}

export function spokenDistance(meters) {
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.max(10, Math.round(meters / 10) * 10) : Math.round(meters / 50) * 50;
    return 'In ' + rounded + ' Metern';
  }
  const km = Math.round(meters / 100) / 10;
  return 'In ' + (km === 1 ? 'einem Kilometer' : km.toLocaleString('de-DE') + ' Kilometern');
}

export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return minutes + ' min';
  return Math.floor(minutes / 60) + ' h ' + String(minutes % 60).padStart(2, '0') + ' min';
}

export function offsetPoint(point, headingDeg, meters) {
  const h = headingDeg * Math.PI / 180;
  const dLat = meters * Math.cos(h) / EARTH * 180 / Math.PI;
  const dLng = meters * Math.sin(h) / (EARTH * Math.cos(point.lat * Math.PI / 180)) * 180 / Math.PI;
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

// Follows a rider along a route. Uses a local flat projection (fine for routes up to a few 100 km).
export function createTracker(route) {
  const coords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const lat0 = coords[0].lat * Math.PI / 180;
  const kx = Math.cos(lat0) * EARTH * Math.PI / 180;
  const ky = EARTH * Math.PI / 180;
  const xy = coords.map(p => [p.lng * kx, p.lat * ky]);
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const total = cum.at(-1) || 0;
  const lastSegment = Math.max(0, xy.length - 2);

  function project(x, y, i) {
    const a = xy[i], b = xy[Math.min(i + 1, xy.length - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * dx, py = a[1] + t * dy;
    return { d: Math.hypot(x - px, y - py), seg: i, along: cum[i] + t * Math.sqrt(len2), x: px, y: py };
  }
  function locate(x, y, from, to) {
    let best = null;
    for (let i = from; i <= to; i++) {
      const hit = project(x, y, i);
      if (!best || hit.d < best.d) best = hit;
    }
    return best;
  }

  // Maneuvers sit on route vertices. Place them in order so loops do not confuse the order.
  let from = 0, minimumAlong = 0;
  const stepAlong = route.steps.map((step, stepIndex) => {
    if (stepIndex === route.steps.length - 1 && step.type === 'arrive') return total;
    const x = step.lng * kx, y = step.lat * ky;
    for (let i = from; i <= lastSegment; i++) {
      const hit = project(x, y, i);
      if (hit.d < 2 && hit.along >= minimumAlong) { from = i; minimumAlong = hit.along; return hit.along; }
    }
    const hit = locate(x, y, from, lastSegment);
    from = hit.seg;
    minimumAlong = Math.max(minimumAlong, hit.along);
    return minimumAlong;
  });
  const viaAlong = route.steps.map((s, i) => s.type === 'waypoint' ? stepAlong[i] : null).filter(v => v !== null);
  const destination = coords.at(-1);
  let state = { seg: 0, along: 0 };

  return {
    total,
    stepAlong,
    update(fix) {
      const x = fix.lng * kx, y = fix.lat * ky;
      const tolerance = Math.max(35, (fix.accuracy || 0) * 1.5);
      let hit = locate(x, y, Math.max(0, state.seg - 3), Math.min(lastSegment, state.seg + 150));
      if (hit.d > tolerance) {
        const anywhere = locate(x, y, 0, lastSegment);
        if (anywhere.d < hit.d) hit = anywhere;
      }
      // Simulation knows its true segment; do not map it onto an overlapping outbound leg.
      if (Number.isInteger(fix.simulatedSegment)) {
        hit = project(x, y, Math.max(0, Math.min(lastSegment, fix.simulatedSegment)));
      }
      const offRoute = hit.d > tolerance;
      if (!offRoute) state = { seg: hit.seg, along: hit.along };
      const traveled = state.along;
      let stepIndex = route.steps.findIndex((s, i) => i > 0 && stepAlong[i] > traveled + 8);
      if (stepIndex < 0) stepIndex = route.steps.length - 1;
      const remaining = Math.max(0, total - traveled);
      const dx = destination.lng * kx - x, dy = destination.lat * ky - y;
      const a = xy[state.seg], b = xy[Math.min(state.seg + 1, xy.length - 1)];
      return {
        offRoute,
        segment: state.seg,
        distanceToRoute: hit.d,
        snapped: offRoute ? { lat: fix.lat, lng: fix.lng } : { lat: hit.y / ky, lng: hit.x / kx },
        routeHeading: (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI + 360) % 360,
        traveled,
        remaining,
        remainingSeconds: total ? route.duration * remaining / total : 0,
        stepIndex,
        step: route.steps[stepIndex],
        following: route.steps[stepIndex + 1] || null,
        distanceToNext: Math.max(0, stepAlong[stepIndex] - traveled),
        passedVias: viaAlong.filter(v => traveled > v - 30).length,
        arrived: !offRoute && remaining < 30 && Math.hypot(dx, dy) < 35,
      };
    },
  };
}

// Picks the next voice prompt. `done` is a Set of keys already spoken; the caller adds the key.
export function announcement(progress, speed, done) {
  if (progress.arrived) return done.has('arrive') ? null : { key: 'arrive', text: 'Du hast dein Ziel erreicht.' };
  const step = progress.step;
  if (!step || progress.offRoute) return null;
  const v = Math.max(Number.isFinite(speed) ? speed : 0, 8);
  const d = progress.distanceToNext;
  const now = Math.max(40, v * 4), soon = Math.max(200, v * 14), early = Math.max(800, v * 40);
  const id = progress.stepIndex + ':';
  const text = instruction(step);
  let tier = null;
  if (d <= now) tier = 'now';
  else if (d <= soon) tier = 'soon';
  else if (d <= early && d > soon * 1.6) tier = 'early';
  if (!tier) return null;
  // A stronger prompt makes weaker ones for the same maneuver obsolete.
  const order = ['early', 'soon', 'now'];
  if (order.slice(order.indexOf(tier)).some(t => done.has(id + t))) return null;
  if (step.type === 'arrive') {
    if (tier === 'now') return null; // handled by `arrived`
    return { key: id + tier, text: spokenDistance(d) + ' erreichst du dein Ziel.' };
  }
  if (tier === 'now') return { key: id + tier, text: 'Jetzt ' + text[0].toLowerCase() + text.slice(1) + '.' };
  return { key: id + tier, text: spokenDistance(d) + ' ' + text[0].toLowerCase() + text.slice(1) + '.' };
}
