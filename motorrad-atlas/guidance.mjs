const actions = {
  left:'Links abbiegen',right:'Rechts abbiegen','sharp left':'Scharf links abbiegen',
  'sharp right':'Scharf rechts abbiegen','slight left':'Leicht links halten',
  'slight right':'Leicht rechts halten',straight:'Geradeaus fahren',uturn:'Wenden',
};

function instruction(step) {
  const {type,modifier,exit} = step.maneuver;
  if (type === 'arrive') return 'Ziel erreichen';
  if (type === 'roundabout' || type === 'rotary') return exit ? 'Im Kreisverkehr die ' + exit + '. Ausfahrt nehmen' : 'In den Kreisverkehr fahren';
  const direction = modifier?.includes('left') ? 'links' : modifier?.includes('right') ? 'rechts' : 'geradeaus';
  const special = {depart:'Losfahren',fork:'An der Gabelung ' + direction + ' halten',merge:'Einfädeln','off ramp':'Die Ausfahrt nehmen','on ramp':'Auf die Auffahrt fahren','exit roundabout':'Den Kreisverkehr verlassen','exit rotary':'Den Kreisverkehr verlassen'};
  const action = special[type] || actions[modifier] || 'Dem Straßenverlauf folgen';
  return action + (step.name ? ' · ' + step.name : '');
}

function prepare(route) {
  const segments = [];
  const turns = [];
  let distance = 0;
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const intermediate = step.maneuver.type === 'arrive' && leg !== route.legs.at(-1);
      turns.push({at:distance,text:intermediate ? 'Zwischenziel erreichen' : instruction(step)});
      const coords = step.geometry.coordinates;
      for (let i = 1; i < coords.length; i++) {
        const [lng,lat] = coords[i-1];
        const scale = 111195 * Math.cos(lat * Math.PI / 180);
        const dx = (coords[i][0] - lng) * scale;
        const dy = (coords[i][1] - lat) * 111195;
        const length = Math.hypot(dx,dy);
        if (length > 0) segments.push({lng,lat,scale,dx,dy,length,at:distance});
        distance += length;
      }
    }
  }
  return {segments,turns,distance};
}

function nearest(segments,coords,previous) {
  let best;
  for (const s of segments) {
    const x = (coords.longitude-s.lng)*s.scale;
    const y = (coords.latitude-s.lat)*111195;
    const t = Math.max(0,Math.min(1,(x*s.dx+y*s.dy)/(s.length*s.length)));
    const error = Math.hypot(x-t*s.dx,y-t*s.dy);
    const at = s.at+t*s.length;
    // Prefer the nearby stretch of the trip at crossings and on out-and-back routes.
    const score = error + Math.min(24,Math.abs(at-previous)*.015);
    if (!best || score < best.score) best = {error,at,score};
  }
  return best;
}

export function createGuidance(map) {
  const panel = document.getElementById('guidance');
  const hint = document.getElementById('guide-hint');
  const detail = document.getElementById('guide-detail');
  let watch = null;
  let marker;
  let generation = 0;
  function stop() {
    generation++;
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null;
    marker?.remove();
    marker = null;
    panel.hidden = true;
    document.body.classList.remove('guiding');
    map.invalidateSize({pan:false});
  }
  document.getElementById('guide-stop').onclick = stop;
  return {stop, start(route) {
    stop();
    const run = generation;
    const trip = prepare(route);
    let previous = 0;
    document.body.classList.add('guiding');
    panel.hidden = false;
    window.scrollTo(0,0);
    map.invalidateSize({pan:false});
    hint.textContent = 'Standort wird gesucht …';
    detail.textContent = 'Chrome sichtbar und Display eingeschaltet lassen.';
    if (!navigator.geolocation) {hint.textContent = 'GPS ist in diesem Browser nicht verfügbar.'; return;}
    watch = navigator.geolocation.watchPosition(({coords}) => {
      if (run !== generation) return;
      if (coords.accuracy > 80) {hint.textContent = 'GPS zu ungenau'; detail.textContent = 'Warte auf ein besseres Signal.'; return;}
      const position = [coords.latitude,coords.longitude];
      if (!marker) marker = L.circleMarker(position,{radius:9,color:'white',weight:3,fillColor:'#1360be',fillOpacity:1}).addTo(map);
      else marker.setLatLng(position);
      map.setView(position,16,{animate:false});
      const match = nearest(trip.segments,coords,previous);
      if (!match || match.error > Math.max(45,coords.accuracy)) {
        hint.textContent = 'Außerhalb der geplanten Route';
        detail.textContent = 'Die blaue Linie zeigt den geplanten Verlauf.';
        return;
      }
      previous = match.at;
      const left = trip.distance-match.at;
      if (left < 25) {
        hint.textContent = 'Ziel erreicht';
        detail.textContent = 'Deine Navigation ist abgeschlossen.';
        navigator.geolocation.clearWatch(watch);
        watch = null;
        return;
      }
      const next = trip.turns.find(turn => turn.at > match.at + 5) || trip.turns.at(-1);
      const meters = Math.max(0,Math.round(next.at-match.at));
      hint.textContent = (meters >= 1000 ? (meters/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km' : meters+' m') + ' · ' + next.text;
      detail.textContent = 'Noch ' + (left/1000).toLocaleString('de-DE',{maximumFractionDigits:1}) + ' km bis zum Ziel';
    },error => {
      if (run !== generation) return;
      hint.textContent = error.code === 1 ? 'Standortzugriff gesperrt' : 'GPS-Signal fehlt';
      detail.textContent = error.code === 1 ? 'Erlaube den Standort in Chrome und starte die Navigation erneut.' : 'Warte auf das nächste Signal.';
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  }};
}
