// Karte: Leaflet, Bundesland/WMS, Mini-Karte, Statistik, Downloads, Lage/ALKIS, Hochspannung, Naturschutz
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---------- Map ----------
// Mapbox-Zugangstoken (kostenloses Konto reicht, Public Token vom Typ "pk.…").
// Solange hier nichts eingetragen ist, läuft die App unverändert nur mit OSM/Esri weiter —
// die Mapbox-Basiskarte taucht dann einfach nicht im Layer-Control auf.
// Token erstellen/finden: https://account.mapbox.com/access-tokens/
const MAPBOX_ACCESS_TOKEN = ''; // Demo: ohne Mapbox

const map = L.map('map', { zoomControl:true }).setView([49.7596, 6.6439], 11); // Trier
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:'© OpenStreetMap-Mitwirkende', maxZoom:19
});
const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution:'© Esri', maxZoom:19
});
// Mapbox "Satellite Streets" — Luftbild mit Straßen-/Beschriftungs-Overlay, alternative
// Basiskarte zu Esri-Satellit. tileSize 512 + zoomOffset -1 ist das übliche Leaflet-Setup
// für Mapbox-Styles (die intern in 512px-Kacheln liefern statt der Leaflet-Standard-256px).
const mapboxSatStreets = MAPBOX_ACCESS_TOKEN ? L.tileLayer(
  'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}{r}?access_token={accessToken}',
  { attribution:'© Mapbox © OpenStreetMap-Mitwirkende', tileSize:512, zoomOffset:-1, maxZoom:22, accessToken:MAPBOX_ACCESS_TOKEN }
) : null;
// Standard-Basiskarte: Mapbox, falls Token vorhanden — sonst Fallback auf OSM (wie bisher).
(mapboxSatStreets || osm).addTo(map);
const drawnItems       = new L.FeatureGroup().addTo(map);
const otherProjectsLayer = new L.FeatureGroup().addTo(map);
const lageLayer        = new L.FeatureGroup().addTo(map);
const lageLabelsLayer  = new L.FeatureGroup().addTo(map);
const uwLayer          = new L.FeatureGroup().addTo(map); // Umspannwerk-Marker
const trasseLayer      = new L.FeatureGroup().addTo(map); // Trassenvorschläge Anlage→UW
const radiusLayer      = new L.FeatureGroup().addTo(map); // Such-Radius-Kreis
const osmLinesLayer    = new L.FeatureGroup().addTo(map); // OSM Hochspannungsleitungen (read-only)

// ALKIS-WMS overlay — URL/layer wird automatisch je Bundesland gesetzt und (sofern ein
// Dienst hinterlegt ist) automatisch eingeblendet, sobald der Kartenausschnitt in das
// jeweilige Bundesland wechselt.
const alkisWmsLayer = L.tileLayer.wms('https://example.invalid/wms', {
  layers:'', format:'image/png', transparent:true, version:'1.3.0', opacity:0.8
});
// Naturschutz-WMS overlay — gleiches Prinzip, aber bewusst NICHT automatisch eingeblendet
// (nur ALKIS soll sich automatisch aktivieren); Nutzer schaltet ihn selbst zu.
const naturschutzWmsLayer = L.tileLayer.wms('https://example.invalid/wms', {
  layers:'', format:'image/png', transparent:true, version:'1.3.0', opacity:0.7
});

const baseLayers = { 'OpenStreetMap':osm, 'Satellit (Esri)':esri };
if(mapboxSatStreets) baseLayers['Mapbox (Satellit + Straßen)'] = mapboxSatStreets;
L.control.layers(
  baseLayers,
  {
    'Projektgebiet':drawnItems,
    'Andere Projekte':otherProjectsLayer,
    'Flurstücke (Vektor)':lageLayer,
    'Flurstücksnummern':lageLabelsLayer,
    'ALKIS-WMS (Bundesland)':alkisWmsLayer,
    'Naturschutz-WMS (Bundesland)':naturschutzWmsLayer,
    'Umspannwerke':uwLayer,
    'Trassenvorschläge':trasseLayer,
    'Such-Radius':radiusLayer,
    'Hochspannungsleitungen (OSM)':osmLinesLayer
  },
  { collapsed:true, position:'topright' }
).addTo(map);

L.control.scale({ position:'bottomleft', metric:true, imperial:false }).addTo(map);

// Zusätzliche klassische "1:X"-Maßstabsangabe neben dem Balkenmaßstab. Bezugsgröße ist das
// CSS-Referenzpixel (1px = 1/96 Zoll, W3C-Standard) statt der tatsächlichen Gerätepixeldichte —
// ein Bildschirm-Maßstab ist sonst geräteabhängig (Retina/HiDPI zeigt sonst denselben Ausschnitt
// mit anderem "1:X"); 96dpi ist der übliche geräteunabhängige Bezug für Web-Karten.
const REF_PX_METERS = 0.0254 / 96;
const scaleRatioControl = L.control({ position:'bottomleft' });
scaleRatioControl.onAdd = function(){
  this._div = L.DomUtil.create('div', 'leaflet-control-scale-ratio');
  return this._div;
};
scaleRatioControl.update = function(){
  const metersPerPx = 156543.03392 * Math.cos(map.getCenter().lat * Math.PI/180) / Math.pow(2, map.getZoom());
  const ratio = Math.round(metersPerPx / REF_PX_METERS);
  this._div.textContent = `Maßstab 1:${ratio.toLocaleString('de-DE')}`;
};
scaleRatioControl.addTo(map);
scaleRatioControl.update();
map.on('zoomend moveend', () => scaleRatioControl.update());

// ---------- Bundesland-Erkennung + WMS-Registry ----------
// Stadtstaaten zuerst, damit sie bei Überschneidungen gewinnen.
const STATES = [
  { key:'BE', name:'Berlin',                bbox:[52.33,13.08,52.68,13.77] },
  { key:'HH', name:'Hamburg',               bbox:[53.39, 9.73,53.74,10.33] },
  { key:'HB', name:'Bremen',                bbox:[53.01, 8.48,53.61, 8.99] },
  { key:'SL', name:'Saarland',              bbox:[49.11, 6.36,49.64, 7.40] },
  { key:'SH', name:'Schleswig-Holstein',    bbox:[53.36, 7.86,55.06,11.32] },
  { key:'MV', name:'Mecklenburg-Vorpommern',bbox:[53.10,10.59,54.69,14.41] },
  { key:'BB', name:'Brandenburg',           bbox:[51.36,11.27,53.56,14.77] },
  { key:'ST', name:'Sachsen-Anhalt',        bbox:[50.94,10.56,53.04,13.19] },
  { key:'TH', name:'Thüringen',             bbox:[50.20, 9.87,51.65,12.65] },
  { key:'SN', name:'Sachsen',               bbox:[50.17,11.87,51.69,15.04] },
  { key:'HE', name:'Hessen',                bbox:[49.39, 7.77,51.66,10.24] },
  { key:'RP', name:'Rheinland-Pfalz',       bbox:[48.97, 6.11,50.94, 8.51] },
  { key:'NW', name:'Nordrhein-Westfalen',   bbox:[50.32, 5.86,52.53, 9.46] },
  { key:'BW', name:'Baden-Württemberg',     bbox:[47.53, 7.51,49.79,10.50] },
  { key:'BY', name:'Bayern',                bbox:[47.27, 8.97,50.56,13.84] },
  { key:'NI', name:'Niedersachsen',         bbox:[51.30, 6.65,53.90,11.59] },
];

