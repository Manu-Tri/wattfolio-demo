// Zustand, Stammdaten, Prozess-Template und abgeleitete Zustands-Helfer
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---------- State ----------
const LS_KEYS = { types: 'pa_types_v2', sender: 'pa_sender_v1', project: 'pa_project_v1', projects: 'pa_projects_v1', projectSort: 'pa_project_sort_v1', umspannwerke: 'pa_umspannwerke_v1', projectIdSeq: 'pa_project_id_seq_v1', activity: 'pa_activity_v1', vertragsvorlagen: 'pa_vertragsvorlagen_v1', taskStatusOptions: 'pa_task_status_options_v1' };

// Vergibt fortlaufende, projektübergreifend eindeutige Projekt-IDs (P-0001, P-0002, ...).
// Zähler bleibt in localStorage erhalten, damit IDs auch nach Löschen von Projekten nicht kollidieren.
function nextProjectId(){
  const seq = Number(localStorage.getItem(LS_KEYS.projectIdSeq) || '0') + 1;
  localStorage.setItem(LS_KEYS.projectIdSeq, String(seq));
  return 'P-' + String(seq).padStart(4, '0');
}

const PROJECT_STATUSES = [
  'Akquise', 'Fläche gesichert', 'Gutachten angefragt', 'Gutachten in Bearbeitung',
  'Im Genehmigungsverfahren', 'Genehmigt', 'Bau', 'In Betrieb', 'Zurückgestellt'
]; // Altbestand: wird nur noch gelesen (Migration), Anzeige läuft über die Prozessphase

// ═════════════════════════════════════════════════════════════════════════════
// Projektentwicklungs-Prozess (10 Phasen mit Gates)
// PROCESS_TEMPLATE und DOCUMENT_TYPES sind Code-Konstanten und werden NICHT
// persistiert — Projekte speichern nur Zustände (prozess.schritte, dokumente).
// Sync-Prinzip: Fachdaten sind führend; Schritte mit `state:`-Funktion oder
// `doku:`-Kopplung leiten ihren Status daraus ab und speichern nichts eigenes.
// ═════════════════════════════════════════════════════════════════════════════

