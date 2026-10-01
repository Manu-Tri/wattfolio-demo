// Projektliste: Suche, Filter, Karten-Kacheln, Header-Navigation
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---- Suche & Filter für die Projektliste ----
const projectFilter = { q:'', phase:'', land:'', overdue:false };
function projectMatchesFilter(p){
  if(projectFilter.q){
    const hay = [p.name, standortText(p), p.prozess.projektnummer].join(' ').toLowerCase();
    if(!hay.includes(projectFilter.q)) return false;
  }
  if(projectFilter.phase && currentPhase(p).id !== projectFilter.phase) return false;
  if(projectFilter.land && ((p.lage && p.lage.land) || '') !== projectFilter.land) return false;
  if(projectFilter.overdue && !projectDeadlines(p).some(d => daysUntil(d.datum) < 0)) return false;
  return true;
}
(function initProjectFilter(){
  const phaseSel = document.getElementById('filter-phase');
  phaseSel.innerHTML = '<option value="">Alle Phasen</option>' +
    PROCESS_TEMPLATE.map(ph => `<option value="${escapeAttr(ph.id)}">${ph.nr} — ${escapeHtml(ph.name)}</option>`).join('');
  document.getElementById('project-search').addEventListener('input', e => {
    projectFilter.q = e.target.value.trim().toLowerCase(); renderProjectList();
  });
  phaseSel.addEventListener('change', e => { projectFilter.phase = e.target.value; renderProjectList(); });
  document.getElementById('filter-land').addEventListener('change', e => { projectFilter.land = e.target.value; renderProjectList(); });
  document.getElementById('filter-overdue').addEventListener('change', e => { projectFilter.overdue = e.target.checked; renderProjectList(); });
})();
function renderLandFilterOptions(){
  const sel = document.getElementById('filter-land');
  const laender = [...new Set(projects.map(p => p.lage && p.lage.land).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  const cur = projectFilter.land;
  sel.innerHTML = '<option value="">Alle Bundesländer</option>' +
    laender.map(l => `<option value="${escapeAttr(l)}"${l===cur?' selected':''}>${escapeHtml(l)}</option>`).join('');
  if(cur && !laender.includes(cur)){ projectFilter.land = ''; }
}
// „Weiter bei"-Chip: springt zum zuletzt geöffneten Projekt
function renderResumeChip(){
  const chip = document.getElementById('resume-chip');
  const lastId = localStorage.getItem('pa_last_project_v1');
  const p = projects.find(x => x.id === lastId);
  if(!p){ chip.style.display = 'none'; return; }
  chip.style.display = 'flex';
  chip.innerHTML = `Weiter bei: <b>${escapeHtml(p.name||'(unbenanntes Projekt)')}</b> →`;
  chip.onclick = () => selectProject(p.id);
}

function renderProjectList(){
  if(typeof glockeSpaeterAktualisieren === 'function') glockeSpaeterAktualisieren(); // auch nach Login/Backup-Import
  const root = document.getElementById('project-list');
  root.innerHTML = '';
  renderLandFilterOptions();
  renderResumeChip();
  const countEl = document.getElementById('filter-count');
  if(!projects.length){
    root.innerHTML = '<div class="empty">Noch keine Projekte angelegt. Klicke „+ Neues Projekt&quot;, um zu starten.</div>';
    countEl.textContent = '';
    renderFristenDashboard();
    renderGlobalCalendar();
    return;
  }
  const visible = projects.filter(projectMatchesFilter);
  countEl.textContent = visible.length === projects.length
    ? `${projects.length} Projekt${projects.length===1?'':'e'}`
    : `${visible.length} von ${projects.length} Projekten`;
  if(!visible.length){
    root.innerHTML = '<div class="empty">Keine Projekte passen zu Suche/Filter.</div>';
    renderFristenDashboard();
    renderGlobalCalendar();
    return;
  }
  root.classList.toggle('als-liste', projectAnsicht === 'liste');
  if(projectAnsicht === 'liste'){
    renderProjectTable(root, sortProjects(visible));
    renderFristenDashboard();
    renderGlobalCalendar();
    return;
  }
  sortProjects(visible).forEach(p => {
    const card = document.createElement('div'); card.className = 'card project-card';
    const ha = (combinedArea(p)/10000).toFixed(2);
    const statusPill = phaseBadgeHtml(p);
    const loc = projectLocationLatLon(p);
    card.innerHTML = `
      <div class="project-card-map" title="${loc ? 'Ungefähre Lage in Deutschland' : 'Noch keine Fläche gezeichnet'}">${miniGermanyMapHtml(loc)}</div>
      <div class="project-card-body">
        <h3><span>${escapeHtml(p.name||'(unbenanntes Projekt)')}</span> ${statusPill}</h3>
        <div class="meta">
          <span>${escapeHtml(standortText(p))}</span>
          <span>Zuletzt geändert: ${new Date(p.updatedAt).toLocaleString('de-DE')}</span>
        </div>
        <div class="kpis">
          <div class="kpi"><span>Größe</span><b>${ha} ha</b></div>
          <div class="kpi"><span>Leistung</span><b>${escapeHtml(formatLeistung(p)||'—')}</b></div>
          <div class="kpi"><span>Teilflächen</span><b>${p.features.length}</b></div>
        </div>
        <details class="project-more">
          <summary>Weitere Infos</summary>
          <div class="body">${projectExtraInfoHtml(p)}</div>
        </details>
        <div class="actions">
          <button data-act="open">Öffnen</button>
          <button class="danger small" data-act="del">Löschen</button>
        </div>
      </div>
    `;
    card.querySelector('[data-act=open]').onclick = () => selectProject(p.id);
    card.querySelector('[data-act=del]').onclick = () => loescheProjekt(p);
    root.appendChild(card);
  });
  renderFristenDashboard();
  renderGlobalCalendar();
}

function loescheProjekt(p){
  if(!confirm(`Projekt "${p.name||'(unbenanntes Projekt)'}" inkl. aller Teilflächen unwiderruflich löschen?`)) return;
  supabaseDelete('projects', p.id);
  const pfade = projektStoragePfade(p);
  if(pfade.length && window.sb) window.sb.storage.from(DOKU_BUCKET).remove(pfade)
    .then(({ error }) => { if(error) console.warn('Storage-Dateien des Projekts nicht gelöscht:', error); });
  projects = projects.filter(x => x.id !== p.id);
  openTabs = openTabs.filter(id => id !== p.id); persistOpenTabs();
  delete tabState[p.id]; persistTabState();
  saveProjects();
  renderProjectList();
  renderProjectTabs(currentView);
}

// ---- Listenansicht: eine Zeile je Projekt, Spaltenköpfe sortieren (gleiche Sortierung wie die Auswahl) ----
const LS_PROJECT_ANSICHT = 'pa_project_ansicht_v1';
let projectAnsicht = loadOr(LS_PROJECT_ANSICHT, 'kacheln') === 'liste' ? 'liste' : 'kacheln';
function setProjectAnsicht(a){
  projectAnsicht = a === 'liste' ? 'liste' : 'kacheln';
  try { localStorage.setItem(LS_PROJECT_ANSICHT, JSON.stringify(projectAnsicht)); } catch {}
  document.querySelectorAll('#project-ansicht [data-ansicht]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.ansicht === projectAnsicht)));
  renderProjectList();
}
document.querySelectorAll('#project-ansicht [data-ansicht]').forEach(b => {
  b.setAttribute('aria-pressed', String(b.dataset.ansicht === projectAnsicht));
  b.addEventListener('click', () => setProjectAnsicht(b.dataset.ansicht));
});

// Nächste Frist eines Projekts (überfällige zuerst, sonst die früheste)
function naechsteProjektFrist(p){
  return projectDeadlines(p).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null;
}
function renderProjectTable(root, liste){
  const kopf = (label, sortKey, cls) => {
    const aktiv = sortKey && projectSortBy === sortKey;
    return `<th class="${cls||''}${sortKey ? ' sortierbar' : ''}"${sortKey ? ` data-sort="${sortKey}" tabindex="0" aria-sort="${aktiv ? 'descending' : 'none'}" title="Nach dieser Spalte sortieren"` : ''}>${label}${aktiv ? ' <span aria-hidden="true">▾</span>' : ''}</th>`;
  };
  root.innerHTML = `<div class="info project-table-wrap"><table class="gs-table project-table">
    <thead><tr>
      ${kopf('Projekt', 'name')}${kopf('Phase', 'status', 'col-phase')}${kopf('Größe', 'area', 'num col-groesse')}
      ${kopf('Leistung', null, 'col-opt col-leistung')}${kopf('Nächste Frist', null, 'col-frist')}${kopf('Geändert', 'updated', 'col-opt col-geaendert')}
      <th class="col-aktion"></th>
    </tr></thead>
    <tbody>${liste.map(p => {
      const ph = currentPhase(p), o = overallProgress(p);
      const phase = p.prozess.abgebrochen
        ? '<span class="pill warn">zurückgestellt</span>'
        : `<span class="pill ${ph.nr >= 9 && o.done === o.total ? 'ok' : 'phase'}">${ph.nr}/10 · ${escapeHtml(ph.name)}</span>`;
      const f = naechsteProjektFrist(p);
      let frist = '<span class="sub">—</span>';
      if(f){
        const t = daysUntil(f.datum);
        frist = `<span class="${fristPillClass(f.datum, f.warnTage || 14)}">${t < 0 ? `${-t} T. überfällig` : t === 0 ? 'heute' : `in ${t} T.`}</span>`
          + `<span class="sub" title="${escapeAttr(f.text)}">${escapeHtml(f.text.split(':')[0])}</span>`;
      }
      const standort = standortText(p);
      return `<tr class="project-row" data-open="${escapeAttr(p.id)}" tabindex="0" title="Projekt öffnen">
        <td><span class="strong">${escapeHtml(p.name || '(unbenanntes Projekt)')}</span>
          <span class="sub">${escapeHtml([p.prozess.projektnummer, standort].filter(Boolean).join(' · '))}</span></td>
        <td class="col-phase">${phase}<span class="sub">${o.done}/${o.total} Schritte</span></td>
        <td class="num col-groesse">${(combinedArea(p) / 10000).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 })} ha</td>
        <td class="col-opt col-leistung">${escapeHtml(formatLeistung(p, '\n') || '—').replace(/\n/g, '<br>')}</td>
        <td class="col-frist">${frist}</td>
        <td class="col-opt col-geaendert">${escapeHtml(new Date(p.updatedAt).toLocaleDateString('de-DE'))}</td>
        <td class="col-aktion"><button type="button" class="danger small" data-del="${escapeAttr(p.id)}" title="Projekt löschen" aria-label="Projekt löschen">×</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
  root.querySelectorAll('[data-open]').forEach(tr => {
    tr.addEventListener('click', e => { if(e.target.closest('button')) return; selectProject(tr.dataset.open); });
    tr.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target === tr){ e.preventDefault(); selectProject(tr.dataset.open); } });
  });
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const p = projects.find(x => x.id === b.dataset.del); if(p) loescheProjekt(p);
  }));
  root.querySelectorAll('th[data-sort]').forEach(th => {
    const sortieren = () => {
      projectSortBy = th.dataset.sort; save(LS_KEYS.projectSort, projectSortBy);
      document.getElementById('project-sort').value = projectSortBy;
      renderProjectList();
    };
    th.addEventListener('click', sortieren);
    th.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); sortieren(); } });
  });
}

