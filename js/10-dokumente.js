// Prozess-Grundlagen, Dokumente und Datei-Anhänge (Supabase Storage)
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Prozess-Tab, Dokumente, Sicherung, Qualifikation, B-Plan/Bauverfahren, Fristen
// ═════════════════════════════════════════════════════════════════════════════

function fmtDate(iso){
  if(!iso) return '—';
  try { return new Date(iso+(iso.length===10?'T12:00:00':'')).toLocaleDateString('de-DE'); } catch { return iso; }
}
function daysUntil(isoDate){
  const d = new Date(isoDate+'T12:00:00');
  return Math.round((d - new Date()) / 86400000);
}
function fristPillClass(isoDate, warnTage){
  const t = daysUntil(isoDate);
  if(t < 0) return 'pill err';
  if(t <= warnTage) return 'pill warn';
  return 'pill';
}

const STEP_ICONS = { offen:'', laufend:'◐', erledigt:'✓', entfaellt:'–' };
const MANUAL_CYCLE = ['offen','laufend','erledigt','entfaellt'];

// Manueller Schritt: Klick schaltet offen → laufend → erledigt → entfällt → offen
function cycleManualStep(p, step){
  const cur = stepState(p, step);
  const next = MANUAL_CYCLE[(MANUAL_CYCLE.indexOf(cur)+1) % MANUAL_CYCLE.length];
  p.prozess.schritte[step.id] = Object.assign({}, p.prozess.schritte[step.id],
    { status:next, datum: next==='erledigt' ? new Date().toISOString() : (p.prozess.schritte[step.id]||{}).datum||null });
  touchActiveProject(); saveProjects();
}
// Dokument: Klick schaltet offen → angefragt → erhalten → abgelegt → offen und stempelt Daten
function cycleDokument(p, typId){
  const d = p.dokumente[typId] = Object.assign({ status:'offen', angefragtAm:null, erhaltenAm:null, quelle:'', notiz:'' }, p.dokumente[typId]||{});
  const next = DOKU_STATUS[(DOKU_STATUS.indexOf(d.status)+1) % DOKU_STATUS.length];
  d.status = next;
  if(next==='angefragt' && !d.angefragtAm) d.angefragtAm = new Date().toISOString();
  if(next==='erhalten'  && !d.erhaltenAm)  d.erhaltenAm  = new Date().toISOString();
  if(next==='offen'){ d.angefragtAm = null; d.erhaltenAm = null; }
  touchActiveProject(); saveProjects();
}
function dokuPill(status){
  const cls = status==='erhalten'||status==='abgelegt' ? 'pill ok' : status==='angefragt' ? 'pill warn' : 'pill';
  return `<span class="${cls}">${escapeHtml(status)}</span>`;
}

