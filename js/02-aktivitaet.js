// Aktivitätslog (wer/wann/was) inkl. Viewer-Overlay
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// AKTIVITÄTSLOG — wer/wann/was. Automatisch: bei jedem saveProjects() wird ein
// flacher Feld-Snapshot je Projekt gebildet und gegen den vorherigen verglichen.
// Jede Feld-Änderung ergibt einen lesbaren Eintrag. Fortlaufendes Tippen wird zu
// EINEM Eintrag zusammengefasst (siehe pushActivity), damit kein Keystroke-Spam
// entsteht. Der Log liegt separat unter LS_KEYS.activity und wird nicht in die
// Projekte geschrieben (kein Einfluss auf normalizeProject).
// ═════════════════════════════════════════════════════════════════════════════
let activityLog = loadOr(LS_KEYS.activity, []);
const ACTIVITY_MAX = 3000;                 // Ringpuffer: älteste Einträge fallen raus
const ACTIVITY_MERGE_MS = 4 * 60 * 1000;   // gleiches Feld+Nutzer binnen 4 min = ein Eintrag
let activitySnapshot = null;               // id -> { name, flat }
let activitySuspended = false;             // während initialer Migration keine Logs

// Technische / riesige / redundante Schlüssel, die NICHT in den Snapshot einfließen.
const ACT_IGNORE_KEYS = new Set(['updatedAt','createdAt','id','dataUrl','storagePath','mime','size',
  'addedAt','fetchedAt','truncated','source','angefragtAm','erhaltenAm','ersteZahlungAm']);
// Ganze Zweige überspringen (Geometrie/Scans) — nur ihre grobe Präsenz interessiert.
const ACT_SKIP_BRANCHES = new Set(['features','lage','naturschutz','benachrichtigungen']); // Glocke: Gelesen-Markierungen sind keine Projektänderung

function actFlatten(v, path, out){
  if(v === null || v === undefined){ return; }
  if(Array.isArray(v)){
    // Datei-/Objektlisten mit Namen → lesbare Namensliste; sonst nur Anzahl.
    if(v.length && v[0] && typeof v[0] === 'object' && 'name' in v[0]){
      out[path] = v.map(x => x.name).join(', ');
    } else if(v.length){
      out[path + '.#'] = v.length;
    }
    return;
  }
  if(typeof v === 'object'){
    for(const k in v){
      if(ACT_IGNORE_KEYS.has(k)) continue;
      if(!path && ACT_SKIP_BRANCHES.has(k)) continue;
      actFlatten(v[k], path ? path + '.' + k : k, out);
    }
    return;
  }
  if(v === '' || v === false) return; // Leerwerte nicht als „gesetzt" führen
  out[path] = v;
}
function actSnapOne(p){ const f = {}; actFlatten(p, '', f); return { name: p.name || '(unbenannt)', flat: f }; }
function actSnapAll(){ const m = {}; projects.forEach(p => { m[p.id] = actSnapOne(p); }); return m; }

