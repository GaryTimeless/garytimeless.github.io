import { distanceMeters } from './track.mjs';

const MAX_ACCURACY_METERS = 80;
const MAX_PLAUSIBLE_SPEED_KMH = 350;
const MAX_GAP_SECONDS = 20;

export function checkedFix(position, previous, interrupted) {
  const { latitude, longitude, accuracy } = position.coords;
  if (!Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_METERS) return null;

  // Track points use seconds. The browser supplies milliseconds.
  const point = { lat: latitude, lng: longitude, time: position.timestamp / 1000, accuracy };
  if (!previous) return point;

  const seconds = point.time - previous.time;
  if (seconds <= 0) return null;
  if (interrupted || seconds > MAX_GAP_SECONDS) return { ...point, breakBefore: true };

  const meters = distanceMeters(previous, point);
  if (meters / seconds * 3.6 > MAX_PLAUSIBLE_SPEED_KMH) return null;

  // Keep a timed sample while stationary, but avoid adding small GPS jitter to the distance.
  if (meters < 8) return { ...point, lat: previous.lat, lng: previous.lng };
  return point;
}
