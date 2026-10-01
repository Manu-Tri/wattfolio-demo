// Projektordner (lokale Datei-Ablage über File System Access API)
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Projektordner (Datei-Ablage): pro Projekt wird ein lokaler Ordner verbunden
// (File System Access API, Chrome/Edge). Hochgeladene Dokumente werden dort
// zusätzlich abgelegt: ein Unterordner je Prozessphase, Dateiname = Dokumenttyp.
// Beim erneuten Hochladen in dasselbe Feld wandern vorhandene Dateien mit
// Zeitstempel nach <Phase>/_Archiv/ (Archiv immer im selben Ordner wie die
// Datei). Handles liegen in IndexedDB (idbSet/idbGet,
// gleicher Store wie der Datei-Sync); der Browser verlangt je Sitzung ggf. eine
// erneute Freigabe per Klick.
// ═════════════════════════════════════════════════════════════════════════════
const projektOrdnerHandles = {}; // projectId -> FileSystemDirectoryHandle (Session-Cache)
const ordnerSupported = 'showDirectoryPicker' in window;

function fsSafeName(s){
  return String(s||'').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim() || 'Unbenannt';
}
function fsStamp(){
  const d = new Date(), z = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
// Unterordner je Prozessphase, z.B. "08 B-Plan-Verfahren"
function dokuOrdnerName(typId){
  const t = dokumentType(typId);
  const ph = t ? PROCESS_TEMPLATE.find(x => x.nr === t.phase) : null;
  return ph ? `${String(ph.nr).padStart(2,'0')} ${fsSafeName(ph.name)}` : '99 Sonstiges';
}
async function getProjektOrdner(p, ask){
  let h = projektOrdnerHandles[p.id];
  if(!h){
    try { h = await idbGet('ordner-' + p.id); } catch { h = null; }
    if(h) projektOrdnerHandles[p.id] = h;
  }
  if(!h) return null;
  if(typeof h.queryPermission !== 'function') return h; // z.B. OPFS-Handles ohne Permission-API
  let perm = await h.queryPermission({ mode:'readwrite' });
  if(perm !== 'granted' && ask){
    try { perm = await h.requestPermission({ mode:'readwrite' }); } catch {}
  }
  return perm === 'granted' ? h : null;
}
async function fsWriteFile(dir, name, data){
  const fh = await dir.getFileHandle(name, { create:true });
  const w = await fh.createWritable();
  await w.write(data); await w.close();
}
// Bestehende Dateien eines Feldes (Name beginnt mit dem Dokumentnamen) mit
// Zeitstempel ins Archiv verschieben (Kopie + Löschen — die API kennt kein move).
// Das Archiv liegt als Unterordner _Archiv im selben Ordner wie die Datei selbst.
async function archiveOrdnerDateien(root, subName, base){
  let dir; try { dir = await root.getDirectoryHandle(subName); } catch { return; }
  const stamp = fsStamp();
  const toMove = [];
  for await (const [name, h] of dir.entries()){
    if(h.kind === 'file' && (name === base || name.startsWith(base + '.') || name.startsWith(base + ' ('))) toMove.push([name, h]);
  }
  if(!toMove.length) return;
  const arch = await dir.getDirectoryHandle('_Archiv', { create:true });
  for(const [name, h] of toMove){
    const file = await h.getFile();
    const dot = name.lastIndexOf('.');
    const archName = (dot > 0 ? name.slice(0, dot) : name) + '_' + stamp + (dot > 0 ? name.slice(dot) : '');
    await fsWriteFile(arch, archName, file);
    await dir.removeEntry(name);
  }
}
// Ein Upload-Batch für ein Feld: erst Altbestand archivieren, dann neue Dateien
// als "<Dokumentname>.<ext>" schreiben (" (2)", " (3)" … bei mehreren Dateien).
async function writeDokumentBatch(root, typId, files){
  const base = fsSafeName((dokumentType(typId)||{}).name || typId);
  const sub = dokuOrdnerName(typId);
  await archiveOrdnerDateien(root, sub, base);
  const dir = await root.getDirectoryHandle(sub, { create:true });
  for(let i = 0; i < files.length; i++){
    const f = files[i];
    const ext = ((f.name||'').match(/\.[^.]+$/) || [''])[0];
    await fsWriteFile(dir, base + (i > 0 ? ` (${i+1})` : '') + ext, f);
  }
}
// Hook aus attachDokumentDateien: fire-and-forget — das Speichern im Browser
// (localStorage) läuft unabhängig davon weiter.
function saveFilesToProjectFolder(p, typId, files){
  if(!ordnerSupported || !files.length) return;
  (async () => {
    const root = await getProjektOrdner(p, true); // Upload-Klick = User-Geste, Rechte-Nachfrage erlaubt
    if(!root) return; // kein Ordner verbunden bzw. Freigabe abgelehnt
    try {
      await writeDokumentBatch(root, typId, files);
      ordnerStatus(`Verbunden: „${root.name}" · ${files.length} Datei(en) abgelegt (${new Date().toLocaleTimeString('de-DE')})`, 'ok');
    } catch(err){
      console.warn('Projektordner-Ablage fehlgeschlagen:', err);
      ordnerStatus('Ablage fehlgeschlagen: ' + err.message, 'err');
    }
  })();
}
function dataUrlToBlob(dataUrl){
  const [head, b64] = String(dataUrl||'').split(',');
  const mime = (head.match(/data:([^;]+)/) || [,''])[1];
  const bin = atob(b64 || '');
  const buf = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}
// Alle bereits im Projekt gespeicherten Anhänge in den Ordner exportieren
async function exportAlleDokumenteInOrdner(p){
  const root = await getProjektOrdner(p, true);
  if(!root){ alert('Kein Projektordner verbunden — bitte zuerst „Ordner wählen".'); return; }
  let n = 0;
  try {
    for(const [typId, d] of Object.entries(p.dokumente || {})){
      const dateien = (d && Array.isArray(d.dateien)) ? d.dateien : [];
      if(!dateien.length) continue;
      const files = [];
      for(const f of dateien) files.push(new File([await dateiBlob(f)], f.name || 'datei', { type: f.mime || '' }));
      await writeDokumentBatch(root, typId, files);
      n += files.length;
    }
    ordnerStatus(`Verbunden: „${root.name}" · ${n} Datei(en) abgelegt (${new Date().toLocaleTimeString('de-DE')})`, 'ok');
  } catch(err){
    ordnerStatus('Export fehlgeschlagen: ' + err.message, 'err');
  }
}
// ---- UI der Ordner-Karte (Prozess-Reiter, Seitenspalte) ----
function ordnerStatus(text, cls){
  const el = document.getElementById('ordner-status');
  if(!el) return;
  el.textContent = text;
  el.style.color = cls==='err' ? 'var(--err)' : cls==='ok' ? 'var(--accent2)' : cls==='warn' ? '#b56a1f' : 'var(--muted)';
}
async function renderOrdnerCard(){
  const p = getActiveProject(); if(!p) return;
  const show = (id, on) => { const b = document.getElementById(id); if(b) b.style.display = on ? '' : 'none'; };
  if(!ordnerSupported){
    ordnerStatus('Nur in Chrome/Edge verfügbar (File System Access API).');
    ['btn-ordner-choose','btn-ordner-grant','btn-ordner-export','btn-ordner-disconnect'].forEach(id => show(id, false));
    return;
  }
  let h = projektOrdnerHandles[p.id];
  if(!h){ try { h = await idbGet('ordner-' + p.id); } catch{} if(h) projektOrdnerHandles[p.id] = h; }
  if(!h){
    ordnerStatus('Kein Ordner verbunden.');
    show('btn-ordner-choose', true); show('btn-ordner-grant', false);
    show('btn-ordner-export', false); show('btn-ordner-disconnect', false);
    return;
  }
  const perm = (typeof h.queryPermission === 'function') ? await h.queryPermission({ mode:'readwrite' }) : 'granted';
  if(perm === 'granted') ordnerStatus(`Verbunden: „${h.name}"`, 'ok');
  else ordnerStatus(`„${h.name}" gemerkt — Zugriff für diese Sitzung erneut erlauben.`, 'warn');
  show('btn-ordner-choose', true);
  show('btn-ordner-grant', perm !== 'granted');
  show('btn-ordner-export', true);
  show('btn-ordner-disconnect', true);
}
async function chooseProjektOrdner(){
  const p = getActiveProject(); if(!p) return;
  if(!ordnerSupported){ alert('Die Ordner-Ablage braucht Chrome oder Edge (File System Access API).'); return; }
  try {
    const h = await showDirectoryPicker({ mode:'readwrite' });
    projektOrdnerHandles[p.id] = h;
    await idbSet('ordner-' + p.id, h);
    renderOrdnerCard();
  } catch(err){
    if(err && err.name !== 'AbortError') alert('Ordner konnte nicht verbunden werden: ' + err.message);
  }
}
(function initOrdnerButtons(){
  const on = (id, fn) => { const b = document.getElementById(id); if(b) b.addEventListener('click', fn); };
  on('btn-ordner-choose', chooseProjektOrdner);
  on('btn-ordner-grant', async () => { const p = getActiveProject(); if(p) await getProjektOrdner(p, true); renderOrdnerCard(); });
  on('btn-ordner-export', () => { const p = getActiveProject(); if(p) exportAlleDokumenteInOrdner(p); });
  on('btn-ordner-disconnect', async () => {
    const p = getActiveProject(); if(!p) return;
    delete projektOrdnerHandles[p.id];
    try { await idbDel('ordner-' + p.id); } catch{}
    renderOrdnerCard();
  });
})();
