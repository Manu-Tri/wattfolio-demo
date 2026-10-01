// Umspannwerk-Vergleich (Netz-Reiter) und globale Umspannwerk-Verwaltung
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---------- Umspannwerk-Vergleich (Netz-Reiter) ----------
const KOSTEN_PRO_METER_EUR = { 20:250, 110:500, 220:800, 380:1200 };
const KOSTEN_DEFAULT_EUR_PRO_METER = 400;

// Reine Funktion, kein DOM-Zugriff — Anlagen-Standort ist der Mittelpunkt der gezeichneten
// Teilflächen des Projekts. Distanz über Leaflets eigene Haversine-Formel (L.LatLng#distanceTo),
// da turf.centroid ohnehin schon für den Projekt-Mittelpunkt genutzt wird und ein zweiter
// Distanz-Helfer (turf.distance) keinen Mehrwert brächte.
function compareSubstations(project, opts){
  opts = Object.assign({ radiusKm:15, minKv:0, nurMitKapazitaet:false, korrekturfaktor:1.3, sortBy:'luftlinie' }, opts||{});
  if(!project || !project.features || !project.features.length) return [];

  const centroid = turf.centroid(combinedFeatureCollection(project)).geometry.coordinates; // [lon,lat]
  const anlagePoint = L.latLng(centroid[1], centroid[0]);
  const leistungMw = Number(project.netz && project.netz.leistungMw) || 0;

  let results = umspannwerke
    .filter(uw => uw.lat != null && uw.lon != null)
    .map(uw => {
      const distanzM = anlagePoint.distanceTo(L.latLng(uw.lat, uw.lon));
      const distanzGeschaetzt = distanzM * opts.korrekturfaktor;
      const kostenProM = KOSTEN_PRO_METER_EUR[uw.spannungKv] ?? KOSTEN_DEFAULT_EUR_PRO_METER;
      const kosten = distanzGeschaetzt * kostenProM;
      const kapAusreichend = (uw.freieKapazitaetMw||0) >= leistungMw && (uw.schaltfelderFrei||0) > 0;
      return { uw, distanzM, distanzGeschaetzt, kosten, kapAusreichend };
    })
    .filter(r => r.distanzM/1000 <= opts.radiusKm)
    .filter(r => opts.minKv === 0 || r.uw.spannungKv >= opts.minKv)
    .filter(r => !opts.nurMitKapazitaet || r.kapAusreichend);

  const sorters = {
    luftlinie:  (a,b) => a.distanzM - b.distanzM,
    kosten:     (a,b) => a.kosten - b.kosten,
    kapazitaet: (a,b) => (b.uw.freieKapazitaetMw||0) - (a.uw.freieKapazitaetMw||0),
  };
  results.sort(sorters[opts.sortBy] || sorters.luftlinie);
  return results; // "Top 10" wird erst beim Rendern geschnitten, nicht hier
}

