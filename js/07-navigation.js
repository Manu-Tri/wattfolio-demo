// Ortssuche, Ansichtswechsel und Projekt-Tabs
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---------- Ortsuche mit Autocomplete (Mapbox Geocoding, sonst Nominatim) ----------
// Liefert eine einheitliche Form { label, lat, lon } unabhängig vom Anbieter, damit
// renderSuggestions/selectSuggestion nicht wissen müssen, welcher Dienst gerade läuft.
async function geocodeSearch(q, signal){
  if(MAPBOX_ACCESS_TOKEN){
    const url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodeURIComponent(q)+'.json'
      + '?access_token='+MAPBOX_ACCESS_TOKEN+'&country=de&language=de&limit=6';
    const r = await fetch(url, { signal });
    const data = await r.json();
    return (data.features||[]).map(f => ({ label:f.place_name, lat:f.center[1], lon:f.center[0] }));
  }
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&countrycodes=de&q='+encodeURIComponent(q), { signal });
  const data = await r.json();
  return data.map(it => ({ label:it.display_name, lat:+it.lat, lon:+it.lon }));
}

(function(){
  const input = document.getElementById('geo-search-input');
  const box = document.getElementById('geo-search-suggestions');
  let debounceTimer = null;
  let abortCtrl = null;
  let suggestions = [];
  let activeIndex = -1;

  function renderSuggestions(items, state){
    suggestions = items;
    activeIndex = -1;
    if(state === 'loading'){
      box.innerHTML = '<div class="geo-suggestion empty">Suche …</div>';
    } else if(state === 'empty'){
      box.innerHTML = '<div class="geo-suggestion empty">Nichts gefunden.</div>';
    } else if(state === 'error'){
      box.innerHTML = '<div class="geo-suggestion empty">Suche fehlgeschlagen.</div>';
    } else {
      box.innerHTML = items.map((it, i) => {
        const parts = it.label.split(',');
        const main = parts[0].trim();
        const rest = parts.slice(1).join(',').trim();
        return `<div class="geo-suggestion" data-i="${i}"><b>${escapeHtml(main)}</b>${rest?`<span>${escapeHtml(rest)}</span>`:''}</div>`;
      }).join('');
    }
    box.classList.remove('hidden');
  }

  function hideSuggestions(){
    box.classList.add('hidden');
    suggestions = [];
    activeIndex = -1;
  }

  function selectSuggestion(it){
    map.setView([it.lat, it.lon], 15);
    input.value = it.label;
    hideSuggestions();
  }

  function setActive(i){
    activeIndex = i;
    box.querySelectorAll('.geo-suggestion').forEach(el => {
      el.classList.toggle('active', +el.dataset.i === i);
    });
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if(abortCtrl) abortCtrl.abort();
    if(q.length < 3){ hideSuggestions(); return; }
    debounceTimer = setTimeout(async () => {
      renderSuggestions([], 'loading');
      abortCtrl = new AbortController();
      try {
        const data = await geocodeSearch(q, abortCtrl.signal);
        renderSuggestions(data, data.length ? 'ok' : 'empty');
      } catch(e){
        if(e.name !== 'AbortError') renderSuggestions([], 'error');
      }
    }, 350);
  });

  input.addEventListener('keydown', e => {
    if(box.classList.contains('hidden') || !suggestions.length) return;
    if(e.key === 'ArrowDown'){ e.preventDefault(); setActive(Math.min(activeIndex+1, suggestions.length-1)); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); setActive(Math.max(activeIndex-1, 0)); }
    else if(e.key === 'Enter'){ e.preventDefault(); selectSuggestion(suggestions[activeIndex >= 0 ? activeIndex : 0]); }
    else if(e.key === 'Escape'){ hideSuggestions(); }
  });

  box.addEventListener('click', e => {
    const row = e.target.closest('.geo-suggestion[data-i]');
    if(row) selectSuggestion(suggestions[+row.dataset.i]);
  });

  document.addEventListener('click', e => {
    if(!e.target.closest('#geo-search')) hideSuggestions();
  });
})();