const projectSortSelect = document.getElementById('project-sort');
projectSortSelect.value = projectSortBy;
projectSortSelect.addEventListener('change', () => {
  projectSortBy = projectSortSelect.value;
  save(LS_KEYS.projectSort, projectSortBy);
  renderProjectList();
});

// Demo-Eigentümer für neu angelegte Projekte — jedes Mal frische Kopien mit eigener id,
// damit Bearbeitungen in einem Projekt nicht versehentlich ein anderes Projekt mitändern.
function demoEigentuemer(){
  const now = Date.now();
  return [
    { id:'e'+now+'a', name:'Erika Musterfrau', strasse:'Hauptstraße 12', plz:'54290', ort:'Trier', telefon:'0651 1234567', email:'erika.musterfrau@beispiel.de', notiz:'Demo-Datensatz' },
    { id:'e'+now+'b', name:'Hans Beispiel', strasse:'Feldweg 5', plz:'54295', ort:'Trier', telefon:'0651 7654321', email:'hans.beispiel@beispiel.de', notiz:'Demo-Datensatz' },
    { id:'e'+now+'c', name:'Agrar Musterhof GbR', strasse:'Am Hof 3', plz:'54308', ort:'Langsur', telefon:'06501 998877', email:'info@musterhof-demo.de', notiz:'Demo-Datensatz' },
  ];
}