function actFmtVal(v){
  if(v === undefined || v === '' || v === null) return '—';
  if(v === true) return 'ja';
  if(v === false) return 'nein';
  return String(v);
}
// Pfad → menschenlesbares Label. Erst spezifische Fälle, dann generischer Fallback.
function actLabel(path){
  const seg = path.split('.');
  const FLAT = {
    name:'Projektname', location:'Ort / Lage', power:'Leistung', timeline:'Zeitplan',
    powerDcKwp:'Leistung DC (kWp)', powerAcKw:'Leistung AC (kW)',
    notes:'Notizen', status:'Status', quelle:'Flächenquelle',
    'prozess.vermarktung':'Vermarktung', 'prozess.projektnummer':'Projekt-ID',
    'prozess.abgebrochen':'Projekt zurückgestellt/abgebrochen', 'prozess.abbruchGrund':'Abbruchgrund',
    'netz.betreiber':'Netz: Betreiber', 'netz.anschlusspunkt':'Netz: Anschlusspunkt',
    'netz.anschlussleistung':'Netz: Anschlussleistung', 'netz.leistungMw':'Netz: Leistung (MW)',
    'netz.anaGestelltAm':'Netz: ANA gestellt am', 'netz.nvpStatus':'Netz: NVP-Status',
    'netz.trasseStatus':'Netz: Trassen-Status', 'netz.trasseNotiz':'Netz: Trassen-Notiz',
    'genehmigung.behoerde':'Genehmigung: Behörde', 'genehmigung.verfahrensstand':'Genehmigung: Verfahrensstand',
    'genehmigung.bauverfahren.art':'Bauverfahren',
    'genehmigung.bplan.bplaner.name':'B-Planer: Name', 'genehmigung.bplan.bplaner.email':'B-Planer: E-Mail',
    'features.#':'Gezeichnete Flächen (Anzahl)', 'eigentuemer.#':'Eigentümer (Anzahl)',
    'genehmigung.auflagen.#':'Auflagen (Anzahl)', 'genehmigung.fristenListe.#':'Fristen (Anzahl)',
  };
  if(FLAT[path]) return FLAT[path];
  // Dokumente: dokumente.<typId>.status | .dateien
  if(seg[0] === 'dokumente' && seg[1]){
    const t = dokumentType(seg[1]); const nm = t ? t.name : seg[1];
    if(seg[2] === 'dateien') return `Dokument „${nm}": Dateien`;
    if(seg[2] === 'status')  return `Dokument „${nm}": Status`;
    return `Dokument „${nm}"`;
  }
  // Prozess-Schritte: prozess.schritte.<stepId>.status/notiz
  if(seg[0] === 'prozess' && seg[1] === 'schritte' && seg[2]){
    let nm = seg[2];
    for(const ph of (typeof PROCESS_TEMPLATE!=='undefined'?PROCESS_TEMPLATE:[])){
      const st = ph.steps.find(s => s.id === seg[2]); if(st){ nm = st.name; break; }
    }
    return `Prozess-Schritt „${nm}"` + (seg[3] && seg[3] !== 'status' ? ` (${seg[3]})` : '');
  }
  // Qualifikation: qualifikation.<key>.status/notiz
  if(seg[0] === 'qualifikation' && seg[1]){
    const map = { lep:'LEP', rep:'REP', fnp:'FNP', schutz:'Schutzgebiete' };
    return `Qualifikation ${map[seg[1]] || seg[1]}` + (seg[2] && seg[2] !== 'status' ? ` (${seg[2]})` : '');
  }
  // Flurstück-Sicherung: flurstueckDaten.<kennz>.<feld>
  if(seg[0] === 'flurstueckDaten' && seg[1]){
    const fmap = { vertragsStatus:'Vertragsstatus', sicherungArt:'Sicherungsart',
      rueckTrittsfrist:'Rücktrittsfrist', preisProM2:'Preis/m²', pachtflaeche:'Pachtfläche',
      reservierungsentgelt:'Reservierungsentgelt', eigentuemerId:'Eigentümer', notiz:'Notiz' };
    return `Flurstück ${seg[1]}: ${fmap[seg[2]] || seg[2] || ''}`.trim();
  }
  // B-Plan-Meilensteine: genehmigung.bplan.meilensteine.<m>.status/datum
  if(seg[0] === 'genehmigung' && seg[1] === 'bplan' && seg[2] === 'meilensteine' && seg[3]){
    let nm = seg[3];
    if(typeof BPLAN_MEILENSTEINE !== 'undefined'){
      const m = BPLAN_MEILENSTEINE.find(x => x[0] === seg[3]); if(m) nm = m[1];
    }
    return `B-Plan: ${nm}` + (seg[4] && seg[4] !== 'status' ? ` (${seg[4]})` : '');
  }
  return path; // Fallback: Rohpfad (selten sichtbar)
}
function actDescribe(path, from, to){
  return `${actLabel(path)}: ${actFmtVal(from)} → ${actFmtVal(to)}`;
}

function pushActivity(entry){
  // Zusammenfassen: gleicher Nutzer + Projekt + Feld kurz hintereinander mit gleichem
  // Ausgangswert (= zusammenhängende Bearbeitung, z. B. Tippen) → letzten Eintrag
  // aktualisieren statt einen neuen anzuhängen. So kein Keystroke-Spam.
  // Fortlaufende Änderung am selben Feld: in den letzten Eintrag mergen. Der
  // Ausgangswert (last.fromVal) des ERSTEN Eintrags bleibt der Anker, nur das Ziel
  // wandert mit — so wird Tippen zu genau einem „— → Endwert"-Eintrag.
  const last = activityLog[activityLog.length - 1];
  if(last && entry.path && entry.path[0] !== '#' &&
     last.path === entry.path && last.projectId === entry.projectId &&
     last.user === entry.user &&
     (new Date(entry.ts) - new Date(last.ts)) < ACTIVITY_MERGE_MS){
    if(String(entry.to) === String(last.fromVal)){ activityLog.pop(); return; } // zurück auf Ausgangswert → Eintrag entfällt
    last.to = entry.to; last.ts = entry.ts;
    last.action = actDescribe(entry.path, last.fromVal, entry.to);
    last.projectName = entry.projectName;
    return;
  }
  activityLog.push(entry);
  if(activityLog.length > ACTIVITY_MAX) activityLog.splice(0, activityLog.length - ACTIVITY_MAX);
}

