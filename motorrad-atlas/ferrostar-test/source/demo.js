import maplibre from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {FerrostarCore,FerrostarMap,SimulatedLocationProvider} from '@stadiamaps/ferrostar-webcomponents';

const ui = document.createElement('ferrostar-map');
const start = document.querySelector('#start');
const note = document.querySelector('#note');
const map = new maplibre.Map({container:'map',center:[8.425,48.995],zoom:16,pitch:48,
  style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}},layers:[{id:'roads',type:'raster',source:'osm'}]}});
const ready = Promise.all([customElements.whenDefined('ferrostar-map'),new Promise(resolve=>map.on('load',resolve))]);
ready.then(()=>{
  ui.geolocateOnLoad=false;
  ui.addGeolocateControl=false;
  ui.map=map;
  document.querySelector("main").append(ui);
  start.disabled=false;
});
const config={stepAdvanceCondition:{DistanceEntryExit:{minimumHorizontalAccuracy:25,distanceToEndOfStep:30,distanceAfterEndStep:5,hasReachedEndOfCurrentStep:false}},arrivalStepAdvanceCondition:{DistanceToEndOfStep:{distance:30,minimumHorizontalAccuracy:25}},routeDeviationTracking:{StaticThreshold:{minimumHorizontalAccuracy:25,maxAcceptableDeviation:30}},snappedLocationCourseFiltering:'Raw',waypointAdvance:{WaypointWithinRange:100}};
start.onclick=async()=>{
  if(start.dataset.running){location.reload();return;}
  start.disabled=true;
  try{
    const engine=new FerrostarCore();
    engine.profile='motorcycle';
    engine.valhallaEndpointUrl='https://valhalla1.openstreetmap.de/route';
    // Reuse the German Valhalla motorcycle response across all replay sessions.
    engine.httpClient=()=>fetch('./karlsruhe.json');
    const voice=document.querySelector('#voice');
    engine.useVoiceGuidance=voice.checked;
    voice.onchange=()=>{engine.useVoiceGuidance=voice.checked;};
    const location={coordinates:{lat:48.995,lng:8.425},horizontalAccuracy:5,courseOverGround:null,timestamp:Date.now(),speed:null};
    const [route]=await engine.getRoutes(location,[{coordinate:{lat:48.999,lng:8.443},kind:'Break'}]);
    const provider=new SimulatedLocationProvider();
    provider.warpFactor=4;
    provider.setSimulatedRoute(route);
    engine.locationProvider=provider;
    ui.route=route;
    ui.linkWith(engine,true);
    engine.onNavigationStop=()=>location.reload();
    engine.startNavigation(route,config);
    note.textContent='Simulierte Motorradfahrt · vierfache Geschwindigkeit';
    start.dataset.running='true';start.textContent='Testfahrt zurücksetzen';
  }catch(error){console.error(error);note.textContent='Die Testfahrt konnte nicht starten. Bitte erneut versuchen.';}
  start.disabled=false;
};