// ---------- Mini-Deutschlandkarte (Listenübersicht) ----------
const GERMANY_BBOX = (function(){
  const lats = STATES.flatMap(s => [s.bbox[0], s.bbox[2]]);
  const lons = STATES.flatMap(s => [s.bbox[1], s.bbox[3]]);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
})();

function projectLocationLatLon(p){
  if(!p.features || !p.features.length) return null;
  try {
    const c = turf.centroid(combinedFeatureCollection(p)).geometry.coordinates; // [lon,lat]
    return { lat: c[1], lon: c[0] };
  } catch { return null; }
}

// germany-map.png ist eine klassische Bundesländer-Umrisskarte (594×802px); ihr Seitenverhältnis
// entspricht fast exakt dem von GERMANY_BBOX unter Berücksichtigung der Breitengrad-Verzerrung,
// daher genügt eine einfache lineare Projektion mit kleinem Rand-Puffer (die Umrisslinie berührt
// den Bildrand nicht ganz) für eine hinreichend genaue Marker-Position.
const GERMANY_IMG_PAD = 0.03;
function miniGermanyMapHtml(loc){
  let marker = '';
  if(loc){
    const bb = GERMANY_BBOX;
    const leftPct = (GERMANY_IMG_PAD + (loc.lon - bb.minLon) / (bb.maxLon - bb.minLon) * (1 - 2*GERMANY_IMG_PAD)) * 100;
    const topPct  = (GERMANY_IMG_PAD + (bb.maxLat - loc.lat) / (bb.maxLat - bb.minLat) * (1 - 2*GERMANY_IMG_PAD)) * 100;
    marker = `<span class="mini-map-marker" style="left:${leftPct.toFixed(2)}%;top:${topPct.toFixed(2)}%"></span>`;
  }
  return `<div class="mini-map-img" role="img" aria-label="Lage in Deutschland">${marker}</div>`;
}

// Pro Bundesland: getesteter freier WMS-Endpoint für ALKIS-Liegenschaftskarte
// (Layer-Namen einzeln per GetCapabilities verifiziert, Stand 2026-07 — siehe GEOLAYER-QUELLEN.md)
const WMS_REGISTRY = {
  BY: { url:'https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte',                  layers:'by_alkis_parzellarkarte_farbe', version:'1.3.0', attribution:'© Bayer. Vermessungsverwaltung' },
  NI: { url:'https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wms',                layers:'ALKIS',                version:'1.3.0', attribution:'© LGLN Niedersachsen' },
  NW: { url:'https://www.wms.nrw.de/geobasis/wms_nw_alkis_gelb',                              layers:'adv_alkis_flurstuecke',version:'1.3.0', attribution:'© Geobasis NRW' },
  BE: { url:'https://gdi.berlin.de/services/wms/alkis_flurstuecke',                           layers:'flurstuecke',          version:'1.3.0', attribution:'© Geoportal Berlin' },
  BB: { url:'https://inspire.brandenburg.de/services/cp_alkis_wms',                           layers:'CP.CadastralParcel',   version:'1.3.0', attribution:'© LGB Brandenburg' },
  ST: { url:'https://geodatenportal.sachsen-anhalt.de/ows_INSPIRE_LVermGeo_ALKIS_CP_WMS',     layers:'CP.CadastralParcel',   version:'1.3.0', attribution:'© LVermGeo Sachsen-Anhalt' },
  SH: { url:'https://service.gdi-sh.de/SH_INSPIREVIEW_AI_CP_ALKIS',                           layers:'CP.CadastralParcel',   version:'1.3.0', attribution:'© LVermGeo Schleswig-Holstein' },
  BW: { url:'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ALKIS_Basis_Vertrieb',        layers:'nora:ALKIS_Basis_Vertrieb', version:'1.3.0', attribution:'© LGL Baden-Württemberg' },
  HE: { url:'https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-maps.ows',          layers:'he_alk_t',             version:'1.3.0', attribution:'© HVBG Hessen' },
  HH: { url:'https://geodienste.hamburg.de/HH_WMS_ALKIS_Basiskarte',                          layers:'19,25',                version:'1.3.0', attribution:'© LGV Hamburg' },
  HB: { url:'https://geodienste.bremen.de/wms_flurstuecke',                                   layers:'flurstuecke',          version:'1.3.0', attribution:'© GDI-FHB Bremen' },
  SL: { url:'https://geoportal.saarland.de/http_auth/39272',                                  layers:'Flurgrenzen',          version:'1.1.1', attribution:'© LVGL Saarland' },
  MV: { url:'https://www.geodaten-mv.de/dienste/alkis_wms',                                   layers:'adv_alkis_flurstuecke',version:'1.3.0', attribution:'© LAiV Mecklenburg-Vorpommern' },
  SN: { url:'https://geodienste.sachsen.de/wms_geosn_alkis-adv/guest',                        layers:'adv_alkis_flurstuecke',version:'1.3.0', attribution:'© GeoSN Sachsen' },
  TH: { url:'https://www.geoproxy.geoportal-th.de/geoproxy/services/ALKISKOMPAKT',            layers:'alkis_fl,alkis_fsnr',  version:'1.3.0', attribution:'© TLBIB Thüringen' },
  // RP: Eigener WMS nicht öffentlich; statt dessen WFS-Vektor via "Flurstücke im Ausschnitt laden"
};

// Pro Bundesland: WMS für Naturschutz-Schutzgebiete (NSG/LSG/FFH/Vogelschutz), soweit ein
// freier Dienst per GetCapabilities verifiziert werden konnte — siehe GEOLAYER-QUELLEN.md.
// Ergänzt den bestehenden BfN-Bounding-Box-Scan um eine visuelle Kartenebene.
const NATURSCHUTZ_WMS_REGISTRY = {
  SH: { url:'https://service.gdi-sh.de/SH_INSPIREVIEW_AI_PS',                                 layers:'PS.ProtectedSitesNSG,PS.ProtectedSitesLSG,PS.ProtectedSitesFFH,PS.ProtectedSitesSPA', version:'1.3.0', attribution:'© LLUR/LfU Schleswig-Holstein' },
  HH: { url:'https://geodienste.hamburg.de/HH_WMS_Schutzgebiete',                             layers:'nr_f_naturschutzgebiet,nr_f_landschaftsschutzgebiet,nr_f_ffh_gebiet,nr_f_eg_vogelschutzgebiet', version:'1.3.0', attribution:'© BUKEA Hamburg' },
  NI: { url:'https://www.umweltkarten-niedersachsen.de/arcgis/services/Natur_wms/MapServer/WMSServer', layers:'Naturschutzgebiet,Landschaftsschutzgebiet', version:'1.3.0', attribution:'© NLWKN Niedersachsen' },
  HB: { url:'https://gis-hub.bremen.de/ags1/services/inspire/Schutzgebiete_Land_Bremen/MapServer/WMSServer', layers:'Naturschutzgebiete,Landschaftsschutzgebiete,FFH-Gebiete,EU-Vogelschutzgebiete', version:'1.3.0', attribution:'© Senatorin für Umwelt Bremen' },
  NW: { url:'https://www.wms.nrw.de/umwelt/linfos',                                           layers:'Naturschutzgebiete,Landschaftsschutzgebiet,FFH-Gebiete,Vogelschutzgebiete', version:'1.3.0', attribution:'© LANUV NRW' },
  HE: { url:'https://geodienste-umwelt.hessen.de/arcgis/services/inspire/schutzgebiete/MapServer/WmsServer', layers:'Naturschutzgebiete,Landschaftsschutzgebiete,Fauna-Flora-Habitate,Vogelschutzgebiete', version:'1.3.0', attribution:'© HLNUG Hessen' },
  SL: { url:'https://geoportal.saarland.de/mapbender/php/wms.php?inspire=1&layer_id=35241',   layers:'Naturschutzgebiet',    version:'1.1.1', attribution:'© Umweltministerium Saarland' },
  BW: { url:'https://rips-gdi.lubw.baden-wuerttemberg.de/arcgis/services/GDI/INSPIRE_Schutzgebiete/MapServer/WMSServer', layers:'PS.ProtectedSite.NSG,PS.ProtectedSite.LSG,PS.ProtectedSite.FFH,PS.ProtectedSite.SPA', version:'1.3.0', attribution:'© LUBW Baden-Württemberg' },
  BY: { url:'https://www.lfu.bayern.de/gdi/wms/natur/schutzgebiete',                          layers:'naturschutzgebiet,landschaftsschutzgebiet,fauna_flora_habitat_gebiet,vogelschutzgebiet', version:'1.3.0', attribution:'© LfU Bayern' },
  // BE, BB, MV, SN, ST, TH, RP: keine per GetCapabilities verifizierte freie URL gefunden (siehe GEOLAYER-QUELLEN.md)
};

