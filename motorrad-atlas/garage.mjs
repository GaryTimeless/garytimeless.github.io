import { createGuidance } from './guidance.mjs';
import { setupPlaceSearch } from './place-search.mjs?v=navigation2';
export function setupGarage(atlas) {
  const byId = id => document.getElementById(id);
  const {map} = atlas;
  const guidance = createGuidance(map);
  const group = L.layerGroup();
  let points = [];
  let savedRoute;
  let searchedGoal = false;
  let goalOnly = false;
  try {
    const saved = JSON.parse(localStorage.getItem('atlas-tourplan'));
    if (Array.isArray(saved?.points)) {
      points = saved.points.map(p => Object.assign(L.latLng(p.lat,p.lng), {name:p.name}));
      searchedGoal = Boolean(saved.searchedGoal && points.length);
      goalOnly = searchedGoal && points.length === 1 && saved.goalOnly;
      savedRoute = saved.route;
    }
  } catch { points = []; }
  function persist() {
    try { localStorage.setItem('atlas-tourplan',JSON.stringify({points,route:savedRoute,searchedGoal,goalOnly})); } catch {}
  }
  let line;
  let controller;
  let firstMap = true;
  const motion = byId('motion');
  motion.checked = localStorage.getItem('atlas-clouds') === null
    ? !matchMedia('(prefers-reduced-motion: reduce)').matches : localStorage.getItem('atlas-clouds') === 'on';
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event => {
    if (localStorage.getItem('atlas-clouds') === null) motion.checked = !event.matches;
  });
  motion.onchange = () => localStorage.setItem('atlas-clouds',motion.checked ? 'on' : 'off');
  byId('invite').onclick = () => byId('invite-dialog').showModal();
  byId('check').onclick = async () => {
    let permission = 'unbekannt';
    try {
      const result = await navigator.permissions.query({name:'geolocation'});
      permission = {granted:'erlaubt',prompt:'wird beim Start erfragt',denied:'gesperrt'}[result.state];
    } catch {}
    byId('check-result').textContent = 'Standort: ' + permission + ' · Wachhalten: ' + ('wakeLock' in navigator ? 'unterstützt' : 'nicht verfügbar') + ' · Wolken: ' + (motion.checked ? 'animiert' : 'ruhig');
  };

  function view() {
    const route = location.hash.slice(1);
    const current = ['aufnahme','statistik','plan','werkstatt'].includes(route) ? route : 'garage';
    document.body.dataset.view = current;
    byId('garage').hidden = current !== 'garage';
    document.querySelector('.atlas').hidden = current === 'garage';
    document.querySelector('.map-panel').hidden = !['aufnahme','plan'].includes(current);
    document.querySelector('.intro').hidden = current !== 'aufnahme';
    byId('fahrten').hidden = current !== 'statistik';
    byId('werkstatt-panel').hidden = current !== 'werkstatt';
    byId('plan-panel').hidden = current !== 'plan';
    byId('home-link').hidden = current === 'garage';
    if (current === 'plan') group.addTo(map);
    else { group.remove(); guidance.stop(); }
    if (current === 'plan' || current === 'aufnahme') {
      map.invalidateSize({pan:false});
      if (firstMap && current === 'plan' && points.length) map.fitBounds(L.latLngBounds(points),{padding:[28,28],maxZoom:15,animate:false});
      else if (firstMap) atlas.showGermany();
      firstMap = false;
    }
    const target = current === 'statistik' ? byId('fahrten') : document.querySelector(current === 'garage' ? '#garage h1' : current === 'aufnahme' ? '.intro h1' : '#' + current + '-panel h1');
    target.tabIndex = -1;
    target.focus({preventScroll:true});
    if (current === 'statistik') byId('fahrten').append(byId('status'));
    else document.querySelector('.intro .actions').before(byId('status'));
    window.scrollTo(0,0);
  }
  function updatePoints(restore = false) {
    controller?.abort(); controller = null;
    byId('navigation').hidden = true;
    byId('navigation-links').replaceChildren();
    group.clearLayers();
    line = null;
    const stops = byId('stops');
    stops.replaceChildren();
    points.forEach((point,index) => {
      const label = goalOnly ? 'Ziel' : index === 0 ? 'Start' : index === points.length - 1 ? 'Ziel' : 'Zwischenziel';
      L.marker(point).bindTooltip(label).addTo(group);
      const item = document.createElement('li');
      item.textContent = label + ' · ' + (point.name || point.lat.toFixed(3) + '°, ' + point.lng.toFixed(3) + '°');
      stops.append(item);
    });
    byId('calculate').disabled = points.length < 2;
    byId('undo').disabled = !points.length;
    byId('route-result').textContent = '';
    if (restore && savedRoute) showRoute(savedRoute);
    else { savedRoute = null; persist(); }
  }
  function showRoute(route) {
    const links = byId('navigation-links');
    links.replaceChildren();
    // Mobile Maps URLs support three intermediate stops per link.
    for (let start = 0; start < points.length - 1; start += 4) {
      const leg = points.slice(start,start + 5).map(point => point.lat + ',' + point.lng);
      const params = new URLSearchParams({api:'1',origin:leg[0],destination:leg.at(-1),travelmode:'driving',dir_action:'navigate'});
      if (leg.length > 2) params.set('waypoints',leg.slice(1,-1).join('|'));
      const link = document.createElement('a');
      link.className = 'primary';
      link.textContent = points.length <= 5 ? 'Navigation in Google Maps starten' : 'Etappe ' + (start / 4 + 1) + ' in Google Maps starten';
      link.href = 'https://www.google.com/maps/dir/?' + params;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    }
    byId('navigation').hidden = !links.childElementCount;
    if (line) group.removeLayer(line);
    line = L.geoJSON(route.geometry,{style:{color:'#1b4193',weight:6}}).addTo(group);
    const minutes = Math.max(1,Math.round(route.duration/60));
    byId('route-result').textContent = (route.distance/1000).toLocaleString('de-DE',{maximumFractionDigits:1}) + ' km · ca. ' + minutes + (minutes === 1 ? ' Minute' : ' Minuten');

  }
  map.on('click',event => {
    if (document.body.dataset.view === 'plan' && !document.body.classList.contains('guiding')) {
      if (searchedGoal) points.splice(points.length - 1,0,event.latlng);
      else points.push(event.latlng);
      goalOnly = false;
      updatePoints();
    }
  });
  byId('undo').onclick = () => {
    points.pop();
    searchedGoal = false;
    goalOnly = false;
    updatePoints();
  };
  setupPlaceSearch({
    start(point) {
      if (goalOnly) points.unshift(point);
      else points[0] = point;
      goalOnly = false;
      updatePoints();
      framePlan();
    },
    destination(point) {
      if (goalOnly || points.length >= 2) points[points.length - 1] = point;
      else points.push(point);
      searchedGoal = true;
      goalOnly = points.length === 1;
      updatePoints();
      framePlan();
      return goalOnly;
    }
  });
  function framePlan() {
    map.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:14,animate:false});
  }
  async function calculate() {
    const request = new AbortController();
    controller?.abort();
    controller = request;
    byId('calculate').disabled = true;
    byId('route-result').textContent = 'Straßenroute wird berechnet …';
    const timeout = setTimeout(() => request.abort(),15000);
    try {
      const coords = points.map(p => p.lng + ',' + p.lat).join(';');
      const response = await fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson&steps=true',{signal:request.signal});
      const data = await response.json();
      if (controller !== request) return;
      if (!response.ok || data.code !== 'Ok') throw Error();
      const route = data.routes[0];
      savedRoute = route;
      showRoute(route);
      map.fitBounds(line.getBounds(),{padding:[30,30],animate:false});
      persist();
      return route;
    } catch {
      if (controller === request) byId('route-result').textContent = 'Route nicht verfügbar. Prüfe die Verbindung oder ändere einen Punkt.';
    } finally {
      clearTimeout(timeout);
      if (controller === request) byId('calculate').disabled = points.length < 2;
    }
  };
  byId('calculate').onclick = calculate;
  byId('guide-start').onclick = async () => {
    const route = savedRoute?.legs?.every(leg => leg.steps?.length) ? savedRoute : await calculate();
    if (route && savedRoute === route && document.body.dataset.view === 'plan') guidance.start(route);
  };
  updatePoints(true);
  window.addEventListener('hashchange',view);
  view();
  return {openRecording() {location.hash = 'aufnahme'; view();}};
}