// ---------- Views / Project selection ----------
function switchView(name){ // name: 'list' | 'map' | 'detail'
  currentView = name;
  try { localStorage.setItem('pa_last_view_v1', name); } catch{}
  document.getElementById('view-list').classList.toggle('hidden', name!=='list');
  document.getElementById('view-map').classList.toggle('hidden', name!=='map');
  document.getElementById('view-detail').classList.toggle('hidden', name!=='detail');
  if(name==='map' || name==='detail') requestAnimationFrame(()=>map.invalidateSize());
  updateHeaderNav(name);
}
// Header-Navigation: aktiver Menüpunkt + Projekt-Tabs
function updateHeaderNav(name){
  document.getElementById('nav-list').classList.toggle('active', name==='list');
  document.getElementById('nav-map').classList.toggle('active', name==='map');
  renderProjectTabs(name);
}

// ---- Projekt-Tabs (mehrere geöffnete Projekte) ----
function openProjectTab(id){
  if(!openTabs.includes(id)){ openTabs.push(id); persistOpenTabs(); }
}
function closeProjectTab(id){
  const wasActive = (id === activeProjectId);
  const idx = openTabs.indexOf(id);
  openTabs = openTabs.filter(t => t !== id);
  persistOpenTabs();
  delete tabState[id]; persistTabState();
  if(wasActive){
    // Nachbar-Tab aktivieren (rechts bevorzugt, sonst links); sonst zurück zur Liste
    const nextId = openTabs[idx] || openTabs[idx-1] || null;
    if(nextId) selectProject(nextId);
    else { activeProjectId = null; clearActiveProjectUI(); gotoList(); }
  } else {
    renderProjectTabs(currentView);
  }
}
function renderProjectTabs(viewName){
  const bar = document.getElementById('project-tabs');
  if(!bar) return;
  // Nur noch existierende Projekte behalten (z. B. nach Löschen)
  const before = openTabs.length;
  openTabs = openTabs.filter(id => projects.some(p => p.id === id));
  if(openTabs.length !== before) persistOpenTabs();
  bar.innerHTML = openTabs.map(id => {
    const p = projects.find(x => x.id === id);
    const label = p.name || '(unbenanntes Projekt)';
    const active = (viewName === 'detail' && id === activeProjectId);
    return `<div class="proj-tab${active?' active':''}" data-tab="${escapeAttr(id)}" title="${escapeAttr(label)}">
      <span class="proj-tab-dot"></span>
      <span class="proj-tab-name">${escapeHtml(label)}</span>
      <button type="button" class="proj-tab-close" data-close="${escapeAttr(id)}" title="Tab schließen" aria-label="Tab schließen">×</button>
    </div>`;
  }).join('');
  bar.querySelectorAll('.proj-tab').forEach(el => {
    el.addEventListener('click', e => {
      if(e.target.closest('.proj-tab-close')) return; // Schließen-Klick separat
      const id = el.dataset.tab;
      if(id !== activeProjectId || currentView !== 'detail') selectProject(id);
    });
    // Mittelklick schließt den Tab (wie im Browser)
    el.addEventListener('auxclick', e => { if(e.button === 1){ e.preventDefault(); closeProjectTab(el.dataset.tab); } });
  });
  bar.querySelectorAll('.proj-tab-close').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); closeProjectTab(btn.dataset.close); });
  });
  fitProjectTabs(bar);
}
// Passen nicht alle Tabs in die Kopfleiste, werden die hintersten (außer dem aktiven)
// ausgeblendet und in einer Auswahl „+N weitere" angeboten — statt dass die Leiste
// scrollt und der letzte Tab mitten im Namen am Rand abgeschnitten wird.
function fitProjectTabs(bar){
  bar.querySelector('.proj-tab-more')?.remove();
  const tabs = [...bar.querySelectorAll('.proj-tab')];
  tabs.forEach(t => t.hidden = false);
  if(bar.scrollWidth <= bar.clientWidth + 1) return;
  const more = document.createElement('select');
  more.className = 'proj-tab-more';
  more.setAttribute('aria-label', 'Weitere geöffnete Projekte');
  bar.appendChild(more);
  const versteckt = [];
  for(let i = tabs.length - 1; i >= 0 && bar.scrollWidth > bar.clientWidth + 1; i--){
    if(tabs[i].classList.contains('active')) continue;
    tabs[i].hidden = true; versteckt.unshift(tabs[i]);
    more.innerHTML = `<option value="">+${versteckt.length} weitere</option>`
      + versteckt.map(t => `<option value="${escapeAttr(t.dataset.tab)}">${escapeHtml(t.title)}</option>`).join('');
  }
  more.addEventListener('change', () => { if(more.value) selectProject(more.value); });
}
window.addEventListener('resize', () => { const bar = document.getElementById('project-tabs'); if(bar) fitProjectTabs(bar); });

