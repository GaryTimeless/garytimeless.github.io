import { liveSettings } from './live-settings.mjs';
import { validateLiveSettings, validateLivePlan, createSessionGate } from './ferrostar-session.mjs';

export function createLiveNavigation({ onClose, onSuspend }) {
  const panel = document.getElementById('ferrostar-panel');
  const message = document.getElementById('ferrostar-status');
  const gate = createSessionGate();
  let core = null, map = null, active = false;
  async function stop() {
    gate.cancel();
    const old = core; core = null;
    try { await old?.stopNavigation(); }
    finally {
      map?.remove(); map = null;
      panel.hidden = true;
      document.body.classList.remove('is-ferrostar');
      active = false; onSuspend(false); onClose();
    }
  }
  document.getElementById('ferrostar-end').addEventListener('click', () => stop().catch(error => { message.textContent = error.message; }));
  async function start(stops, avoidMotorways) {
    if (active) return;
    validateLiveSettings(liveSettings);
    const destination = validateLivePlan(stops, avoidMotorways);
    const current = gate.begin();
    active = true; panel.hidden = false;
    document.body.classList.add('is-ferrostar'); onSuspend(true);
    message.textContent = 'Navigation wird vorbereitet. Browser sichtbar lassen.';
    try {
      const sdk = await import('@stadiamaps/ferrostar-webcomponents');
      if (!current()) return;
      const instance = new sdk.FerrostarCore(); core = instance;
      instance.valhallaEndpointUrl = liveSettings.valhallaEndpointUrl;
      instance.locationProvider = new sdk.BrowserLocationProvider();
      instance.useVoiceGuidance = false;
      map = document.createElement('ferrostar-map');
      document.getElementById('ferrostar-host').replaceChildren(map);
      map.linkWith(instance);
      const location = await instance.locationProvider.getCurrentLocation(15000);
      if (!current()) return;
      // Candidate waypoint representation: verify against installed 0.58.0 types before enabling.
      const routes = await instance.getRoutes(location, [{ coordinate: { lat: destination.lat, lng: destination.lng }, kind: 'Break' }]);
      if (!current()) return;
      if (!routes?.length) throw new Error('Keine Route gefunden.');
      message.textContent = 'Neue Route ab aktuellem Standort; nicht die bisherige OSRM-Vorschau. Keine Atlas-Aufzeichnung in diesem Integrationsstand.';
      await instance.startNavigation(routes[0], liveSettings.navigationConfig);
      if (!current()) await instance.stopNavigation();
    } catch (error) {
      if (current()) { await stop(); throw error; }
    }
  }
  document.getElementById('ferrostar-voice').addEventListener('click', () => {
    if (!core) return;
    core.useVoiceGuidance = !core.useVoiceGuidance;
    document.getElementById('ferrostar-voice').setAttribute('aria-pressed', String(core.useVoiceGuidance));
  });
  return { start, stop, get active() { return active; } };
}