function detectBundesland(lat, lng){
  return STATES.find(s => lat>=s.bbox[0] && lat<=s.bbox[2] && lng>=s.bbox[1] && lng<=s.bbox[3]) || null;
}

function applyWmsLayer(layer, reg){
  if(reg){
    layer.setUrl(reg.url);
    layer.setParams({
      layers: reg.layers,
      format: 'image/png',
      transparent: true,
      version: reg.version || '1.3.0'
    });
    layer.options.attribution = reg.attribution || '';
  } else {
    // Bundesland ohne hinterlegten WMS — Layer leeren (zeigt nichts)
    layer.setParams({ layers:'__none__' });
  }
  // Leaflet legt den Achsen-/Parametername (srs= vs. crs=) nur beim Hinzufügen zur Karte
  // (onAdd) anhand der WMS-Version fest und LÖSCHT den jeweils anderen Key dabei nicht.
  // Wechselt man z.B. von einem 1.3.0- zu einem 1.1.1-Dienst (Saarland), bleibt sonst der
  // alte "crs"-Key neben dem neuen "srs"-Key stehen. Beide vorab entfernen und die Ebene
  // (falls schon aktiv) neu anhängen, damit onAdd nur den zur aktuellen Version passenden
  // Key frisch setzt.
  delete layer.wmsParams.crs;
  delete layer.wmsParams.srs;
  if(map.hasLayer(layer)){ map.removeLayer(layer); map.addLayer(layer); }
}

let currentWmsState = null;
function updateAlkisWms(){
  const c = map.getCenter();
  const state = detectBundesland(c.lat, c.lng);
  if(!state){
    if(currentWmsState !== null){ currentWmsState = null; map.removeLayer(alkisWmsLayer); }
    return;
  }
  const reg = WMS_REGISTRY[state.key];
  const natReg = NATURSCHUTZ_WMS_REGISTRY[state.key];
  if(currentWmsState === state.key) return;
  currentWmsState = state.key;
  applyWmsLayer(alkisWmsLayer, reg);
  applyWmsLayer(naturschutzWmsLayer, natReg);
  // ALKIS automatisch ein-/ausblenden, sobald ein neues Bundesland erreicht wird — der
  // Naturschutz-WMS bleibt bewusst manuell (Nutzer schaltet ihn selbst über die Layer-Kontrolle zu).
  if(reg && !map.hasLayer(alkisWmsLayer)) map.addLayer(alkisWmsLayer);
  else if(!reg && map.hasLayer(alkisWmsLayer)) map.removeLayer(alkisWmsLayer);
}

map.on('moveend', updateAlkisWms);
const drawControl = new L.Control.Draw({
  position: 'topleft',
  edit: { featureGroup: drawnItems, remove: true },
  draw: {
    polygon: { allowIntersection:false, showArea:true, shapeOptions:{color:'#4dabf7', weight:2, fillOpacity:0.25} },
    rectangle: { shapeOptions:{color:'#4dabf7', weight:2, fillOpacity:0.25} },
    polyline:false, circle:false, marker:false, circlemarker:false
  }
});
map.addControl(drawControl);

// Schutz für die Umspannwerk-Standortplatzierung: während einer laufenden Flächen-Zeichnung
// darf ein map-Klick nicht versehentlich als Umspannwerk-Standort interpretiert werden.
let isDrawingPolygon = false;
map.on(L.Draw.Event.DRAWSTART, () => { isDrawingPolygon = true; });
map.on(L.Draw.Event.DRAWSTOP,  () => { isDrawingPolygon = false; });

map.on(L.Draw.Event.CREATED, e => {
  const project = getActiveProject(); if(!project) return;
  drawnItems.addLayer(e.layer);
  const feat = e.layer.toGeoJSON();
  feat.properties = feat.properties || {};
  feat.properties._fid = 'f'+Date.now()+Math.random().toString(36).slice(2);
  e.layer.feature = feat;
  project.features.push(feat);
  touchActiveProject(); saveProjects();
  clearLage(); clearNaturschutz();
  refreshStats();
  toast('Teilfläche gespeichert – Flurstücke werden ermittelt …');
  fetchLage();
});
map.on(L.Draw.Event.EDITED, e => {
  const project = getActiveProject(); if(!project) return;
  e.layers.eachLayer(layer => {
    const updated = layer.toGeoJSON();
    const fid = layer.feature && layer.feature.properties && layer.feature.properties._fid;
    const idx = project.features.findIndex(f => f.properties && f.properties._fid === fid);
    if(idx > -1){ updated.properties = project.features[idx].properties; project.features[idx] = updated; }
  });
  touchActiveProject(); saveProjects();
  clearLage(); clearNaturschutz();
  refreshStats();
  toast('Änderung gespeichert – Flurstücke werden aktualisiert …');
  fetchLage();
});
map.on(L.Draw.Event.DELETED, e => {
  const project = getActiveProject(); if(!project) return;
  e.layers.eachLayer(layer => {
    const fid = layer.feature && layer.feature.properties && layer.feature.properties._fid;
    project.features = project.features.filter(f => !(f.properties && f.properties._fid === fid));
  });
  touchActiveProject(); saveProjects();
  clearLage(); clearNaturschutz();
  refreshStats();
  toast('Teilfläche gelöscht');
  if(project.features.length) fetchLage();
});

// ---------- Stats ----------
function refreshStats(){
  const E = id => document.getElementById(id);
  const project = getActiveProject();
  if(!project || !project.features.length){
    E('stat-area').textContent='—';
    E('stat-perim').textContent='—';
    E('stat-center').textContent='—';
    E('stat-bbox').textContent='—';
    E('stat-parts').textContent='—';
    E('stat-area-m2').textContent='—';
    return;
  }
  const fc = combinedFeatureCollection(project);

  const areaM2 = combinedArea(project);
  const ha = areaM2/10000;
  E('stat-area').textContent = `${ha.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 })} ha`;
  E('stat-area-m2').textContent = `${Math.round(areaM2).toLocaleString('de-DE')} m²`;

  // perimeter: sum of each Teilfläche's ring length
  const lenKm = project.features.reduce((sum,f) => {
    try { return sum + turf.length(turf.polygonToLine(f), { units:'kilometers' }); }
    catch { return sum; }
  }, 0);
  E('stat-perim').textContent = `${Math.round(lenKm*1000).toLocaleString('de-DE')} m`;

  const c = turf.centroid(fc).geometry.coordinates; // [lon,lat]
  E('stat-center').textContent = `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`;

  const bb = turf.bbox(fc); // [minX,minY,maxX,maxY]
  E('stat-bbox').textContent = `${bb[1].toFixed(4)},${bb[0].toFixed(4)} → ${bb[3].toFixed(4)},${bb[2].toFixed(4)}`;

  E('stat-parts').textContent = `${project.features.length}`;
}

