import { distanceMeters, splitTrack } from './track.mjs';

// Explored area: the map is split into ~400 m cells. Every cell touched by a ride counts once,
// so riding the same road twice does not inflate the number.
export const CELL_DEG = 0.0036;
const CELL_KM = CELL_DEG * 111.32;

function mark(set, lat, lng) {
  const y = Math.floor(lat / CELL_DEG);
  const x = Math.floor(lng * Math.cos((y + .5) * CELL_DEG * Math.PI / 180) / CELL_DEG);
  set.add(y + ':' + x);
}

export function exploredCells(rides, set = new Set()) {
  for (const ride of rides) {
    for (const segment of splitTrack(ride.points)) {
      for (let i = 0; i < segment.length; i++) {
        const b = segment[i];
        mark(set, b.lat, b.lng);
        if (i === 0) continue;
        const a = segment[i - 1];
        const steps = Math.min(4000, Math.ceil(distanceMeters(a, b) / 100));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          mark(set, a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t);
        }
      }
    }
  }
  return set;
}

export function exploredAreaKm2(rides) {
  return exploredCells(rides).size * CELL_KM * CELL_KM;
}

export function badgesFor(rides, { distanceKm, areaKm2 }) {
  const night = rides.some(ride => {
    if (ride.startedAt === null || ride.startedAt === undefined) return false;
    const hour = new Date(ride.startedAt).getHours();
    return hour >= 21 || hour < 5;
  });
  const alps = rides.some(ride => ride.points.some(p => p.lat < 47.75 && p.lng > 9.5 && p.lng < 13.2));
  return [
    { id: 'first', icon: '01', label: 'Erste Ausfahrt', hint: 'Eine Fahrt gespeichert', got: rides.length >= 1 },
    { id: 'hundred', icon: '100', label: 'Hunderter', hint: '100 km gesamt', got: distanceKm >= 100 },
    { id: 'thousand', icon: '1K', label: 'Tausender', hint: '1.000 km gesamt', got: distanceKm >= 1000 },
    { id: 'clouds', icon: '☁', label: 'Wolkenbrecher', hint: '25 km² entdeckt', got: areaKm2 >= 25 },
    { id: 'alps', icon: '▲', label: 'Alpenluft', hint: 'Tour im Voralpenland', got: alps },
    { id: 'night', icon: '☾', label: 'Nachteule', hint: 'Start nach 21 Uhr', got: night },
  ];
}