// ---- Neues-Projekt-Assistent: fragt die drei grundlegenden Weichenstellungen ab
// (Anlagenart, Verfahrensweg, Bundesland), bevor überhaupt ein Projekt existiert — danach
// landet man direkt auf der schon passend zentrierten Karte. Alles Weitere (Feinheiten zum
// Verfahren, Privilegierungsnachweise, Stammdaten) bleibt bewusst dem jeweiligen Reiter
// überlassen, damit die eigentliche Projekt-Eingabemaske schlank bleibt.
let npEntwurf = null;

function openNeuesProjektModal(){
  npEntwurf = { anlagenart:'', weg:'', land:'' };
  document.getElementById('view-neu').classList.remove('hidden');
  renderNeuesProjektModal();
}
function closeNeuesProjektModal(){
  document.getElementById('view-neu').classList.add('hidden');
  npEntwurf = null;
}

function renderNeuesProjektModal(){
  const body = document.getElementById('np-body'); if(!body || !npEntwurf) return;
  const e = npEntwurf;
  const landeAlpha = [...STATES].sort((a,b) => a.name.localeCompare(b.name,'de'));

  body.innerHTML = `
    <div style="padding:16px 18px;display:flex;flex-direction:column;gap:20px">
      <div class="vw-step">
        <label><b>1 · Was wird gebaut?</b></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${ANLAGENARTEN.map(a => `<button type="button" class="${e.anlagenart===a.id?'':'secondary '}small" data-np-art="${escapeAttr(a.id)}">${escapeHtml(a.name)}</button>`).join('')}
        </div>
      </div>

      <div class="vw-step${e.anlagenart ? '' : ' hidden'}">
        <label><b>2 · Wie wird die Fläche baurechtlich zulässig?</b></label>
        <div class="vw-desc" style="margin:0">Groborientierung — der genaue Tatbestand samt Nachweisen folgt später im Reiter „Genehmigung".</div>
        ${VERFAHRENSWEGE.map(w => `
          <label class="vw-opt${e.weg===w.id?' sel':''}">
            <input type="radio" name="np-weg" value="${escapeAttr(w.id)}"${e.weg===w.id?' checked':''} />
            <span style="flex:1">
              <b>${escapeHtml(w.name)}</b>
              <span class="pill" style="margin-left:6px">${escapeHtml(w.norm)}</span>
              <span class="pill phase" style="margin-left:4px">${escapeHtml(w.dauer)}</span>
              <div class="vw-desc">${escapeHtml(w.kurz)}</div>
            </span>
          </label>`).join('')}
      </div>

      <div class="vw-step${e.weg ? '' : ' hidden'}">
        <label><b>3 · In welchem Bundesland liegt die Fläche?</b></label>
        <div class="vw-desc" style="margin:0">Legt den Kartenausschnitt und die ALKIS-Hintergrundkarte fest, mit der die Karte gleich startet.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${landeAlpha.map(s => `<button type="button" class="${e.land===s.key?'':'secondary '}small" data-np-land="${escapeAttr(s.key)}">${escapeHtml(s.name)}</button>`).join('')}
        </div>
      </div>
    </div>`;

  body.querySelectorAll('[data-np-art]').forEach(b => b.addEventListener('click', () => {
    npEntwurf.anlagenart = b.dataset.npArt; renderNeuesProjektModal();
    scrollNpStepIntoView(1); // Schritt 2 (Verfahrensweg) ist gerade erschienen — direkt zeigen
  }));
  body.querySelectorAll('input[name=np-weg]').forEach(r => r.addEventListener('change', () => {
    npEntwurf.weg = r.value; renderNeuesProjektModal();
    scrollNpStepIntoView(2); // Schritt 3 (Bundesland) ist gerade erschienen — direkt zeigen
  }));
  body.querySelectorAll('[data-np-land]').forEach(b => b.addEventListener('click', () => {
    npEntwurf.land = b.dataset.npLand; renderNeuesProjektModal();
  }));
}

