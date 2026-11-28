import { createRequestQueue } from './request-queue.mjs';
const enqueue = createRequestQueue();
// Road routing with the public OSRM demo server (car profile, light use, max. 1 request/s).
export const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/';

export function normalizeRoute(osrm) {
  const route = osrm.routes[0];
  const steps = [];
  route.legs.forEach((leg, legIndex) => leg.steps.forEach(step => {
    let type = step.maneuver.type;
    if (type === 'depart' && legIndex > 0) return;               // continuing after a via point
    if (type === 'arrive' && legIndex < route.legs.length - 1) type = 'waypoint';
    steps.push({
      type,
      modifier: step.maneuver.modifier || '',
      exit: step.maneuver.exit ?? null,
      name: step.name || '',
      ref: step.ref || '',
      lat: step.maneuver.location[1],
      lng: step.maneuver.location[0],
      distance: step.distance,
      duration: step.duration,
      leg: legIndex,
    });
  }));
  return {
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
    steps,
    waypoints: (osrm.waypoints || []).map(w => ({ lat: w.location[1], lng: w.location[0], name: w.name || '' })),
  };
}

export async function fetchRoute(points, { avoidMotorways = false, signal } = {}) {
  const coords = points.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
  const base = OSRM_URL + coords + '?overview=full&geometries=geojson&steps=true';
  const attempt = async url => {
    const response = await enqueue(() => fetch(url, { signal }), signal);
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.code !== 'Ok') {
      const error = new Error(data?.code === 'NoRoute' ? 'Keine Straßenverbindung gefunden.' : 'Route nicht verfügbar.');
      error.code = data?.code;
      throw error;
    }
    return data;
  };
  // Fail closed: never silently relax the user's highway preference.
  try {
    return { ...normalizeRoute(await attempt(base + (avoidMotorways ? '&exclude=motorway' : ''))), avoidedMotorways: avoidMotorways };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (avoidMotorways) error.message += ' Autobahnen meiden bleibt aktiv. Vorgabe selbst ändern oder später erneut versuchen.';
    throw error;
  }
}