// ---- Datei-Anhänge je Dokumenttyp (Base64 in localStorage) ----
// Warnschwelle: einzelne Datei > 6 MB (Base64 bläht ~+33% auf und localStorage
// ist je nach Browser bei ~5–10 MB gedeckelt). Beim Speichern greift zusätzlich
// die Quota-Behandlung in save().
const DOKU_FILE_WARN_BYTES = 6 * 1024 * 1024;
function fmtBytes(n){
  if(!n && n!==0) return '';
  if(n < 1024) return n + ' B';
  if(n < 1024*1024) return (n/1024).toFixed(n<10*1024?1:0) + ' KB';
  return (n/(1024*1024)).toFixed(1) + ' MB';
}
function dokEntry(p, typId){
  const d = p.dokumente[typId] = Object.assign(
    { status:'offen', angefragtAm:null, erhaltenAm:null, quelle:'', notiz:'', dateien:[] },
    p.dokumente[typId] || {});
  if(!Array.isArray(d.dateien)) d.dateien = [];
  return d;
}
// Ablageort der Dateien: mit Supabase (window.sb) im privaten Storage-Bucket „dokumente"
// (im Projekt steht nur storagePath), sonst wie bisher als Base64-dataUrl im Projekt-JSON.
// Beide Formen können nebeneinander vorkommen — ältere Einträge haben noch dataUrl,
// bis migriereDateienNachStorage() sie beim nächsten Login hochgeladen hat.
const DOKU_BUCKET = 'dokumente';
// Storage-Keys vertragen keine Umlaute/Sonderzeichen → auf ASCII reduzieren.
function storageSafeName(name){
  return String(name || 'datei').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
}
function storageDateiPfad(projektId, typId, fileId, name){
  return `projects/${projektId}/${typId}/${fileId}-${storageSafeName(name)}`;
}
function storageVorlagePfad(vorlageId, name){
  return `vorlagen/${vorlageId}-${storageSafeName(name)}`;
}
async function ladeDateiHoch(path, blob, mime){
  const { error } = await window.sb.storage.from(DOKU_BUCKET)
    .upload(path, blob, { upsert:true, contentType: mime || 'application/octet-stream' });
  if(error) throw error;
}
// Inhalt einer Datei als Blob — egal ob noch als dataUrl oder schon im Storage.
async function dateiBlob(f){
  if(f.dataUrl) return dataUrlToBlob(f.dataUrl);
  if(f.storagePath && window.sb){
    const { data, error } = await window.sb.storage.from(DOKU_BUCKET).download(f.storagePath);
    if(error) throw error;
    return data;
  }
  throw new Error('Datei ist nur in der Cloud gespeichert — dafür bitte angemeldet sein.');
}
// Link auf eine Datei. dataUrl-Dateien direkt als Download-Link; Storage-Dateien
// über data-Attribute, die der globale Klick-Handler unten per Download abholt.
function dateiLinkHtml(f, inner){
  const title = `${f.name} (${fmtBytes(f.size)})`;
  if(f.dataUrl) return `<a href="${escapeAttr(f.dataUrl)}" download="${escapeAttr(f.name)}" title="${escapeAttr(title)}">${inner}</a>`;
  return `<a href="#" data-datei-path="${escapeAttr(f.storagePath||'')}" data-datei-name="${escapeAttr(f.name)}" title="${escapeAttr(title)}">${inner}</a>`;
}
document.addEventListener('click', async e => {
  const a = e.target.closest('a[data-datei-path]'); if(!a) return;
  e.preventDefault();
  try { downloadBlob(await dateiBlob({ storagePath: a.dataset.dateiPath }), a.dataset.dateiName || 'datei'); }
  catch(err){ alert('Datei konnte nicht geladen werden: ' + (err.message || err)); }
});

