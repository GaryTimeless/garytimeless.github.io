// Place search with Photon (komoot, OpenStreetMap data). Photon is built for search-as-you-type.
// Nominatim's public server forbids autocomplete, so it is deliberately not used here.
// Fair use: requests are debounced by the caller, results are cached, the bias position is rounded.
export const PHOTON_URL = 'https://photon.komoot.io';
const cache = new Map();

const KINDS = {
  place: { city: 'Stadt', town: 'Stadt', village: 'Ort', hamlet: 'Weiler', suburb: 'Stadtteil', locality: 'Ort', isolated_dwelling: 'Gehöft' },
  amenity: { fuel: 'Tankstelle', restaurant: 'Restaurant', cafe: 'Café', biergarten: 'Biergarten', fast_food: 'Imbiss', parking: 'Parkplatz', motorcycle_parking: 'Motorradparkplatz', pub: 'Kneipe', charging_station: 'Ladesäule' },
  tourism: { viewpoint: 'Aussichtspunkt', hotel: 'Hotel', guest_house: 'Pension', camp_site: 'Campingplatz', attraction: 'Sehenswürdigkeit', museum: 'Museum', alpine_hut: 'Hütte' },
  natural: { saddle: 'Pass', peak: 'Gipfel', water: 'See' },
  mountain_pass: { yes: 'Pass' },
  shop: { motorcycle: 'Motorradhändler', motorcycle_repair: 'Motorradwerkstatt' },
  highway: { '*': 'Straße' },
  historic: { '*': 'Historischer Ort' },
  leisure: { '*': 'Freizeit' },
  boundary: { '*': 'Region' },
};

export function kindOf(p) {
  const group = KINDS[p.osm_key];
  if (!group) return '';
  return group[p.osm_value] || group['*'] || '';
}

export function describe(feature) {
  const p = feature.properties || {};
  const [lng, lat] = feature.geometry.coordinates;
  const place = p.city || p.town || p.village || p.district || p.county || p.state || '';
  const street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
  const title = p.name || street || place || p.country || 'Unbenannter Ort';
  const parts = [];
  if (p.name && street) parts.push(street);
  if (place && place !== title) parts.push((p.postcode ? p.postcode + ' ' : '') + place);
  else if (p.state && p.state !== title) parts.push(p.state);
  if (p.country && p.country !== 'Deutschland' && p.country !== title) parts.push(p.country);
  return {
    lat, lng, title, subtitle: parts.join(', '), kind: kindOf(p),
    id: (p.osm_type || '') + (p.osm_id || lat.toFixed(5) + lng.toFixed(5)),
  };
}

async function photon(path, signal) {
  if (cache.has(path)) return cache.get(path);
  const response = await fetch(PHOTON_URL + path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 429 ? 'Zu viele Suchanfragen. Kurz warten.' : 'Suche nicht verfügbar.');
  const data = await response.json();
  if (cache.size > 200) cache.clear();
  cache.set(path, data);
  return data;
}

export async function search(query, { lat, lng, signal } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  let path = '/api/?q=' + encodeURIComponent(q) + '&lang=de&limit=7';
  if (Number.isFinite(lat) && Number.isFinite(lng)) path += '&lat=' + lat.toFixed(1) + '&lon=' + lng.toFixed(1);
  const data = await photon(path, signal);
  const seen = new Set();
  return (data.features || []).map(describe).filter(place => {
    const key = place.title + '|' + place.subtitle;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function reverse(lat, lng, { signal } = {}) {
  const data = await photon('/reverse?lat=' + lat.toFixed(5) + '&lon=' + lng.toFixed(5) + '&lang=de', signal);
  return data.features?.length ? describe(data.features[0]) : null;
}