function renderVergleichTable(results){
  const wrap = document.getElementById('uw-vergleich-table-wrap');
  const empty = document.getElementById('uw-vergleich-empty');
  if(!results.length){
    wrap.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  const rows = results.slice(0,10).map((r,i) => {
    const uw = r.uw;
    const kmLuft = (r.distanzM/1000).toFixed(2);
    const kmGesch = (r.distanzGeschaetzt/1000).toFixed(2);
    const kapPill = r.kapAusreichend ? 'pill ok' : 'pill warn';
    const kapText = (uw.freieKapazitaetMw!=null) ? `${uw.freieKapazitaetMw} MW` : '—';
    const statusPill = r.kapAusreichend
      ? '<span class="pill ok">✓ ausreichend</span>'
      : '<span class="pill warn">knapp</span>';
    return `<tr>
      <td>${i+1}</td>
      <td>${escapeHtml(uw.name||'(unbenannt)')}${uw.betreiber?`<div style="color:var(--muted);font-size:10.5px">${escapeHtml(uw.betreiber)}</div>`:''}</td>
      <td class="mono">${uw.spannungKv} kV</td>
      <td class="mono">${kmLuft} / ${kmGesch} km</td>
      <td><span class="${kapPill}">${kapText}</span></td>
      <td class="mono">${r.kosten.toLocaleString('de-DE',{maximumFractionDigits:0})} €</td>
      <td>${statusPill}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<table class="vergleich-table">
    <tr><th>#</th><th>Umspannwerk</th><th>kV</th><th>Luftlinie / geschätzt</th><th>Frei</th><th>Geschätzte Kosten</th><th>Status</th></tr>
    ${rows}
  </table>`;
}

function renderTrasseLinesOnMap(results, anlagePoint){
  trasseLayer.clearLayers();
  results.slice(0,10).forEach(r => {
    const line = L.polyline(
      [anlagePoint, L.latLng(r.uw.lat, r.uw.lon)],
      { color: r.kapAusreichend ? '#2f9e44' : '#e8590c', weight:2, dashArray:'6,6' }
    );
    line.bindTooltip(`${escapeHtml(r.uw.name)} · ${(r.distanzM/1000).toFixed(2)} km`, { sticky:true });
    trasseLayer.addLayer(line);
  });
}

function renderSearchRadius(anlagePoint, radiusKm){
  radiusLayer.clearLayers();
  L.circle(anlagePoint, { radius: radiusKm*1000, color:'#4dabf7', weight:1.5, dashArray:'4,4', fillOpacity:0.03 }).addTo(radiusLayer);
}

let activeMinKv = 0;

function runVergleichAndRender(){
  const p = getActiveProject();
  if(!p || !p.features.length){
    renderVergleichTable([]);
    trasseLayer.clearLayers();
    radiusLayer.clearLayers();
    return;
  }
  const opts = {
    radiusKm: Number(document.getElementById('uw-radius').value),
    minKv: activeMinKv,
    nurMitKapazitaet: document.getElementById('uw-nur-kapazitaet').checked,
    korrekturfaktor: 1.3,
    sortBy: document.getElementById('uw-sort').value,
  };
  const results = compareSubstations(p, opts);
  const centroid = turf.centroid(combinedFeatureCollection(p)).geometry.coordinates;
  const anlagePoint = L.latLng(centroid[1], centroid[0]);

  renderVergleichTable(results);
  renderTrasseLinesOnMap(results, anlagePoint);
  renderSearchRadius(anlagePoint, opts.radiusKm);
}

document.getElementById('uw-radius').addEventListener('input', () => {
  document.getElementById('uw-radius-val').textContent = document.getElementById('uw-radius').value;
  runVergleichAndRender();
});
document.getElementById('uw-nur-kapazitaet').addEventListener('change', runVergleichAndRender);
document.getElementById('uw-sort').addEventListener('change', runVergleichAndRender);
document.querySelectorAll('#uw-minkv-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    const kv = Number(btn.dataset.kv);
    activeMinKv = (activeMinKv === kv) ? 0 : kv; // erneuter Klick hebt die Auswahl auf
    document.querySelectorAll('#uw-minkv-toggle button').forEach(b => b.classList.toggle('active', Number(b.dataset.kv)===activeMinKv));
    runVergleichAndRender();
  });
});

// ---------- Umspannwerke verwalten (global, CRUD) ----------
function renderUwListOnMap(){
  uwLayer.clearLayers();
  umspannwerke.filter(uw => uw.lat!=null && uw.lon!=null).forEach(uw => {
    L.marker([uw.lat, uw.lon], { title: uw.name })
      .bindPopup(`<div class="flst-popup"><div class="flst-popup-title">${escapeHtml(uw.name||'(unbenannt)')}</div>
        <table>
          <tr><th>Betreiber</th><td>${escapeHtml(uw.betreiber||'—')}</td></tr>
          <tr><th>Spannung</th><td>${uw.spannungKv} kV</td></tr>
          <tr><th>Freie Kapazität</th><td>${uw.freieKapazitaetMw ?? '—'} MW</td></tr>
          <tr><th>Schaltfelder frei</th><td>${uw.schaltfelderFrei ?? '—'}</td></tr>
        </table></div>`, { maxWidth:280 })
      .addTo(uwLayer);
  });
}

function armSubstationPlacement(uw){
  if(isDrawingPolygon){
    alert('Bitte zuerst die aktuelle Flächen-Zeichnung abschließen oder abbrechen.');
    return;
  }
  toast(`Klicke auf die Karte, um den Standort für "${uw.name||'Umspannwerk'}" zu setzen.`);
  map.getContainer().style.cursor = 'crosshair';
  map.once('click', (e) => {
    map.getContainer().style.cursor = '';
    uw.lat = e.latlng.lat;
    uw.lon = e.latlng.lng;
    saveUmspannwerke();
    renderUwList();
    renderUwListOnMap();
    runVergleichAndRender();
    toast(`Standort gesetzt für "${uw.name||'Umspannwerk'}".`);
  });
}

