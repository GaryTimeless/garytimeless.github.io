const EARTH_RADIUS_METERS = 6_371_000;
const MAX_GAP_SECONDS = 20;
const MOVING_SPEED_KMH = 5;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function hasTimeGap(previous, current) {
  if (previous.time === null || current.time === null) {
    return false;
  }

  return Math.abs(current.time - previous.time) > MAX_GAP_SECONDS;
}

export function splitTrack(points) {
  const segments = [];
  let segment = [];

  for (const point of points) {
    if (segment.length === 0) {
      segment.push(point);
      continue;
    }

    const previous = segment[segment.length - 1];
    if (point.breakBefore === true || hasTimeGap(previous, point)) {
      segments.push(segment);
      segment = [point];
    } else {
      segment.push(point);
    }
  }

  if (segment.length > 0) {
    segments.push(segment);
  }

  return segments;
}

export function summarize(points) {
  let totalMeters = 0;
  let movingMeters = 0;
  let movingSeconds = 0;

  for (const segment of splitTrack(points)) {
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const current = segment[index];
      const meters = distanceMeters(previous, current);

      totalMeters += meters;

      if (previous.time === null || current.time === null) {
        continue;
      }

      const seconds = current.time - previous.time;
      if (seconds <= 0) {
        continue;
      }

      const speedKmh = (meters / 1000) / (seconds / 3600);
      if (speedKmh >= MOVING_SPEED_KMH) {
        movingMeters += meters;
        movingSeconds += seconds;
      }
    }
  }

  const movingKm = movingMeters / 1000;

  return {
    distanceKm: totalMeters / 1000,
    movingSeconds,
    movingKm,
    averageKmh: movingSeconds > 0 ? movingKm / (movingSeconds / 3600) : null,
  };
}
