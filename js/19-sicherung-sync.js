// Backup, Supabase-Sync und Datei-Sync
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Datensicherung: JSON-Backup (Export/Import) + Datei-Sync (File System Access API)
// ═════════════════════════════════════════════════════════════════════════════

function buildBackupPayload(){
  return { app:'projektanfragen', version:1, exportedAt:new Date().toISOString(),
           data:{ projects, umspannwerke, types, sender, vertragsvorlagen, taskStatusOptions } };
}
function persistAll(){
  save(LS_KEYS.projects, projects);
  save(LS_KEYS.umspannwerke, umspannwerke);
  save(LS_KEYS.types, types);
  save(LS_KEYS.sender, sender);
  save(LS_KEYS.vertragsvorlagen, vertragsvorlagen);
  save(LS_KEYS.taskStatusOptions, taskStatusOptions);
}
// Akzeptiert das eigene Backup-Format, ein nacktes { projects:[…] } oder ein reines Projekt-Array.
function applyBackupData(raw){
  const data = (raw && raw.data) ? raw.data : raw;
  const arr = Array.isArray(data) ? data : (data && data.projects);
  if(!Array.isArray(arr)) throw new Error('Keine Projektliste in der Datei gefunden.');
  // Vor den Projekten übernehmen: normalizeAufgabe/normalizeSubelement lösen statusId dagegen auf.
  if(Array.isArray(data.taskStatusOptions) && data.taskStatusOptions.length){
    taskStatusOptions = data.taskStatusOptions.map(normalizeStatusOption);
  }
  projects = arr.map(normalizeProject);
  activitySnapshot = actSnapAll(); // Import nicht als Feld-für-Feld-Änderungen protokollieren
  if(Array.isArray(data.umspannwerke)) umspannwerke = data.umspannwerke.map(normalizeSubstation);
  if(Array.isArray(data.types)){ types = data.types; types.forEach(t => { if(!Array.isArray(t.offices)) t.offices = []; }); }
  if(data.sender && typeof data.sender==='object'){
    sender = Object.assign(sender, data.sender);
    ['name','company','strasse','plz','ort','phone','email','signature'].forEach(k => { document.getElementById('me-'+k).value = sender[k]||''; });
  }
  if(Array.isArray(data.vertragsvorlagen)) vertragsvorlagen = data.vertragsvorlagen;
  // Beim Einspielen (Backup-Import ODER frischer Supabase-Hydration direkt nach dem Login)
  // soll persistAll() nur lokal zwischenspeichern, nicht sofort dieselben Daten wieder
  // zu Supabase zurückschreiben, die gerade erst von dort kamen.
  suppressSupabaseWrite = true;
  try { persistAll(); } finally { suppressSupabaseWrite = false; }
  activeProjectId = null;
  renderContacts();
  renderProjectList();
  renderVorlagenList();
  switchView('list');
}

// ═════════════════════════════════════════════════════════════════════════════
// Supabase-Sync (Stufe 1+2): strukturierte Projektdaten + Stammdaten. Nur aktiv,
// wenn supabase-config.js gültige Zugangsdaten enthält (window.sb gesetzt) — sonst
// bleibt alles beim reinen localStorage-Betrieb von vorher. Dateiuploads (Dokumente,
// Vertragsvorlagen) ziehen erst mit der Storage-Anbindung (Stufe 3) um.
// ═════════════════════════════════════════════════════════════════════════════
const SUPABASE_SYNC_TABLES = {
  [LS_KEYS.projects]:     { table:'projects',       mode:'array'  },
  [LS_KEYS.umspannwerke]: { table:'substations',     mode:'array'  },
  [LS_KEYS.types]:        { table:'expert_types',    mode:'array'  },
  [LS_KEYS.sender]:       { table:'sender_settings', mode:'single' },
};

let suppressSupabaseWrite = false;
let supabaseWriteTimer = null;
const supabaseDirtyKeys = new Set();