function renderUwList(){
  const root = document.getElementById('uw-list');
  root.innerHTML = '';
  if(!umspannwerke.length){ root.innerHTML = '<div class="empty">Keine Umspannwerke hinterlegt.</div>'; return; }
  umspannwerke.forEach((uw, i) => {
    const card = document.createElement('div'); card.className = 'card';
    const hasLoc = uw.lat!=null && uw.lon!=null;
    const pill = hasLoc ? '<span class="pill ok">Standort gesetzt</span>' : '<span class="pill warn">Kein Standort</span>';
    card.innerHTML = `
      <h3><span>${escapeHtml(uw.name||'Neues Umspannwerk')}</span> ${pill}</h3>
      <label>Name</label>
      <input type="text" data-k="name" value="${escapeAttr(uw.name)}" />
      <label>Betreiber (optional)</label>
      <input type="text" data-k="betreiber" value="${escapeAttr(uw.betreiber)}" />
      <div class="grid2" style="margin-top:8px;max-width:none">
        <div><label>Spannungsebene</label>
          <select data-k="spannungKv">
            <option value="110"${uw.spannungKv===110?' selected':''}>110 kV</option>
            <option value="220"${uw.spannungKv===220?' selected':''}>220 kV</option>
            <option value="380"${uw.spannungKv===380?' selected':''}>380 kV</option>
          </select></div>
        <div><label>Trafoleistung (MVA)</label>
          <input type="number" data-k="trafoleistungMva" value="${uw.trafoleistungMva ?? ''}" /></div>
        <div><label>Schaltfelder gesamt</label>
          <input type="number" data-k="schaltfelderGesamt" value="${uw.schaltfelderGesamt ?? ''}" /></div>
        <div><label>Schaltfelder frei</label>
          <input type="number" data-k="schaltfelderFrei" value="${uw.schaltfelderFrei ?? ''}" /></div>
        <div><label>Freie Kapazität (MW)</label>
          <input type="number" data-k="freieKapazitaetMw" value="${uw.freieKapazitaetMw ?? ''}" /></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted)" class="mono">
        ${hasLoc ? `${uw.lat.toFixed(5)}, ${uw.lon.toFixed(5)}` : 'Noch kein Standort'}
      </div>
      <div class="actions">
        <button class="secondary small" data-act="placeloc">Standort auf Karte setzen</button>
        <button class="danger small" data-act="del">Entfernen</button>
      </div>
    `;
    card.querySelectorAll('[data-k]').forEach(inp => {
      const ev = inp.tagName==='SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        const key = inp.dataset.k;
        const numericKeys = ['trafoleistungMva','schaltfelderGesamt','schaltfelderFrei','freieKapazitaetMw'];
        uw[key] = (key==='spannungKv') ? Number(inp.value)
                : numericKeys.includes(key) ? (inp.value===''?null:Number(inp.value))
                : inp.value;
        saveUmspannwerke();
        if(key==='name') renderUwList();
        renderUwListOnMap();
        runVergleichAndRender();
      });
    });
    card.querySelector('[data-act=placeloc]').onclick = () => armSubstationPlacement(uw);
    card.querySelector('[data-act=del]').onclick = () => {
      if(!confirm('Dieses Umspannwerk entfernen?')) return;
      supabaseDelete('substations', uw.id);
      umspannwerke.splice(i,1); saveUmspannwerke(); renderUwList(); renderUwListOnMap(); runVergleichAndRender();
    };
    root.appendChild(card);
  });
}
document.getElementById('btn-add-uw').onclick = () => {
  umspannwerke.push(normalizeSubstation({ name:'Neues Umspannwerk' }));
  saveUmspannwerke(); renderUwList();
};

let currentLage = null;    // { gemarkungen, fluren, gemeinden, kreise, land, flurstuecke[], truncated, source, fetchedAt }
let currentNaturschutz = null; // { bbox, results:[{cat,items,error}], fetchedAt }

// Old sidebar-tab switcher removed — the Projektübersicht's Reiter (Grundstück/
// Genehmigungsplanung/Netz/Technische Planung) are handled by switchDetailTab()
// further down, wired to elements with the distinct `.detail-tab` class.
