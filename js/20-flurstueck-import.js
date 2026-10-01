// Flurstücks-/ALB-Import (CSV/Excel) und Start der App
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---------- Flurstücke Import (CSV/Excel) ----------
// ═════════════════════════════════════════════════════════════════════════════
// Flurstücks-/ALB-Import  (CSV / Excel)
// ─────────────────────────────────────────────────────────────────────────────
// In der Praxis kommt die Flurstücksliste als ALB-Auszug vom Katasteramt: eine Zeile je
// Flurstück, mit Eigentümer UND Anschrift in denselben Spalten. Der Import legt deshalb
// nicht nur Flurstücke an, sondern auch die Eigentümer (dedupliziert) und verknüpft beide —
// das ist der Schritt, der sonst per Hand für jedes einzelne Flurstück nötig wäre.
// Bestehende Zeilen werden über das Kennzeichen wiedererkannt und ergänzt statt ersetzt,
// damit bereits gepflegte Sicherungsdaten (Vertragsstatus, Fristen, Preise) erhalten bleiben.
// ═════════════════════════════════════════════════════════════════════════════

// Spaltenüberschriften sind je Katasteramt/Export unterschiedlich benannt — hier werden alle
// gängigen Schreibweisen auf ein internes Feld abgebildet. Vergleich erfolgt normalisiert
// (klein, ohne Umlaute/Sonderzeichen), damit "Fläche (m²)" und "flaeche_m2" gleich landen.
const IMPORT_ALIASES = {
  kennzeichen: ['kennzeichen','flurstueckskennzeichen','flurstueckkennzeichen','flstkennz','fskennz','flurstuecksnummeramtlich'],
  land:        ['land','bundesland'],
  kreis:       ['kreis','landkreis','kreisname'],
  gemeinde:    ['gemeinde','gemeindename','stadt'],
  gemarkung:   ['gemarkung','gemarkungsname'],
  flur:        ['flur','flurnummer','flurnr'],
  flurstueck:  ['flurstueck','flurstuecksnummer','flurstuecknr','flstnr','flurstuecknummer'],
  zaehler:     ['zaehler','flurstueckzaehler','flurstueckszaehler','flstnrzae','nenner_zaehler'],
  nenner:      ['nenner','flurstuecknenner','flurstuecksnenner','flstnrnen'],
  flaeche:     ['flaeche','amtlichaeche','amtlicheflaeche','flaechem2','groesse','grosse','flaecheqm','flaecheinm2'],
  lage:        ['lage','lagebezeichnung','lagebeztxt','strasselage'],
  nutzung:     ['nutzung','nutzungsart','tatsaechlichenutzung','tntxt'],
  pachtflaeche:['pachtflaeche','pachtflaechem2','verfuegbareflaeche','projektflaeche'],
  grundbuch:   ['grundbuch','grundbuchblatt','grundbuchblattnummer','blattnummer'],
  eigName:     ['eigentuemer','eigentuemername','eigentuemerin','name','nameeigentuemer','eigentuemer1'],
  eigStrasse:  ['strasse','strassehausnummer','anschrift','adresse','strassenr','eigentuemerstrasse'],
  eigPlz:      ['plz','postleitzahl','eigentuemerplz'],
  eigOrt:      ['ort','wohnort','stadtort','eigentuemerort'],
  eigTelefon:  ['telefon','tel','telefonnummer','mobil'],
  eigEmail:    ['email','emailadresse','mail'],
  eigNotiz:    ['notiz','bemerkung','anmerkung','hinweis'],
  anteil:      ['anteil','eigentumsanteil','anteilbruch'],
};
const importNormKey = h => String(h||'')
  .toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
  .replace(/[^a-z0-9]/g,'');

// Überschriftenzeile -> { internesFeld: Spaltenindex }
function mapImportHeaders(headers){
  const norm = headers.map(importNormKey);
  const map = {};
  Object.entries(IMPORT_ALIASES).forEach(([field, aliases]) => {
    let idx = norm.findIndex(h => h && aliases.includes(h));
    if(idx < 0) idx = norm.findIndex(h => h && aliases.some(a => h.startsWith(a)));
    if(idx >= 0) map[field] = idx;
  });
  return map;
}