const VERTRAGS_STATUS = ['offen','Eigentümer kontaktiert','Interesse','Vertrag verhandelt','unterschrieben','kein Interesse','aufgelöst'];
const PRIORITAET_LEVELS = ['Niedrig','Mittel','Hoch'];
function newTaskId(){ return 't'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// Frei definierbare Stati (Monday-Style: farbige Auswahl statt fixer Erledigt/Offen-Checkbox) —
// projektübergreifend gemeinsam gepflegt, analog zu den globalen Gutachten-Typen. Bleibt bewusst
// lokal (kein Supabase-Sync, wie vertragsvorlagen) statt eine neue Tabelle vorauszusetzen.
const DEFAULT_TASK_STATUS_OPTIONS = [
  { id:'offen',     label:'Offen',      color:'#9699a6', done:false },
  { id:'arbeit',    label:'In Arbeit',  color:'#fdab3d', done:false },
  { id:'blockiert', label:'Blockiert',  color:'#e2445c', done:false },
  { id:'erledigt',  label:'Erledigt',   color:'#00c875', done:true  },
];
function normalizeStatusOption(o){
  o = o || {};
  return {
    id: o.id || newTaskId(), label: o.label || '',
    color: /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#9699a6',
    done: !!o.done,
  };
}
let taskStatusOptions = loadOr(LS_KEYS.taskStatusOptions, DEFAULT_TASK_STATUS_OPTIONS).map(normalizeStatusOption);
function saveTaskStatusOptions(){ save(LS_KEYS.taskStatusOptions, taskStatusOptions); }
function defaultStatusId(){ return (taskStatusOptions[0] || DEFAULT_TASK_STATUS_OPTIONS[0]).id; }
function isTaskDone(item){ const o = taskStatusOptions.find(x => x.id===item.statusId); return !!(o && o.done); }
// Helligkeit grob abschätzen, damit der Pill-Text (weiß/dunkel) auf jeder gewählten Farbe lesbar bleibt.
function contrastTextColor(hex){
  const c = (hex||'#9699a6').replace('#','');
  const r=parseInt(c.substr(0,2),16), g=parseInt(c.substr(2,2),16), b=parseInt(c.substr(4,2),16);
  return (0.299*r+0.587*g+0.114*b)/255 > 0.6 ? '#1b2420' : '#ffffff';
}
// Verweist eine gelöschte Status-Option auf den ersten verbleibenden Status um (projektübergreifend,
// da die Statusliste global gilt) — verhindert verwaiste statusId-Referenzen.
function reassignOrphanStatusIds(){
  const validIds = new Set(taskStatusOptions.map(o => o.id));
  const fallback = defaultStatusId();
  const fix = item => { if(!validIds.has(item.statusId)) item.statusId = fallback; };
  projects.forEach(p => {
    p.prozess.aufgaben.forEach(a => { fix(a); a.subelemente.forEach(fix); });
    Object.values(p.prozess.schritte).forEach(ex => { if(Array.isArray(ex.subelemente)) ex.subelemente.forEach(fix); });
  });
  saveProjects();
}

// Frei anlegbare Aufgaben (Prozess-Reiter, "+ Aufgabe") und Subelemente darunter — unabhängig
// vom festen PROCESS_TEMPLATE, damit Nutzer projektspezifische Punkte ergänzen können, die die
// Phasen-Logik nicht kennt (z.B. interne Abstimmungen, Rückfragen).
function normalizeSubelement(s){
  s = s || {};
  // Migration: ältere Einträge kannten nur ein Erledigt-Bool statt der freien Statusliste.
  const statusId = s.statusId || (s.erledigt ? (taskStatusOptions.find(o=>o.done)||{}).id : null) || defaultStatusId();
  return {
    id: s.id || newTaskId(), titel: s.titel || '',
    verantwortlich: s.verantwortlich || '', deadline: s.deadline || null,
    prioritaet: PRIORITAET_LEVELS.includes(s.prioritaet) ? s.prioritaet : null,
    statusId, erstelltAm: s.erstelltAm || new Date().toISOString(),
  };
}
function normalizeAufgabe(a){
  a = a || {};
  const statusId = a.statusId || (a.erledigt ? (taskStatusOptions.find(o=>o.done)||{}).id : null) || defaultStatusId();
  return {
    id: a.id || newTaskId(), titel: a.titel || '',
    verantwortlich: a.verantwortlich || '', deadline: a.deadline || null,
    prioritaet: PRIORITAET_LEVELS.includes(a.prioritaet) ? a.prioritaet : null,
    statusId, erstelltAm: a.erstelltAm || new Date().toISOString(),
    subelemente: Array.isArray(a.subelemente) ? a.subelemente.map(normalizeSubelement) : [],
  };
}

// Freies Update-/Aufgaben-Log im Übersicht-Dashboard (siehe "Updates & Aufgaben").
// Ein Beteiligter: Organisation + Ansprechpartner. Defaults per Object.assign, damit
// später ergänzte Felder auch bei bereits gespeicherten Einträgen vorhanden sind.
function normalizeBeteiligter(b){
  const out = Object.assign({
    id: 'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    bereich:'genehmigung', rolle:'', organisation:'', strasse:'', plz:'', ort:'',
    aktenzeichen:'', notiz:'', personen:[],
  }, b || {});
  out.personen = Array.isArray(out.personen) ? out.personen.map(x => Object.assign(
    { id:'ap'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
      name:'', funktion:'', telefon:'', email:'' }, x||{})) : [];
  return out;
}

function normalizeUpdate(u){
  u = u || {};
  return {
    id: u.id || ('u'+Date.now()+Math.random().toString(36).slice(2,6)),
    type: u.type === 'task' ? 'task' : 'status',
    text: u.text || '',
    done: !!u.done,
    author: u.author || (typeof paCurrentUser === 'function' ? paCurrentUser() : '') || '',
    createdAt: u.createdAt || new Date().toISOString(),
  };
}
const NVP_STATUS      = ['offen','ANA gestellt','NVP/NTS erhalten','vor Ort abgestimmt','gesichert'];
const TRASSE_STATUS   = ['offen','in Planung','mit Gemeinde abgestimmt','gesichert'];
const DOKU_STATUS     = ['offen','angefragt','erhalten','abgelegt'];
const VERMARKTUNG     = ['EEG','PPA','Kombi'];
const QUALI_KEYS      = ['lep','rep','fnp','schutz'];

const DOCUMENT_TYPES = [
  { id:'alkalb',        name:'ALK/ALB (Katasteramt)',                phase:4 },
  { id:'grundbuch',     name:'Grundbuchauszug',                      phase:5 },
  { id:'altlasten',     name:'Altlastenauskunft',                    phase:5 },
  { id:'baulasten',     name:'Baulastenkataster',                    phase:5 },
  { id:'kampfmittel',   name:'Kampfmittelauskunft',                  phase:5 },
  { id:'luftbild',      name:'Luftbildauswertung',                   phase:5 },
  { id:'medienplan',    name:'Medienplan',                           phase:5 },
  { id:'topographie',   name:'Flächentopographie (Drohne)',          phase:5 },
  { id:'vermessung',    name:'Vermessung',                           phase:5 },
  { id:'nvpnts',        name:'NVP / NTS',                            phase:6 },
  { id:'layout',        name:'Modullayout (Plant Design)',           phase:6 },
  { id:'blend',         name:'Blendgutachten',                       phase:8 },
  { id:'artenschutz',   name:'Artenschutzrechtlicher Fachbeitrag',   phase:8 },
  { id:'umweltbericht', name:'Umweltbericht',                        phase:8 },
  { id:'brandschutz',   name:'Brandschutzkonzept',                   phase:8 },
  { id:'bplanentwurf',  name:'Bebauungsplan-Entwurf',                phase:8 },
  { id:'satzung',       name:'B-Plan (Satzung, finale Fassung)',     phase:8 },
  { id:'baugrund',      name:'Baugrundgutachten',                    phase:9 },
  { id:'baugenehmigung',name:'Baugenehmigung (inkl. Auflagen)',      phase:9 },
];
function dokumentType(id){ return DOCUMENT_TYPES.find(d => d.id===id) || null; }

const BPLAN_MEILENSTEINE = [
  ['aufstellungsbeschluss','Aufstellungsbeschluss gefasst'],
  ['bplanerBeauftragt','B-Planer (Landschaftsarchitekt) beauftragt'],
  ['vorentwurf','Vor-Entwurf Bebauungsplan freigegeben'],
  ['fruehzBeteiligung','Frühzeitige Öffentlichkeits- & Behördenbeteiligung'],
  ['toebAusgewertet','TÖB-Stellungnahmen ausgewertet'],
  ['offenlegungsbeschluss','Billigungs- / Offenlegungsbeschluss'],
  ['auslegung','Öffentliche Auslegung'],
  ['abwaegung','Abwägung der Stellungnahmen'],
  ['erneuteAuslegung','Erneute Auslegung (falls erforderlich)'],
  ['satzungsbeschluss','Satzungsbeschluss'],
  ['genehmigungLandkreis','Genehmigung durch Landkreisverwaltung'],
];

// ---- abgeleitete Zustands-Helfer (Fachdaten → Schritt-Status) ----
function dokuDerivedState(p, typId){
  const d = p.dokumente[typId];
  if(!d || d.status==='offen') return 'offen';
  return d.status==='angefragt' ? 'laufend' : 'erledigt';
}
// Vergibt jedem Flurstück eine im Projekt stabile, fortlaufende ID. Diese ID (nicht der Index
// und nicht das Kennzeichen) ist der Schlüssel für flurstueckDaten — Pachtfläche, Eigentümer,
// Vertragsstatus. Sie muss deshalb eine Neuabfrage der Lage und einen Re-Import überleben:
// `p.flurstueckIds` merkt sich Kennzeichen → ID, sodass ein wiedergefundenes Flurstück seine
// alten Sicherungsdaten behält und nur wirklich neue Flurstücke eine neue Nummer bekommen.
function ensureFlurstueckIds(p){
  if(!p.lage || !Array.isArray(p.lage.flurstuecke)) return [];
  const list = p.lage.flurstuecke;
  if(!p.flurstueckIds || typeof p.flurstueckIds !== 'object') p.flurstueckIds = {};
  if(!p.flurstueckDaten) p.flurstueckDaten = {};
  const nums = [0,
    ...Object.values(p.flurstueckIds).map(Number),
    ...list.map(f => Number(f.id))].filter(n => Number.isFinite(n));
  let max = Math.max(...nums);
  list.forEach(f => {
    const kz = f.kennzeichen || '';
    if(f.id == null || f.id === ''){
      f.id = (kz && p.flurstueckIds[kz] != null) ? p.flurstueckIds[kz] : ++max;
    }
    if(kz){
      p.flurstueckIds[kz] = f.id;
      // Altbestand: früher lagen die Zusatzdaten unter dem Kennzeichen statt unter der ID.
      if(p.flurstueckDaten[kz] && !p.flurstueckDaten[f.id]){
        p.flurstueckDaten[f.id] = p.flurstueckDaten[kz];
        delete p.flurstueckDaten[kz];
      }
    }
  });
  return list;
}

// Alle Flurstücke mit Sicherungsdaten: ALKIS-Liste + verwaiste Kennzeichen aus flurstueckDaten
function sicherungRows(p){
  const list = ensureFlurstueckIds(p);
  const rows = list.map(f => ({ fid:f.id, kennzeichen:f.kennzeichen, f, extra:getFlurstueckExtra(p, f.id) }));
  Object.keys(p.flurstueckDaten).forEach(k => {
    if(!rows.some(r => r.fid==k)) rows.push({ fid:k, kennzeichen:'—', f:null, extra:getFlurstueckExtra(p,k), verwaist:true });
  });
  return rows;
}
function aggState(items, isDone, isStarted){
  if(!items.length) return 'offen';
  if(items.every(isDone)) return 'erledigt';
  return items.some(isStarted || isDone) ? 'laufend' : 'offen';
}
function qualiState(p, key){
  const q = p.qualifikation[key];
  return (q && q.status!=='offen') ? 'erledigt' : 'offen';
}
function msState(p, key){
  const m = p.genehmigung.bplan.meilensteine[key] || {};
  if(m.erledigt) return 'erledigt';
  return (m.datum || m.von) ? 'laufend' : 'offen';
}
function dateState(v){ return v ? 'erledigt' : 'offen'; }
function auflagenState(p, typ){
  const items = (p.genehmigung.auflagen||[]).filter(a => a.typ===typ);
  if(!items.length) return 'entfaellt';
  if(items.every(a => a.erledigt)) return 'erledigt';
  return 'laufend';
}

const PROCESS_TEMPLATE = [
  { nr:1, id:'identifikation', name:'Flächenidentifikation', steps:[
    { id:'p1-quelle', name:'Flächenquelle erfassen', rolle:'PD',
      hinweis:'Quellen: interne Suche (Google Earth, GEO-Portale Landkreis/Bundesland, GIS), externer Projektierer, Eigentümer meldet sich. Von extern bezogene Projekte müssen intern komplett nachgeprüft werden.',
      state:p => p.quelle ? 'erledigt' : 'offen' },
    { id:'p1-flaeche', name:'Fläche erfassen (zeichnen oder KMZ/KML hochladen)', rolle:'PD',
      hinweis:'Im Reiter Grundstück → Karte. Die KMZ-Datei lässt sich z. B. aus Google Earth exportieren.',
      state:p => p.features.length ? 'erledigt' : 'offen' },
    { id:'p1-planbar', name:'Erstprüfung: planbar / bebaubar?', rolle:'PD', gate:true,
      hinweis:'Gate — bei „nicht planbar/bebaubar" endet der Prozess hier.' },
    { id:'p1-vorort', name:'Erste technische Begutachtung der Fläche vor Ort', rolle:'PD', optional:true },
  ]},
  { nr:2, id:'qualifikation', name:'Flächenqualifikation', steps:[
    { id:'p2-lep', name:'Landesraumentwicklungsplan (LEP) prüfen', rolle:'PD',
      hinweis:'Portale Ebene Bundesland: Grundzüge der räumlichen Entwicklung, Vorgaben für die Regionalplanung. Selbst in GIS prüfen oder Planungsbüro beauftragen. Pflege im Reiter Grundstück → Karte → Qualifikations-Checks.',
      state:p => qualiState(p,'lep') },
    { id:'p2-rep', name:'Regionalentwicklungsplan (REP) prüfen', rolle:'PD',
      hinweis:'Portale Ebene Region: Vorrang-/Vorbehaltsgebiete, Vorgaben für die Flächennutzungsplanung.',
      state:p => qualiState(p,'rep') },
    { id:'p2-fnp', name:'Flächennutzungsplan (FNP) prüfen', rolle:'PD',
      hinweis:'Portale Ebene Gemeinde: beabsichtigte städtebauliche Entwicklung, gesamte Bodennutzung.',
      state:p => qualiState(p,'fnp') },
    { id:'p2-schutz', name:'Schutzgebietsanalyse (BfN) durchführen', rolle:'PD',
      hinweis:'BfN pflegt Karten für NSG, Nationalparke, Biosphärenreservate, Naturparke, LSG sowie Natura-2000 (FFH/Vogelschutz). Der Naturschutz-Scan im Reiter Grundstück liefert den Vorscan.',
      state:p => (p.naturschutz || qualiState(p,'schutz')==='erledigt') ? 'erledigt' : 'offen' },
    { id:'p2-gate', name:'Gate: Fläche geeignet?', rolle:'PD', gate:true,
      hinweis:'Ergibt sich aus den vier Checks — ein „Problem"-Ergebnis heißt i. d. R.: Fläche ungeeignet.',
      state:p => {
        const all = QUALI_KEYS.every(k => p.qualifikation[k].status!=='offen' || (k==='schutz' && p.naturschutz));
        if(!all) return 'offen';
        return QUALI_KEYS.some(k => p.qualifikation[k].status==='problem') ? 'laufend' : 'erledigt';
      }},
  ]},
  { nr:3, id:'vermarktung', name:'Vermarktung (EEG / PPA)', steps:[
    { id:'p3-eeg', name:'Vergütungsfähigkeit nach EEG prüfen', rolle:'PD',
      hinweis:'Z. B.: Im Umkreis von 2 km dürfen innerhalb der letzten 24 Monate nicht mehr als 20 MW PV errichtet worden sein.' },
    { id:'p3-weg', name:'Vermarktungsweg festlegen (EEG / PPA / Kombi)', rolle:'PD', gate:true,
      hinweis:'EEG: Pauschalpreis oder Direktvermarktung. PPA: grüne Stromlieferung an feste Abnehmer zu fixen Konditionen. Kombi: Hybrid, teils temporär bis EEG-Bedingungen erfüllt sind. Auswahl oben im Prozess-Kopf.',
      state:p => p.prozess.vermarktung ? 'erledigt' : 'offen' },
  ]},
  { nr:4, id:'sicherung', name:'Flächensicherung', steps:[
    { id:'p4-alkalb', name:'ALK/ALB beim Katasteramt beantragen', rolle:'PD', doku:'alkalb',
      hinweis:'ALK: Flurstücksgrenzen & Gebäudebestand. ALB: Flurstück mit Merkmalen & Eigentumsverhältnissen. Tipp: Vermessungsingenieure mit berechtigtem Interesse können Hürden leichter umgehen. ALB-GIS-Daten sind immer kostenpflichtig und aus Datenschutzgründen teils schwer zu beziehen.' },
    { id:'p4-kontakt', name:'Eigentümer kontaktieren und Projekt vorstellen', rolle:'PD',
      hinweis:'Kontaktdaten aus dem ALB. Status je Flurstück im Reiter Grundstück → Sicherung pflegen.',
      state:p => aggState(sicherungRows(p), r => r.extra.vertragsStatus!=='offen') },
    { id:'p4-art', name:'Pacht oder Kauf je Flurstück klären', rolle:'PD',
      state:p => aggState(sicherungRows(p), r => !!r.extra.sicherungArt) },
    { id:'p4-vertraege', name:'Kauf- / Pachtverträge durch Legal abschließen lassen', rolle:'Legal',
      hinweis:'Rücktrittsfrist lang genug wählen, damit bei nicht erfolgreicher Realisierung das Land nicht erworben/gepachtet werden muss. Verträge für die Trasse sind hier enthalten; Zahlungskalkulation und -fristen stehen in der Pachttabelle.',
      state:p => aggState(sicherungRows(p), r => r.extra.vertragsStatus==='unterschrieben',
                                            r => ['Vertrag verhandelt','Interesse'].includes(r.extra.vertragsStatus)) },
    { id:'p4-tabelle', name:'Flurstücks- / Pachttabelle vollständig pflegen', rolle:'PD',
      hinweis:'Enthält: verfügbare Fläche, Eigentümer, Grundbuchblattnummer, Nutzungsart, Kauf/Pacht, Preis pro Fläche, Zahlungsziele. Im Reiter Grundstück → Sicherung.' },
    { id:'p4-zahlung', name:'Reservierungsentgelt / erste Zahlung anstoßen', rolle:'BuHa',
      hinweis:'Zur Flächensicherung muss eine Geldleistung erbracht werden, sonst kann der Verpächter jederzeit aus dem Vertrag. Fristen werden auch in der BuHa getrackt.' },
    { id:'p4-controlling', name:'Vertrag an Controlling für Finanzierung senden', rolle:'Controlling' },
    { id:'p4-projektnr', name:'Projekt-ID vergeben — Fläche wird zum Projekt', rolle:'System',
      hinweis:'Die Projekt-ID wird automatisch beim Anlegen des Projekts vergeben. Referenz für den gesamten Projektzyklus. Eintrag oben im Prozess-Kopf.',
      state:p => p.prozess.projektnummer ? 'erledigt' : 'offen' },
    { id:'p4-gesellschaft', name:'Gesellschaft (ESI) festlegen', rolle:'PD',
      hinweis:'Auswahl aus vorher gegründeten ESIs. Eintrag oben im Prozess-Kopf.',
      state:p => p.prozess.gesellschaft ? 'erledigt' : 'offen' },
  ]},
  { nr:5, id:'voruntersuchung', name:'Voruntersuchungen & Kataster', steps:[
    { id:'p5-grundbuch', name:'Grundbuchauszug vom Eigentümer beziehen', rolle:'PD', doku:'grundbuch',
      hinweis:'Bei Kauf sind wir selbst Eigentümer; teils Anfrage mit Vollmacht des Eigentümers über das Notariat.' },
    { id:'p5-altlasten', name:'Altlastenauskunft vom Altlastenkataster anfragen', rolle:'PD', doku:'altlasten' },
    { id:'p5-altlast-gate', name:'Gate: Altlasten als zu gravierend eingestuft?', rolle:'PD', gate:true,
      hinweis:'Gravierende ökonomische Aspekte oder Haftung sind ausschlaggebend — im schlimmsten Fall Abbruch über die Rücktrittsfrist.' },
    { id:'p5-baulasten', name:'Baulastenkataster beim Bauamt anfragen', rolle:'PD', doku:'baulasten',
      hinweis:'Baulasten können Zuwegungen, Windkraftanlagen, Sperrbereiche sein — diese Bereiche sind nicht bebaubar.' },
    { id:'p5-kampfmittel', name:'Kampfmittelauskunft anfragen (amtliche Auskunft Polizei)', rolle:'PD', doku:'kampfmittel',
      hinweis:'Grundlage für spätere Sondierung und das Baugrundgutachten.' },
    { id:'p5-luftbild', name:'Luftbildauswertung vom Dienstleister anfragen', rolle:'PD', doku:'luftbild', optional:true },
    { id:'p5-erschliessung', name:'Erschließung / Zuwegung mit Eigentümern und Bauamt klären', rolle:'PD',
      hinweis:'Erreichbarkeit z. B. für Feuerwehr und Logistik. Flächen brauchen Anschluss an eine öffentliche Zuwegung; neue Zuwegungen müssen genehmigt und eingetragen werden — inkl. Genehmigungen der Eigentümer überfahrener Flächen.' },
    { id:'p5-topo', name:'Flächentopographie / -vermessung ermitteln lassen (z. B. Drohnenflug)', rolle:'Plant Design', doku:'topographie' },
    { id:'p5-medienplan', name:'Medienplan erstellen lassen (z. B. EPEG)', rolle:'PD', doku:'medienplan' },
    { id:'p5-vermessung', name:'Vermessung beauftragen', rolle:'Plant Design', doku:'vermessung',
      hinweis:'Je nach Bundesland öffentlich bestellter Vermessungsingenieur oder (günstiger) Vermessungsbüro.' },
  ]},
  { nr:6, id:'netzplanung', name:'Netz & technische Planung', steps:[
    { id:'p6-ana', name:'Netzanschlussanfrage (ANA) an das Netzanschluss-Team senden', rolle:'Netzanschluss-Team',
      hinweis:'Datum im Reiter Netz pflegen.',
      state:p => dateState(p.netz.anaGestelltAm) },
    { id:'p6-nvp', name:'NVP/NTS erhalten und vor Ort mit Netzbetreiber abstimmen', rolle:'Bau-Team',
      hinweis:'Zugangspunkt („letzter Meter") wird mit dem zuständigen Netzmeister auf der Fläche abgestimmt und per Unterschrift fixiert. Status im Reiter Netz.',
      state:p => p.netz.nvpStatus==='gesichert' ? 'erledigt' : (p.netz.nvpStatus && p.netz.nvpStatus!=='offen' ? 'laufend' : 'offen') },
    { id:'p6-trasse', name:'Trasse planen und mit Gemeinde/Stadt abstimmen', rolle:'PD',
      hinweis:'Schließt häufig öffentliche Grundstücke ein — bei privaten muss mit jedem Besitzer verhandelt werden. Tatsächliche Sicherung erst nach Erstkontakt mit der Gemeinde. Nach der Abstimmung beginnt die Trassensicherung durch das Bau-Team. Status im Reiter Netz.',
      state:p => p.netz.trasseStatus==='gesichert' ? 'erledigt' : (p.netz.trasseStatus && p.netz.trasseStatus!=='offen' ? 'laufend' : 'offen') },
    { id:'p6-layout', name:'Modullayout durch Plant Design erstellen lassen', rolle:'Plant Design', doku:'layout' },
  ]},
  { nr:7, id:'kommune', name:'Kommunale Abstimmung', steps:[
    { id:'p7-modus', name:'Abstimmungsmodus mit Bürgermeister klären', rolle:'PD',
      hinweis:'Politische Abstimmungen mit Behörden führt PD direkt. Wo wird das Projekt zuerst vorgestellt? Hängt von der Offenheit der Gemeinde für PV ab.' },
    { id:'p7-vorstellung', name:'Projektvorstellung in Gremien (Gemeinde- / Stadtrat)', rolle:'PD',
      hinweis:'Kann bereits mit B-Planer vorbereitet werden. Mitbringen: KMZ mit NVP, Layout, NTS, Vermessung, Katasterauszug.' },
    { id:'p7-aufstellung', name:'Gate: Aufstellungsbeschluss gefasst?', rolle:'Gemeinde', gate:true,
      hinweis:'Bei positivem Ergebnis ist die Realisierungswahrscheinlichkeit sehr hoch. Bei „Nein": späterer neuer Versuch (wenn sich Gremien/Planung verbessern) oder Abbruch — dann Rücktrittsfrist wahrnehmen und Verträge auflösen! Datum im Reiter Genehmigungsplanung → B-Plan-Verfahren.',
      state:p => msState(p,'aufstellungsbeschluss') },
  ]},
  { nr:8, id:'bplan', name:'B-Plan-Verfahren', steps:[
    { id:'p8-bplaner', name:'Regionalen B-Planer für das Verfahren beauftragen', rolle:'Extern',
      hinweis:'Teilweise haben Gemeinden „ihre" B-Planer (Preis dann nach HOAI hoch). Der B-Planer begleitet das gesamte Verfahren planerisch, das Bauamt koordiniert. Parallel: Start Änderung des Flächennutzungsplans.',
      state:p => msState(p,'bplanerBeauftragt') },
    { id:'p8-arten', name:'Ökologisches Gutachten: Artenschutzrechtlicher Fachbeitrag', rolle:'Extern', doku:'artenschutz',
      hinweis:'Beim Biologen beauftragen. Ergebnis kann CEF-Maßnahmen erfordern (z. B. Umsiedlung von Zauneidechsen) — meist VOR Baubeginn.' },
    { id:'p8-umwelt', name:'Ökologisches Gutachten: Umweltbericht', rolle:'Extern', doku:'umweltbericht',
      hinweis:'Kann A&E-Maßnahmen erfordern (Ausgleichs- & Ersatzbilanzierung, je Bundesland verschieden; Alternative Ökopunktevertrag).' },
    { id:'p8-brand', name:'Brandschutzkonzept beim Fachplaner beauftragen', rolle:'Extern', doku:'brandschutz',
      hinweis:'Enthält Gebäudebeschreibung, baurechtliche Einordnung sowie bauliche, anlagentechnische und organisatorische Maßnahmen.' },
    { id:'p8-blend', name:'Blendgutachten beauftragen (falls erforderlich)', rolle:'Extern', doku:'blend', optional:true,
      hinweis:'Blendwirkung ermitteln und bewerten (Schutz für Verkehrsteilnehmer und Wohnbebauung); wichtig sind Dauer und Stärke der Immission. Kann Maßnahmen wie einen Blendschutz erfordern.' },
    { id:'p8-vorentwurf', name:'Ersten Bebauungsplan-Entwurf unterstützen und freigeben', rolle:'PD',
      hinweis:'Input: alle Naturschutz-Maßnahmen, sämtliche Katasterauszüge mit Einfluss auf die Planung. PD gibt den Vor-Entwurf frei.',
      state:p => msState(p,'vorentwurf') },
    { id:'p8-beteiligung', name:'Frühzeitige Öffentlichkeits- und Behördenbeteiligung', rolle:'Extern',
      hinweis:'Äußerungen der Öffentlichkeit zu Zielen und Auswirkungen; Stellungnahmen der TÖB (Träger öffentlicher Belange: Bundes-/Landesbehörden, Bundeswehr, Landkreise, Energieversorger, Wasserwerke, Telekom-Netzbetreiber, Post, Bahn, Feuerwehr/Rettungsdienst) fragt der B-Planer ab.',
      state:p => msState(p,'fruehzBeteiligung') },
    { id:'p8-toeb', name:'TÖB-Stellungnahmen auswerten', rolle:'PD', state:p => msState(p,'toebAusgewertet') },
    { id:'p8-offenlegung', name:'Billigungs- / Offenlegungsbeschluss', rolle:'Gemeinde', state:p => msState(p,'offenlegungsbeschluss') },
    { id:'p8-auslegung', name:'Öffentliche Auslegung', rolle:'Gemeinde',
      hinweis:'Entwürfe liegen mit Begründung, Umweltbericht und umweltfachlichen Stellungnahmen aus. Innerhalb der Frist (i. d. R. 1 Monat) können TÖB weitere Stellungnahmen einreichen; Fristverlängerungen möglich.',
      state:p => msState(p,'auslegung') },
    { id:'p8-abwaegung', name:'Abwägung der Stellungnahmen (Unterstützung)', rolle:'PD',
      hinweis:'Bei wesentlichen Änderungen am Planentwurf kann eine erneute Auslegung nötig werden (Dauer angemessen verkürzbar).',
      state:p => msState(p,'abwaegung') },
    { id:'p8-satzung', name:'Gate: Satzungsbeschluss gefasst?', rolle:'Gemeinde', gate:true,
      hinweis:'Finale Fassung: Zeichnung/Vermessung, Textfassung, Begründung, Umweltbericht. Wird vom Stadtplanungsausschuss als Satzung beschlossen.',
      state:p => msState(p,'satzungsbeschluss') },
    { id:'p8-genehmigung', name:'Genehmigung durch Landkreisverwaltung einholen', rolle:'PD',
      state:p => msState(p,'genehmigungLandkreis') },
  ]},
  { nr:9, id:'baugenehmigung', name:'Baugenehmigung', steps:[
    { id:'p9-verfahren', name:'Geeignetes Verfahren für die Fläche wählen', rolle:'PD',
      hinweis:'Regulär / vereinfacht (reduzierter Unterlagenumfang, möglich bei bestehendem B-Plan) / Genehmigungsfreistellung (MV und ST möglich, BB und NRW nicht). Auswahl im Reiter Genehmigungsplanung → Baugenehmigungsverfahren.',
      state:p => p.genehmigung.bauverfahren.art ? 'erledigt' : 'offen' },
    { id:'p9-einreichen', name:'Alle Unterlagen einreichen (durch Architekt mit Bauvorlageberechtigung)', rolle:'Extern',
      state:p => dateState(p.genehmigung.bauverfahren.eingereichtAm) },
    { id:'p9-vollstaendig', name:'Bestätigung der Vollständigkeit erhalten', rolle:'PD',
      hinweis:'Gesetzlich max. ~3 Monate; real aktuell bis zu 3–4 Monate. Freistellung: nach ca. 3 Wochen Frist automatisch oder per Rückmeldung.',
      state:p => dateState(p.genehmigung.bauverfahren.vollstaendigAm) },
    { id:'p9-baugrund', name:'Baugrundgutachten abrufen', rolle:'PD', doku:'baugrund',
      hinweis:'Auf Basis der Kampfmittelauskunft wurde je nach Bedarf eine Sondierung durchgeführt und anschließend das Bodengutachten beauftragt.' },
    { id:'p9-genehmigt', name:'Gate: Baugenehmigung erhalten?', rolle:'PD', gate:true,
      hinweis:'Kann unter Auflagen erteilt werden (z. B. Nachlieferung Kampfmittelfreiheits-Bericht). Auflagen im Reiter Genehmigungsplanung erfassen! Bei endgültiger Ablehnung: Rücktrittsfrist wahrnehmen, Verträge auflösen.',
      state:p => dateState(p.genehmigung.bauverfahren.genehmigtAm) },
    { id:'p9-anzeige', name:'Baubeginnsanzeige bei Baubehörde und Landkreis einreichen', rolle:'PD',
      hinweis:'Eine Woche Frist bis Baubeginn einhalten. Inhalte: Bauherr, Vorhaben, Datum Baubeginn, Nachweise (Standsicherheit, Brandschutz), Bauleiter, Unterschrift.',
      state:p => dateState(p.genehmigung.bauverfahren.baubeginnsanzeigeAm) },
    { id:'p9-bauprogramm', name:'Aufnahme ins Bauprogramm', rolle:'PD' },
    { id:'p9-scm', name:'Materialbestellung mit SCM im Baumeeting abstimmen', rolle:'SCM',
      hinweis:'Auflagen können den Einkauf spezieller Komponenten erfordern (andere Rammpfosten, Trafos).' },
    { id:'p9-uebergabe', name:'Übergabe Baugenehmigung inkl. Auflagen an das Bau-Team', rolle:'Bau-Team' },
  ]},
  { nr:10, id:'massnahmen', name:'Auflagen & Maßnahmen (A&E / CEF)', steps:[
    { id:'p10-cef', name:'CEF- / Artenschutzmaßnahmen umsetzen (VOR Baubeginn)', rolle:'PD',
      hinweis:'Erhaltung des Ökosystems, z. B. Umsiedlung gefährdeter Arten wie Zauneidechsen — üblicherweise vor Baubeginn nötig. Pflege in Genehmigungsplanung → Auflagen & Maßnahmen.',
      state:p => auflagenState(p,'CEF') },
    { id:'p10-ae', name:'Vereinbarte A&E-Maßnahmen umsetzen', rolle:'PD',
      hinweis:'Ausgleichs- & Ersatzbilanzierung, jedes Bundesland hat andere Vorgaben; häufig erst deutlich nach Baubeginn, vertraglich geregelt.',
      state:p => auflagenState(p,'A&E') },
    { id:'p10-oeko', name:'Zahlung im Rahmen des Ökopunktevertrags bei BuHa anstoßen', rolle:'BuHa',
      hinweis:'Alternative zu A&E: nur eine Zahlung auf das Konto der Gemeinde, die das Geld für ökologische Projekte nutzt.',
      state:p => auflagenState(p,'Ökopunkte') },
    { id:'p10-auflagen', name:'Sonstige Auflagen aus der Baugenehmigung erfüllen', rolle:'PD',
      state:p => auflagenState(p,'Auflage') },
  ]},
];

// Schritte, die es nur im Bebauungsplanverfahren gibt. Wird ein Weg ohne B-Plan gewählt
// (Privilegierung, § 34, bestehender B-Plan), entfallen sie — sonst bliebe der
// Projektfortschritt dauerhaft bei „13 offene Schritte" stehen, obwohl das Projekt sauber
// durchläuft. `entfaellt` zählt in phaseProgress/overallProgress als erledigt.
// Die Fachgutachten stehen zwar in der B-Plan-Phase, hängen aber NICHT am Bebauungsplan:
// der artenschutzrechtliche Fachbeitrag folgt aus § 44 BNatSchG, Brandschutzkonzept und
// Blendgutachten werden für die Baugenehmigung gebraucht, und eine UVP-Vorprüfung kann sich
// aus dem UVPG ergeben. Sie bleiben deshalb auch ohne B-Plan-Verfahren bestehen — entfallen
// dürfen nur die reinen Verfahrensschritte der Bauleitplanung.
const MATERIELL_TROTZ_OHNE_BPLAN = new Set(['p8-arten','p8-umwelt','p8-brand','p8-blend']);
const BPLAN_ONLY_STEP_IDS = new Set([
  'p7-aufstellung',
  ...(PROCESS_TEMPLATE.find(ph => ph.id==='bplan') || {steps:[]}).steps
      .map(st => st.id).filter(id => !MATERIELL_TROTZ_OHNE_BPLAN.has(id)),
]);
function stepEntfaelltDurchVerfahren(p, step){
  if(!BPLAN_ONLY_STEP_IDS.has(step.id)) return false;
  // Vor der Verfahrenswahl nichts ausblenden — der Regelfall ist das B-Plan-Verfahren.
  if(typeof VERFAHRENSWEGE === 'undefined') return false;
  const weg = verfahrensweg(p);
  return !!weg && !weg.bplan;
}

// Status eines Schritts — einzige Stelle, die entscheidet, woher der Zustand kommt
// (Verfahrensweg > Dokument-Kopplung > abgeleitete state-Funktion > manueller Zustand).
function stepState(p, step){
  if(stepEntfaelltDurchVerfahren(p, step)) return 'entfaellt';
  if(step.doku) return dokuDerivedState(p, step.doku);
  if(step.state){ try { return step.state(p) || 'offen'; } catch { return 'offen'; } }
  const st = p.prozess.schritte[step.id];
  return st ? (st.status || 'offen') : 'offen';
}
function stepDone(s){ return s==='erledigt' || s==='entfaellt'; }
function phaseProgress(p, phase){
  const total = phase.steps.length;
  const done = phase.steps.filter(st => stepDone(stepState(p,st))).length;
  return { done, total };
}
function currentPhase(p){
  for(const phase of PROCESS_TEMPLATE){
    if(phase.steps.some(st => !st.optional && !stepDone(stepState(p,st)))) return phase;
  }
  return PROCESS_TEMPLATE[PROCESS_TEMPLATE.length-1];
}
function overallProgress(p){
  let done=0, total=0;
  PROCESS_TEMPLATE.forEach(ph => { const pr = phaseProgress(p,ph); done+=pr.done; total+=pr.total; });
  return { done, total };
}
function phaseBadgeHtml(p){
  if(p.prozess.abgebrochen) return '<span class="pill warn">Zurückgestellt / abgebrochen</span>';
  const ph = currentPhase(p);
  const o = overallProgress(p);
  const cls = (ph.nr>=9 && o.done===o.total) ? 'pill ok' : 'pill phase';
  return `<span class="${cls}" title="${escapeAttr(ph.name)}">Phase ${ph.nr}/10 · ${escapeHtml(ph.name)} · ${o.done}/${o.total}</span>`;
}

const DEFAULT_TYPES = [
  { id:'arten',      name:'Artenschutzrechtliche Prüfung (saP)',       notes:'Faunistisches Gutachten / saP nach §44 BNatSchG', offices:[] },
  { id:'umwelt',     name:'UVP-Vorprüfung / Umweltbericht',             notes:'Allgemeine Vorprüfung des Einzelfalls nach UVPG', offices:[] },
  { id:'boden',      name:'Bodengutachten / Baugrundgutachten',         notes:'Tragfähigkeit, Erdung, Frosttiefe, Rammbarkeit', offices:[] },
  { id:'altlast',    name:'Altlastenrecherche',                         notes:'Auszug aus dem Altlastenkataster, Nutzungshistorie', offices:[] },
  { id:'schall',     name:'Schallgutachten (Trafo / Wechselrichter)',   notes:'Nur bei nahegelegener Wohnbebauung', offices:[] },
  { id:'blend',      name:'Blendgutachten',                             notes:'Bei angrenzender Wohnbebauung, Straße, Schiene, Flughafen', offices:[] },
  { id:'landschaft', name:'Landschaftsbildbewertung / Eingriffsbilanz', notes:'Ggf. inkl. Visualisierung', offices:[] },
  { id:'archaeo',    name:'Archäologische Voruntersuchung',             notes:'Abstimmung mit Landesdenkmalpflege', offices:[] },
  { id:'denkmal',    name:'Denkmalschutzrechtliche Stellungnahme',      notes:'Sichtachsen, Umgebungsschutz', offices:[] },
  { id:'wasser',     name:'Wasserrechtliche Stellungnahme',             notes:'Wasserschutzgebiete, Überschwemmungsgebiete', offices:[] },
  { id:'netz',       name:'Netzanschlussanfrage / Netzverträglichkeit', notes:'An zuständigen Verteilnetzbetreiber', offices:[] },
  { id:'verkehr',    name:'Verkehrstechnische Erschließung',            notes:'Zufahrt während Bau + Betrieb', offices:[] },
];

// Migration: v1 (single email) -> v2 (offices[])
function migrateTypes(){
  const v1 = localStorage.getItem('pa_types_v1');
  if(v1 && !localStorage.getItem(LS_KEYS.types)){
    try {
      const arr = JSON.parse(v1);
      const migrated = arr.map(t => ({
        id: t.id, name: t.name, notes: t.notes || '',
        offices: t.email ? [{ id:'o'+Date.now()+Math.random(), name:'', contact:'', email:t.email, phone:'', notes:'' }] : []
      }));
      localStorage.setItem(LS_KEYS.types, JSON.stringify(migrated));
    } catch{}
  }
}
migrateTypes();

// Fills in any missing fields (incl. the Grundstück/Genehmigungsplanung/Netz/Technik sub-objects)
// with sane defaults. Used for brand-new projects, migrated legacy data, and hand-edited/older
// localStorage data alike, so all three shapes only need to be described once.
function normalizeProject(p){
  p = p || {};
  const now = new Date().toISOString();
  return {
    id: p.id || ('p'+Date.now()+Math.random().toString(36).slice(2)),
    name: p.name||'', location: p.location||'', power: p.power||'',
    // Leistung getrennt nach DC (Modulleistung, kWp) und AC (Wechselrichter-/Einspeiseleistung, kW).
    // Altprojekte haben nur das Freitextfeld `power` — siehe formatLeistung() für den Fallback.
    powerDcKwp: (typeof p.powerDcKwp === 'number' && !Number.isNaN(p.powerDcKwp)) ? p.powerDcKwp : null,
    powerAcKw: (typeof p.powerAcKw === 'number' && !Number.isNaN(p.powerAcKw)) ? p.powerAcKw : null,
    timeline: p.timeline||'', notes: p.notes||'',
    status: PROJECT_STATUSES.includes(p.status) ? p.status : PROJECT_STATUSES[0],
    features: Array.isArray(p.features) ? p.features : [],
    // Bei der Neuanlage im Assistenten gewähltes Bundesland (STATES-Key) — zentriert die Karte
    // und aktiviert das passende ALKIS-WMS, solange noch keine Fläche gezeichnet ist. Sobald
    // eine Fläche existiert, übernimmt die reale Lage-Ermittlung (p.lage.land) diese Rolle.
    planBundesland: p.planBundesland || '',
    lage: ('lage' in p) ? p.lage : null,
    naturschutz: ('naturschutz' in p) ? p.naturschutz : null,
    genehmigung: (g => {
      const out = Object.assign({ behoerde:'', verfahrensstand:'', fristen:'' }, g);
      // B-Plan-Verfahren (AP5): Meilensteine tief mergen, damit neue Keys Defaults bekommen
      const ms = (g.bplan && g.bplan.meilensteine) || {};
      out.bplan = {
        bplaner: Object.assign({ name:'', email:'', telefon:'' }, (g.bplan && g.bplan.bplaner)||{}),
        meilensteine: Object.fromEntries(BPLAN_MEILENSTEINE.map(([key]) =>
          [key, Object.assign({ erledigt:false, datum:null, von:null, bis:null }, ms[key]||{})]))
      };
      out.bauverfahren = Object.assign(
        { art:null, eingereichtAm:null, vollstaendigAm:null, genehmigtAm:null, baubeginnAm:null, baubeginnsanzeigeAm:null },
        g.bauverfahren||{});
      // Planungsrechtlicher Weg (BauGB). Bestimmt, welche Felder im Genehmigungs-Reiter
      // überhaupt sichtbar sind und ob das B-Plan-Verfahren im Prozess anfällt.
      out.verfahren = Object.assign({
        weg:null,               // siehe VERFAHRENSWEGE
        anlagenart:'',          // pv | bess | pv-bess — steuert die Privilegierungstatbestände
        privilegierung:null,    // siehe PRIVILEGIERUNGEN
        nachweise:{},           // Feldwerte zum gewählten Privilegierungstatbestand
        einvernehmenStatus:'offen', einvernehmenAm:null,
        rueckbauErklaerungAm:null,   // § 35 Abs. 5 BauGB
        // Förder- und Netzrahmen (EEG / EnWG), siehe renderFoerderrahmen()
        eegKategorie:'', eegAbstandM:null, eegBiodivAnzahl:null,
        eegLeistungMwp:null, kommunalabgabeAm:null, kommunalabgabeCt:null,
        bestandName:'', bestandNutzung:'', bestandBefreiung:false,
        bestandBefreiungAm:null, bestandBefreiungErteiltAm:null,
        innenUmgebung:'', innenErschliessung:'',
        vbplanDurchfuehrungsvertragAm:null, vbplanVepAm:null,
        vorbescheidGenutzt:false, vorbescheidFrage:'', vorbescheidEingereichtAm:null,
        vorbescheidErhaltenAm:null, vorbescheidErgebnis:'', vorbescheidGueltigBis:null,
      }, g.verfahren||{});
      if(!out.verfahren.nachweise || typeof out.verfahren.nachweise!=='object') out.verfahren.nachweise = {};
      out.auflagen = Array.isArray(g.auflagen) ? g.auflagen : [];
      out.fristenListe = Array.isArray(g.fristenListe) ? g.fristenListe : [];
      return out;
    })(p.genehmigung||{}),
    netz: Object.assign({ betreiber:'', anschlusspunkt:'', anschlussleistung:'', status:'', leistungMw:null,
      anaGestelltAm:null, nvpStatus:'offen', trasseStatus:'offen', trasseNotiz:'' }, p.netz||{}),
    technik: Object.assign({ anlagentyp:'', module:'', wechselrichter:'', bemerkungen:'' }, p.technik||{}),
    // Prozess-Zustand (AP1): nur Zustände, der Ablauf selbst steht in PROCESS_TEMPLATE
    prozess: (pr => {
      const out = Object.assign(
        { schritte:{}, vermarktung:null, projektnummer:'', gesellschaft:'', abgebrochen:false, abbruchGrund:'', aufgaben:[] },
        pr,
        // Einmalige Übernahme des alten Status "Zurückgestellt" in das neue Flag
        (!p.prozess && p.status==='Zurückgestellt') ? { abgebrochen:true, abbruchGrund:'Übernommen aus altem Status „Zurückgestellt"' } : {});
      out.aufgaben = Array.isArray(out.aufgaben) ? out.aufgaben.map(normalizeAufgabe) : [];
      // Projekt-ID wird automatisch vergeben, sobald keine (z.B. bei Neuanlage) vorhanden ist.
      if(!out.projektnummer) out.projektnummer = nextProjectId();
      return out;
    })(p.prozess||{}),
    dokumente: (p.dokumente && typeof p.dokumente==='object') ? p.dokumente : {},
    qualifikation: Object.fromEntries(QUALI_KEYS.map(k =>
      [k, Object.assign({ status:'offen', geprueftAm:null, durch:'selbst', notiz:'' }, (p.qualifikation||{})[k]||{})])),
    quelle: p.quelle || null,
    // Zusatzdaten je Flurstück (Pachtfläche, Eigentümer-Verknüpfung), Key = Flurstückskennzeichen.
    // Bleibt unabhängig von p.lage, da p.lage bei jeder Neuabfrage komplett ersetzt wird.
    flurstueckDaten: (p.flurstueckDaten && typeof p.flurstueckDaten === 'object') ? p.flurstueckDaten : {},
    // Kennzeichen -> stabile Flurstücks-ID. Hält die Zuordnung über Lage-Neuabfragen und
    // Re-Importe hinweg zusammen (siehe ensureFlurstueckIds).
    flurstueckIds: (p.flurstueckIds && typeof p.flurstueckIds === 'object') ? p.flurstueckIds : {},
    // Eigentümer sind projektbezogen (an die konkreten Flurstücke dieses Projekts gebunden),
    // anders als die globalen Gutachter-Typen/Umspannwerke.
    eigentuemer: Array.isArray(p.eigentuemer) ? p.eigentuemer : [],
    // Vertragsmanagement (Grundstück → Verträge), Aufbau siehe normalizeVertrag in 08b-vertragsmanagement.js
    vertraege: Array.isArray(p.vertraege) ? p.vertraege : [],
    // Kostenerfassung (Reiter Kosten): Belege und Kostenbescheide, Aufbau siehe normalizeKosten in 16b-kosten.js
    kosten: Array.isArray(p.kosten) ? p.kosten : [],
    // Benachrichtigungen an Teammitglieder (z. B. Aufgabe zugewiesen), siehe 21-benachrichtigungen.js.
    // Liegen im Projekt, damit sie über den Projekt-Sync beim Empfänger ankommen.
    benachrichtigungen: Array.isArray(p.benachrichtigungen) ? p.benachrichtigungen : [],
    // Behörden, Gemeinde, Netzbetreiber und externe Planer — je Eintrag eine Organisation
    // mit beliebig vielen Ansprechpartnern. Bewusst projektbezogen: dieselbe Kreisverwaltung
    // hat je Projekt andere Sachbearbeiter und Aktenzeichen.
    beteiligte: Array.isArray(p.beteiligte) ? p.beteiligte.map(normalizeBeteiligter) : [],
    // Kommunikationslog: chronologische Gesprächsnotizen (Eigentümer, Gemeinde, Netzbetreiber, ...)
    kommunikation: Array.isArray(p.kommunikation) ? p.kommunikation : [],
    // Updates & Aufgaben: freies Statuslog + Aufgabenliste im Übersicht-Dashboard,
    // unabhängig von den strukturierten Prozess-Aufgaben (prozess.aufgaben).
    updates: Array.isArray(p.updates) ? p.updates.map(normalizeUpdate) : [],
    // Manuell im Kalender angelegte Termine (z.B. Ortstermin, Gemeinderatssitzung)
    termine: Array.isArray(p.termine) ? p.termine : [],
    // Projektbezogene Gutachtenplanung (Erforderlichkeit, Büro, Honorar, Termine).
    // Der Bearbeitungsstand selbst bleibt an den Dokumenten hängen, siehe GUTACHTEN_KATALOG.
    gutachten: (p.gutachten && typeof p.gutachten === 'object') ? p.gutachten : {},
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
  };
}

// Leistung als Text: bevorzugt die getrennten DC/AC-Werte (neue Projekte), fällt für
// Altprojekte ohne diese Felder auf das frühere Freitextfeld `power` zurück.
function formatLeistung(p, sep){
  if(!p) return '';
  const dc = p.powerDcKwp, ac = p.powerAcKw;
  if(dc != null || ac != null){
    const parts = [];
    if(dc != null) parts.push(`${Number(dc).toLocaleString('de-DE')} kWp (DC)`);
    if(ac != null) parts.push(`${Number(ac).toLocaleString('de-DE')} kW (AC)`);
    return parts.join(sep != null ? sep : ' / ');
  }
  return p.power || '';
}

// Umspannwerke: globale, selbst gepflegte Liste (kein Default-Seed) für den Netz-Vergleich.
function normalizeSubstation(s){
  s = s || {};
  const num = v => (typeof v === 'number' && !Number.isNaN(v)) ? v : null;
  return {
    id: s.id || ('u'+Date.now()+Math.random().toString(36).slice(2)),
    name: s.name || '',
    betreiber: s.betreiber || '',
    lat: num(s.lat),
    lon: num(s.lon),
    spannungKv: [110,220,380].includes(s.spannungKv) ? s.spannungKv : 110,
    trafoleistungMva: num(s.trafoleistungMva),
    schaltfelderGesamt: num(s.schaltfelderGesamt),
    schaltfelderFrei: num(s.schaltfelderFrei),
    freieKapazitaetMw: num(s.freieKapazitaetMw),
  };
}

// Migration: single pa_project_v1 object -> pa_projects_v1 array (geometry was never persisted, only text fields carry over)
function migrateProjects(){
  if(localStorage.getItem(LS_KEYS.projects)) return;
  let seed = [];
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEYS.project));
    if(p && (p.name || p.location || p.power || p.timeline || p.notes)){
      seed = [normalizeProject({ name:p.name, location:p.location, power:p.power, timeline:p.timeline, notes:p.notes })];
    }
  } catch{}
  localStorage.setItem(LS_KEYS.projects, JSON.stringify(seed));
}
migrateProjects();