function captureActivity(){
  const cur = actSnapAll();
  if(!activitySnapshot || activitySuspended){ activitySnapshot = cur; return; }
  const user = (typeof paCurrentUser === 'function' ? paCurrentUser() : '') || '—';
  const ts = new Date().toISOString();
  let changed = false;
  // Gelöschte Projekte
  for(const id in activitySnapshot){
    if(!cur[id]){
      pushActivity({ ts, user, projectId:id, projectName:activitySnapshot[id].name,
        path:'#deleted', fromVal:null, to:null, action:'Projekt gelöscht' });
      changed = true;
    }
  }
  for(const id in cur){
    if(!activitySnapshot[id]){
      pushActivity({ ts, user, projectId:id, projectName:cur[id].name,
        path:'#created', fromVal:null, to:null, action:'Projekt angelegt' });
      changed = true; continue;
    }
    const a = activitySnapshot[id].flat, b = cur[id].flat;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for(const k of keys){
      if(a[k] === b[k]) continue;
      pushActivity({ ts, user, projectId:id, projectName:cur[id].name,
        path:k, fromVal:a[k], to:b[k], action:actDescribe(k, a[k], b[k]) });
      changed = true;
    }
  }
  activitySnapshot = cur;
  if(changed){
    try { localStorage.setItem(LS_KEYS.activity, JSON.stringify(activityLog)); } catch(e){ /* Quota: Log ist verzichtbar */ }
    if(typeof refreshActivityViewIfOpen === 'function') refreshActivityViewIfOpen();
  }
}
// Einmalig manuell protokollieren (für ALKIS/Naturschutz-Aktionen, die ganze Zweige ersetzen).
function logAction(project, action){
  if(!project) return;
  pushActivity({ ts:new Date().toISOString(),
    user:(typeof paCurrentUser==='function'?paCurrentUser():'')||'—',
    projectId:project.id, projectName:project.name||'(unbenannt)',
    path:'#'+action.slice(0,24), fromVal:null, to:null, action });
  try { localStorage.setItem(LS_KEYS.activity, JSON.stringify(activityLog)); } catch(e){}
  if(typeof refreshActivityViewIfOpen === 'function') refreshActivityViewIfOpen();
}
// Ausgangs-Snapshot der beim Laden vorhandenen Projekte, damit schon die ERSTE
// Änderung erfasst wird (sonst würde der erste saveProjects()-Aufruf nur die
// Basislinie setzen).
activitySnapshot = actSnapAll();