async function attachDokumentDateien(p, typId, fileList, done){
  const files = Array.from(fileList || []);
  if(!files.length){ done && done(); return; }
  const cloud = !!window.sb;
  const big = files.find(f => f.size > DOKU_FILE_WARN_BYTES);
  if(!cloud && big && !confirm(`„${big.name}" ist ${fmtBytes(big.size)} groß. Große Dateien können den lokalen Speicher (localStorage) sprengen. Trotzdem anhängen?`)){
    done && done(); return;
  }
  // Zusätzlich in den verbundenen Projektordner schreiben (inkl. Archivierung der Vorversion)
  saveFilesToProjectFolder(p, typId, files);
  if(cloud) toast(`${files.length} Datei(en) werden hochgeladen …`);
  const fehler = [];
  for(const file of files){
    const id = 'f' + Date.now() + Math.random().toString(36).slice(2,7);
    const entry = { id, name: file.name, mime: file.type || '', size: file.size, addedAt: new Date().toISOString() };
    try {
      if(cloud){
        entry.storagePath = storageDateiPfad(p.id, typId, id, file.name);
        await ladeDateiHoch(entry.storagePath, file, file.type);
      } else {
        entry.dataUrl = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file);
        });
      }
    } catch(err){ fehler.push(`${file.name}: ${err.message || err}`); continue; }
    const d = dokEntry(p, typId);
    d.dateien.push(entry);
    // Erstes Hochladen impliziert „erhalten", solange noch offen/angefragt.
    if(d.status==='offen' || d.status==='angefragt'){
      d.status = 'erhalten';
      if(!d.erhaltenAm) d.erhaltenAm = new Date().toISOString();
    }
  }
  touchActiveProject(); saveProjects();
  if(fehler.length) alert('Nicht hochgeladen:\n\n' + fehler.join('\n'));
  else if(cloud) toast(`${files.length} Datei(en) hochgeladen.`);
  done && done();
}
function removeDokumentDatei(p, typId, fileId){
  const d = p.dokumente[typId]; if(!d || !Array.isArray(d.dateien)) return;
  const f = d.dateien.find(x => x.id === fileId);
  d.dateien = d.dateien.filter(x => x.id !== fileId);
  touchActiveProject(); saveProjects();
  if(f && f.storagePath && window.sb){
    window.sb.storage.from(DOKU_BUCKET).remove([f.storagePath])
      .then(({ error }) => { if(error) console.warn('Storage-Datei nicht gelöscht:', f.storagePath, error); });
  }
}
// Alle Storage-Dateien eines Projekts (für das Aufräumen beim Löschen des Projekts).
function projektStoragePfade(p){
  return Object.values(p.dokumente || {}).flatMap(d => (d && Array.isArray(d.dateien)) ? d.dateien : [])
    .concat((p.vertraege || []).flatMap(v => Array.isArray(v.dateien) ? v.dateien : []))
    .map(f => f.storagePath).filter(Boolean);
}
// Einmalige Umstellung: Dateien, die noch als Base64 im Projekt stecken, in den Storage
// hochladen und die dataUrl danach entfernen. Läuft nach jedem Login, ist aber nach dem
// ersten erfolgreichen Durchlauf ein No-op. dataUrl wird nur bei erfolgreichem Upload entfernt.
async function migriereDateienNachStorage(){
  if(!window.sb) return;
  let n = 0, fehler = 0;
  for(const p of projects){
    let geaendert = false;
    for(const [typId, d] of Object.entries(p.dokumente || {})){
      for(const f of (d && Array.isArray(d.dateien)) ? d.dateien : []){
        if(!f.dataUrl || f.storagePath) continue;
        const path = storageDateiPfad(p.id, typId, f.id, f.name);
        try {
          await ladeDateiHoch(path, dataUrlToBlob(f.dataUrl), f.mime);
          f.storagePath = path; delete f.dataUrl; geaendert = true; n++;
        } catch(err){ fehler++; console.warn('Migration fehlgeschlagen:', f.name, err); }
      }
    }
    // Dateien an Verträgen (Grundstück → Verträge)
    for(const v of (p.vertraege || [])){
      for(const f of Array.isArray(v.dateien) ? v.dateien : []){
        if(!f.dataUrl || f.storagePath) continue;
        const path = storageDateiPfad(p.id, 'vertrag-' + v.id, f.id, f.name);
        try { await ladeDateiHoch(path, dataUrlToBlob(f.dataUrl), f.mime); f.storagePath = path; delete f.dataUrl; geaendert = true; n++; }
        catch(err){ fehler++; console.warn('Migration fehlgeschlagen:', f.name, err); }
      }
    }
    if(geaendert) p.updatedAt = new Date().toISOString();
  }
  if(n) saveProjects();
  if(vorlagenCloudOk){
    let nv = 0;
    for(const v of vertragsvorlagen){
      if(!v.dataUrl || v.storagePath) continue;
      const path = storageVorlagePfad(v.id, v.dateiName || (v.name + '.docx'));
      try {
        await ladeDateiHoch(path, dataUrlToBlob(v.dataUrl), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        v.storagePath = path;
        await speichereVorlageCloud(v);
        delete v.dataUrl; nv++; n++;
      } catch(err){ delete v.storagePath; fehler++; console.warn('Vorlagen-Migration fehlgeschlagen:', v.name, err); }
    }
    if(nv){ saveVertragsvorlagen(); renderVorlagenList(); }
  }
  if(n || fehler) toast(`${n} Datei(en) in die Cloud verschoben` + (fehler ? `, ${fehler} fehlgeschlagen (siehe Konsole)` : '') + '.');
}
window.__paMigriereDateien = migriereDateienNachStorage;
