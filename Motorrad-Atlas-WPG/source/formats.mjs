export const DEMO_RIDE = {
  id: 'demo',
  name: 'Beispiel · Voralpen',
  startedAt: null,
  points: [
    [47.7620, 11.5570], [47.7435, 11.5591], [47.7310, 11.5511],
    [47.7063, 11.5590], [47.7010, 11.5715], [47.6700, 11.5775],
    [47.6532, 11.6030], [47.6337, 11.6280], [47.6240, 11.6510],
    [47.6150, 11.6530], [47.5950, 11.6350], [47.5850, 11.5950],
    [47.5865, 11.5660], [47.5892, 11.5490], [47.5880, 11.5180],
    [47.6057, 11.4890], [47.6131, 11.4530], [47.6085, 11.4155],
    [47.5976, 11.3789], [47.5914, 11.3555], [47.5925, 11.3378],
  ].map(([lat, lng]) => ({ lat, lng, time: null })),
};

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180
    && (point.time === null || Number.isFinite(point.time));
}

export function parseGpx(xml, filename) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.documentElement.localName !== 'gpx') throw new Error('Die Datei ist kein lesbarer GPX-Track.');

  const points = [];
  for (const segment of document.getElementsByTagNameNS('*', 'trkseg')) {
    let firstPoint = true;
    for (const element of segment.getElementsByTagNameNS('*', 'trkpt')) {
      const timestamp = Date.parse(element.getElementsByTagNameNS('*', 'time')[0]?.textContent);
      const point = {
        lat: parseFloat(element.getAttribute('lat')),
        lng: parseFloat(element.getAttribute('lon')),
        time: Number.isFinite(timestamp) ? timestamp / 1000 : null,
        breakBefore: firstPoint && points.length > 0,
      };
      if (!validPoint(point)) throw new Error('Der GPX-Track enthält ungültige Koordinaten.');
      points.push(point);
      firstPoint = false;
    }
  }
  if (points.length < 2) throw new Error('Die GPX-Datei muss einen aufgezeichneten Track mit mindestens zwei Punkten enthalten.');

  const firstTimestamp = points.find(point => point.time !== null)?.time;
  return {
    id: crypto.randomUUID(),
    name: filename.replace(/\.gpx$/i, ''),
    startedAt: firstTimestamp === undefined ? null : firstTimestamp * 1000,
    points,
  };
}

export function parseBackup(text) {
  const backup = JSON.parse(text);
  if (backup?.version !== 1 || !Array.isArray(backup.rides)) {
    throw new Error('Diese Datei ist keine Sicherung aus dem Motorrad-Atlas.');
  }
  for (const ride of backup.rides) {
    if (!ride || typeof ride.id !== 'string' || typeof ride.name !== 'string'
      || (ride.startedAt !== null && !Number.isFinite(ride.startedAt))
      || !Array.isArray(ride.points) || ride.points.length < 1 || !ride.points.every(validPoint)) {
      throw new Error('Die Sicherung enthält eine ungültige Fahrt.');
    }
  }
  return backup.rides;
}

// ---------- GPX export of a planned route (for Garmin, Calimoto, Kurviger …) ----------
const xml = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const coord = value => value.toFixed(6);

export function stopName(stop) {
  return stop.current ? 'Start' : stop.title || 'Wegpunkt';
}

export function routeToGpx(route, stops, { name, createdAt = new Date() } = {}) {
  const title = name || stopName(stops[0]) + ' – ' + stopName(stops.at(-1));
  const km = (route.distance / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const role = index => index === 0 ? 'Start' : index === stops.length - 1 ? 'Ziel' : 'Zwischenziel ' + index;
  const waypoints = stops.map((stop, index) =>
    `  <wpt lat="${coord(stop.lat)}" lon="${coord(stop.lng)}"><name>${xml(stopName(stop))}</name><desc>${role(index)}</desc></wpt>`);
  const points = route.geometry.coordinates.map(([lng, lat]) => `      <trkpt lat="${coord(lat)}" lon="${coord(lng)}"/>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Motorrad-Atlas" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${xml(title)}</name><desc>${km} km, geplant mit Motorrad-Atlas</desc><time>${createdAt.toISOString()}</time></metadata>`,
    ...waypoints,
    `  <trk><name>${xml(title)}</name>`,
    '    <trkseg>',
    ...points,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}

export function gpxFilename(stops) {
  const slug = text => String(text).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  const parts = [stopName(stops[0]), stopName(stops.at(-1))].map(slug).filter(Boolean);
  return 'tour-' + (parts.join('-nach-') || 'route') + '.gpx';
}