// ---- Aktivitätslog-Viewer (Overlay) ----
function actFmtTime(iso){ try { return new Date(iso).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); } catch { return ''; } }
function actFmtDay(iso){
  try {
    const d = new Date(iso), now = new Date();
    const sameDay = a => a.getFullYear()===now.getFullYear() && a.getMonth()===now.getMonth() && a.getDate()===now.getDate();
    const yest = new Date(now); yest.setDate(now.getDate()-1);
    if(sameDay(d)) return 'Heute';
    if(d.getFullYear()===yest.getFullYear() && d.getMonth()===yest.getMonth() && d.getDate()===yest.getDate()) return 'Gestern';
    return d.toLocaleDateString('de-DE',{weekday:'short', day:'2-digit', month:'2-digit', year:'numeric'});
  } catch { return ''; }
}
function openActivityView(projectId){
  // Filter-Optionen füllen
  const projSel = document.getElementById('act-filter-project');
  const userSel = document.getElementById('act-filter-user');
  const projIds = [...new Set(activityLog.map(e => e.projectId))];
  const nameById = {}; activityLog.forEach(e => { nameById[e.projectId] = e.projectName; });
  projects.forEach(p => { nameById[p.id] = p.name || '(unbenannt)'; });
  projSel.innerHTML = '<option value="">Alle Projekte</option>' +
    projIds.map(id => `<option value="${escapeAttr(id)}">${escapeHtml(nameById[id] || id)}</option>`).join('');
  const users = [...new Set(activityLog.map(e => e.user))].filter(Boolean);
  userSel.innerHTML = '<option value="">Alle Benutzer</option>' +
    users.map(u => `<option value="${escapeAttr(u)}">${escapeHtml(u)}</option>`).join('');
  projSel.value = projectId || '';
  userSel.value = '';
  document.getElementById('act-search').value = '';
  renderActivityList();
  document.getElementById('view-activity').classList.remove('hidden');
  // Profilbilder je Benutzer im Hintergrund nachladen — Liste zeigt sich sofort mit
  // Initialen-Avataren, Fotos poppen kurz danach nach (analog zu anderen Fire-and-forget-
  // Refreshes im Tool, kein Blockieren des Öffnens für eine Netzwerk-Anfrage).
  loadProfileCacheForActivity().then(renderActivityList).catch(()=>{});
}
function closeActivityView(){ document.getElementById('view-activity').classList.add('hidden'); }
function activityViewOpen(){ return !document.getElementById('view-activity').classList.contains('hidden'); }
function refreshActivityViewIfOpen(){ if(activityViewOpen()) renderActivityList(); }
function renderActivityList(){
  const root = document.getElementById('act-list'); if(!root) return;
  const fp = document.getElementById('act-filter-project').value;
  const fu = document.getElementById('act-filter-user').value;
  const q = document.getElementById('act-search').value.trim().toLowerCase();
  let rows = activityLog.filter(e =>
    (!fp || e.projectId === fp) && (!fu || e.user === fu) &&
    (!q || (e.action||'').toLowerCase().includes(q) || (e.projectName||'').toLowerCase().includes(q))
  ).slice().reverse(); // neueste zuerst
  document.getElementById('act-count').textContent =
    activityLog.length ? `${rows.length} von ${activityLog.length} Einträgen` : '';
  if(!rows.length){ root.innerHTML = '<div class="act-empty">Keine Aktivitäten' + (activityLog.length?' für diesen Filter':' aufgezeichnet') + '.</div>'; return; }
  let html = '', lastDay = null;
  rows.forEach(e => {
    const day = actFmtDay(e.ts);
    if(day !== lastDay){ lastDay = day; html += `<div class="act-day">${escapeHtml(day)}</div>`; }
    const projLink = `<span class="act-proj" data-goto="${escapeAttr(e.projectId)}">${escapeHtml(e.projectName||'—')}</span>`;
    const prof = profileCache[e.user] || (e.user && e.user===window.paCurrentUser() ? currentProfile : null);
    const userLabel = (prof && prof.displayName) || e.user || '—';
    html += `<div class="act-row">
      <span class="act-time">${escapeHtml(actFmtTime(e.ts))}</span>
      <span class="act-user" title="${escapeAttr(e.user||'')}"><span class="avatar act-avatar">${avatarHtml(prof, e.user)}</span>${escapeHtml(userLabel)}</span>
      <span class="act-body">${projLink} — <span class="act-action">${escapeHtml(e.action||'')}</span></span>
    </div>`;
  });
  root.innerHTML = html;
  root.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.goto;
      if(projects.some(p => p.id === id)){ closeActivityView(); selectProject(id); }
    });
  });
}
document.getElementById('btn-activity').addEventListener('click', () => openActivityView(activeProjectId || ''));
document.getElementById('act-close').addEventListener('click', closeActivityView);
document.getElementById('view-activity').addEventListener('click', e => { if(e.target.id === 'view-activity') closeActivityView(); });
document.getElementById('act-filter-project').addEventListener('change', renderActivityList);
document.getElementById('act-filter-user').addEventListener('change', renderActivityList);
document.getElementById('act-search').addEventListener('input', renderActivityList);
document.getElementById('act-clear').addEventListener('click', () => {
  if(!activityLog.length) return;
  if(!confirm('Das gesamte Aktivitätslog unwiderruflich löschen?')) return;
  activityLog = [];
  try { localStorage.setItem(LS_KEYS.activity, JSON.stringify(activityLog)); } catch(e){}
  renderActivityList();
});
document.addEventListener('keydown', e => { if(e.key === 'Escape' && activityViewOpen()) closeActivityView(); });
