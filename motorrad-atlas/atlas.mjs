import { splitTrack } from './track.mjs';

const GERMANY = [[47.27, 5.85], [55.06, 15.05]];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const REVEAL_RADIUS_METERS = 200;
const EARTH_CIRCUMFERENCE_METERS = 40075017;

export function createAtlas(element) {
  const leaflet = window.L;
  const map = leaflet.map(element, { minZoom: 4, zoomSnap: .25, zoomAnimation: false });
  const canvas = document.createElement('canvas');
  canvas.className = 'fog';
  canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas);
  const context = canvas.getContext('2d');

  leaflet.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap-Mitwirkende</a>',
  }).addTo(map);

  let segments = [];
  let request = 0;

  function draw() {
    request = 0;
    const { x: width, y: height } = map.getSize();
    if (!width || !height) return;

    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    context.scale(scale, scale);

    context.fillStyle = 'rgba(30, 50, 72, .80)';
    context.fillRect(0, 0, width, height);

    // Erase the fog before drawing the tracks. Each segment stays separate across GPS gaps.
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = 'black';
    context.strokeStyle = 'black';
    context.lineCap = 'round';
    const metersPerPixel = EARTH_CIRCUMFERENCE_METERS
      * Math.cos(map.getCenter().lat * Math.PI / 180) / (256 * 2 ** map.getZoom());
    context.lineWidth = Math.max(5, 2 * REVEAL_RADIUS_METERS / metersPerPixel);

    const lines = segments.map(({ points, highlighted }) => ({
      highlighted,
      pixels: points.map(point => map.latLngToContainerPoint([point.lat, point.lng])),
    }));
    for (const { pixels } of lines) {
      if (pixels.length === 1) {
        context.beginPath();
        context.arc(pixels[0].x, pixels[0].y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        stroke(pixels);
      }
    }

    context.globalCompositeOperation = 'source-over';
    context.lineWidth = 2;
    for (const { pixels, highlighted } of lines) {
      context.strokeStyle = highlighted ? '#8e621a' : '#40607c';
      stroke(pixels);
    }
  }

  function stroke(pixels) {
    if (pixels.length < 2) return;
    context.beginPath();
    context.moveTo(pixels[0].x, pixels[0].y);
    for (const pixel of pixels.slice(1)) context.lineTo(pixel.x, pixel.y);
    context.stroke();
  }

  function redraw() {
    if (!request) request = requestAnimationFrame(draw);
  }

  function showGermany() {
    map.fitBounds(GERMANY, { padding: [18, 18], animate: false });
  }

  map.on('move zoom resize', redraw);
  showGermany();

  return {
    showGermany,
    showTracks(rides, highlightId) {
      segments = rides.flatMap(ride => splitTrack(ride.points).map(points => ({
        points,
        highlighted: ride.id === highlightId,
      })));
      segments.sort((first, second) => Number(first.highlighted) - Number(second.highlighted));
      redraw();
    },
    fitTracks(rides) {
      const points = rides.flatMap(ride => ride.points.map(point => [point.lat, point.lng]));
      if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 14, animate: false });
    },
  };
}