// ---------- Downloads ----------
function buildKML(){
  const project = getActiveProject();
  if(!project || !project.features.length) return null;
  const baseName = (project.name||'Projektgebiet').replace(/[<>&]/g,'');
  const placemarks = project.features.map((f,i) => {
    const coords = f.geometry.coordinates[0].map(c=>`${c[0]},${c[1]},0`).join(' ');
    const name = project.features.length>1 ? `${baseName} – Teilfläche ${i+1}` : baseName;
    return `<Placemark><name>${name}</name>
<Style><LineStyle><color>ff7fabd4</color><width>2</width></LineStyle><PolyStyle><color>4d7fabd4</color></PolyStyle></Style>
<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document><name>${baseName}</name>
${placemarks}</Document></kml>`;
}
async function downloadKMZ(){
  const kml = buildKML(); if(!kml){ alert('Bitte erst Bereich definieren.'); return; }
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  const blob = await zip.generateAsync({type:'blob', mimeType:'application/vnd.google-earth.kmz'});
  downloadBlob(blob, fileBase()+'.kmz');
}
function downloadGeoJSON(){
  const project = getActiveProject();
  if(!project || !project.features.length){ alert('Bitte erst Bereich definieren.'); return; }
  const blob = new Blob([JSON.stringify(combinedFeatureCollection(project),null,2)], {type:'application/geo+json'});
  downloadBlob(blob, fileBase()+'.geojson');
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function fileBase(){
  const project = getActiveProject();
  const n = ((project && project.name)||'Projektgebiet').replace(/[^a-zA-Z0-9-_]+/g,'_');
  return n;
}

document.getElementById('btn-download-kmz').onclick = downloadKMZ;
document.getElementById('btn-download-geojson').onclick = downloadGeoJSON;
document.getElementById('btn-clear').onclick = () => {
  const project = getActiveProject(); if(!project) return;
  if(!project.features.length) return;
  if(!confirm('Alle Teilflächen dieses Projekts unwiderruflich löschen?')) return;
  project.features = [];
  touchActiveProject(); saveProjects();
  drawnItems.clearLayers(); clearLage(); clearNaturschutz(); refreshStats();
};

// ---------- Lage (ALKIS + Verwaltung) ----------
const ALKIS_RP_WFS = 'https://geo5.service24.rlp.de/wfs/alkis_rp.fcgi';
const BKG_VG_WFS   = 'https://sgx.geodatenzentrum.de/wfs_vg250';

// Flurstücks-Vektorabfrage ("Flurstücke im Ausschnitt" / "Lage ermitteln") ist — anders als
// die reine WMS-Hintergrundkarte (WMS_REGISTRY, die für viele Länder funktioniert) — bisher
// fest auf Rheinland-Pfalz verdrahtet gewesen, weil nur RP einen frei zugänglichen WFS mit
// direktem GeoJSON-Output liefert. NW und BE bieten ebenfalls einen freien, Sachdaten-
// tragenden WFS an (per GetCapabilities/GetFeature live geprüft, Stand 2026-07), aber nur
// als GML — daher parseGmlFlurstuecke() als Fallback-Parser. Für alle anderen Bundesländer
// wurde kein frei zugänglicher Flurstücks-WFS mit Sachdaten gefunden (siehe WMS_REGISTRY-
// Kommentar/GEOLAYER-QUELLEN.md) — dort bleibt die Abfrage bewusst leer statt RP-Daten am
// falschen Ort zu zeigen; der bestehende BKG-VG250-Fallback liefert dort wenigstens Gemeinde/Kreis.
const FLURSTUECKE_WFS_REGISTRY = {
  RP: { url: ALKIS_RP_WFS, format:'geojson', typeName:'ave:Flurstueck', axisOrder:'latlon',
        label:'ALKIS RP (LVermGeo RLP)' },
  NW: { url:'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht', format:'gml',
        typeName:'ave:Flurstueck', axisOrder:'latlon', label:'ALKIS NRW (Geobasis NRW, vereinfacht)',
        mapProps: p => p },
  BE: { url:'https://gdi.berlin.de/services/wfs/alkis_flurstuecke', format:'gml',
        typeName:'alkis_flurstuecke:flurstuecke', axisOrder:'lonlat', label:'ALKIS Berlin (Geoportal Berlin)',
        // Berlin führt ein eigenes (Nicht-AAA-)Schema statt der sonst länderübergreifend
        // gleichen ave:Flurstueck-Feldnamen — hier auf die von addFlurstueckToMap /
        // flurstueckPopup erwarteten Property-Namen abbilden.
        mapProps: p => ({
          flstkennz: p.fsko, land:'Berlin', kreis: p.namgem, gemeinde: p.namgem,
          gemarkung: p.namgmk, gemaschl: p.gmk, flur: p.fln,
          flstnrzae: p.zae, flstnrnen: p.nen, flaeche: p.afl,
          lagebeztxt:'', tntxt:'', abwrecht:'', aktualit: p.beg
        }) },
};

// Generischer GML→GeoJSON-Parser für die WFS-Dienste, die kein GeoJSON ausliefern (NW/BE).
// Liest jedes <…:member>-Element: Kind-Elemente ohne eigene Kind-Elemente werden als
// Sachdaten-Property übernommen, das Kind-Element mit verschachtelter Polygon/MultiSurface-
// Geometrie liefert die Ringe. Achsreihenfolge in den posList-Koordinaten ist je Dienst
// unterschiedlich (manche liefern trotz "EPSG:4326" lon,lat statt der eigentlich vorgesehenen
// lat,lon-Reihenfolge) — daher steuerbar über entry.axisOrder. Löcher (gml:interior) werden
// nicht unterstützt (in der Praxis bei Flurstücken selten relevant).
function parseGmlFlurstuecke(text, entry){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('Ungültige GML-Antwort');
  const toLonLat = (lon, lat) => entry.axisOrder==='lonlat' ? [lon, lat] : [lat, lon];
  const members = doc.getElementsByTagNameNS('*', 'member');
  const features = [];
  for(const m of members){
    const feat = m.firstElementChild;
    if(!feat) continue;
    const props = {};
    let geometry = null;
    for(const child of feat.children){
      if(child.localName === 'boundedBy') continue;
      const posLists = child.getElementsByTagNameNS('*', 'posList');
      if(posLists.length){
        const rings = [...posLists].map(pl => {
          const nums = pl.textContent.trim().split(/\s+/).map(Number);
          const pts = [];
          for(let i=0;i<nums.length;i+=2) pts.push(toLonLat(nums[i], nums[i+1]));
          return pts;
        });
        geometry = rings.length===1
          ? { type:'Polygon', coordinates:[rings[0]] }
          : { type:'MultiPolygon', coordinates: rings.map(r=>[r]) };
      } else if(!child.children.length){
        props[child.localName] = child.textContent.trim();
      }
    }
    if(!geometry) continue;
    features.push({ type:'Feature', properties: entry.mapProps ? entry.mapProps(props) : props, geometry });
  }
  const nr = doc.documentElement.getAttribute('numberReturned');
  return { type:'FeatureCollection', features, numberReturned: nr!=null ? Number(nr) : features.length };
}

function addFlurstueckToMap(f){
  const p = f.properties;
  const fnr = `${p.flstnrzae}${p.flstnrnen?'/'+p.flstnrnen:''}`;
  L.geoJSON(f, {
    style:{ color:'#ffd43b', weight:1, fillOpacity:0.05 },
    onEachFeature:(feat, layer)=>{
      layer.bindPopup(flurstueckPopup(p, fnr), { maxWidth:340, minWidth:260 });
      // Popup-Inhalt wird erst beim Öffnen ins DOM gehängt — Klick daher hier binden und
      // den Inhalt danach neu erzeugen, damit der Zustand ("bereits in der Liste") stimmt.
      layer.on('popupopen', ev => {
        const btn = ev.popup.getElement().querySelector('[data-flst-add]');
        if(!btn) return;
        btn.addEventListener('click', () => {
          // Feature mitgeben, damit auch hier die Schnittfläche mit dem Projektpolygon
          // berechnet werden kann (bei Flurstücken außerhalb des Polygons ergibt das 0 m²).
          if(flurstueckUebernehmen(p, f)) layer.setPopupContent(flurstueckPopup(p, fnr));
        });
      });
    }
  }).eachLayer(l => lageLayer.addLayer(l));
  try {
    const c = turf.centroid(f).geometry.coordinates;
    const label = L.marker([c[1], c[0]], {
      interactive:false,
      icon: L.divIcon({
        className:'flst-label',
        html:`<div>${escapeHtml(fnr)}</div>`,
        iconSize:[40,16], iconAnchor:[20,8]
      })
    });
    lageLabelsLayer.addLayer(label);
  } catch{}
}

// ---------- Hochspannungsleitungen (OSM-Overlay via Overpass API) ----------
// Anders als das GridConnect-Original (einmaliger Offline-Import für ganz Deutschland in eine
// eigene Datenbank) läuft diese Abfrage live im Browser und ist bewusst auf den aktuellen
// Kartenausschnitt beschränkt — ohne Backend gäbe es sonst weder einen Ort zum Zwischenspeichern
// von ~10.000 Leitungen noch eine Möglichkeit, sie performant zu rendern.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

function overpassLinesQuery(bbox){
  const [west, south, east, north] = bbox;
  return `[out:json][timeout:60];
( way["power"="line"]["voltage"~"^(380000|220000|110000)$"](${south},${west},${north},${east}); );
out geom tags;`;
}

async function fetchOverpass(bbox){
  const query = overpassLinesQuery(bbox);
  let lastErr;
  for(const url of OVERPASS_ENDPOINTS){
    try {
      const res = await fetch(url, { method:'POST', body:'data='+encodeURIComponent(query) });
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    } catch(err){ lastErr = err; }
  }
  throw lastErr || new Error('Alle Overpass-Endpunkte fehlgeschlagen');
}

function addOsmLineToMap(el){
  if(!el.geometry || !el.geometry.length) return;
  const latlngs = el.geometry.map(pt => [pt.lat, pt.lon]);
  const tags = el.tags || {};
  const line = L.polyline(latlngs, { color:'#e64980', weight:2 });
  line.bindPopup(`<div class="flst-popup">
    <div class="flst-popup-title">${escapeHtml(tags.name || 'Freileitung')}</div>
    <table>
      <tr><th>Betreiber</th><td>${escapeHtml(tags.operator||'—')}</td></tr>
      <tr><th>Spannung</th><td>${tags.voltage ? escapeHtml(String(Number(tags.voltage)/1000))+' kV' : '—'}</td></tr>
      <tr><th>Stromkreise</th><td>${escapeHtml(tags.circuits||'—')}</td></tr>
      <tr><th>Seile</th><td>${escapeHtml(tags.cables||'—')}</td></tr>
    </table></div>`, { maxWidth:280 });
  osmLinesLayer.addLayer(line);
}

async function loadHochspannungsleitungenInView(){
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const midLat = (b.getNorth()+b.getSouth())/2;
  const areaKm2 = (b.getNorth()-b.getSouth()) * (b.getEast()-b.getWest()) * 111 * 111 * Math.cos(midLat*Math.PI/180);
  if(map.getZoom() < 6){
    if(!confirm(`Zoom-Level ${map.getZoom()} ist sehr niedrig — bitte näher heranzoomen. Trotzdem laden?`)) return;
  } else if(areaKm2 > 4000){
    if(!confirm(`Kartenausschnitt ist ~${areaKm2.toFixed(0)} km². Abfrage kann lange dauern. Trotzdem laden?`)) return;
  }
  const btn = document.getElementById('btn-load-osm-lines');
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Lade …';
  osmLinesLayer.clearLayers();
  try {
    const data = await fetchOverpass(bbox);
    const elements = (data.elements || []).filter(el => el.type==='way');
    elements.forEach(addOsmLineToMap);
    toast(`${elements.length} Leitungsabschnitte geladen.`);
  } catch(err){
    alert('Fehler beim Laden der OSM-Leitungen: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}
document.getElementById('btn-load-osm-lines').onclick = loadHochspannungsleitungenInView;
document.getElementById('btn-clear-osm-lines').onclick = () => osmLinesLayer.clearLayers();

function flurstueckPopup(p, fnr){
  const rows = [
    ['Flurstückskennzeichen', p.flstkennz],
    ['Bundesland',            p.land],
    ['Landkreis',             p.kreis],
    ['Gemeinde',              p.gemeinde],
    ['Gemarkung',             `${p.gemarkung || ''}${p.gemaschl ? ' (' + p.gemaschl + ')' : ''}`],
    ['Flur',                  p.flur],
    ['Flurstücksnummer',      fnr],
    ['Amtliche Fläche',       p.flaeche != null ? `${Number(p.flaeche).toLocaleString('de-DE')} m²` : ''],
    ['Lagebezeichnung',       p.lagebeztxt],
    ['Tatsächliche Nutzung',  p.tntxt],
    ['Rechtszustand',         p.abwrecht],
    ['Aktualität',            p.aktualit],
  ].filter(([,v]) => v !== '' && v != null);

  const body = rows.map(([k,v]) =>
    `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`
  ).join('');

  // Ohne diese Aktion waere ein per "Flurstuecke im Ausschnitt" geladenes Flurstueck eine
  // reine Kartenanzeige: es liesse sich weder einem Eigentuemer zuordnen noch sichern.
  // Gebraucht wird das vor allem fuer Flaechen, die nicht im gezeichneten Polygon liegen —
  // Zuwegung, Trasse, angrenzende Ergaenzungsflurstuecke.
  const drin = flurstueckInListe(p.flstkennz);
  return `<div class="flst-popup">
    <div class="flst-popup-title">Flst. ${escapeHtml(fnr)} · ${escapeHtml(p.gemarkung||'')}, ${escapeHtml(p.flur||'')}</div>
    <table>${body}</table>
    <div style="margin-top:8px">${drin
      ? '<span class="pill ok">bereits in der Flurstücksliste</span>'
      : `<button class="small" data-flst-add="${escapeAttr(p.flstkennz||'')}">+ In Flurstücksliste übernehmen</button>`}</div>
  </div>`;
}

// Ist dieses Kennzeichen bereits Teil des Projekts?
function flurstueckInListe(kennzeichen){
  const pr = getActiveProject();
  if(!pr || !kennzeichen || !pr.lage || !Array.isArray(pr.lage.flurstuecke)) return false;
  return pr.lage.flurstuecke.some(f => f.kennzeichen === kennzeichen);
}

// ALKIS-Properties -> Listeneintrag, in derselben Form wie fetchLage() ihn erzeugt.
// `feature` ist optional: liegt es vor, wird zusätzlich die Schnittfläche mit dem
// Projektpolygon bestimmt — sonst bleibt projektflaeche leer und die Pachtfläche offen.
function flurstueckAusProps(pr, feature){
  const project = getActiveProject();
  const projektGeom = (feature && project) ? projektGeometrieVereint(project.features) : null;
  return { kennzeichen:pr.flstkennz, land:pr.land, kreis:pr.kreis, gemeinde:pr.gemeinde,
           gemarkung:pr.gemarkung, flur:pr.flur, zaehler:pr.flstnrzae, nenner:pr.flstnrnen,
           flaeche:pr.flaeche != null ? Number(pr.flaeche) : null,
           projektflaeche: schnittflaecheM2(projektGeom, feature),
           lage:pr.lagebeztxt, nutzung:pr.tntxt };
}

// Legt p.lage an, falls es noch keine gibt (Flurstuecke aus der Karte statt aus einer
// Polygon-Abfrage sind ein vollwertiger Einstieg in die Liste).
function ensureLageContainer(p, quelle){
  if(!p.lage || !Array.isArray(p.lage.flurstuecke)){
    p.lage = { gemarkungen:[], fluren:[], gemeinden:[], kreise:[], land:'', flurstuecke:[],
               truncated:false, source:quelle, fetchedAt:new Date().toISOString() };
  }
  return p.lage;
}
// Aggregatanzeige (Bundesland/Kreis/Gemeinde/...) aus der aktuellen Liste neu bilden.
function refreshLageAggregat(p){
  const all = p.lage.flurstuecke;
  p.lage.gemarkungen = uniqueSorted(all.map(f => f.gemarkung));
  p.lage.fluren      = uniqueSorted(all.map(f => f.flur));
  p.lage.gemeinden   = uniqueSorted(all.map(f => f.gemeinde));
  p.lage.kreise      = uniqueSorted(all.map(f => f.kreis));
  p.lage.land        = uniqueSorted(all.map(f => f.land)).join(', ');
  p.lage.fetchedAt   = new Date().toISOString();
}

function flurstueckUebernehmen(props, feature){
  const p = getActiveProject();
  if(!p){ alert('Kein Projekt aktiv.'); return false; }
  if(flurstueckInListe(props.flstkennz)) return false;
  ensureLageContainer(p, 'Karte (manuell übernommen)');
  p.lage.flurstuecke.push(flurstueckAusProps(props, feature));
  refreshLageAggregat(p);
  ensureFlurstueckIds(p);
  uebernehmeProjektflaecheAlsPacht(p);
  touchActiveProject(); saveProjects();
  currentLage = p.lage;
  logAction(p, `Flurstück ${props.flstkennz || ''} von der Karte in die Flurstücksliste übernommen`);
  renderLage(); renderFlurstueckeTable(); renderSicherungTable();
  toast('Flurstück in die Liste übernommen');
  return true;
}

function clearLage(){
  currentLage = null;
  const project = getActiveProject();
  if(project){
    project.lage = null;
    // WICHTIG: `flurstueckIds` (Kennzeichen → ID) wird hier bewusst NICHT zurückgesetzt.
    // clearLage() läuft bei jedem Zeichnen/Ändern/Löschen einer Teilfläche. Da die Zusatzdaten
    // (Eigentümer, Pachtfläche, Vertragsstatus, Fristen) in flurstueckDaten unter der ID
    // hängen, dieses aber NICHT mitgelöscht wird, hätte ein Reset die IDs danach wieder ab 1
    // vergeben — und zwar in der Sortierreihenfolge der neuen Trefferliste. Fällt dabei ein
    // Flurstück weg oder kommt eines hinzu, verschiebt sich die Zuordnung: fremde Eigentümer
    // und sogar der Status „unterschrieben" landeten an Flurstücken, die nie verhandelt wurden.
    // Die Kennzeichen-Zuordnung zu behalten ist genau das, was Bestandsdaten am richtigen
    // Flurstück hält; entfallene Flurstücke zeigt sicherungRows() korrekt als „verwaist".
    saveProjects();
    logAction(project, 'ALKIS-Lage zurückgesetzt');
  }
  lageLayer.clearLayers();
  lageLabelsLayer.clearLayers();
  const el = document.getElementById('lage-result');
  if(el) el.innerHTML = '<span style="font-style:italic">Noch nicht abgefragt. Datenquelle: ALKIS RP/NRW/Berlin + BKG VG250.</span>';
  renderFlurstueckeTable();
  clearNaturschutz();
}

function clearNaturschutz(){
  currentNaturschutz = null;
  const project = getActiveProject();
  if(project){ project.naturschutz = null; saveProjects(); logAction(project, 'Naturschutz-Scan zurückgesetzt'); }
  const el = document.getElementById('nat-result');
  if(el) el.innerHTML = '<span style="font-style:italic">Noch nicht geprüft. Datenquelle: BfN — prüft Bounding-Box-Überlappung.</span>';
}

// ---------- Naturschutz-Scan (BfN) ----------
const BFN_WFS = 'https://geodienste.bfn.de/ogc/wfs/schutzgebiet';
const BFN_CATEGORIES = [
  { key:'nsg',  type:'bfn_sch_Schutzgebiet:Naturschutzgebiete',          label:'Naturschutzgebiet (NSG)',                 severity:'high'   },
  { key:'np',   type:'bfn_sch_Schutzgebiet:Nationalparke',               label:'Nationalpark',                            severity:'high'   },
  { key:'nnm',  type:'bfn_sch_Schutzgebiet:Nationale_Naturmonumente',    label:'Nationales Naturmonument',                severity:'high'   },
  { key:'ffh',  type:'bfn_sch_Schutzgebiet:Fauna_Flora_Habitat_Gebiete', label:'FFH-Gebiet (Natura 2000)',                severity:'high'   },
  { key:'spa',  type:'bfn_sch_Schutzgebiet:Vogelschutzgebiete',          label:'Vogelschutzgebiet (Natura 2000)',         severity:'high'   },
  { key:'lsg',  type:'bfn_sch_Schutzgebiet:Landschaftsschutzgebiete',    label:'Landschaftsschutzgebiet (LSG)',           severity:'medium' },
  { key:'br',   type:'bfn_sch_Schutzgebiet:Biosphaerenreservate',        label:'Biosphärenreservat',                      severity:'medium' },
  { key:'npark',type:'bfn_sch_Schutzgebiet:Naturparke',                  label:'Naturpark',                               severity:'low'    },
];

async function fetchBfNCategory(cat, bbox){
  const u = new URL(BFN_WFS);
  u.search = new URLSearchParams({
    service:'WFS', version:'2.0.0', request:'GetFeature',
    typeNames:cat.type, srsName:'EPSG:4326',
    bbox:`${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]},EPSG:4326`,
    count:'200'
  }).toString();
  const r = await fetch(u.toString());
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseBfNGML(await r.text());
}

function parseBfNGML(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length) return [];
  const members = doc.getElementsByTagNameNS('http://www.opengis.net/wfs/2.0', 'member');
  const out = [];
  const get = (el, name) => {
    const els = el.getElementsByTagNameNS('*', name);
    return els.length ? (els[0].textContent || '').trim() : '';
  };
  for(const m of members){
    const feat = m.firstElementChild;
    if(!feat) continue;
    out.push({
      name:    get(feat, 'NAME'),
      bfnId:   get(feat, 'BFN_ID'),
      id:      get(feat, 'ID'),
      land:    get(feat, 'BL'),
      ha:      get(feat, 'AREA_HA') || get(feat, 'AREA'),
      iucn:    get(feat, 'IUCN_CAT'),
      legDate: get(feat, 'LEG_DATE').slice(0,10),
      legLink: get(feat, 'LEG_LINK'),
    });
  }
  return out;
}

async function runNaturschutzScan(){
  const project = getActiveProject();
  if(!project || !project.features.length){ alert('Bitte erst Bereich definieren.'); return; }
  const btn = document.getElementById('btn-naturschutz');
  btn.disabled = true; const oldTxt = btn.textContent; btn.textContent = 'Scanne …';
  const root = document.getElementById('nat-result');
  root.innerHTML = '<span style="font-style:italic">Anfragen an BfN laufen …</span>';
  const bb = turf.bbox(combinedFeatureCollection(project));
  try {
    const results = await Promise.all(BFN_CATEGORIES.map(async cat => {
      try { return { cat, items: await fetchBfNCategory(cat, bb), error:null }; }
      catch(e){ return { cat, items:[], error:e.message }; }
    }));
    currentNaturschutz = { bbox:bb, results, fetchedAt:new Date().toISOString() };
    project.naturschutz = currentNaturschutz; touchActiveProject(); saveProjects();
    logAction(project, 'Naturschutz-Scan (BfN) durchgeführt');
    renderNaturschutz();
  } catch(err){
    root.innerHTML = `<span style="color:var(--err)">Fehler: ${escapeHtml(err.message)}</span>`;
  } finally {
    btn.disabled = false; btn.textContent = oldTxt.includes('Erneut') ? oldTxt : 'Erneut scannen';
  }
}

function renderNaturschutz(){
  if(!currentNaturschutz) return;
  const root = document.getElementById('nat-result');
  const sevColor = { high:'var(--err)', medium:'var(--warn)', low:'var(--accent)' };
  const sevPill  = { high:'kritisch', medium:'beachten', low:'Hinweis' };

  const totalHits = currentNaturschutz.results.reduce((s,r)=>s+r.items.length, 0);
  const errs = currentNaturschutz.results.filter(r=>r.error);

  const summary = totalHits === 0
    ? `<div style="padding:6px 8px;border-radius:4px;background:rgba(47,158,68,.12);color:var(--ok);font-weight:600">
         ✓ Keine BfN-Schutzgebiete im Bounding-Box-Bereich.
       </div>`
    : `<div style="padding:6px 8px;border-radius:4px;background:rgba(224,49,49,.10);color:var(--err);font-weight:600">
         ${totalHits} Treffer in ${currentNaturschutz.results.filter(r=>r.items.length).length} Kategorie(n) — bitte prüfen.
       </div>`;

  const blocks = currentNaturschutz.results.filter(r=>r.items.length || r.error).map(r => {
    if(r.error){
      return `<div style="margin-top:6px;font-size:11px;color:var(--muted)">
        <b>${escapeHtml(r.cat.label)}:</b> Abfrage fehlgeschlagen (${escapeHtml(r.error)})
      </div>`;
    }
    const items = r.items.slice(0,20).map(it => {
      const link = it.legLink ? `<a href="${escapeAttr(it.legLink)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">VO ↗</a>` : '';
      return `<div style="font-size:11px;padding:2px 0;border-bottom:1px dashed var(--border)">
        ${escapeHtml(it.name || '(ohne Name)')}${it.land?` <span style="color:var(--muted)">[${escapeHtml(it.land)}]</span>`:''}
        ${it.id?` <span style="color:var(--muted)">${escapeHtml(it.id)}</span>`:''}
        ${it.legDate?` <span style="color:var(--muted)">· ${escapeHtml(it.legDate)}</span>`:''}
        ${link?` · ${link}`:''}
      </div>`;
    }).join('');
    const more = r.items.length>20 ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">… ${r.items.length-20} weitere</div>` : '';
    return `<div style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:12px">${escapeHtml(r.cat.label)}</b>
        <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:${sevColor[r.cat.severity]};color:#fff">${r.items.length} · ${sevPill[r.cat.severity]}</span>
      </div>
      ${items}${more}
    </div>`;
  }).join('');

  const errsBlock = errs.length && totalHits===0
    ? `<div style="margin-top:6px;font-size:11px;color:var(--err)">${errs.length} Abfrage(n) fehlgeschlagen — Ergebnis ist unvollständig.</div>`
    : '';

  root.innerHTML = `
    ${summary}
    ${blocks}
    ${errsBlock}
    <div style="margin-top:8px;font-size:10px;color:var(--muted)">
      Quelle: BfN-Schutzgebiete-WFS · BBOX-Treffer, nicht exakte Polygon-Überschneidung · ${new Date(currentNaturschutz.fetchedAt).toLocaleString('de-DE')}
    </div>
  `;
}

document.getElementById('btn-naturschutz').onclick = runNaturschutzScan;

function setLageStatus(html, isError){
  const el = document.getElementById('lage-result');
  if(el) el.innerHTML = `<span style="color:${isError?'var(--err)':'var(--muted)'};font-style:italic">${html}</span>`;
}

async function wfsFetch(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Ermittelt anhand des Kartenausschnitt-Mittelpunkts den passenden Flurstücks-WFS
// (siehe FLURSTUECKE_WFS_REGISTRY) und liefert null, wenn für das erkannte Bundesland
// keiner hinterlegt ist — der Aufrufer zeigt dann direkt eine passende Meldung statt
// unnötig einen Request loszuschicken.
function flurstueckeEntryForBbox(bbox){
  const midLat = (bbox[1]+bbox[3])/2, midLon = (bbox[0]+bbox[2])/2;
  const state = detectBundesland(midLat, midLon);
  return { state, entry: state ? FLURSTUECKE_WFS_REGISTRY[state.key] : null };
}

async function fetchFlurstuecke(bbox, entry){
  // bbox: [minLon, minLat, maxLon, maxLat]
  if(!entry) return { type:'FeatureCollection', features:[], numberReturned:0 };
  const bboxStr = entry.axisOrder==='lonlat'
    ? `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},EPSG:4326`
    : `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]},EPSG:4326`;
  const u = new URL(entry.url);
  const params = {
    service:'WFS', version:'2.0.0', request:'GetFeature',
    typeNames:entry.typeName, srsName:'EPSG:4326',
    bbox:bboxStr, count:'2500'
  };
  if(entry.format==='geojson') params.outputFormat = 'application/json; subtype=geojson';
  u.search = new URLSearchParams(params).toString();
  if(entry.format==='geojson') return wfsFetch(u.toString());
  const r = await fetch(u.toString());
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseGmlFlurstuecke(await r.text(), entry);
}

async function fetchVG(typeName, center){
  // center: [lon, lat]; query single point via tiny bbox
  // BKG_VG_WFS erwartet die Bbox trotz "EPSG:4326" in lon,lat-Reihenfolge (nicht die
  // eigentlich vorgesehene lat,lon-Reihenfolge) — live per GetFeature verifiziert.
  const d = 0.0005;
  const u = new URL(BKG_VG_WFS);
  u.search = new URLSearchParams({
    service:'WFS', version:'2.0.0', request:'GetFeature',
    typeNames:typeName, srsName:'EPSG:4326',
    outputFormat:'application/json',
    bbox:`${center[0]-d},${center[1]-d},${center[0]+d},${center[1]+d},EPSG:4326`,
    count:'5'
  }).toString();
  return wfsFetch(u.toString());
}

function uniqueSorted(values){
  return [...new Set(values.filter(v => v!=null && v!==''))].sort((a,b)=>a.localeCompare(b,'de'));
}

async function fetchLage(){
  const project = getActiveProject();
  if(!project || !project.features.length){ alert('Bitte erst Bereich definieren.'); return; }
  const btn = document.getElementById('btn-fetch-lage');
  btn.disabled = true; btn.textContent = 'Lade …';
  lageLayer.clearLayers();
  setLageStatus('Abfrage läuft …');
  try {
    const fc0 = combinedFeatureCollection(project);
    const bb = turf.bbox(fc0); // [minLon,minLat,maxLon,maxLat]
    const areaKm2 = combinedArea(project)/1e6;
    if(areaKm2 > 50) setLageStatus(`Hinweis: Bereich ist groß (~${areaKm2.toFixed(0)} km²) — Abfrage kann dauern.`);

    const { state, entry } = flurstueckeEntryForBbox(bb);
    let fc;
    try {
      fc = await fetchFlurstuecke(bb, entry);
    } catch(e){
      throw new Error(`${entry?.label || 'ALKIS'} nicht erreichbar: `+e.message);
    }

    // Filter: only features that actually intersect at least one Teilfläche
    const inside = (fc.features||[]).filter(f => {
      try { return project.features.some(pf => turf.booleanIntersects(f, pf)); }
      catch { return false; }
    });

    const truncated = (fc.numberReturned ?? fc.features?.length ?? 0) >= 2500;

    if(!inside.length){
      // Kein Flurstücks-Dienst für dieses Bundesland (oder dort tatsächlich keine Treffer)?
      // BKG-VG250-Fallback liefert wenigstens Gemeinde + Kreis, unabhängig vom Bundesland.
      const center = turf.centroid(fc0).geometry.coordinates;
      const [gem, krs] = await Promise.all([
        fetchVG('vg250:vg250_gem', center).catch(()=>null),
        fetchVG('vg250:vg250_krs', center).catch(()=>null),
      ]);
      // BKG_VG_WFS liefert die Feldnamen klein geschrieben ("gen"), nicht "GEN".
      const gemeinden = uniqueSorted((gem?.features||[]).map(f => f.properties?.gen));
      const kreise    = uniqueSorted((krs?.features||[]).map(f => f.properties?.gen));
      const ortsHinweis = !entry
        ? (state ? `kein freier Flurstücks-Dienst für ${state.name} hinterlegt` : 'außerhalb der erkannten Bundesländer')
        : `keine Treffer bei ${entry.label}`;
      if(!gemeinden.length && !kreise.length){
        setLageStatus(`Keine ALKIS-Flurstücke im Bereich gefunden (${ortsHinweis}) und auch keine BKG-Treffer.`, true);
      } else {
        currentLage = {
          gemarkungen:[], fluren:[], gemeinden, kreise, land:'',
          flurstuecke:[], truncated:false, source:'BKG VG250 (Fallback, nur Verwaltung)',
          fetchedAt:new Date().toISOString()
        };
        project.lage = currentLage; touchActiveProject(); saveProjects();
        logAction(project, 'ALKIS-Lage abgefragt (nur Verwaltungsdaten, Fallback)');
        renderLage();
        renderFlurstueckeTable();
      }
      return;
    }

    // Aggregate
    const gemarkungen = uniqueSorted(inside.map(f => f.properties.gemarkung));
    const fluren      = uniqueSorted(inside.map(f => f.properties.flur));
    const gemeinden   = uniqueSorted(inside.map(f => f.properties.gemeinde));
    const kreise      = uniqueSorted(inside.map(f => f.properties.kreis));
    const land        = uniqueSorted(inside.map(f => f.properties.land)).join(', ');

    // Projektgeometrie einmal vereinen und dann je Flurstück verschneiden: liefert die
    // tatsächlich betroffene Fläche statt der amtlichen Gesamtfläche des Flurstücks.
    const projektGeom = projektGeometrieVereint(project.features);

    const flurstuecke = inside.map(f => ({
      kennzeichen: f.properties.flstkennz,
      land:        f.properties.land,
      kreis:       f.properties.kreis,
      gemeinde:    f.properties.gemeinde,
      gemarkung:   f.properties.gemarkung,
      flur:        f.properties.flur,
      zaehler:     f.properties.flstnrzae,
      nenner:      f.properties.flstnrnen,
      flaeche:     f.properties.flaeche,
      projektflaeche: schnittflaecheM2(projektGeom, f),
      lage:        f.properties.lagebeztxt
    })).sort((a,b)=> (a.gemarkung+a.flur+String(a.zaehler).padStart(6,'0')).localeCompare(b.gemarkung+b.flur+String(b.zaehler).padStart(6,'0'),'de'));

    currentLage = { gemarkungen, fluren, gemeinden, kreise, land, flurstuecke, truncated, source: entry.label, fetchedAt:new Date().toISOString() };
    project.lage = currentLage;
    ensureFlurstueckIds(project); // IDs vor dem Speichern vergeben: erhält Eigentümer-/Sicherungsdaten
    uebernehmeProjektflaecheAlsPacht(project);
    touchActiveProject(); saveProjects();
    logAction(project, `ALKIS-Lage abgefragt (${flurstuecke.length} Flurstück(e))`);

    // Render flurstücke + labels on map
    inside.forEach(addFlurstueckToMap);

    renderLage();
    renderFlurstueckeTable();
  } catch(err){
    setLageStatus('Fehler: '+err.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Lage erneut ermitteln';
  }
}

function renderLage(){
  if(!currentLage){ return; }
  const L = currentLage;
  const html = `
    <div class="stat"><span>Bundesland</span><b>${escapeHtml(L.land||'—')}</b></div>
    <div class="stat"><span>Landkreis(e)</span><b>${escapeHtml(L.kreise.join(', ')||'—')}</b></div>
    <div class="stat"><span>Gemeinde(n)</span><b>${escapeHtml(L.gemeinden.join(', ')||'—')}</b></div>
    <div class="stat"><span>Gemarkung(en)</span><b>${escapeHtml(L.gemarkungen.join(', ')||'—')}</b></div>
    <div class="stat"><span>Flur(en)</span><b>${escapeHtml(L.fluren.join(', ')||'—')}</b></div>
    <div class="stat"><span>Flurstücke</span><b>${L.flurstuecke.length}${L.truncated?' (gekürzt!)':''}</b></div>
    ${L.flurstuecke.length ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:11px;color:var(--muted)">Flurstücke anzeigen</summary>
      <div style="max-height:200px;overflow:auto;font-size:11px;font-family:ui-monospace,monospace;margin-top:6px">
        ${L.flurstuecke.slice(0,500).map(f => `${escapeHtml(f.gemarkung)} · ${escapeHtml(f.flur)} · Flst. ${f.zaehler}${f.nenner?'/'+f.nenner:''} · ${f.flaeche} m²`).join('<br>')}
        ${L.flurstuecke.length>500 ? `<br>… ${L.flurstuecke.length-500} weitere` : ''}
      </div></details>` : ''}
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Quelle: ${escapeHtml(L.source)} · ${new Date(L.fetchedAt).toLocaleString('de-DE')}</div>
  `;
  document.getElementById('lage-result').innerHTML = html;
}

document.getElementById('btn-fetch-lage').onclick = fetchLage;