function scheduleSupabaseWrite(key){
  if(!window.sb || suppressSupabaseWrite || !SUPABASE_SYNC_TABLES[key]) return;
  supabaseDirtyKeys.add(key);
  clearTimeout(supabaseWriteTimer);
  supabaseWriteTimer = setTimeout(flushSupabaseWrites, 600); // wie scheduleFileWrite() — debounced, nicht pro Tastendruck
}
async function flushSupabaseWrites(){
  const keys = [...supabaseDirtyKeys]; supabaseDirtyKeys.clear();
  const uid = window.__paUserId || null;
  const now = new Date().toISOString();
  for(const key of keys){
    const cfg = SUPABASE_SYNC_TABLES[key];
    try {
      if(cfg.mode === 'array'){
        const arr = key===LS_KEYS.projects ? projects : key===LS_KEYS.umspannwerke ? umspannwerke : types;
        if(!arr.length) continue;
        // owner_id bewusst NICHT mitschicken: Spalten-Default (auth.uid()) greift nur beim
        // INSERT, ein bestehender Eigentümer bleibt beim UPDATE unangetastet.
        const rows = arr.map(item => ({ id:item.id, data:item, updated_by:uid, updated_at:now }));
        const { error } = await window.sb.from(cfg.table).upsert(rows);
        if(error) throw error;
      } else {
        const { error } = await window.sb.from(cfg.table).upsert({ id:1, data:sender, updated_at:now });
        if(error) throw error;
      }
    } catch(e){ console.error('Supabase-Sync fehlgeschlagen für', cfg.table, e); }
  }
}
// Löschungen laufen sofort und einzeln (kein Debounce nötig) — an den drei Stellen
// aufgerufen, die Einträge aus projects/umspannwerke/types entfernen.
function supabaseDelete(table, id){
  if(!window.sb) return;
  window.sb.from(table).delete().eq('id', id)
    .then(({error}) => { if(error) console.error('Supabase-Delete fehlgeschlagen für', table, id, error); });
}

// Wird vom Login-Skript direkt nach erfolgreicher Supabase-Anmeldung aufgerufen:
// lädt den aktuellen Stand aus der Datenbank und übernimmt ihn wie ein Backup-Import.
window.__paHydrateFromSupabase = async function(){
  if(!window.sb) return;
  const [projRes, subRes, typeRes, senderRes] = await Promise.all([
    window.sb.from('projects').select('id,data'),
    window.sb.from('substations').select('id,data'),
    window.sb.from('expert_types').select('id,data'),
    window.sb.from('sender_settings').select('data').eq('id', 1).maybeSingle(),
  ]);
  if(projRes.error) throw projRes.error;
  if(subRes.error) throw subRes.error;
  if(typeRes.error) throw typeRes.error;
  if(senderRes.error) throw senderRes.error;
  applyBackupData({ data:{
    projects: projRes.data.map(r => r.data),
    umspannwerke: (subRes.data||[]).map(r => r.data),
    types: (typeRes.data||[]).map(r => r.data),
    sender: senderRes.data ? senderRes.data.data : undefined,
    // vertragsvorlagen: eigene Tabelle mit Spalten statt jsonb → separat in ladeVorlagenAusCloud().
  } });
  await ladeVorlagenAusCloud();
};

document.getElementById('btn-backup-export').onclick = () => {
  const blob = new Blob([JSON.stringify(buildBackupPayload(), null, 1)], { type:'application/json' });
  const stamp = new Date().toISOString().slice(0,10);
  downloadBlob(blob, `wattfolio-backup-${stamp}.json`);
  toast('Backup heruntergeladen.');
};
document.getElementById('btn-backup-import').onclick = () => document.getElementById('backup-input').click();
document.getElementById('backup-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = ''; // gleicher Dateiname soll erneut wählbar sein
  if(!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const data = (raw && raw.data) ? raw.data : raw;
    const count = Array.isArray(data) ? data.length : (data.projects||[]).length;
    if(!confirm(`Backup einspielen?\n\nErsetzt die aktuellen Daten (${projects.length} Projekt(e)) durch das Backup (${count} Projekt(e)).`)) return;
    applyBackupData(raw);
    toast(`Backup eingespielt — ${projects.length} Projekt(e).`);
  } catch(err){
    alert('Backup konnte nicht eingespielt werden: ' + err.message);
  }
});

// ---- Datei-Sync (Chrome/Edge): Handle wird in IndexedDB gemerkt, localStorage bleibt Fallback ----
const fileSyncSupported = 'showSaveFilePicker' in window;
let fileSyncHandle = null;
let fileWriteTimer = null;