// CSV mit Semikolon (deutsches Excel), Komma oder Tab; Anführungszeichen werden respektiert.
function parseCsvRows(text){
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const head = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
  const counts = { ';':(head.match(/;/g)||[]).length, ',':(head.match(/,/g)||[]).length, '\t':(head.match(/\t/g)||[]).length };
  const sep = Object.keys(counts).reduce((a,b) => counts[b] > counts[a] ? b : a, ';');
  const rows = []; let row = [], cell = '', quoted = false;
  for(let i=0; i<text.length; i++){
    const c = text[i];
    if(quoted){
      if(c === '"'){ if(text[i+1] === '"'){ cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if(c === '"') quoted = true;
    else if(c === sep){ row.push(cell); cell = ''; }
    else if(c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
    else if(c !== '\r') cell += c;
  }
  if(cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

function readImportRows(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.onload = e => {
      try {
        if(file.name.toLowerCase().endsWith('.csv')) return resolve(parseCsvRows(e.target.result));
        const wb = XLSX.read(e.target.result, { type:'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:false })
                          .filter(r => r.some(v => String(v).trim() !== '')));
      } catch(err){ reject(err); }
    };
    if(file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file, 'utf-8');
    else reader.readAsBinaryString(file);
  });
}

const impTxt = v => String(v ?? '').trim();
// "1.234,56 m²" (deutsch), "1,234.56" (englisch) und "24.500" (deutsche Tausendertrennung)
// zuverlässig auf eine Zahl bringen. Der Sonderfall ohne Nachkommastelle ist der wichtigste:
// eine Flurstücksfläche "24.500" bedeutet 24.500 m², nicht 24,5 m².
function impNum(v){
  const t = impTxt(v).replace(/[^\d.,-]/g,'');
  if(!t) return null;
  let norm;
  if(t.includes(',')){
    norm = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g,'').replace(',','.')   // deutsch: Punkt = Tausender, Komma = Dezimal
      : t.replace(/,/g,'');                    // englisch: Komma = Tausender
  } else if(/^-?\d{1,3}(\.\d{3})+$/.test(t)){
    norm = t.replace(/\./g,'');                 // reine Tausendertrennung: 24.500 -> 24500
  } else {
    norm = t;
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

// Rohzeilen -> { flurstuecke:[…], eigentuemerRoh:[…] } (noch ohne Projektbezug)
function parseImportRows(rows){
  if(rows.length < 2) throw new Error('Datei enthält keine Datenzeilen (erwartet: Überschriftenzeile + mindestens eine Zeile).');
  const map = mapImportHeaders(rows[0]);
  if(map.kennzeichen == null && map.zaehler == null && map.flurstueck == null)
    throw new Error('Keine Flurstücksspalte erkannt. Erwartet wird mindestens „Kennzeichen" oder „Flurstück" bzw. „Zähler". Muster über „Musterdatei" herunterladen.');
  const out = [];
  rows.slice(1).forEach(r => {
    const get = f => map[f] == null ? '' : impTxt(r[map[f]]);
    let zaehler = get('zaehler'), nenner = get('nenner');
    if(!zaehler && map.flurstueck != null){
      const m = get('flurstueck').match(/^(\d+)\s*(?:\/\s*(\d+))?$/);
      if(m){ zaehler = m[1]; nenner = m[2] || ''; }
    }
    const kennzeichen = get('kennzeichen');
    if(!kennzeichen && !zaehler) return; // Leer-/Summenzeile
    out.push({
      fs: { kennzeichen, land:get('land'), kreis:get('kreis'), gemeinde:get('gemeinde'),
            gemarkung:get('gemarkung'), flur:get('flur'), zaehler, nenner,
            flaeche: map.flaeche == null ? null : impNum(r[map.flaeche]),
            lage:get('lage'), nutzung:get('nutzung'), grundbuch:get('grundbuch') },
      pachtflaeche: map.pachtflaeche == null ? null : impNum(r[map.pachtflaeche]),
      anteil: get('anteil'),
      eig: { name:get('eigName'), strasse:get('eigStrasse'), plz:get('eigPlz'), ort:get('eigOrt'),
             telefon:get('eigTelefon'), email:get('eigEmail'), notiz:get('eigNotiz') },
    });
  });
  if(!out.length) throw new Error('Keine gültigen Flurstückszeilen gefunden.');
  return out;
}

// Zwei Eigentümerzeilen gelten als dieselbe Person, wenn Name + PLZ + Straße übereinstimmen.
const ownerKey = e => [e.name, e.plz, e.strasse].map(v => importNormKey(v)).join('|');

// Fachliche Übernahme in das aktive Projekt. Gibt eine Bilanz für die Rückmeldung zurück.
function applyFlurstueckImport(p, parsed){
  if(!p.lage) p.lage = { gemarkungen:[], fluren:[], gemeinden:[], kreise:[], land:'', flurstuecke:[], truncated:false, source:'Import', fetchedAt:new Date().toISOString() };
  if(!Array.isArray(p.lage.flurstuecke)) p.lage.flurstuecke = [];
  ensureFlurstueckIds(p);

  const bilanz = { neu:0, aktualisiert:0, eigNeu:0, eigZuordnung:0 };
  const ownerIndex = new Map();
  p.eigentuemer.forEach(e => { if(impTxt(e.name)) ownerIndex.set(ownerKey(e), e); });

  // Wiedererkennung: Kennzeichen, sonst Gemarkung+Flur+Zähler/Nenner
  const altKey = f => [importNormKey(f.gemarkung), importNormKey(f.flur), impTxt(f.zaehler), impTxt(f.nenner)].join('|');
  const byKennz = new Map(), byAlt = new Map();
  p.lage.flurstuecke.forEach(f => {
    if(f.kennzeichen) byKennz.set(f.kennzeichen, f);
    byAlt.set(altKey(f), f);
  });

  parsed.forEach(row => {
    let ziel = (row.fs.kennzeichen && byKennz.get(row.fs.kennzeichen)) || byAlt.get(altKey(row.fs));
    if(ziel){
      // Vorhandene Werte nur ergänzen, nie mit Leerwerten überschreiben.
      Object.entries(row.fs).forEach(([k,v]) => { if(v !== '' && v != null) ziel[k] = v; });
      bilanz.aktualisiert++;
    } else {
      ziel = Object.assign({}, row.fs);
      p.lage.flurstuecke.push(ziel);
      if(ziel.kennzeichen) byKennz.set(ziel.kennzeichen, ziel);
      byAlt.set(altKey(ziel), ziel);
      bilanz.neu++;
    }
    ensureFlurstueckIds(p); // vergibt die ID der neuen Zeile, bevor Zusatzdaten geschrieben werden
    const extra = getFlurstueckExtra(p, ziel.id);
    // Importierte Pachtfläche gilt als bewusst gesetzt: die automatische Polygon-Verschneidung
    // darf sie bei einer späteren Lage-Abfrage nicht überschreiben.
    if(row.pachtflaeche != null){ extra.pachtflaeche = row.pachtflaeche; extra.pachtflaecheAuto = false; }
    if(row.fs.grundbuch && !extra.grundbuch) extra.grundbuch = row.fs.grundbuch;
    if(row.anteil && !extra.anteil) extra.anteil = row.anteil;

    if(impTxt(row.eig.name)){
      const key = ownerKey(row.eig);
      let owner = ownerIndex.get(key);
      if(!owner){
        owner = Object.assign({ id:'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,7) }, row.eig);
        p.eigentuemer.push(owner);
        ownerIndex.set(key, owner);
        bilanz.eigNeu++;
      } else {
        // Kontaktdaten aus dem Import nachtragen, sofern beim Eigentümer noch leer
        ['strasse','plz','ort','telefon','email','notiz'].forEach(k => {
          if(!impTxt(owner[k]) && impTxt(row.eig[k])) owner[k] = row.eig[k];
        });
      }
      if(extra.eigentuemerId !== owner.id){ extra.eigentuemerId = owner.id; bilanz.eigZuordnung++; }
    }
  });

  // Aggregat-Anzeige (Bundesland/Kreis/Gemeinde/…) aus der zusammengeführten Liste neu bilden
  const L = p.lage, all = L.flurstuecke;
  L.gemarkungen = uniqueSorted(all.map(f => f.gemarkung));
  L.fluren      = uniqueSorted(all.map(f => f.flur));
  L.gemeinden   = uniqueSorted(all.map(f => f.gemeinde));
  L.kreise      = uniqueSorted(all.map(f => f.kreis));
  L.land        = uniqueSorted(all.map(f => f.land)).join(', ');
  L.source      = L.source && L.source !== 'Import' ? L.source + ' + Import' : 'Import (CSV/Excel)';
  L.fetchedAt   = new Date().toISOString();
  return bilanz;
}

const FLURSTUECK_EXPORT_COLS = [
  ['ID',            (f,x) => f.id],
  ['Kennzeichen',   f => f.kennzeichen || ''],
  ['Bundesland',    f => f.land || ''],
  ['Landkreis',     f => f.kreis || ''],
  ['Gemeinde',      f => f.gemeinde || ''],
  ['Gemarkung',     f => f.gemarkung || ''],
  ['Flur',          f => f.flur || ''],
  ['Zaehler',       f => f.zaehler ?? ''],
  ['Nenner',        f => f.nenner ?? ''],
  ['Amtliche Flaeche (m2)', f => f.flaeche ?? ''],
  ['Flaeche im Projekt (m2)', f => f.projektflaeche ?? ''],
  ['Pachtflaeche (m2)',     (f,x) => x.pachtflaeche ?? ''],
  ['Nutzung',       f => f.nutzung || ''],
  ['Lage',          f => f.lage || ''],
  ['Grundbuchblatt',(f,x) => x.grundbuch || ''],
  ['Anteil',        (f,x) => x.anteil || ''],
  ['Eigentuemer',   (f,x,o) => o ? (o.name||'') : ''],
  ['Strasse',       (f,x,o) => o ? (o.strasse||'') : ''],
  ['PLZ',           (f,x,o) => o ? (o.plz||'') : ''],
  ['Ort',           (f,x,o) => o ? (o.ort||'') : ''],
  ['Telefon',       (f,x,o) => o ? (o.telefon||'') : ''],
  ['E-Mail',        (f,x,o) => o ? (o.email||'') : ''],
  ['Sicherungsart', (f,x) => x.sicherungArt || ''],
  ['Vertragsstatus',(f,x) => x.vertragsStatus || ''],
  ['Ruecktrittsfrist', (f,x) => x.rueckTrittsfrist || ''],
  ['Preis (EUR/m2)',   (f,x) => x.preisProM2 ?? ''],
  ['Reservierung (EUR)',(f,x) => x.reservierungsentgelt ?? ''],
  ['1. Zahlung am', (f,x) => x.ersteZahlungAm || ''],
  ['Erstanschreiben am', (f,x) => x.anschreibenAm || ''],
  ['Notiz',         (f,x) => x.notiz || ''],
];

// Die Flurstücksliste ist das Arbeitsdokument gegenüber Gemeinde, Notariat und B-Planer —
// deshalb als vollständiges Blatt inkl. Eigentümer und Sicherungsstand, nicht nur als Ansicht.
function exportFlurstueckslisteXlsx(){
  const p = getActiveProject(); if(!p) return;
  const list = ensureFlurstueckIds(p);
  if(!list.length){ alert('Noch keine Flurstücke vorhanden.'); return; }
  const rows = [FLURSTUECK_EXPORT_COLS.map(c => c[0])];
  list.forEach(f => {
    const x = getFlurstueckExtra(p, f.id);
    const o = p.eigentuemer.find(e => e.id === x.eigentuemerId) || null;
    rows.push(FLURSTUECK_EXPORT_COLS.map(c => c[1](f, x, o)));
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = FLURSTUECK_EXPORT_COLS.map(c => ({ wch: Math.max(10, Math.min(28, c[0].length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Flurstuecksliste');
  XLSX.writeFile(wb, `Flurstuecksliste_${fsSafeName(p.name || 'Projekt')}_${fsStamp().slice(0,10)}.xlsx`);
  logAction(p, 'Flurstücksliste als Excel exportiert');
}

// Musterdatei: zeigt die erwarteten Spalten und dient zugleich als Vorlage, in die ein
// ALB-Auszug hineinkopiert werden kann.
function downloadImportMuster(){
  const rows = [
    ['Kennzeichen','Bundesland','Landkreis','Gemeinde','Gemarkung','Flur','Zaehler','Nenner','Flaeche','Nutzung','Lage','Grundbuchblatt','Anteil','Pachtflaeche','Eigentuemer','Strasse','PLZ','Ort','Telefon','E-Mail','Notiz'],
    ['071350010000100023','Rheinland-Pfalz','Trier-Saarburg','Musterdorf','Musterheim','3','23','','24500','Ackerland','Am Hang','GB 1234','1/1','20000','Max Mustermann','Hauptstr. 1','54290','Trier','0651 12345','max@example.de','Erstkontakt offen'],
    ['071350010000100024','Rheinland-Pfalz','Trier-Saarburg','Musterdorf','Musterheim','3','24','1','8100','Gruenland','Am Hang','GB 1234','1/2','8100','Max Mustermann','Hauptstr. 1','54290','Trier','0651 12345','max@example.de',''],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Vorlage');
  XLSX.writeFile(wb, 'Flurstuecksliste_Vorlage.xlsx');
}

document.getElementById('btn-import-flurstuecke')?.addEventListener('click', () => {
  document.getElementById('flurstuecke-import-input').click();
});
document.getElementById('btn-flurstuecke-muster')?.addEventListener('click', downloadImportMuster);
document.getElementById('btn-flurstuecke-export')?.addEventListener('click', exportFlurstueckslisteXlsx);

document.getElementById('flurstuecke-import-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  e.target.value = '';
  const p = getActiveProject();
  if(!p){ alert('Kein Projekt aktiv.'); return; }
  try {
    const parsed = parseImportRows(await readImportRows(file));
    const mitEig = parsed.filter(r => impTxt(r.eig.name)).length;
    const frage = `${parsed.length} Zeile(n) erkannt` + (mitEig ? `, davon ${mitEig} mit Eigentümerangabe.` : '.')
      + `\n\nBestehende Flurstücke werden anhand des Kennzeichens ergänzt (Sicherungsdaten bleiben erhalten), neue werden angelegt.\n\nImport durchführen?`;
    if(!confirm(frage)) return;
    const b = applyFlurstueckImport(p, parsed);
    touchActiveProject(); saveProjects();
    renderFlurstueckeTable(); renderEigentuemerTable(); renderSicherungTable(); renderLage();
    logAction(p, `Flurstücksimport: ${b.neu} neu, ${b.aktualisiert} aktualisiert, ${b.eigNeu} Eigentümer angelegt`);
    alert(`✓ Import abgeschlossen\n\n`
      + `Flurstücke neu:        ${b.neu}\n`
      + `Flurstücke ergänzt:    ${b.aktualisiert}\n`
      + `Eigentümer neu:        ${b.eigNeu}\n`
      + `Zuordnungen gesetzt:   ${b.eigZuordnung}`);
  } catch(err){
    alert('Import fehlgeschlagen: ' + err.message);
    console.error(err);
  }
});

renderContacts();
updateAlkisWms();
renderProjectList();
// Entwicklungsmodus: dort weitermachen, wo vor dem Reload gearbeitet wurde
// (Projekt + Reiter + Grundstück-Unterreiter bzw. Kartenansicht). Sonst wie gehabt die Liste.
// Ist der Browser noch leer, werden vorher die Demo-Projekte aus demo-projekte-backup.json
// geladen — nur wenn es wirklich 0 Projekte gibt, es wird also nie etwas überschrieben.
(async function(){
  if(window.PA_DEV_MODE && !projects.length){
    try {
      const r = await fetch('demo-projekte-backup.json', { cache:'no-store' });
      if(r.ok){ applyBackupData(await r.json()); toast(`Demo-Daten geladen — ${projects.length} Projekt(e).`); }
    } catch(e){ console.warn('Demo-Daten konnten nicht geladen werden.', e); }
  }
  let lastView = null, lastId = null;
  try { lastView = localStorage.getItem('pa_last_view_v1'); lastId = localStorage.getItem('pa_last_project_v1'); } catch{}
  if(window.PA_DEV_MODE && lastView === 'detail' && projects.some(p => p.id === lastId)){
    selectProject(lastId, { startTab: tabStateFor(lastId).detailTab || 'uebersicht' });
  } else if(window.PA_DEV_MODE && lastView === 'map'){
    gotoMap();
  } else {
    switchView('list');
  }
})();