let types = loadOr(LS_KEYS.types, DEFAULT_TYPES);
// safety: ensure offices array exists
types.forEach(t => { if(!Array.isArray(t.offices)) t.offices = []; });
// In der öffentlichen Demo keine echte Absenderadresse vorbelegen
let sender = loadOr(LS_KEYS.sender, { name:'', company:'PORTA-PV', phone:'', email: window.PA_DEMO ? '' : 'manuel@nillesonline.de', signature:'Mit freundlichen Grüßen' });
// Vertragsvorlagen: global gepflegte Word-Muster mit {{Feld}}-Platzhaltern (Serienbrief-Prinzip).
// Einmal vom Entwickler hochgeladen, dann je Projekt/Eigentümer über die Eingabemaske befüllt —
// erspart das erneute Öffnen des Word-Dokuments für Standardanpassungen wie die Laufzeit.
let vertragsvorlagen = loadOr(LS_KEYS.vertragsvorlagen, []);
function saveVertragsvorlagen(){ save(LS_KEYS.vertragsvorlagen, vertragsvorlagen); }

let projects = loadOr(LS_KEYS.projects, []).map(normalizeProject);
// Direktes localStorage.setItem statt save(): Datei-Sync ist an dieser frühen Stelle im
// Skript noch nicht initialisiert (fileSyncHandle wird erst weiter unten deklariert) —
// persistiert trotzdem sofort neu vergebene Projekt-IDs, damit sie beim nächsten Laden stabil bleiben.
try { localStorage.setItem(LS_KEYS.projects, JSON.stringify(projects)); } catch{}
let umspannwerke = loadOr(LS_KEYS.umspannwerke, []).map(normalizeSubstation);
function saveUmspannwerke(){ save(LS_KEYS.umspannwerke, umspannwerke); }
let activeProjectId = null; // in-memory; beim Laden Liste — im Entwicklungsmodus das zuletzt offene Projekt (siehe Ende der Datei)
let currentView = 'list';   // 'list' | 'map' | 'detail' — von switchView gesetzt
// Geöffnete Projekt-Tabs (Reihenfolge). Persistiert, damit die offenen Projekte einen
// Reload überleben. Beim Laden landet die App weiterhin auf der Liste (kein Auto-Detail),
// die Tabs sind aber sofort wieder da und per Klick anwählbar.
const LS_OPEN_TABS = 'pa_open_tabs_v1';
let openTabs = (function(){ try { const a = JSON.parse(localStorage.getItem(LS_OPEN_TABS)); return Array.isArray(a) ? a : []; } catch { return []; } })();
function persistOpenTabs(){ try { localStorage.setItem(LS_OPEN_TABS, JSON.stringify(openTabs)); } catch {} }