const IDB_NAME = 'pa_filesync', IDB_STORE = 'kv';
function idbOpen(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val){
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const rq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
async function idbDel(key){
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

function fileSyncStatus(text){
  const el = document.getElementById('filesync-status');
  if(el) el.textContent = text;
}
function updateFileSyncButtons(state){ // 'connected' | 'resumable' | 'disconnected'
  const show = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };
  show('btn-filesync-resume', state==='resumable');
  show('btn-filesync-disconnect', state==='connected' || state==='resumable');
  show('btn-filesync-load', state==='disconnected');
  show('btn-filesync-new', state==='disconnected');
}

// Debounced: save() ruft das bei jeder Speicherung auf; geschrieben wird gebündelt.
function scheduleFileWrite(){
  if(!fileSyncHandle) return;
  clearTimeout(fileWriteTimer);
  fileWriteTimer = setTimeout(writeFileNow, 600);
}
async function writeFileNow(){
  if(!fileSyncHandle) return;
  try {
    const w = await fileSyncHandle.createWritable();
    await w.write(JSON.stringify(buildBackupPayload(), null, 1));
    await w.close();
    fileSyncStatus(`verbunden: ${fileSyncHandle.name} · gespeichert ${new Date().toLocaleTimeString('de-DE')}`);
  } catch(err){
    fileSyncStatus('Schreibfehler: ' + err.message);
  }
}

const FILE_PICKER_TYPES = [{ description:'Wattfolio-Daten (JSON)', accept:{ 'application/json':['.json'] } }];

async function fileSyncConnectNew(){
  try {
    const h = await showSaveFilePicker({ suggestedName:'wattfolio-daten.json', types:FILE_PICKER_TYPES });
    fileSyncHandle = h;
    await idbSet('handle', h);
    await writeFileNow(); // aktueller Stand wird sofort in die neue Datei geschrieben
    updateFileSyncButtons('connected');
    toast('Sync-Datei verbunden — es wird automatisch gespeichert.');
  } catch(err){ if(err.name!=='AbortError') alert('Verbinden fehlgeschlagen: ' + err.message); }
}
async function fileSyncLoadExisting(){
  try {
    const [h] = await showOpenFilePicker({ types:FILE_PICKER_TYPES, multiple:false });
    const raw = JSON.parse(await (await h.getFile()).text());
    const data = (raw && raw.data) ? raw.data : raw;
    const count = Array.isArray(data) ? data.length : (data.projects||[]).length;
    if(!confirm(`"${h.name}" laden und verbinden?\n\nErsetzt die aktuellen Daten (${projects.length} Projekt(e)) durch den Datei-Stand (${count} Projekt(e)). Danach wird automatisch in diese Datei gespeichert.`)) return;
    fileSyncHandle = h; // vor applyBackupData setzen, damit persistAll() direkt mitschreibt
    await idbSet('handle', h);
    applyBackupData(raw);
    updateFileSyncButtons('connected');
    fileSyncStatus(`verbunden: ${h.name}`);
    toast(`Datei geladen — ${projects.length} Projekt(e).`);
  } catch(err){ if(err.name!=='AbortError') alert('Laden fehlgeschlagen: ' + err.message); }
}
async function fileSyncResume(){ // braucht eine Nutzer-Geste (Berechtigungs-Dialog)
  try {
    const h = await idbGet('handle');
    if(!h){ updateFileSyncButtons('disconnected'); return; }
    const perm = await h.requestPermission({ mode:'readwrite' });
    if(perm !== 'granted'){ fileSyncStatus('Berechtigung abgelehnt'); return; }
    fileSyncHandle = h;
    const raw = JSON.parse(await (await h.getFile()).text());
    applyBackupData(raw); // Datei ist führend
    updateFileSyncButtons('connected');
    fileSyncStatus(`verbunden: ${h.name}`);
    toast('Datei-Sync reaktiviert — Datei-Stand geladen.');
  } catch(err){ alert('Reaktivieren fehlgeschlagen: ' + err.message); }
}
async function fileSyncDisconnect(){
  fileSyncHandle = null;
  clearTimeout(fileWriteTimer);
  try { await idbDel('handle'); } catch{}
  updateFileSyncButtons('disconnected');
  fileSyncStatus('nicht verbunden');
  toast('Datei-Sync getrennt — es wird nur noch im Browser gespeichert.');
}

(async function initFileSync(){
  if(!fileSyncSupported){
    document.getElementById('filesync-section').style.display = 'none';
    document.getElementById('filesync-unsupported').style.display = '';
    return;
  }
  document.getElementById('btn-filesync-new').onclick = fileSyncConnectNew;
  document.getElementById('btn-filesync-load').onclick = fileSyncLoadExisting;
  document.getElementById('btn-filesync-resume').onclick = fileSyncResume;
  document.getElementById('btn-filesync-disconnect').onclick = fileSyncDisconnect;
  updateFileSyncButtons('disconnected');
  try {
    const h = await idbGet('handle');
    if(!h) return;
    let perm = 'prompt';
    try { perm = await h.queryPermission({ mode:'readwrite' }); } catch{}
    if(perm === 'granted'){
      fileSyncHandle = h;
      try {
        const raw = JSON.parse(await (await h.getFile()).text());
        applyBackupData(raw); // Datei ist führend (siehe Hinweis in der UI)
        fileSyncStatus(`verbunden: ${h.name}`);
        toast(`Datei-Sync aktiv — Stand aus "${h.name}" geladen.`);
      } catch(err){
        fileSyncStatus('Datei nicht lesbar: ' + err.message);
      }
      updateFileSyncButtons('connected');
    } else {
      updateFileSyncButtons('resumable');
      fileSyncStatus(`Verbindung zu "${h.name}" gemerkt — zum Fortsetzen reaktivieren`);
    }
  } catch{ /* IndexedDB nicht verfügbar → nur localStorage */ }
})();