function syncLageNaturschutzUI(p){
  currentLage = p.lage;
  const lageEl = document.getElementById('lage-result');
  if(currentLage) renderLage();
  else if(lageEl) lageEl.innerHTML = '<span style="font-style:italic">Noch nicht abgefragt. Datenquelle: ALKIS RP/NRW/Berlin + BKG VG250.</span>';

  currentNaturschutz = p.naturschutz;
  const natEl = document.getElementById('nat-result');
  if(currentNaturschutz) renderNaturschutz();
  else if(natEl) natEl.innerHTML = '<span style="font-style:italic">Noch nicht geprüft. Datenquelle: BfN — prüft Bounding-Box-Überlappung.</span>';

  lageLayer.clearLayers(); lageLabelsLayer.clearLayers();
}

function clearActiveProjectUI(){
  loadActiveProjectIntoSidebar(normalizeProject({}));
  syncLageNaturschutzUI({ lage:null, naturschutz:null });
}

function loadActiveProjectGeometryIntoMap(p){
  drawnItems.clearLayers();
  p.features.forEach(f => {
    L.geoJSON(f, { style:{color:'#4dabf7', weight:2, fillOpacity:0.25} })
      .eachLayer(l => { l.feature = f; drawnItems.addLayer(l); });
  });
}

function otherProjectPopupHtml(p){
  const ha = (combinedArea(p)/10000).toFixed(2);
  return `<div class="flst-popup">
    <div class="flst-popup-title">${escapeHtml(p.name||'(unbenanntes Projekt)')}</div>
    <div style="margin-bottom:8px">${ha} ha &middot; ${p.features.length} Teilfläche${p.features.length===1?'':'n'}</div>
    <button class="small" data-open-project>Öffnen</button>
  </div>`;
}

const PROJECT_POLY_STYLE = { color:'#0b8159', weight:3, fillColor:'#0e9d6e', fillOpacity:0.28, opacity:0.95 };
const PROJECT_POLY_STYLE_HOVER = { weight:4.5, fillOpacity:0.42 };

function renderOtherProjectsOnMap(){
  otherProjectsLayer.clearLayers();
  projects.filter(p => p.id !== activeProjectId && p.features.length).forEach(p => {
    L.geoJSON(combinedFeatureCollection(p), {
      style: PROJECT_POLY_STYLE
    }).eachLayer(l => {
      // bindPopup/on must run on each child layer — binding on the temporary
      // L.geoJSON group has no effect since only its children are added to the map
      l.bindPopup(otherProjectPopupHtml(p), { maxWidth:260, minWidth:180 });
      l.on('popupopen', e => {
        const btn = e.popup.getElement().querySelector('[data-open-project]');
        if(btn) btn.onclick = () => selectProject(p.id);
      });
      l.on('mouseover', () => l.setStyle(PROJECT_POLY_STYLE_HOVER));
      l.on('mouseout', () => l.setStyle(PROJECT_POLY_STYLE));
      otherProjectsLayer.addLayer(l);
    });
    try {
      const c = turf.centroid(combinedFeatureCollection(p)).geometry.coordinates;
      const label = L.marker([c[1], c[0]], {
        interactive:false,
        icon: L.divIcon({
          className:'project-label',
          html:`<div>${escapeHtml(p.name||'(unbenanntes Projekt)')}</div>`,
          iconSize:[0,0], iconAnchor:[0,0]
        })
      });
      otherProjectsLayer.addLayer(label);
    } catch{}
  });
}