// Pro Projekt-Tab gemerkter Ansichtszustand, damit beim Zurückwechseln nicht auf den
// Prozess-Reiter zurückgesprungen wird: aktiver Detail-Reiter, Grundstück-Unterreiter
// und Scrollposition. Persistiert, damit es einen Reload übersteht.
const LS_TAB_STATE = 'pa_tab_state_v1';
let tabState = (function(){ try { const o = JSON.parse(localStorage.getItem(LS_TAB_STATE)); return (o && typeof o==='object') ? o : {}; } catch { return {}; } })();
function persistTabState(){ try { localStorage.setItem(LS_TAB_STATE, JSON.stringify(tabState)); } catch {} }
function tabStateFor(id){ return tabState[id] || (tabState[id] = { detailTab:'prozess', grundSub:'karte', scrollTop:0 }); }
// Seit dem Umbau auf die Sidebar scrollt nicht mehr #view-detail, sondern .detail-main —
// die Navigation soll ja stehen bleiben. Eine Funktion statt drei verstreuter Zugriffe,
// damit ein künftiger Layoutwechsel nur hier anfassen muss.
function detailScroller(){ return document.getElementById('detail-main'); }
function saveActiveScroll(){
  if(activeProjectId && currentView==='detail'){
    const el = detailScroller();
    if(el){ tabStateFor(activeProjectId).scrollTop = el.scrollTop; persistTabState(); }
  }
}
let projectSortBy = loadOr(LS_KEYS.projectSort, 'updated');

function sortProjects(list){
  const sorted = [...list];
  switch(projectSortBy){
    case 'name':
      sorted.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'de'));
      break;
    case 'area':
      sorted.sort((a,b) => combinedArea(b) - combinedArea(a));
      break;
    case 'status': // sortiert nach Prozessphase (fortgeschrittenste zuerst)
      sorted.sort((a,b) => currentPhase(b).nr - currentPhase(a).nr);
      break;
    case 'created':
      sorted.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
    case 'updated':
    default:
      sorted.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  return sorted;
}

function getActiveProject(){ return projects.find(p => p.id === activeProjectId) || null; }
function saveProjects(){
  captureActivity(); save(LS_KEYS.projects, projects); showSaveToast();
  if(typeof glockeSpaeterAktualisieren === 'function') glockeSpaeterAktualisieren(); // Zähler an der Glocke
}
