import { FAVORITES, loadFavorites, matchFavorites, saveFavorite } from './favorites.mjs';
import { gpxFilename, routeToGpx } from './formats.mjs';
import { reverse, search } from './geocode.mjs';
import { formatDuration } from './nav.mjs';
import { fetchRoute } from './route.mjs';
import { distanceMeters } from './track.mjs';

const STORE = 'wpg-atlas-navplan-v2';
const RECENT = 'wpg-atlas-recent-places';
const ROUTE_GAP_MS = 1100;      // OSRM demo server: at most 1 request per second
const SEARCH_DEBOUNCE_MS = 320;
const MAX_STOPS = 8;
const ICONS = {
  locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" class="fill"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
};
const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export function createPlanner(atlas, { getPosition, lastPosition, onNavigate, toast, onFavoritesChange = () => {} }) {
  const L = window.L;
  const { map } = atlas;
  const $ = id => document.getElementById(id);
  const group = L.layerGroup();
  let stops = [null, null];
  let route = null;
  let routeStops = null;
  let revision = 0;
  let quickBusy = false;
  let navigationStarting = false;
  const searchCleanups = new Set();
  let active = false;
  let routeTimer = 0;
  let lastRouteAt = 0;
  let controller = null;
  let fitNext = true;
  let avoidMotorways = false;
  let favorites = loadFavorites();

  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (Array.isArray(saved?.stops) && saved.stops.length >= 2) stops = saved.stops.map(s => s && Number.isFinite(s.lat) ? s : null);
    avoidMotorways = Boolean(saved?.avoidMotorways);
  } catch {}
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ stops, avoidMotorways })); } catch {} };

  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch { return []; } };
  function remember(place) {
    if (place.current || place.favorite || place.title === 'Punkt auf der Karte') return;
    const list = recent().filter(p => p.title + p.subtitle !== place.title + place.subtitle);
    list.unshift({ title: place.title, subtitle: place.subtitle, kind: place.kind, lat: place.lat, lng: place.lng });
    try { localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 6))); } catch {}
  }

  const kindOf = index => index === 0 ? 'start' : index === stops.length - 1 ? 'end' : 'via';
  const labelOf = index => index === 0 ? 'Start' : index === stops.length - 1 ? 'Ziel' : 'Zwischenziel ' + index;
  const bias = () => lastPosition() || map.getCenter();
  const currentPlace = position => ({
    current: true, title: 'Mein Standort',
    subtitle: position.accuracy ? 'genau auf etwa ' + Math.max(5, Math.round(position.accuracy / 5) * 5) + ' m' : '',
    lat: position.lat, lng: position.lng,
  });
  const favoriteItem = kind => ({ ...favorites[kind], favorite: kind, kind: FAVORITES[kind].label, title: favorites[kind].title });
  const sameSpot = (a, b) => a && b && distanceMeters(a, b) < 60;

  // ---------- stop list ----------
  function renderStops() {
    for (const cleanup of searchCleanups) cleanup();
    searchCleanups.clear();
    const list = $('stops');
    list.replaceChildren(...stops.map((stop, index) => stopRow(stop, index)));
    $('add-via').disabled = stops.length >= MAX_STOPS || !stops[stops.length - 1];
    $('swap').disabled = !stops.some(Boolean);
    $('clear-route').disabled = !stops.some(Boolean);
    drawMarkers();
  }

  function stopRow(stop, index) {
    const kind = kindOf(index);
    const row = document.createElement('li');
    row.className = 'stop';
    row.dataset.kind = kind;
    const dot = document.createElement('span');
    dot.className = 'stop-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = kind === 'start' ? 'S' : kind === 'end' ? 'Z' : String(index);
    const field = document.createElement('div');
    field.className = 'stop-field';
    const input = document.createElement('input');
    const listId = 'suggest-' + index;
    Object.assign(input, { type: 'search', value: stop?.title || '', autocomplete: 'off', spellcheck: false, enterKeyHint: 'search' });
    input.placeholder = kind === 'start' ? 'Von: Ort oder Adresse' : kind === 'end' ? 'Wohin? Ort, Adresse, Tankstelle …' : 'Zwischenstopp: Café, Tankstelle …';
    input.setAttribute('aria-label', labelOf(index));
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.classList.toggle('is-current', Boolean(stop?.current));
    const sub = document.createElement('small');
    sub.className = 'stop-sub';
    sub.textContent = stop ? (stop.kind ? stop.kind + (stop.subtitle ? ' · ' : '') : '') + (stop.subtitle || '') : '';
    const suggestions = document.createElement('ul');
    suggestions.className = 'suggestions';
    suggestions.id = listId;
    suggestions.setAttribute('role', 'listbox');
    suggestions.hidden = true;
    field.append(input, sub, suggestions);
    row.append(dot, field);

    if (kind === 'start') {
      const locate = document.createElement('button');
      locate.className = 'stop-btn';
      locate.innerHTML = ICONS.locate;
      locate.setAttribute('aria-label', 'Meinen Standort als Start setzen');
      locate.title = 'Mein Standort';
      locate.addEventListener('click', () => useCurrentLocation(index));
      row.append(locate);
    }
    if (kind === 'via' || stop) {
      const remove = document.createElement('button');
      remove.className = 'stop-btn';
      remove.innerHTML = ICONS.remove;
      remove.setAttribute('aria-label', kind === 'via' ? labelOf(index) + ' entfernen' : labelOf(index) + ' leeren');
      remove.addEventListener('click', () => {
        if (kind === 'via') stops.splice(index, 1);
        else stops[index] = null;
        changed();
      });
      row.append(remove);
    }
    wireSearch(input, suggestions, index);
    return row;
  }

  function wireSearch(input, list, index) {
    let timer = 0;
    let request = null;
    let options = [];
    let activeOption = -1;

    const close = () => { list.hidden = true; options = []; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); activeOption = -1; };
    let generation = 0;
    searchCleanups.add(() => { generation++; clearTimeout(timer); request?.abort(); close(); });
    const show = items => {
      input.removeAttribute('aria-activedescendant');
      options = items;
      activeOption = -1;
      list.replaceChildren(...items.map((item, i) => {
        const li = document.createElement('li');
        li.id = list.id + '-' + i;
        li.setAttribute('role', 'option');
        li.className = 'suggestion' + (item.current ? ' is-current' : '') + (item.favorite ? ' is-favorite' : '') + (item.info ? ' is-info' : '');
        if (item.info) { li.textContent = item.info; return li; }
        const icon = document.createElement('span');
        icon.className = 'suggestion-icon';
        icon.innerHTML = item.current ? ICONS.locate : item.favorite ? FAVORITES[item.favorite].icon : item.recent ? ICONS.clock : ICONS.pin;
        const text = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = item.title;
        const meta = document.createElement('small');
        meta.textContent = [item.kind, item.subtitle].filter(Boolean).join(' · ');
        text.append(title, meta);
        li.append(icon, text);
        if (item.distance !== undefined) {
          const d = document.createElement('em');
          d.textContent = item.distance < 1 ? '< 1 km' : Math.round(item.distance) + ' km';
          li.append(d);
        }
        li.addEventListener('pointerdown', event => { event.preventDefault(); pick(item); });
        return li;
      }));
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', String(!list.hidden));
    };
    const defaults = () => {
      const items = [];
      if (index === 0) items.push({ current: true, title: 'Mein Standort', subtitle: 'wo du gerade bist' });
      for (const kind of Object.keys(FAVORITES)) if (favorites[kind]) items.push(favoriteItem(kind));
      for (const place of recent()) items.push({ ...place, recent: true });
      return items;
    };
    const pick = item => {
      close();
      input.blur();
      if (item.info) return;
      if (item.current) { useCurrentLocation(index); return; }
      const { recent: _r, distance: _d, info: _i, ...place } = item;
      stops[index] = place;
      remember(place);
      changed();
      const next = stops.findIndex(s => !s);
      if (next >= 0 && matchMedia('(pointer: fine)').matches) document.querySelectorAll('#stops input')[next]?.focus();
    };
    const run = () => {
      if (!input.isConnected || document.activeElement !== input) return;
      const token = ++generation;
      const q = input.value.trim();
      const favs = matchFavorites(q, favorites).map(favoriteItem);
      if (q.length < 3) { show(favs.length ? favs : defaults()); return; }
      request?.abort();
      request = new AbortController();
      const near = bias();
      search(q, { lat: near.lat, lng: near.lng, signal: request.signal })
        .then(results => {
          // Ignore late answers for text the rider has already changed.
          if (token !== generation || !input.isConnected || document.activeElement !== input || input.value.trim() !== q) return;
          show(results.length || favs.length
            ? [...favs, ...results.map(r => ({ ...r, distance: distanceMeters(near, r) / 1000 }))]
            : [{ info: 'Nichts gefunden. Probier Ort plus Name, z. B. „Kesselberg Kochel“.' }]);
        })
        .catch(error => { if (token === generation && input.isConnected && document.activeElement === input && input.value.trim() === q && error.name !== 'AbortError') show([...favs, { info: (error.message || 'Suche gerade nicht möglich.') + ' Du kannst den Punkt auch auf der Karte antippen.' }]); });
    };

    input.addEventListener('focus', () => { input.select(); run(); });
    input.addEventListener('input', () => {
      generation++; close();
      clearTimeout(timer);
      request?.abort();
      const q = input.value.trim();
      // Favourites appear instantly; the place search follows after a short pause.
      const favs = matchFavorites(q, favorites).map(favoriteItem);
      if (q.length >= 3 && favs.length) show(favs);
      timer = setTimeout(run, q.length < 3 ? 0 : SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener('blur', () => {
      generation++; clearTimeout(timer); request?.abort();
      setTimeout(close, 120);
      if (!input.value.trim() && stops[index]) { stops[index] = null; changed(); }
      else if (stops[index]) input.value = stops[index].title;
    });
    input.addEventListener('keydown', event => {
      const selectable = options.filter(o => !o.info);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!options.length) return;
        activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : options.length - 1) + (activeOption < 0 && event.key === 'ArrowUp' ? 1 : 0)) % options.length;
        [...list.children].forEach((li, i) => li.classList.toggle('is-active', i === activeOption));
        input.setAttribute('aria-activedescendant', list.id + '-' + activeOption);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const choice = options[activeOption] && !options[activeOption].info ? options[activeOption] : selectable[0];
        if (choice) pick(choice);
      } else if (event.key === 'Escape') close();
    });
  }

  async function useCurrentLocation(index) {
    $('route-result').textContent = 'Standort wird bestimmt …';
    try {
      const token = revision;
      const position = await getPosition();
      if (token !== revision) return;
      stops[index] = currentPlace(position);
      $('route-result').textContent = '';
      changed();
    } catch (error) {
      $('route-result').textContent = error.message || 'Standort nicht verfügbar. Erlaube den Standort im Browser.';
    }
  }

  // ---------- map interaction ----------
  const pinIcon = (text, kind) => L.divIcon({ className: 'pin pin-' + kind, html: '<span><i>' + text + '</i></span>', iconSize: [38, 46], iconAnchor: [19, 44] });

  function drawMarkers() {
    group.eachLayer(layer => { if (layer instanceof L.Marker) group.removeLayer(layer); });
    stops.forEach((stop, index) => {
      if (!stop) return;
      const kind = kindOf(index);
      const marker = L.marker([stop.lat, stop.lng], {
        icon: pinIcon(kind === 'start' ? 'S' : kind === 'end' ? 'Z' : String(index), kind),
        draggable: true, autoPan: true, keyboard: false, title: labelOf(index) + ': ' + stop.title,
      }).addTo(group);
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        placeFromMap(index, lat, lng);
      });
    });
  }

  function placeFromMap(index, lat, lng) {
    const place = { title: 'Punkt auf der Karte', subtitle: lat.toFixed(4) + '°, ' + lng.toFixed(4) + '°', lat, lng };
    stops[index] = place;
    fitNext = false;
    changed();
    reverse(lat, lng).then(found => {
      if (stops[index] !== place || !found) return;
      stops[index] = { ...place, title: found.title, subtitle: found.subtitle || place.subtitle, kind: found.kind };
      renderStops();
      persist();
    }).catch(() => {});
  }

  map.on('click', event => {
    if (!active) return;
    let index = stops.findIndex(s => !s);
    if (index < 0) {
      if (stops.length >= MAX_STOPS) { toast('Maximal ' + MAX_STOPS + ' Punkte pro Route.'); return; }
      stops.push(null);
      index = stops.length - 1;
    }
    navigator.vibrate?.(12);
    placeFromMap(index, event.latlng.lat, event.latlng.lng);
  });

  // ---------- routing ----------
  function changed() {
    persist();
    renderStops();
    renderRemember();
    scheduleRoute();
  }

  function clearRouteLayers() {
    group.eachLayer(layer => { if (!(layer instanceof L.Marker)) group.removeLayer(layer); });
  }

  function invalidateRoute() {
    revision++;
    clearTimeout(routeTimer);
    const previous = controller;
    controller = null;
    previous?.abort();
    route = null; routeStops = null;
    clearRouteLayers(); renderCard();
  }

  function scheduleRoute() {
    invalidateRoute();
    if (stops.some(s => !s) || stops.length < 2) { $('route-result').textContent = ''; return; }
    const points = stops.map(s => ({ ...s }));
    const token = revision, avoid = avoidMotorways;
    $('route-result').textContent = 'Route wird berechnet …';
    routeTimer = setTimeout(() => computeRoute(points, token, avoid), 320);
  }

  async function computeRoute(points, token, avoid) {
    if (token !== revision) return false;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    try {
      const result = await fetchRoute(points, { avoidMotorways: avoid, signal: request.signal });
      if (token !== revision || controller !== request || request.signal.aborted) return false;
      route = result; routeStops = points;
      drawRoute(); renderCard(); $('route-result').textContent = '';
      if (fitNext && active) atlas.fitBounds(L.geoJSON(route.geometry).getBounds());
      fitNext = true;
      return true;
    } catch (error) {
      if (token !== revision || controller !== request) return false;
      route = null; routeStops = null; clearRouteLayers(); renderCard();
      $('route-result').textContent = request.signal.aborted
        ? 'Der Routenplaner antwortet nicht. Bitte erneut versuchen.' : error.message;
      return false;
    } finally { clearTimeout(timeout); }
  }

  function drawRoute() {
    clearRouteLayers();
    if (!route) return;
    L.geoJSON(route.geometry, { style: { color: '#04101f', weight: 11, opacity: .5 }, interactive: false }).addTo(group);
    L.geoJSON(route.geometry, { style: { color: getComputedStyle(document.documentElement).getPropertyValue('--plan').trim() || '#5cd2ff', weight: 5.5, opacity: 1 }, interactive: false }).addTo(group);
  }

  function renderCard() {
    $('route-card').hidden = !route;
    $('start-nav').disabled = !route;
    $('simulate-nav').disabled = !route;
    $('export-gpx').disabled = !route;
    renderRemember();
    $('plan-empty').hidden = stops.some(Boolean);
    if (!route) return;
    const latlngs = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const share = atlas.unexploredShare(latlngs);
    const percent = share === null ? null : Math.round(share * 100);
    $('route-km').textContent = (route.distance / 1000).toLocaleString('de-DE', { maximumFractionDigits: route.distance < 10000 ? 1 : 0 });
    $('route-time').textContent = formatDuration(route.duration);
    $('route-arrival').textContent = clock.format(Date.now() + route.duration * 1000);
    $('route-new').textContent = percent === null ? '–' : percent + ' %';
    $('route-new-bar').style.setProperty('--p', percent ?? 0);
    $('route-note').textContent = avoidMotorways && !route.avoidedMotorways
      ? 'Autobahnen meiden klappt gerade nicht. Die Route kann Autobahn enthalten.'
      : '';
  }

  // ---------- favourites ----------
  function renderFavorites() {
    const row = $('fav-row');
    row.replaceChildren(...Object.entries(FAVORITES).map(([kind, meta]) => {
      const button = document.createElement('button');
      button.className = 'fav' + (favorites[kind] ? '' : ' is-empty');
      button.dataset.fav = kind;
      button.innerHTML = meta.icon;
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = meta.label;
      const sub = document.createElement('small');
      sub.textContent = favorites[kind] ? favorites[kind].title : 'Noch nicht festgelegt';
      text.append(title, sub);
      button.append(text);
      button.setAttribute('aria-label', favorites[kind] ? meta.label + ' als Ziel: ' + favorites[kind].title : meta.label + ' festlegen');
      button.addEventListener('click', () => {
        if (!favorites[kind]) { toast('Suche den Ort als Ziel und tippe dann auf „Als ' + meta.label + ' merken“.'); focusDestination(); return; }
        const destination = { ...favorites[kind], favorite: kind };
        stops = [stops[0] || null, destination];
        changed();
        if (!stops[0]) useCurrentLocation(0);
      });
      return button;
    }));
    renderRemember();
    onFavoritesChange(favorites);
  }

  function renderRemember() {
    const box = $('remember');
    const target = stops.at(-1);
    if (!target || target.current) { box.hidden = true; return; }
    box.hidden = false;
    for (const button of box.querySelectorAll('[data-remember]')) {
      const kind = button.dataset.remember;
      const done = sameSpot(favorites[kind], target);
      button.setAttribute('aria-pressed', String(done));
      button.lastElementChild.textContent = done ? FAVORITES[kind].label + ' gespeichert' : 'Als ' + FAVORITES[kind].label + ' merken';
    }
  }

  function setFavorite(kind, place) {
    favorites = saveFavorite(kind, place);
    renderFavorites();
  }

  for (const button of $('remember').querySelectorAll('[data-remember]')) {
    button.addEventListener('click', () => {
      const kind = button.dataset.remember;
      const target = stops.at(-1);
      if (!target) return;
      if (sameSpot(favorites[kind], target)) return;
      const { favorite: _f, current: _c, ...place } = target;
      setFavorite(kind, place);
      navigator.vibrate?.(20);
      toast(FAVORITES[kind].label + ' gespeichert: ' + place.title);
    });
  }

  function focusDestination() {
    const inputs = document.querySelectorAll('#stops input');
    const target = stops[0] ? inputs[inputs.length - 1] : inputs[0];
    setTimeout(() => target?.focus(), 80);
  }

  // ---------- GPX export ----------
  async function exportGpx() {
    if (!route) return;
    const used = routeStops;
    const text = routeToGpx(route, used);
    const name = gpxFilename(used);
    const file = typeof File === 'function' ? new File([text], name, { type: 'application/gpx+xml' }) : null;
    // Share targets and GPX support depend on the installed applications.
    if (file && navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file], title: 'Tour ' + used[0].title + ' – ' + used.at(-1).title }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Tour gespeichert: ' + name);
  }
  $('export-gpx').addEventListener('click', exportGpx);

  // One tap from the start screen: route from here to a favourite and go.
  async function quickNavigate(kind) {
    const destination = favorites[kind];
    if (!destination) return false;
    if (quickBusy || navigationStarting) return true;
    quickBusy = true;
    invalidateRoute();
    const token = revision;
    try {
      const position = await getPosition();
      if (token !== revision) return true;
      if (distanceMeters(position, destination) < 150) { toast('Du bist schon da.'); return true; }
      stops = [currentPlace(position), { ...destination, favorite: kind }];
      persist(); renderStops();
      if (await computeRoute(stops.map(s => ({ ...s })), token, avoidMotorways)) await go(false);
    } catch (error) { if (token === revision) toast(error.message); }
    finally { quickBusy = false; }
    return true;
  }

  // ---------- buttons ----------
  $('add-via').addEventListener('click', () => {
    stops.splice(stops.length - 1, 0, null);
    changed();
    document.querySelectorAll('#stops input')[stops.length - 2]?.focus();
  });
  $('swap').addEventListener('click', () => { stops.reverse(); if (stops.at(-1)?.current) toast('Hinweis: Dein Standort ist jetzt das Ziel.'); changed(); });
  $('clear-route').addEventListener('click', () => { stops = [null, null]; changed(); });
  $('avoid-motorways').checked = avoidMotorways;
  $('avoid-motorways').addEventListener('change', event => { avoidMotorways = event.target.checked; fitNext = false; changed(); });
  const go = async simulate => {
    if (!route || !routeStops || navigationStarting) return;
    navigationStarting = true;
    const token = revision;
    try {
      await onNavigate({ route, stops: routeStops.map(s => ({ ...s })), avoidMotorways, simulate,
        record: $('nav-record').checked && !simulate, isCurrent: () => token === revision });
    } catch (error) { toast(error.message || 'Start fehlgeschlagen.'); }
    finally { navigationStarting = false; }
  };
  $('start-nav').addEventListener('click', () => go(false));
  $('simulate-nav').addEventListener('click', () => go(true));

  renderStops();
  renderCard();
  renderFavorites();

  return {
    activate(on) {
      if (on === active) return;
      active = on;
      document.getElementById('map').classList.toggle('is-planning', on);
      if (on) {
        group.addTo(map);
        if (!route && stops.filter(Boolean).length >= 2) scheduleRoute();
        else if (route) atlas.fitBounds(L.geoJSON(route.geometry).getBounds());
      } else {
        group.remove(); clearTimeout(routeTimer);
        if (controller) { const previous = controller; controller = null; previous.abort(); }
        for (const cleanup of searchCleanups) cleanup();
      }
    },
    refresh() { if (active && route) renderCard(); },
    focusDestination,
    quickNavigate,
    favorites: () => favorites,
    setFavorite,
    async favoriteFromHere(kind) {
      const position = await getPosition();
      const found = await reverse(position.lat, position.lng).catch(() => null);
      setFavorite(kind, { title: found?.title || 'Mein Ort', subtitle: found?.subtitle || '', kind: '', lat: position.lat, lng: position.lng });
      return favorites[kind];
    },
  };
}