// Scrollt den n-ten Schritt (0-basiert) im Assistenten-Body ins Bild — sorgt dafür, dass ein
// gerade freigeschalteter Folgeschritt (v.a. „3 · Bundesland", ohne größeres Fenster sonst
// unterhalb des sichtbaren Bereichs) nicht übersehen wird.
function scrollNpStepIntoView(stepIndex){
  const steps = document.querySelectorAll('#np-body .vw-step');
  const el = steps[stepIndex];
  // "smooth" bleibt in manchen Situationen (Tab kurz ohne Fokus, reduced-motion) einfach aus,
  // ohne Fehler — sofortiges Scrollen ("auto") ist hier wichtiger als die Animation.
  if(el) el.scrollIntoView({ behavior:'auto', block:'start' });
}

// Button ist bewusst nie disabled: eine ausgegraute Schaltfläche unterscheidet sich in diesem
// Stylesheet optisch nicht von einer aktiven (kein globales button:disabled) — das führte dazu,
// dass ein Klick bei fehlender Angabe (meist Schritt 3, außerhalb des sichtbaren Bereichs)
// wirkungslos und der Button dadurch "kaputt" wirkte. Stattdessen: bei Klick immer reagieren,
// fehlende Angabe klar benennen und zum jeweiligen Schritt scrollen.
function erstelleNeuesProjekt(){
  const e = npEntwurf;
  if(!e) return;
  if(!e.anlagenart){ toast('Bitte zuerst auswählen: Was wird gebaut?'); scrollNpStepIntoView(0); return; }
  if(!e.weg){ toast('Bitte den Verfahrensweg wählen.'); scrollNpStepIntoView(1); return; }
  if(!e.land){ toast('Bitte noch das Bundesland wählen.'); scrollNpStepIntoView(2); return; }
  const p = normalizeProject({});
  p.eigentuemer = demoEigentuemer();
  p.genehmigung.verfahren.anlagenart = e.anlagenart;
  p.genehmigung.verfahren.weg = e.weg;
  p.planBundesland = e.land;
  projects.push(p); saveProjects();
  closeNeuesProjektModal();
  // Neuanlage startet auf der Kartenansicht: erster Schritt ist das Abstecken der Fläche,
  // alle weiteren Angaben folgen danach auf den übrigen Reitern.
  selectProject(p.id, { startTab: 'grundstueck' });
}

