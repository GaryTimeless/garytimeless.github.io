// Thin adapter around the documented Ferrostar Web API.
// SDK startup configuration must be validated against the pinned SDK before live activation.
export function validateLiveSettings(settings) {
  if (!settings || settings.integrationValidated !== true) throw new Error('Ferrostar-Integration noch nicht freigegeben. Zuerst Build und Browserprüfung durchführen.');
  const endpoint = new URL(settings.valhallaEndpointUrl, globalThis.location?.href || 'http://localhost');
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') throw new Error('Routing benötigt HTTPS.');
  if (!settings.navigationConfig || typeof settings.navigationConfig !== 'object') throw new Error('Geprüfte Ferrostar-Navigationskonfiguration fehlt.');
  return settings;
}
export function validateLivePlan(stops, avoidMotorways) {
  if (!Array.isArray(stops) || stops.length !== 2) throw new Error('Der erste Ferrostar-Prototyp unterstützt nur Start und Ziel. Kein Zwischenziel wird still entfernt.');
  if (avoidMotorways) throw new Error('Autobahnen meiden ist im Ferrostar-Adapter noch nicht geprüft. Es wird keine abweichende Route gestartet.');
  for (const p of stops) if (!Number.isFinite(p?.lat) || Math.abs(p.lat)>90 || !Number.isFinite(p?.lng) || Math.abs(p.lng)>180) throw new Error('Ungültiger Routenpunkt.');
  return { ...stops[1] };
}
export function createSessionGate() {
  let revision = 0;
  return { begin() { const value = ++revision; return () => value === revision; }, cancel() { revision++; } };
}
