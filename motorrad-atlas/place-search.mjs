export function setupPlaceSearch(plan) {
  const element = id => document.getElementById(id);
  const locate = element('locate-start');
  const locationStatus = element('location-status');
  let locationRequest = 0;
  locate.onclick = () => {
    const request = ++locationRequest;
    if (!navigator.geolocation) {
      locationStatus.textContent = 'Standort ist hier nicht verfügbar. Gib den Start unten ein.';
      return;
    }
    locate.disabled = true;
    locationStatus.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest) return;
      locate.disabled = false;
      const point = L.latLng(position.coords.latitude,position.coords.longitude);
      point.name = 'Mein Standort';
      plan.start(point);
      locationStatus.textContent = 'Start gesetzt · Genauigkeit etwa ±' + Math.round(position.coords.accuracy) + ' m.';
    }, error => {
      if (request !== locationRequest) return;
      locate.disabled = false;
      locationStatus.textContent = (error.code === 1 ? 'Standortzugriff gesperrt.' : 'Standort konnte nicht ermittelt werden.') + ' Gib den Start unten ein.';
    }, {enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  };

  bindSearch('origin','origin-matches','origin-status',point => {
    locationRequest++;
    locate.disabled = false;
    plan.start(point);
    locationStatus.textContent = '';
    return 'Start gesetzt.';
  });
  bindSearch('destination','matches','search-status',point => plan.destination(point)
    ? 'Ziel gesetzt. Wähle jetzt deinen Start.' : 'Ziel gesetzt. Die Route ist bereit zur Berechnung.');
}

function bindSearch(field, listId, statusId, select) {
  const element = id => document.getElementById(id);
  const input = element(field);
  const matches = element(listId);
  const status = element(statusId);
  let pending;
  input.oninput = () => {
    pending?.abort();
    pending = null;
    matches.replaceChildren();
    status.textContent = '';
  };
  element(field + '-search').onsubmit = async event => {
    event.preventDefault();
    input.oninput();
    const query = input.value.trim();
    if (!query) return;
    const request = new AbortController();
    pending = request;
    const timer = setTimeout(() => request.abort(),12000);
    status.textContent = 'Orte werden gesucht …';
    try {
      const params = new URLSearchParams({q:query,lang:'de',limit:'5'});
      const response = await fetch('https://photon.komoot.io/api/?' + params,{signal:request.signal});
      if (!response.ok) throw Error();
      const data = await response.json();
      if (pending !== request) return;
      for (const feature of data.features) {
        const [lng,lat] = feature.geometry.coordinates;
        const place = feature.properties;
        const title = place.name || place.street || place.city;
        if (!title || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const label = [...new Set([title,place.city,place.state,place.country].filter(Boolean))].join(', ');
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.className = 'secondary';
        button.textContent = label;
        button.onclick = () => {
          const point = L.latLng(lat,lng);
          point.name = label;
          const message = select(point);
          input.value = title;
          matches.replaceChildren();
          status.textContent = message;
        };
        item.append(button);
        matches.append(item);
      }
      status.textContent = matches.childElementCount ? (field === 'origin' ? 'Treffer als Start auswählen.' : 'Treffer als Ziel auswählen.') : 'Keine Treffer. Ergänze den Ort oder ändere den Suchbegriff.';
    } catch {
      if (pending === request) status.textContent = 'Suche derzeit nicht erreichbar. Versuche es erneut oder wähle den Punkt auf der Karte.';
    } finally {
      clearTimeout(timer);
    }
  };
}