document.getElementById('btn-new-project').onclick = openNeuesProjektModal;
document.getElementById('np-close').addEventListener('click', closeNeuesProjektModal);
document.getElementById('np-anlegen').addEventListener('click', erstelleNeuesProjekt);
document.getElementById('view-neu').addEventListener('click', e => {
  if(e.target.id === 'view-neu') closeNeuesProjektModal();
});
// ---- Header-Navigation ----
function gotoList(){
  saveActiveScroll();
  renderProjectList();
  switchView('list');
  globalCalendar.pruefeModus(); // Kalender war evtl. verdeckt (Breite 0) aufgebaut — Stufe jetzt an die sichtbare Breite anpassen
}
// Fallback-Ausschnitt (ganz Deutschland), wenn noch kein Projekt eine Fläche hat.
const GERMANY_BOUNDS = [[47.27,5.87],[55.06,15.04]];
function gotoMap(){
  saveActiveScroll();
  map.closePopup();
  activeProjectId = null; // Karte zeigt alle Projekte; das offene Projekt wird geschlossen
  pendingMapFit = null;   // gemerkten Projekt-Ausschnitt verwerfen, die Übersichtskarte richtet sich selbst aus
  clearActiveProjectUI();
  switchView('map');
  attachMapTo('map-host-browse');
  drawnItems.clearLayers();
  renderOtherProjectsOnMap();
  refreshStats();
  // Kartenausschnitt automatisch auf alle Projektflächen zoomen (statt am zuletzt betrachteten
  // Ausschnitt zu kleben), damit die Übersicht sofort alle Standorte auf einen Blick zeigt.
  // Doppeltes rAF: attachMapTo/invalidateSize läuft selbst per rAF, erst danach hat der
  // Kartencontainer seine echte Größe, sonst würde fitBounds falsch skalieren.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if(otherProjectsLayer.getLayers().length) map.fitBounds(otherProjectsLayer.getBounds(), { padding:[40,40], maxZoom:13 });
    else map.fitBounds(GERMANY_BOUNDS);
  }));
}
document.getElementById('nav-brand').onclick = gotoList;
document.getElementById('nav-list').onclick = gotoList;
document.getElementById('nav-map').onclick = gotoMap;
updateHeaderNav('list'); // Initialzustand: Projektliste aktiv (Tabs werden aus dem Speicher wiederhergestellt)
