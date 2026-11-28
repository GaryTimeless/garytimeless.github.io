import maplibre from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {FerrostarCore,BrowserLocationProvider,SimulatedLocationProvider} from '@stadiamaps/ferrostar-webcomponents';

const ui = document.createElement('ferrostar-map');
const start = document.querySelector('#start');
const note = document.querySelector('#note');
const live = new URLSearchParams(location.search).get('fahrt') === 'live';
const wpg = new URLSearchParams(location.search).get('von') === 'wpg';
if (wpg) {
  const back = document.querySelector('header a');
  back.href = '../../Motorrad-Atlas-WPG/#plan';
  back.textContent = 'Zum Atlas WPG';
}
let stops = [];
if (live) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(wpg ? 'wpg-live-waypoints' : 'atlas-live-waypoints'));
    if (Array.isArray(stored) && stored.every(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))) stops = stored;
  } catch {}
  document.title = 'Motorrad-Atlas · GPS-Navigation';
  document.querySelector('header strong').textContent = 'Ferrostar · GPS-Navigation';
  start.textContent = 'GPS-Navigation starten';
  note.textContent = stops.length < 2 ? 'Wähle zuerst Start und Ziel im Atlas.' :
    'Ziel: ' + (stops.at(-1).name || stops.at(-1).title || 'Kartenpunkt') + '. Zum Start erhält der Routingdienst Valhalla deinen Standort und die Wegpunkte. Lass die Seite während der Fahrt sichtbar.';
}
const map = new maplibre.Map({container:'map',center:live && stops.length ? [stops[0].lng,stops[0].lat] : [8.425,48.995],zoom:16,pitch:48,
  style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}},layers:[{id:'roads',type:'raster',source:'osm'}]}});
const ready = Promise.all([customElements.whenDefined('ferrostar-map'),new Promise(resolve=>map.on('load',resolve))]);
ready.then(()=>{
  ui.geolocateOnLoad=false;
  ui.addGeolocateControl=false;
  ui.map=map;
  document.querySelector("main").append(ui);
  start.disabled=live && stops.length<2;
});
const config={stepAdvanceCondition:{DistanceEntryExit:{minimumHorizontalAccuracy:25,distanceToEndOfStep:30,distanceAfterEndStep:5,hasReachedEndOfCurrentStep:false}},arrivalStepAdvanceCondition:{DistanceToEndOfStep:{distance:30,minimumHorizontalAccuracy:25}},routeDeviationTracking:{StaticThreshold:{minimumHorizontalAccuracy:25,maxAcceptableDeviation:30}},snappedLocationCourseFiltering:'Raw',waypointAdvance:{WaypointWithinRange:100}};
start.onclick=async()=>{
  if(start.dataset.running){location.reload();return;}
  start.disabled=true;
  try{
    const engine=new FerrostarCore();
    engine.profile='motorcycle';
    engine.valhallaEndpointUrl='https://valhalla1.openstreetmap.de/route';
    const voice=document.querySelector('#voice');
    engine.useVoiceGuidance=voice.checked;
    voice.onchange=()=>{engine.useVoiceGuidance=voice.checked;};
    const provider = live ? new BrowserLocationProvider() : new SimulatedLocationProvider();
    let origin;
    let waypoints;
    if (live) {
      note.textContent = 'Standort wird ermittelt …';
      let timer;
      try {
        origin = await Promise.race([provider.getCurrentLocation(5000),new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(Error('GPS timeout')),18000);
        })]);
      } finally { clearTimeout(timer); }
      const distance = new maplibre.LngLat(origin.coordinates.lng,origin.coordinates.lat).distanceTo(new maplibre.LngLat(stops[0].lng,stops[0].lat));
      const remaining = distance < 100 ? stops.slice(1) : stops;
      waypoints = remaining.map(({lat,lng}) => ({coordinate:{lat,lng},kind:'Break'}));
      engine.options = {language:'de-DE',directions_options:{language:'de-DE'}};
      // GET also works on mobile browsers without a cross-origin POST preflight.
      engine.httpClient = async (endpoint,options) => {
        const url = new URL(endpoint);
        url.searchParams.set('json',new TextDecoder().decode(options.body));
        const response = await fetch(url,{signal:AbortSignal.timeout(18000),referrerPolicy:'strict-origin-when-cross-origin'});
        if (!response.ok) throw Error('routing');
        return response;
      };
      note.textContent = 'Motorradroute wird berechnet …';
    } else {
      engine.httpClient=()=>fetch('./karlsruhe.json');
      origin={coordinates:{lat:48.995,lng:8.425},horizontalAccuracy:5,courseOverGround:null,timestamp:Date.now(),speed:null};
      waypoints=[{coordinate:{lat:48.999,lng:8.443},kind:'Break'}];
    }
    const [route]=await engine.getRoutes(origin,waypoints);
    if (!live) {
      provider.warpFactor=4;
      provider.setSimulatedRoute(route);
    }
    engine.locationProvider=provider;
    ui.route=route;
    ui.linkWith(engine,true);
    engine.onNavigationStop=()=>{provider.stop();location.reload();};
    engine.startNavigation(route,config);
    note.textContent=live ? 'GPS-Führung aktiv · Chrome sichtbar lassen.' : 'Simulierte Motorradfahrt · vierfache Geschwindigkeit';
    start.dataset.running='true';start.textContent=live ? 'Navigation beenden' : 'Testfahrt zurücksetzen';
  }catch(error){console.error(error);note.textContent=live ? (error?.code === 1 ? 'Standortzugriff gesperrt. Erlaube den Standort für diese Seite und starte erneut.' : 'Navigation konnte nicht starten. Prüfe GPS, Verbindung und Wegpunkte und versuche es erneut.') : 'Die Testfahrt konnte nicht starten. Bitte erneut versuchen.';}
  start.disabled=false;
};