// Moves the single shared #main (toolbar+#map) node into the given host container and
// forces Leaflet to recompute its size. The destination view/pane MUST already be visible
// (not display:none) before this runs, otherwise invalidateSize() measures a zero-size box.
function attachMapTo(hostId){
  document.getElementById(hostId).appendChild(document.getElementById('main'));
  requestAnimationFrame(()=>{
    map.invalidateSize();
    if(pendingMapFit && mapHatGroesse()){ const fit = pendingMapFit; pendingMapFit = null; fit(); }
  });
}
// Kartenausschnitt erst setzen, wenn die Karte wirklich sichtbar ist. Ein fitBounds auf den
// unsichtbaren Container (z. B. beim Öffnen eines Projekts auf der Übersicht) misst Größe 0,
// und Leaflet zoomt dann bis zum Maximalzoom (Maßstab ~1:90). Ist die Karte gerade verdeckt,
// wird der Ausschnitt gemerkt und beim nächsten attachMapTo() nachgeholt.
let pendingMapFit = null;
function mapHatGroesse(){ const c = map.getContainer(); return c.clientWidth > 0 && c.clientHeight > 0; }
function fitMapWhenVisible(fit){
  if(mapHatGroesse()){ pendingMapFit = null; requestAnimationFrame(() => requestAnimationFrame(fit)); }
  else pendingMapFit = fit;
}

function switchDetailTab(name){ // name: 'uebersicht' | 'prozess' | 'grundstueck' | 'genehmigung' | 'netz' | 'technik' | 'termine' | 'kosten'
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.dtab===name));
  ['uebersicht','prozess','grundstueck','genehmigung','netz','technik','termine','kosten'].forEach(k => {
    document.getElementById('dpane-'+k).classList.toggle('hidden', k!==name);
  });
  if(name==='uebersicht') renderDashboard();
  if(name==='prozess') renderProzessTab();
  if(name==='termine') renderTermineTab();
  if(name==='kosten') renderKostenTab();
  if(name==='grundstueck'){
    // Karte in den Grundstück-Host holen — der Pane ist ab hier sichtbar,
    // invalidateSize misst also eine echte Größe (auch beim Wechsel zurück vom Netz-Reiter).
    attachMapTo('map-host-grundstueck');
    switchGrundstueckSubtab('karte');
  }
  if(name==='genehmigung'){
    renderContacts(); renderRequests(); renderGenehmigungProzess();
    switchNtab('genehmigung:'+ntabAktiv.genehmigung);
  }
  if(name==='netz'){
    switchNtab('netz:'+ntabAktiv.netz);
    attachMapTo('map-host-netz');
    requestAnimationFrame(()=>map.invalidateSize());
    renderUwList();
    renderUwListOnMap();
    runVergleichAndRender();
  }
  if(activeProjectId){ tabStateFor(activeProjectId).detailTab = name; persistTabState(); }
}
document.querySelectorAll('.detail-tab').forEach(t => {
  t.addEventListener('click', () => switchDetailTab(t.dataset.dtab));
});
// Scrollposition des aktiven Tabs laufend (throttled per rAF) merken.
(function(){
  const el = detailScroller(); if(!el) return;
  let raf = null;
  el.addEventListener('scroll', () => {
    if(raf || !activeProjectId || currentView!=='detail') return;
    raf = requestAnimationFrame(() => { raf = null; tabStateFor(activeProjectId).scrollTop = el.scrollTop; persistTabState(); });
  }, { passive:true });
})();

// Unterreiter der Bereiche, die keine eigene Sub-Tab-Historie haben (Grundstück nutzt
// weiterhin switchGrundstueckSubtab). Schlüssel ist "bereich:unterreiter", damit derselbe
// Klick-Handler die Sidebar und die Leiste im Inhalt bedienen kann.
const NTAB_PANES = {
  genehmigung: ['verfahren','behoerden'],
  netz:        ['planung','beteiligte'],
};
let ntabAktiv = { genehmigung:'verfahren', netz:'planung' };

function switchNtab(key){
  const [bereich, sub] = String(key).split(':');
  const panes = NTAB_PANES[bereich]; if(!panes || !panes.includes(sub)) return;
  ntabAktiv[bereich] = sub;
  panes.forEach(k => {
    const el = document.getElementById('ntab-'+bereich+'-'+k);
    if(el) el.classList.toggle('hidden', k !== sub);
  });
  document.querySelectorAll(`[data-ntab^="${bereich}:"]`).forEach(t =>
    t.classList.toggle('active', t.dataset.ntab === key));
  if(sub === 'behoerden' || sub === 'beteiligte') renderBeteiligte(bereich);
  // Die Karte war beim Verstecken ohne Größe — nach der Rückkehr neu vermessen.
  if(bereich === 'netz' && sub === 'planung') requestAnimationFrame(() => map.invalidateSize());
}
document.querySelectorAll('[data-ntab]').forEach(t =>
  t.addEventListener('click', () => switchNtab(t.dataset.ntab)));
