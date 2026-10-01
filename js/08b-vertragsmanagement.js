// Vertragsmanagement (Grundstück → Verträge): Tracker und Eingabemaske für alle Verträge zur Fläche
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Datenmodell: p.vertraege = [Vertrag]. Ein Vertrag bündelt Vertragspartner (Eigentümer),
// Flurstücke, Status mit Verlauf und — spätestens nach der Unterzeichnung — die Eckdaten
// (Laufzeit, Vergütung, Reservierung, Zahlungsmodalitäten, Fristen, Grundbuch, Rückbau).
// Pacht- und Kaufverträge sind führend für den Sicherungsstand ihrer Flurstücke
// (syncVertragZuFlurstuecken) — so zeigen Sicherung, Übersicht und Fristen dasselbe.
// ═════════════════════════════════════════════════════════════════════════════

const VERTRAGSTYPEN = [
  { id:'pacht',       name:'Pachtvertrag / Nutzungsvertrag', kurz:'Pacht',       sichert:true,  verguetung:'pacht' },
  { id:'kauf',        name:'Kaufvertrag',                     kurz:'Kauf',        sichert:true,  verguetung:'kauf'  },
  { id:'gestattung',  name:'Gestattungsvertrag (Kabeltrasse / Leitungsrecht)', kurz:'Gestattung', sichert:false, verguetung:'pacht' },
  { id:'wege',        name:'Wegenutzungsvertrag (Zuwegung)',   kurz:'Wegenutzung', sichert:false, verguetung:'pacht' },
  { id:'ausgleich',   name:'Ausgleichsflächenvertrag',          kurz:'Ausgleich',   sichert:false, verguetung:'pacht' },
  { id:'reservierung',name:'Reservierungs- / Optionsvereinbarung', kurz:'Reservierung', sichert:false, verguetung:'keine' },
  { id:'sonstig',     name:'Sonstiger Vertrag',                 kurz:'Sonstiges',   sichert:false, verguetung:'pacht' },
];
const VERTRAGSTYP_BY_ID = Object.fromEntries(VERTRAGSTYPEN.map(t => [t.id, t]));

// Status-Pipeline. `signed` = unterzeichnet (ab hier zählen die Eckdaten als vereinbart),
// `flst` = Vertragsstatus, der auf die Flurstücke übertragen wird (Reiter Sicherung).
const VSTATUS = [
  { id:'entwurf',        name:'Entwurf',            pill:'',     flst:'Interesse' },
  { id:'verhandlung',    name:'In Verhandlung',     pill:'warn', flst:'Vertrag verhandelt' },
  { id:'unterschrift',   name:'Zur Unterschrift',   pill:'warn', flst:'Vertrag verhandelt' },
  { id:'unterschrieben', name:'Unterschrieben',     pill:'ok',   flst:'unterschrieben', signed:true },
  { id:'wirksam',        name:'Wirksam / läuft',    pill:'ok',   flst:'unterschrieben', signed:true },
  { id:'beendet',        name:'Beendet',            pill:'',     flst:'aufgelöst',      signed:true, ende:true },
  { id:'abgebrochen',    name:'Abgebrochen',        pill:'err',  flst:'kein Interesse', ende:true },
];
const VSTATUS_BY_ID = Object.fromEntries(VSTATUS.map(s => [s.id, s]));
const VSTATUS_PIPELINE = ['entwurf','verhandlung','unterschrift','unterschrieben','wirksam']; // für die Fortschrittsanzeige

const PACHT_MODELLE = [
  ['ha', '€ je ha und Jahr'], ['m2', '€ je m² und Jahr'], ['pauschal', 'Pauschal € je Jahr'], ['umsatz', '% vom Stromerlös (mit Mindestpacht)'],
];
const ZAHLUNGS_RHYTHMEN = [['jaehrlich','jährlich',12], ['halbjaehrlich','halbjährlich',6], ['quartal','quartalsweise',3], ['monatlich','monatlich',1], ['einmalig','einmalig',0]];
const BEGINN_ARTEN = [['datum','an einem festen Datum'], ['unterschrift','mit Unterzeichnung'], ['baubeginn','mit Baubeginn'], ['inbetriebnahme','mit Inbetriebnahme']];
const DIENSTBARKEIT_STATUS = [['keine','keine vereinbart'], ['bewilligt','bewilligt'], ['beantragt','Eintragung beantragt'], ['eingetragen','im Grundbuch eingetragen']];

function normalizeVertrag(v){
  v = v || {};
  return Object.assign({
    id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    typ:'pacht', bezeichnung:'', aktenzeichen:'',
    partnerIds:[], flurstueckIds:[], flaecheM2:null,
    status:'entwurf', statusHistorie:[],
    angebotAm:null, unterschriebenAm:null, gegengezeichnetAm:null, beurkundetAm:null,
    beginnArt:'unterschrift', beginnAm:null, laufzeitJahre:null, verlaengerungAnzahl:null, verlaengerungJahre:null,
    kuendigungsfristMonate:null, ruecktrittBis:null, ruecktrittNotiz:'',
    pachtModell:'ha', pachtBetrag:null, pachtMindest:null, wertsicherung:'keine', wertsicherungText:'',
    kaufpreis:null,
    reservierungModell:'pauschal', reservierungBetrag:null, reservierungBis:null, reservierungAnrechnung:false,
    zahlungsRhythmus:'jaehrlich', faelligkeit:'', ersteZahlungAm:null, ust:'keine',
    dienstbarkeit:'keine', dienstbarkeitAm:null, rueckbauSicherheit:null, entschaedigung:'',
    notiz:'', dateien:[],
    angelegtAm: new Date().toISOString(),
  }, v, {
    partnerIds: Array.isArray(v.partnerIds) ? v.partnerIds : [],
    flurstueckIds: Array.isArray(v.flurstueckIds) ? v.flurstueckIds.map(String) : [],
    statusHistorie: Array.isArray(v.statusHistorie) ? v.statusHistorie : [],
    dateien: Array.isArray(v.dateien) ? v.dateien : [],
  });
}
function vertraegeVon(p){
  if(!Array.isArray(p.vertraege)) p.vertraege = [];
  p.vertraege = p.vertraege.map(normalizeVertrag);
  return p.vertraege;
}

// ---- Berechnungen ----------------------------------------------------------
const EURO = n => n == null || n === '' || Number.isNaN(Number(n)) ? '—'
  : Number(n).toLocaleString('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
// Fläche lesbar: unter 1 ha in m² (sonst stünde bei kleinen Flurstücken „0,00 ha"), darüber in ha
const HA = m2 => Number(m2) < 10000
  ? Math.round(Number(m2)).toLocaleString('de-DE') + '\u00A0m²'
  : (Number(m2) / 10000).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + '\u00A0ha';
const isoPlus = (iso, jahre, monate, tage) => {
  if(!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  if(jahre) d.setFullYear(d.getFullYear() + jahre);
  if(monate) d.setMonth(d.getMonth() + monate);
  if(tage) d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0,10);
};
function vertragFlurstuecke(p, v){
  const ids = new Set(v.flurstueckIds.map(String));
  return ensureFlurstueckIds(p).filter(f => ids.has(String(f.id)));
}
function vertragFlaecheM2(p, v){
  if(v.flaecheM2 != null && v.flaecheM2 !== '') return Number(v.flaecheM2);
  return vertragFlurstuecke(p, v).reduce((s, f) => {
    const ex = p.flurstueckDaten[f.id] || {};
    return s + (Number(ex.pachtflaeche != null ? ex.pachtflaeche : f.flaeche) || 0);
  }, 0);
}
function vertragJahresbetrag(p, v){
  const typ = VERTRAGSTYP_BY_ID[v.typ] || {};
  if(typ.verguetung !== 'pacht' || v.pachtBetrag == null || v.pachtBetrag === '') return null;
  const m2 = vertragFlaecheM2(p, v), b = Number(v.pachtBetrag);
  if(v.pachtModell === 'ha') return b * m2 / 10000;
  if(v.pachtModell === 'm2') return b * m2;
  if(v.pachtModell === 'pauschal') return b;
  if(v.pachtModell === 'umsatz') return v.pachtMindest != null ? Number(v.pachtMindest) : null; // Mindestpacht als untere Grenze
  return null;
}
function vertragReservierungGesamt(p, v){
  if(v.reservierungBetrag == null || v.reservierungBetrag === '') return null;
  const b = Number(v.reservierungBetrag);
  return v.reservierungModell === 'ha' ? b * vertragFlaecheM2(p, v) / 10000 : b;
}
function vertragBeginn(p, v){
  if(v.beginnArt === 'datum') return v.beginnAm || null;
  if(v.beginnArt === 'unterschrift') return v.unterschriebenAm || v.beginnAm || null;
  if(v.beginnArt === 'baubeginn') return p.genehmigung.bauverfahren.baubeginnAm || v.beginnAm || null;
  return v.beginnAm || null; // Inbetriebnahme: Datum erst bekannt, wenn eingetragen
}
function vertragEnde(p, v){
  const b = vertragBeginn(p, v);
  return (b && v.laufzeitJahre) ? isoPlus(b, Number(v.laufzeitJahre), 0, -1) : null;
}
function vertragEndeMaximal(p, v){
  const e = vertragEnde(p, v);
  const extra = (Number(v.verlaengerungAnzahl) || 0) * (Number(v.verlaengerungJahre) || 0);
  return e && extra ? isoPlus(e, extra) : null;
}
function vertragKuendigungBis(p, v){
  const e = vertragEnde(p, v);
  return (e && v.kuendigungsfristMonate) ? isoPlus(e, 0, -Number(v.kuendigungsfristMonate)) : null;
}
function vertragNaechsteZahlung(p, v){
  if(!v.ersteZahlungAm || !(VSTATUS_BY_ID[v.status] || {}).signed || v.status === 'beendet') return null;
  const heute = new Date().toISOString().slice(0,10);
  const r = ZAHLUNGS_RHYTHMEN.find(z => z[0] === v.zahlungsRhythmus) || ZAHLUNGS_RHYTHMEN[0];
  if(!r[2]) return v.ersteZahlungAm >= heute ? v.ersteZahlungAm : null;
  const ende = vertragEndeMaximal(p, v) || vertragEnde(p, v);
  let d = v.ersteZahlungAm, n = 0;
  while(d < heute && n < 1200){ n++; d = isoPlus(v.ersteZahlungAm, 0, r[2] * n); }
  return (ende && d > ende) ? null : d;
}
function vertragSigned(v){ return !!(VSTATUS_BY_ID[v.status] || {}).signed; }
function vertragPartnerNamen(p, v){
  return v.partnerIds.map(id => (p.eigentuemer.find(e => e.id === id) || {}).name).filter(Boolean);
}
function vertragTitel(v){
  const t = VERTRAGSTYP_BY_ID[v.typ] || VERTRAGSTYP_BY_ID.sonstig;
  return v.bezeichnung || t.name;
}

// Welche Eckdaten fehlen nach der Unterzeichnung noch? (Hinweis in der Liste)
function vertragFehlendeEckdaten(p, v){
  if(!vertragSigned(v)) return [];
  const typ = VERTRAGSTYP_BY_ID[v.typ] || {};
  const fehlt = [];
  if(!v.unterschriebenAm) fehlt.push('Datum der Unterzeichnung');
  if(!v.partnerIds.length) fehlt.push('Vertragspartner');
  if(typ.verguetung === 'kauf'){ if(v.kaufpreis == null) fehlt.push('Kaufpreis'); }
  else {
    if(!v.laufzeitJahre) fehlt.push('Laufzeit');
    if(!vertragBeginn(p, v) && v.beginnArt !== 'inbetriebnahme' && v.beginnArt !== 'baubeginn') fehlt.push('Vertragsbeginn');
    if(typ.verguetung === 'pacht' && (v.pachtBetrag == null || v.pachtBetrag === '')) fehlt.push('Pachthöhe');
    if(typ.verguetung === 'pacht' && !v.ersteZahlungAm) fehlt.push('erste Zahlung');
  }
  return fehlt;
}

// ---- Synchronisation Vertrag → Flurstücke (Reiter Sicherung, Übersicht, Fristen) ----
// Führend nur für Pacht/Kauf. Setzt Vertragsstatus, Art, Rücktrittsfrist, erste Zahlung und
// €/m² an jedem zugeordneten Flurstück; Flurstücke, die aus dem Vertrag herausgenommen
// werden, behalten ihren letzten Stand (sie werden nicht zurückgesetzt).
function syncVertragZuFlurstuecken(p, v){
  const typ = VERTRAGSTYP_BY_ID[v.typ] || {};
  if(!typ.sichert) return;
  const st = VSTATUS_BY_ID[v.status] || VSTATUS[0];
  const preisM2 = typ.verguetung === 'pacht' && v.pachtBetrag != null && v.pachtBetrag !== ''
    ? (v.pachtModell === 'm2' ? Number(v.pachtBetrag) : v.pachtModell === 'ha' ? Number(v.pachtBetrag) / 10000 : null) : null;
  v.flurstueckIds.forEach(fid => {
    const ex = getFlurstueckExtra(p, fid);
    ex.vertragsStatus = st.flst;
    ex.sicherungArt = v.typ === 'kauf' ? 'Kauf' : 'Pacht';
    ex.rueckTrittsfrist = v.ruecktrittBis || null;
    if(v.ersteZahlungAm) ex.ersteZahlungAm = v.ersteZahlungAm;
    if(preisM2 != null) ex.preisProM2 = Math.round(preisM2 * 10000) / 10000;
    if(!ex.eigentuemerId && v.partnerIds.length === 1) ex.eigentuemerId = v.partnerIds[0];
  });
}
// Flurstück-ID → sichernder Vertrag (für Sicherung-Reiter und Fristen)
function vertragFuerFlurstueck(p, fid){
  return (p.vertraege || []).find(v => (VERTRAGSTYP_BY_ID[v.typ] || {}).sichert && v.flurstueckIds.map(String).includes(String(fid)));
}

// ---- Fristen für „Als Nächstes", Fristen-Dashboard und Kalender -----------------
function vertragDeadlines(p){
  const out = [];
  (p.vertraege || []).forEach(v => {
    const st = VSTATUS_BY_ID[v.status] || {};
    if(st.ende) return;
    const name = `${vertragTitel(v)}${v.partnerIds.length ? ' · ' + vertragPartnerNamen(p, v).join(', ') : ''}`;
    const nav = { tab:'grundstueck', sub:'vertraege', vid:v.id };
    if(v.ruecktrittBis) out.push(Object.assign({ datum:v.ruecktrittBis, text:`Rücktrittsrecht endet: ${name}`, p, warnTage:42 }, nav));
    if(v.reservierungBis && !st.signed) out.push(Object.assign({ datum:v.reservierungBis, text:`Reservierung endet: ${name}`, p, warnTage:42 }, nav));
    const z = vertragNaechsteZahlung(p, v);
    if(z) out.push(Object.assign({ datum:z, text:`Zahlung fällig (${EURO(vertragJahresbetrag(p, v) != null ? vertragZahlungsbetrag(p, v) : null)}): ${name}`, p, warnTage:14 }, nav));
    const k = vertragKuendigungBis(p, v);
    if(k && st.signed) out.push(Object.assign({ datum:k, text:`Letzter Tag für Kündigung/Verlängerung: ${name}`, p, warnTage:90 }, nav));
    const e = vertragEnde(p, v);
    if(e && st.signed) out.push(Object.assign({ datum:e, text:`Vertragsende (Grundlaufzeit): ${name}`, p, warnTage:180 }, nav));
  });
  return out;
}
function vertragZahlungsbetrag(p, v){
  const j = vertragJahresbetrag(p, v); if(j == null) return null;
  const r = ZAHLUNGS_RHYTHMEN.find(z => z[0] === v.zahlungsRhythmus) || ZAHLUNGS_RHYTHMEN[0];
  return r[2] ? j * r[2] / 12 : j;
}

// ---- Übernahme aus der Flächensicherung -----------------------------------------
// Fasst Flurstücke mit zugeordnetem Eigentümer und begonnener Vertragsanbahnung (ab „Interesse"),
// die noch in keinem Vertrag stecken, zu je einem Vertrag pro Eigentümer, Art (Pacht/Kauf)
// und Status zusammen — unterschiedliche Stände sind in der Praxis getrennte Vereinbarungen,
// und so ändert die Übernahme am Sicherungsstand der Flurstücke nichts. „Eigentümer
// kontaktiert" ist noch kein Vertrag und bleibt außen vor.
const FLST_ZU_VSTATUS = { 'Interesse':'entwurf', 'Vertrag verhandelt':'verhandlung',
  'unterschrieben':'unterschrieben', 'aufgelöst':'beendet' };
function vertragUebernahmeKandidaten(p){
  const gruppen = new Map();
  sicherungRows(p).forEach(r => {
    const ex = r.extra;
    if(!ex.eigentuemerId || !FLST_ZU_VSTATUS[ex.vertragsStatus]) return;
    if(vertragFuerFlurstueck(p, r.fid)) return;
    const key = ex.eigentuemerId + '|' + (ex.sicherungArt === 'Kauf' ? 'kauf' : 'pacht') + '|' + FLST_ZU_VSTATUS[ex.vertragsStatus];
    if(!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(r);
  });
  return [...gruppen.entries()].map(([key, rows]) => ({ key, rows }));
}
function vertraegeAusSicherungUebernehmen(p){
  const kandidaten = vertragUebernahmeKandidaten(p);
  kandidaten.forEach(({ key, rows }) => {
    const [eid, typ, status] = key.split('|');
    const frueheste = k => rows.map(r => r.extra[k]).filter(Boolean).sort()[0] || null;
    const preise = rows.map(r => r.extra.preisProM2).filter(x => x != null);
    const reserv = rows.map(r => Number(r.extra.reservierungsentgelt) || 0).reduce((a, b) => a + b, 0);
    const heute = new Date().toISOString().slice(0,10);
    const v = normalizeVertrag({
      typ, partnerIds:[eid], flurstueckIds: rows.map(r => String(r.fid)), status,
      ruecktrittBis: frueheste('rueckTrittsfrist'), ersteZahlungAm: frueheste('ersteZahlungAm'),
      pachtModell: preise.length ? 'm2' : 'ha', pachtBetrag: preise.length ? preise[0] : null,
      reservierungModell:'pauschal', reservierungBetrag: reserv || null,
      statusHistorie:[{ status, datum:heute, notiz:'Aus der Flächensicherung übernommen' }],
    });
    // Bewusst kein syncVertragZuFlurstuecken: die Übernahme spiegelt nur den vorhandenen Stand.
    // Erst beim Speichern im Vertrag werden dessen Werte (z. B. eine gemeinsame Rücktrittsfrist)
    // auf die Flurstücke übertragen.
    vertraegeVon(p).push(v);
  });
  return kandidaten.length;
}

// ═════════════════════════════════════════════════════════════════════════════
// Tracker (Reiter Grundstück → Verträge)
// ═════════════════════════════════════════════════════════════════════════════
let vertragFilter = 'alle';
const vertragOffen = new Set(); // aufgeklappte Eckdaten-Zeilen

function vertragStatusPill(v){
  const st = VSTATUS_BY_ID[v.status] || VSTATUS[0];
  return `<span class="pill ${st.pill}">${escapeHtml(st.name)}</span>`;
}
// Kleine Fortschrittsleiste Entwurf → Wirksam
function vertragStepper(v){
  const i = VSTATUS_PIPELINE.indexOf(v.status);
  if(i < 0) return '';
  return `<span class="vt-steps" aria-label="Schritt ${i + 1} von ${VSTATUS_PIPELINE.length}">${VSTATUS_PIPELINE.map((s, k) =>
    `<i class="${k <= i ? 'on' : ''}" title="${escapeAttr(VSTATUS_BY_ID[s].name)}"></i>`).join('')}</span>`;
}
function vertragLaufzeitText(p, v){
  if(v.typ === 'kauf') return v.beurkundetAm ? `beurkundet ${fmtDate(v.beurkundetAm)}` : '—';
  if(!v.laufzeitJahre) return '—';
  const verl = v.verlaengerungAnzahl && v.verlaengerungJahre ? ` + ${v.verlaengerungAnzahl}×${v.verlaengerungJahre}` : '';
  const b = vertragBeginn(p, v), e = vertragEnde(p, v);
  const art = (BEGINN_ARTEN.find(a => a[0] === v.beginnArt) || [])[1] || '';
  return `${v.laufzeitJahre} J.${verl}<span class="sub">${b ? `${fmtDate(b)} – ${fmtDate(e)}` : 'Beginn ' + escapeHtml(art)}</span>`;
}
function vertragNaechsteFrist(p, v){
  const f = vertragDeadlines(p).filter(d => d.vid === v.id).sort((a, b) => a.datum.localeCompare(b.datum))[0];
  if(!f) return '—';
  const t = daysUntil(f.datum);
  const was = f.text.split(':')[0].replace(/\s*\(.*\)$/, '');
  return `<span class="${fristPillClass(f.datum, f.warnTage)}">${t < 0 ? `${-t} T. überfällig` : t === 0 ? 'heute' : `in ${t} T.`}</span><span class="sub">${escapeHtml(was)} · ${escapeHtml(fmtDate(f.datum))}</span>`;
}

function renderVertraegeTab(){
  const p = getActiveProject(); if(!p) return;
  const liste = document.getElementById('vertrag-liste'); if(!liste) return;
  const alle = vertraegeVon(p);
  const kandidaten = vertragUebernahmeKandidaten(p);
  const btnU = document.getElementById('btn-vertrag-uebernehmen');
  btnU.classList.toggle('hidden', !kandidaten.length);
  btnU.textContent = `Aus Flächensicherung übernehmen (${kandidaten.length})`;

  // Kennzahlen
  const aktiv = alle.filter(v => !(VSTATUS_BY_ID[v.status] || {}).ende || v.status === 'beendet');
  const signed = alle.filter(v => vertragSigned(v) && v.status !== 'beendet');
  const sichernd = alle.filter(v => (VERTRAGSTYP_BY_ID[v.typ] || {}).sichert && v.status !== 'abgebrochen');
  const flaecheGesichert = sichernd.filter(vertragSigned).reduce((s, v) => s + vertragFlaecheM2(p, v), 0);
  const jahrespacht = signed.reduce((s, v) => s + (vertragJahresbetrag(p, v) || 0), 0);
  const reservierung = alle.filter(v => v.status !== 'abgebrochen').reduce((s, v) => s + (vertragReservierungGesamt(p, v) || 0), 0);
  const naechste = vertragDeadlines(p).sort((a, b) => a.datum.localeCompare(b.datum))[0];
  document.getElementById('vertrag-kpis').innerHTML = alle.length ? [
    `<span><b>${signed.length}</b> von <b>${aktiv.length}</b> unterschrieben</span>`,
    `<span>Gesicherte Fläche <b>${HA(flaecheGesichert)}</b></span>`,
    `<span>Jahrespacht <b>${EURO(jahrespacht)}</b></span>`,
    reservierung ? `<span>Reservierung <b>${EURO(reservierung)}</b></span>` : '',
    naechste ? `<span>Nächste Frist <b>${escapeHtml(fmtDate(naechste.datum))}</b> (${escapeHtml(naechste.text.split(':')[0])})</span>` : '',
  ].join('') : '';

  // Filter-Leiste mit Anzahlen
  const zaehle = id => alle.filter(v => id === 'alle' || (id === 'ende' ? (VSTATUS_BY_ID[v.status] || {}).ende : v.status === id)).length;
  const filter = [['alle','Alle'], ...VSTATUS_PIPELINE.map(id => [id, VSTATUS_BY_ID[id].name]), ['ende','Beendet / abgebrochen']];
  document.getElementById('vertrag-filter').innerHTML = alle.length ? filter.map(([id, name]) =>
    `<button type="button" class="vt-chip${vertragFilter === id ? ' active' : ''}" data-vfilter="${id}" aria-pressed="${vertragFilter === id}">${escapeHtml(name)} <span>${zaehle(id)}</span></button>`).join('') : '';
  document.querySelectorAll('[data-vfilter]').forEach(b => b.addEventListener('click', () => { vertragFilter = b.dataset.vfilter; renderVertraegeTab(); }));

  document.getElementById('vertrag-empty').style.display = alle.length ? 'none' : '';
  const sichtbar = alle.filter(v => vertragFilter === 'alle' || (vertragFilter === 'ende' ? (VSTATUS_BY_ID[v.status] || {}).ende : v.status === vertragFilter));
  if(!alle.length){ liste.innerHTML = ''; return; }
  if(!sichtbar.length){ liste.innerHTML = '<div class="empty">Keine Verträge mit diesem Status.</div>'; return; }

  liste.innerHTML = `<table class="gs-table vt-table">
    <colgroup><col><col style="width:15%"><col style="width:9rem"><col style="width:10rem"><col style="width:8.5rem"><col style="width:10rem"><col style="width:5.5rem"></colgroup>
    <tr><th>Vertrag / Partner</th><th class="num">Fläche</th><th>Status</th><th>Laufzeit</th><th class="num">Jahrespacht</th><th>Nächste Frist</th><th></th></tr>
    ${sichtbar.map(v => {
      const typ = VERTRAGSTYP_BY_ID[v.typ] || VERTRAGSTYP_BY_ID.sonstig;
      const partner = vertragPartnerNamen(p, v);
      const flst = vertragFlurstuecke(p, v);
      const fehlt = vertragFehlendeEckdaten(p, v);
      const letzter = v.statusHistorie[v.statusHistorie.length - 1];
      const offen = vertragOffen.has(v.id);
      const jb = vertragJahresbetrag(p, v);
      return `<tr class="vt-row" data-vopen="${v.id}">
        <td><span class="vt-typ">${escapeHtml(typ.kurz)}</span> <span class="strong">${escapeHtml(vertragTitel(v))}</span>${v.aktenzeichen ? ` <span class="vt-az">${escapeHtml(v.aktenzeichen)}</span>` : ''}
          <span class="sub">${partner.length ? escapeHtml(partner.join(', ')) : 'kein Vertragspartner'}${flst.length ? ` · ${flst.length} Flurstück${flst.length === 1 ? '' : 'e'}` : ''}</span>
          ${fehlt.length ? `<span class="pill warn vt-fehlt" title="${escapeAttr('Nach der Unterzeichnung noch nicht erfasst: ' + fehlt.join(', '))}">${fehlt.length} Eckdat${fehlt.length === 1 ? 'um' : 'en'} fehlen</span>` : ''}</td>
        <td class="num">${vertragFlaecheM2(p, v) ? HA(vertragFlaecheM2(p, v)) : '—'}</td>
        <td>${vertragStatusPill(v)}${vertragStepper(v)}${letzter && letzter.datum ? `<span class="sub">seit ${escapeHtml(fmtDate(letzter.datum))}</span>` : ''}</td>
        <td>${vertragLaufzeitText(p, v)}</td>
        <td class="num">${v.typ === 'kauf' ? (v.kaufpreis != null ? EURO(v.kaufpreis) + '<span class="sub">Kaufpreis</span>' : '—') : EURO(jb)}</td>
        <td>${vertragNaechsteFrist(p, v)}</td>
        <td><div class="gs-row-actions">
          <button type="button" class="secondary small" data-vedit="${v.id}">Bearbeiten</button>
          <button type="button" class="secondary small" data-vtoggle="${v.id}" aria-expanded="${offen}">${offen ? 'Weniger' : 'Eckdaten'}</button>
        </div></td>
      </tr>${offen ? `<tr class="gs-detail-row"><td colspan="7">${vertragEckdatenHtml(p, v)}</td></tr>` : ''}`;
    }).join('')}
  </table>`;
  liste.querySelectorAll('[data-vedit]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openVertragModal(b.dataset.vedit); }));
  liste.querySelectorAll('[data-vtoggle]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const id = b.dataset.vtoggle; vertragOffen.has(id) ? vertragOffen.delete(id) : vertragOffen.add(id); renderVertraegeTab();
  }));
}

// Eckdaten-Übersicht (aufgeklappte Zeile): die nach der Unterzeichnung maßgeblichen Punkte
function vertragEckdatenHtml(p, v){
  const typ = VERTRAGSTYP_BY_ID[v.typ] || {};
  const row = (k, val) => `<div class="vt-kv"><span>${escapeHtml(k)}</span><b>${val == null || val === '' ? '—' : val}</b></div>`;
  const rh = (ZAHLUNGS_RHYTHMEN.find(z => z[0] === v.zahlungsRhythmus) || [])[1];
  const pm = (PACHT_MODELLE.find(m => m[0] === v.pachtModell) || [])[1];
  const pacht = v.pachtBetrag != null && v.pachtBetrag !== ''
    ? (v.pachtModell === 'umsatz' ? `${escapeHtml(String(v.pachtBetrag).replace('.', ','))} % vom Erlös` : `${EURO(v.pachtBetrag)} (${escapeHtml(pm)})`) : null;
  const flst = vertragFlurstuecke(p, v).map(f => `${flurText(f.flur)} · ${f.zaehler ?? ''}${f.nenner ? '/' + f.nenner : ''}`);
  const gruppen = [
    ['Vertrag', [
      row('Art', escapeHtml(typ.name || '—')),
      row('Vertragspartner', escapeHtml(vertragPartnerNamen(p, v).join(', '))),
      row('Flurstücke', flst.length ? escapeHtml(flst.join(', ')) : null),
      row('Fläche', vertragFlaecheM2(p, v) ? HA(vertragFlaecheM2(p, v)) : null),
      row('Unterzeichnet', v.unterschriebenAm ? escapeHtml(fmtDate(v.unterschriebenAm)) : null),
      v.gegengezeichnetAm ? row('Gegengezeichnet', escapeHtml(fmtDate(v.gegengezeichnetAm))) : '',
      v.beurkundetAm ? row('Notariell beurkundet', escapeHtml(fmtDate(v.beurkundetAm))) : '',
    ]],
    typ.verguetung === 'kauf' ? ['Kaufpreis', [
      row('Kaufpreis', v.kaufpreis != null ? EURO(v.kaufpreis) : null),
      row('je m²', v.kaufpreis != null && vertragFlaecheM2(p, v) ? EURO(v.kaufpreis / vertragFlaecheM2(p, v)) : null),
    ]] : ['Laufzeit und Fristen', [
      row('Beginn', vertragBeginn(p, v) ? escapeHtml(fmtDate(vertragBeginn(p, v))) : escapeHtml((BEGINN_ARTEN.find(a => a[0] === v.beginnArt) || [])[1] || '')),
      row('Grundlaufzeit', v.laufzeitJahre ? `${v.laufzeitJahre} Jahre${vertragEnde(p, v) ? ` bis ${escapeHtml(fmtDate(vertragEnde(p, v)))}` : ''}` : null),
      row('Verlängerung', v.verlaengerungAnzahl && v.verlaengerungJahre ? `${v.verlaengerungAnzahl} × ${v.verlaengerungJahre} Jahre${vertragEndeMaximal(p, v) ? ` (max. bis ${escapeHtml(fmtDate(vertragEndeMaximal(p, v)))})` : ''}` : null),
      row('Kündigungsfrist', v.kuendigungsfristMonate ? `${v.kuendigungsfristMonate} Monate${vertragKuendigungBis(p, v) ? ` (bis ${escapeHtml(fmtDate(vertragKuendigungBis(p, v)))})` : ''}` : null),
      row('Rücktrittsrecht bis', v.ruecktrittBis ? escapeHtml(fmtDate(v.ruecktrittBis)) + (v.ruecktrittNotiz ? ` · ${escapeHtml(v.ruecktrittNotiz)}` : '') : null),
    ]],
    typ.verguetung === 'pacht' ? ['Vergütung', [
      row('Pacht', pacht),
      row('Jahrespacht', vertragJahresbetrag(p, v) != null ? EURO(vertragJahresbetrag(p, v)) + (v.pachtModell === 'umsatz' ? ' (Mindestpacht)' : '') : null),
      row('Wertsicherung', escapeHtml({ keine:'keine', vpi:'Indexierung (VPI)', staffel:'Staffelpacht' }[v.wertsicherung] + (v.wertsicherungText ? ' · ' + v.wertsicherungText : ''))),
      row('Umsatzsteuer', escapeHtml({ keine:'nicht ausgewiesen', zzgl:'zzgl. USt', inkl:'inkl. USt' }[v.ust] || '')),
    ]] : null,
    ['Reservierung', [
      row('Entgelt', v.reservierungBetrag != null && v.reservierungBetrag !== '' ? `${EURO(v.reservierungBetrag)}${v.reservierungModell === 'ha' ? ' je ha' : ''}${v.reservierungModell === 'ha' ? ` = ${EURO(vertragReservierungGesamt(p, v))}` : ''}` : null),
      row('bis', v.reservierungBis ? escapeHtml(fmtDate(v.reservierungBis)) : null),
      row('Anrechnung auf Pacht', v.reservierungBetrag != null && v.reservierungBetrag !== '' ? (v.reservierungAnrechnung ? 'ja' : 'nein') : null),
    ]],
    typ.verguetung !== 'keine' ? ['Zahlungsmodalitäten', [
      row('Rhythmus', escapeHtml(rh || '')),
      row('Fälligkeit', escapeHtml(v.faelligkeit || '')),
      row('Betrag je Zahlung', vertragZahlungsbetrag(p, v) != null ? EURO(vertragZahlungsbetrag(p, v)) : null),
      row('Erste Zahlung', v.ersteZahlungAm ? escapeHtml(fmtDate(v.ersteZahlungAm)) : null),
      row('Nächste Zahlung', vertragNaechsteZahlung(p, v) ? escapeHtml(fmtDate(vertragNaechsteZahlung(p, v))) : null),
    ]] : null,
    ['Sicherung und Rückbau', [
      row('Dienstbarkeit', escapeHtml(((DIENSTBARKEIT_STATUS.find(d => d[0] === v.dienstbarkeit) || [])[1] || '') + (v.dienstbarkeitAm ? ' · ' + fmtDate(v.dienstbarkeitAm) : ''))),
      row('Rückbausicherheit', v.rueckbauSicherheit != null && v.rueckbauSicherheit !== '' ? EURO(v.rueckbauSicherheit) : null),
      row('Entschädigungen', escapeHtml(v.entschaedigung || '')),
    ]],
  ].filter(Boolean);
  const verlauf = v.statusHistorie.slice().reverse().map(h =>
    `<li><b>${escapeHtml(fmtDate(h.datum))}</b> ${escapeHtml((VSTATUS_BY_ID[h.status] || {}).name || h.status)}${h.notiz ? ` · ${escapeHtml(h.notiz)}` : ''}</li>`).join('');
  const dateien = v.dateien.length ? v.dateien.map(f => dateiLinkHtml(f, '📎 ' + escapeHtml(f.name))).join(' ') : '';
  return `<div class="vt-eck">${gruppen.map(([t, rows]) => `<section><h4>${escapeHtml(t)}</h4>${rows.join('')}</section>`).join('')}
    <section><h4>Statusverlauf</h4>${verlauf ? `<ul class="vt-verlauf">${verlauf}</ul>` : '<div class="sub">—</div>'}
      ${v.notiz ? `<h4 style="margin-top:var(--sp-2)">Notiz</h4><div class="vt-notiz">${escapeHtml(v.notiz)}</div>` : ''}
      ${dateien ? `<h4 style="margin-top:var(--sp-2)">Dokumente</h4><div class="vt-dateien">${dateien}</div>` : ''}</section>
  </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Eingabemaske (Dialog). Bearbeitet eine Arbeitskopie; erst „Speichern" übernimmt sie.
// ═════════════════════════════════════════════════════════════════════════════
let vtmEntwurf = null;      // Arbeitskopie
let vtmIstNeu = false;
let vtmAlleFlurstuecke = false; // Flurstücksauswahl: nur die der Vertragspartner oder alle
let vtmStatusEintrag = null;     // Index des in dieser Sitzung angelegten Statusverlauf-Eintrags

function openVertragModal(id){
  const p = getActiveProject(); if(!p) return;
  const vorhanden = id ? vertraegeVon(p).find(v => v.id === id) : null;
  vtmIstNeu = !vorhanden;
  vtmEntwurf = normalizeVertrag(JSON.parse(JSON.stringify(vorhanden || {})));
  vtmAlleFlurstuecke = false;
  vtmStatusEintrag = null;
  document.getElementById('vtm-titel').textContent = vtmIstNeu ? 'Neuer Vertrag' : vertragTitel(vtmEntwurf);
  document.getElementById('vtm-sub').textContent = vtmIstNeu ? '' : ((VSTATUS_BY_ID[vtmEntwurf.status] || {}).name || '');
  document.getElementById('vtm-loeschen').classList.toggle('hidden', vtmIstNeu);
  document.getElementById('view-vertrag').classList.remove('hidden');
  renderVertragModal();
  document.getElementById('vtm-body').scrollTop = 0;
}
function closeVertragModal(){
  document.getElementById('view-vertrag').classList.add('hidden');
  vtmEntwurf = null;
}

function renderVertragModal(){
  const p = getActiveProject(); const v = vtmEntwurf; if(!p || !v) return;
  const typ = VERTRAGSTYP_BY_ID[v.typ] || VERTRAGSTYP_BY_ID.sonstig;
  const opt = (liste, wert) => liste.map(([k, l]) => `<option value="${escapeAttr(k)}"${String(wert) === String(k) ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
  const feld = (label, inner, opts) => `<div class="vtm-f${opts && opts.breit ? ' breit' : ''}"><label>${label}</label>${inner}${opts && opts.hilfe ? `<small>${opts.hilfe}</small>` : ''}</div>`;
  const inp = (k, type, extra) => `<input type="${type || 'text'}" data-vk="${k}" value="${escapeAttr(String(v[k] ?? ''))}" ${extra || ''} />`;
  const num = (k, extra) => inp(k, 'number', 'step="any" min="0" ' + (extra || ''));
  const dat = k => inp(k, 'date');

  // Flurstücke: standardmäßig die der gewählten Vertragspartner (plus bereits zugeordnete)
  const alleFlst = ensureFlurstueckIds(p);
  const gewaehlt = new Set(v.flurstueckIds.map(String));
  const partnerSet = new Set(v.partnerIds);
  const flstListe = alleFlst.filter(f => vtmAlleFlurstuecke || gewaehlt.has(String(f.id))
    || partnerSet.has((p.flurstueckDaten[f.id] || {}).eigentuemerId));
  const belegt = fid => (p.vertraege || []).find(x => x.id !== v.id && (VERTRAGSTYP_BY_ID[x.typ] || {}).sichert && typ.sichert && x.flurstueckIds.map(String).includes(String(fid)));
  const flstHtml = flstListe.length ? flstListe.slice(0, 400).map(f => {
    const andere = belegt(f.id);
    const ex = p.flurstueckDaten[f.id] || {};
    const m2 = ex.pachtflaeche != null ? ex.pachtflaeche : f.flaeche;
    return `<label class="vtm-check${andere ? ' belegt' : ''}"><input type="checkbox" data-vflst="${escapeAttr(String(f.id))}" ${gewaehlt.has(String(f.id)) ? 'checked' : ''} />
      <span>${escapeHtml(flurText(f.flur))} · <b>${escapeHtml(`${f.zaehler ?? ''}${f.nenner ? '/' + f.nenner : ''}`)}</b>${m2 != null ? ` · ${Number(m2).toLocaleString('de-DE')} m²` : ''}${andere ? ` · <em>schon in „${escapeHtml(vertragTitel(andere))}"</em>` : ''}</span></label>`;
  }).join('') + (flstListe.length > 400 ? `<div class="sub">… ${flstListe.length - 400} weitere — bitte Vertragspartner wählen, um die Liste einzugrenzen.</div>` : '')
    : `<div class="sub">${v.partnerIds.length ? 'Den gewählten Vertragspartnern sind keine Flurstücke zugeordnet.' : 'Zuerst Vertragspartner wählen — dann erscheinen deren Flurstücke.'}</div>`;
  const partnerHtml = p.eigentuemer.length ? p.eigentuemer.map(e =>
    `<label class="vtm-check"><input type="checkbox" data-vpartner="${escapeAttr(e.id)}" ${partnerSet.has(e.id) ? 'checked' : ''} /><span>${escapeHtml(e.name || '(unbenannt)')}</span></label>`).join('')
    : '<div class="sub">Noch keine Eigentümer angelegt (Reiter Eigentümer).</div>';

  const flaeche = vertragFlaecheM2(p, v);
  const jb = vertragJahresbetrag(p, v);
  const signed = vertragSigned(v);
  const berechnet = (label, wert) => `<div class="vtm-calc"><span>${label}</span><b>${wert}</b></div>`;

  document.getElementById('vtm-body').innerHTML = `
    <section class="vtm-sec">
      <h3>Vertrag</h3>
      <div class="vtm-grid">
        ${feld('Vertragsart', `<select data-vk="typ">${opt(VERTRAGSTYPEN.map(t => [t.id, t.name]), v.typ)}</select>`, { breit:true })}
        ${feld('Bezeichnung', inp('bezeichnung', 'text', `placeholder="${escapeAttr(typ.name)}"`))}
        ${feld('Vertragsnummer / Aktenzeichen', inp('aktenzeichen', 'text', 'placeholder="PV-2026-001"'))}
      </div>
    </section>

    <section class="vtm-sec">
      <h3>Vertragspartner und Flächen</h3>
      <div class="vtm-grid">
        ${feld('Vertragspartner (Eigentümer)', `<div class="vtm-checks">${partnerHtml}</div>`, { breit:true })}
        ${feld(`Flurstücke <button type="button" class="linklike" id="vtm-flst-alle">${vtmAlleFlurstuecke ? 'nur die der Vertragspartner zeigen' : 'alle Flurstücke zeigen'}</button>`,
          `<div class="vtm-checks vtm-flst">${flstHtml}</div>`, { breit:true })}
        ${feld('Vertragsfläche in m² (optional)', num('flaecheM2', `placeholder="${flaeche ? Math.round(flaeche) : ''}"`),
          { hilfe:'Leer lassen = Summe der Pachtflächen der gewählten Flurstücke.' })}
        ${berechnet('Vertragsfläche', flaeche ? `${Math.round(flaeche).toLocaleString('de-DE')} m²${flaeche >= 10000 ? ` (${HA(flaeche)})` : ''}` : '—')}
      </div>
    </section>

    <section class="vtm-sec">
      <h3>Status und Unterzeichnung</h3>
      <div class="vtm-grid">
        ${feld('Status', `<select data-vk="status">${opt(VSTATUS.map(s => [s.id, s.name]), v.status)}</select>`,
          { hilfe:'Jede Änderung wird mit Datum im Statusverlauf festgehalten.' })}
        ${feld('Notiz zur Statusänderung', `<input type="text" id="vtm-status-notiz" placeholder="z. B. Entwurf per Post versandt" />`)}
        ${feld('Angebot / Entwurf versandt', dat('angebotAm'))}
        ${feld('Unterzeichnet (Signing)', dat('unterschriebenAm'), { hilfe: signed && !v.unterschriebenAm ? '<span class="vtm-warn">Bitte Datum der Unterzeichnung eintragen.</span>' : '' })}
        ${feld('Gegengezeichnet', dat('gegengezeichnetAm'))}
        ${v.typ === 'kauf' || v.dienstbarkeit !== 'keine' ? feld('Notariell beurkundet', dat('beurkundetAm')) : ''}
      </div>
    </section>

    ${typ.verguetung === 'kauf' ? `
    <section class="vtm-sec">
      <h3>Kaufpreis</h3>
      <div class="vtm-grid">
        ${feld('Kaufpreis gesamt (€)', num('kaufpreis'))}
        ${berechnet('Kaufpreis je m²', v.kaufpreis != null && v.kaufpreis !== '' && flaeche ? EURO(v.kaufpreis / flaeche) : '—')}
        ${feld('Rücktrittsrecht bis', dat('ruecktrittBis'))}
        ${feld('Rücktritt: Bedingung', inp('ruecktrittNotiz', 'text', 'placeholder="z. B. falls keine Baugenehmigung"'))}
      </div>
    </section>` : `
    <section class="vtm-sec">
      <h3>Laufzeit und Fristen</h3>
      <div class="vtm-grid">
        ${feld('Vertragsbeginn', `<select data-vk="beginnArt">${opt(BEGINN_ARTEN, v.beginnArt)}</select>`)}
        ${feld(v.beginnArt === 'datum' ? 'Beginn am' : 'Beginn am (falls schon bekannt)', dat('beginnAm'))}
        ${feld('Grundlaufzeit (Jahre)', num('laufzeitJahre', 'placeholder="30"'))}
        ${feld('Verlängerungsoption', `<div class="vtm-inline">${num('verlaengerungAnzahl', 'placeholder="2"')}<span>×</span>${num('verlaengerungJahre', 'placeholder="5"')}<span>Jahre</span></div>`)}
        ${feld('Kündigungsfrist (Monate vor Ende)', num('kuendigungsfristMonate', 'placeholder="12"'))}
        ${feld('Rücktrittsrecht bis', dat('ruecktrittBis'), { hilfe:'Erscheint als Frist in „Als Nächstes" und im Kalender.' })}
        ${feld('Rücktritt: Bedingung', inp('ruecktrittNotiz', 'text', 'placeholder="z. B. falls kein Netzanschluss bis 2028"'), { breit:true })}
        ${berechnet('Beginn', vertragBeginn(p, v) ? fmtDate(vertragBeginn(p, v)) : '—')}
        ${berechnet('Ende Grundlaufzeit', vertragEnde(p, v) ? fmtDate(vertragEnde(p, v)) : '—')}
        ${berechnet('Ende mit Verlängerung', vertragEndeMaximal(p, v) ? fmtDate(vertragEndeMaximal(p, v)) : '—')}
        ${berechnet('Kündigung spätestens', vertragKuendigungBis(p, v) ? fmtDate(vertragKuendigungBis(p, v)) : '—')}
      </div>
    </section>`}

    ${typ.verguetung === 'pacht' ? `
    <section class="vtm-sec">
      <h3>Vergütung</h3>
      <div class="vtm-grid">
        ${feld('Pachtmodell', `<select data-vk="pachtModell">${opt(PACHT_MODELLE, v.pachtModell)}</select>`)}
        ${feld(v.pachtModell === 'umsatz' ? 'Anteil am Stromerlös (%)' : 'Pachthöhe (€)', num('pachtBetrag', `placeholder="${v.pachtModell === 'ha' ? '2500' : v.pachtModell === 'm2' ? '0,25' : v.pachtModell === 'umsatz' ? '5' : '10000'}"`))}
        ${v.pachtModell === 'umsatz' ? feld('Mindestpacht je Jahr (€)', num('pachtMindest')) : ''}
        ${feld('Wertsicherung', `<select data-vk="wertsicherung">${opt([['keine','keine'],['vpi','Indexierung (VPI)'],['staffel','Staffelpacht']], v.wertsicherung)}</select>`)}
        ${v.wertsicherung !== 'keine' ? feld('Wertsicherung: Regelung', inp('wertsicherungText', 'text', 'placeholder="z. B. Anpassung alle 5 Jahre bei ±10 % VPI"'), { breit:true }) : ''}
        ${feld('Umsatzsteuer', `<select data-vk="ust">${opt([['keine','nicht ausgewiesen'],['zzgl','zzgl. USt'],['inkl','inkl. USt']], v.ust)}</select>`)}
        ${berechnet('Jahrespacht', jb != null ? EURO(jb) + (v.pachtModell === 'umsatz' ? ' (Mindestpacht)' : '') : '—')}
      </div>
    </section>` : ''}

    <section class="vtm-sec">
      <h3>Reservierung</h3>
      <div class="vtm-grid">
        ${feld('Reservierungsentgelt', `<div class="vtm-inline">${num('reservierungBetrag', 'placeholder="0"')}<select data-vk="reservierungModell">${opt([['pauschal','€ pauschal'],['ha','€ je ha']], v.reservierungModell)}</select></div>`)}
        ${feld('Reservierung gilt bis', dat('reservierungBis'))}
        ${feld('Anrechnung auf die Pacht', `<label class="vtm-check"><input type="checkbox" data-vk="reservierungAnrechnung" ${v.reservierungAnrechnung ? 'checked' : ''} /><span>wird auf die spätere Pacht angerechnet</span></label>`)}
        ${berechnet('Reservierung gesamt', vertragReservierungGesamt(p, v) != null ? EURO(vertragReservierungGesamt(p, v)) : '—')}
      </div>
    </section>

    ${typ.verguetung !== 'keine' ? `
    <section class="vtm-sec">
      <h3>Zahlungsmodalitäten</h3>
      <div class="vtm-grid">
        ${feld('Zahlungsrhythmus', `<select data-vk="zahlungsRhythmus">${opt(ZAHLUNGS_RHYTHMEN.map(z => [z[0], z[1]]), v.zahlungsRhythmus)}</select>`)}
        ${feld('Fälligkeit', inp('faelligkeit', 'text', 'placeholder="jeweils zum 15.01. im Voraus"'))}
        ${feld('Erste Zahlung am', dat('ersteZahlungAm'))}
        ${berechnet('Betrag je Zahlung', vertragZahlungsbetrag(p, v) != null ? EURO(vertragZahlungsbetrag(p, v)) : '—')}
        ${berechnet('Nächste Zahlung', vertragNaechsteZahlung(p, v) ? fmtDate(vertragNaechsteZahlung(p, v)) : (signed ? '—' : 'ab Unterzeichnung'))}
      </div>
    </section>` : ''}

    <section class="vtm-sec">
      <h3>Grundbuch und Rückbau</h3>
      <div class="vtm-grid">
        ${feld('Dienstbarkeit', `<select data-vk="dienstbarkeit">${opt(DIENSTBARKEIT_STATUS, v.dienstbarkeit)}</select>`)}
        ${v.dienstbarkeit !== 'keine' ? feld('Datum (Bewilligung / Eintragung)', dat('dienstbarkeitAm')) : ''}
        ${typ.id !== 'kauf' ? feld('Rückbausicherheit / Bürgschaft (€)', num('rueckbauSicherheit')) : ''}
        ${feld('Entschädigungen (Aufwuchs, Flurschaden …)', inp('entschaedigung', 'text'), { breit:true })}
      </div>
    </section>

    <section class="vtm-sec">
      <h3>Notizen und Dokumente</h3>
      <div class="vtm-grid">
        ${feld('Notiz', `<textarea data-vk="notiz" rows="3">${escapeHtml(v.notiz || '')}</textarea>`, { breit:true })}
        ${feld('Dokumente (z. B. unterschriebener Vertrag)', `<div class="vtm-dateien">${v.dateien.map(f =>
          `<span class="doku-file">${dateiLinkHtml(f, '📎 ' + escapeHtml(f.name))}<button type="button" class="doku-file-x" data-vdel="${escapeAttr(f.id)}" title="Datei entfernen">×</button></span>`).join('')}
          <button type="button" class="secondary small" id="vtm-datei">+ Datei anhängen</button></div>`, { breit:true })}
      </div>
    </section>
    ${v.statusHistorie.length ? `<section class="vtm-sec"><h3>Statusverlauf</h3><ul class="vt-verlauf">${v.statusHistorie.slice().reverse().map(h =>
      `<li><b>${escapeHtml(fmtDate(h.datum))}</b> ${escapeHtml((VSTATUS_BY_ID[h.status] || {}).name || h.status)}${h.notiz ? ` · ${escapeHtml(h.notiz)}` : ''}</li>`).join('')}</ul></section>` : ''}
  `;
  bindVertragModal();
}

// Statuswechsel im Dialog: ein Verlaufseintrag je Sitzung (mehrfaches Umschalten ersetzt ihn),
// die Notiz dazu wird live nachgetragen. Unterzeichnung ohne Datum → heute als Vorschlag.
function statusGeaendert(v, status){
  const heute = new Date().toISOString().slice(0,10);
  const notiz = (document.getElementById('vtm-status-notiz') || {}).value || '';
  if(vtmStatusEintrag != null) v.statusHistorie[vtmStatusEintrag] = { status, datum:heute, notiz };
  else { v.statusHistorie.push({ status, datum:heute, notiz }); vtmStatusEintrag = v.statusHistorie.length - 1; }
  if((VSTATUS_BY_ID[status] || {}).signed && !v.unterschriebenAm) v.unterschriebenAm = heute;
}

function bindVertragModal(){
  const body = document.getElementById('vtm-body'); const v = vtmEntwurf; if(!v) return;
  // Felder, deren Änderung Aufbau oder Berechnungen der Maske verändert → neu rendern
  const strukturell = new Set(['typ','beginnArt','pachtModell','wertsicherung','dienstbarkeit','flaecheM2','pachtBetrag','pachtMindest',
    'laufzeitJahre','verlaengerungAnzahl','verlaengerungJahre','kuendigungsfristMonate','beginnAm','unterschriebenAm','kaufpreis',
    'reservierungBetrag','reservierungModell','zahlungsRhythmus','ersteZahlungAm','status']);
  const neuAufbauen = () => { const pos = body.scrollTop; renderVertragModal(); document.getElementById('vtm-body').scrollTop = pos; };
  body.querySelectorAll('[data-vk]').forEach(el => {
    const k = el.dataset.vk;
    const wert = () => el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : (el.value || (el.type === 'date' ? null : ''));
    if(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date'){
      el.addEventListener('change', () => {
        if(k === 'status') statusGeaendert(v, el.value);
        v[k] = wert();
        if(strukturell.has(k)) neuAufbauen();
      });
    } else {
      // Tippen: nur speichern (Fokus bleibt); Berechnungen beim Verlassen des Felds aktualisieren
      el.addEventListener('input', () => { v[k] = wert(); });
      if(strukturell.has(k)) el.addEventListener('change', neuAufbauen);
    }
  });
  const notizEl = document.getElementById('vtm-status-notiz');
  if(notizEl){
    if(vtmStatusEintrag != null) notizEl.value = v.statusHistorie[vtmStatusEintrag].notiz || '';
    notizEl.addEventListener('input', () => { if(vtmStatusEintrag != null) v.statusHistorie[vtmStatusEintrag].notiz = notizEl.value; });
  }
  body.querySelectorAll('[data-vpartner]').forEach(el => el.addEventListener('change', () => {
    const id = el.dataset.vpartner;
    v.partnerIds = el.checked ? [...new Set([...v.partnerIds, id])] : v.partnerIds.filter(x => x !== id);
    // Neu gewählter Partner: seine Flurstücke gleich mit auswählen (abwählen bleibt Handarbeit)
    const p = getActiveProject();
    if(el.checked) ensureFlurstueckIds(p).forEach(f => {
      if((p.flurstueckDaten[f.id] || {}).eigentuemerId === id && !v.flurstueckIds.includes(String(f.id))) v.flurstueckIds.push(String(f.id));
    });
    const pos = body.scrollTop; renderVertragModal(); body.scrollTop = pos;
  }));
  body.querySelectorAll('[data-vflst]').forEach(el => el.addEventListener('change', () => {
    const id = el.dataset.vflst;
    v.flurstueckIds = el.checked ? [...new Set([...v.flurstueckIds, id])] : v.flurstueckIds.filter(x => x !== id);
    const pos = body.scrollTop; renderVertragModal(); body.scrollTop = pos;
  }));
  document.getElementById('vtm-flst-alle')?.addEventListener('click', () => {
    vtmAlleFlurstuecke = !vtmAlleFlurstuecke; const pos = body.scrollTop; renderVertragModal(); body.scrollTop = pos;
  });
  document.getElementById('vtm-datei')?.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
    inp.addEventListener('change', async () => {
      await attachVertragDateien(getActiveProject(), v, inp.files);
      const pos = body.scrollTop; renderVertragModal(); body.scrollTop = pos;
    });
    inp.click();
  });
  body.querySelectorAll('[data-vdel]').forEach(b => b.addEventListener('click', () => {
    if(!confirm('Diese Datei entfernen?')) return;
    const f = v.dateien.find(x => x.id === b.dataset.vdel);
    v.dateien = v.dateien.filter(x => x.id !== b.dataset.vdel);
    if(f && f.storagePath && window.sb) window.sb.storage.from(DOKU_BUCKET).remove([f.storagePath])
      .then(({ error }) => { if(error) console.warn('Vertragsdatei nicht gelöscht:', error); });
    const pos = body.scrollTop; renderVertragModal(); body.scrollTop = pos;
  }));
}

// Dateien am Vertrag: mit Supabase im Storage (projects/<pid>/vertrag-<id>/…), sonst als dataUrl
async function attachVertragDateien(p, v, fileList){
  const files = Array.from(fileList || []);
  for(const file of files){
    const id = 'f' + Date.now() + Math.random().toString(36).slice(2,7);
    const entry = { id, name:file.name, mime:file.type || '', size:file.size, addedAt:new Date().toISOString() };
    try {
      if(window.sb){
        entry.storagePath = storageDateiPfad(p.id, 'vertrag-' + v.id, id, file.name);
        await ladeDateiHoch(entry.storagePath, file, file.type);
      } else {
        if(file.size > DOKU_FILE_WARN_BYTES && !confirm(`„${file.name}" ist ${fmtBytes(file.size)} groß. Große Dateien können den lokalen Speicher sprengen. Trotzdem anhängen?`)) continue;
        entry.dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      }
      v.dateien.push(entry);
    } catch(err){ alert(`„${file.name}" konnte nicht hochgeladen werden: ${err.message || err}`); }
  }
}

function speichereVertragModal(){
  const p = getActiveProject(); const v = vtmEntwurf; if(!p || !v) return;
  if(!v.partnerIds.length && !v.flurstueckIds.length && !v.bezeichnung){
    alert('Bitte mindestens einen Vertragspartner, ein Flurstück oder eine Bezeichnung angeben.'); return;
  }
  // Belegte Flurstücke: ein Flurstück kann nur von einem sichernden Vertrag geführt werden
  const typ = VERTRAGSTYP_BY_ID[v.typ] || {};
  if(typ.sichert){
    const konflikt = v.flurstueckIds.filter(fid => (p.vertraege || []).some(x => x.id !== v.id && (VERTRAGSTYP_BY_ID[x.typ] || {}).sichert
      && !(VSTATUS_BY_ID[x.status] || {}).ende && x.flurstueckIds.map(String).includes(String(fid))));
    if(konflikt.length && !confirm(`${konflikt.length} Flurstück(e) stecken bereits in einem anderen laufenden Pacht-/Kaufvertrag. Trotzdem speichern? Der Sicherungsstand dieser Flurstücke folgt dann diesem Vertrag.`)) return;
  }
  if(vtmIstNeu && !v.statusHistorie.length) v.statusHistorie.push({ status:v.status, datum:new Date().toISOString().slice(0,10), notiz:'Angelegt' });
  const liste = vertraegeVon(p);
  const i = liste.findIndex(x => x.id === v.id);
  if(i >= 0) liste[i] = v; else liste.push(v);
  syncVertragZuFlurstuecken(p, v);
  touchActiveProject(); saveProjects();
  logAction(p, `${vtmIstNeu ? 'Vertrag angelegt' : 'Vertrag geändert'}: ${vertragTitel(v)} (${(VSTATUS_BY_ID[v.status] || {}).name || v.status})`);
  closeVertragModal();
  renderVertraegeTab(); renderSicherungTable(); renderNavBadges(p);
  toast('Vertrag gespeichert');
}

document.getElementById('btn-vertrag-neu').addEventListener('click', () => openVertragModal(null));
document.getElementById('btn-vertrag-uebernehmen').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  const k = vertragUebernahmeKandidaten(p);
  if(!k.length) return;
  const flst = k.reduce((s, g) => s + g.rows.length, 0);
  if(!confirm(`${k.length} Vertrag/Verträge aus der Flächensicherung anlegen (${flst} Flurstücke, je Eigentümer und Art ein Vertrag)?\n\nStatus, Rücktrittsfrist, Preis je m², Reservierung und erste Zahlung werden übernommen. Fehlende Eckdaten (Laufzeit, Zahlungsmodalitäten …) danach im Vertrag ergänzen.`)) return;
  const n = vertraegeAusSicherungUebernehmen(p);
  touchActiveProject(); saveProjects();
  logAction(p, `${n} Vertrag/Verträge aus der Flächensicherung übernommen`);
  renderVertraegeTab(); renderNavBadges(p);
  toast(`${n} Vertrag/Verträge übernommen`);
});
document.getElementById('btn-vertrag-export').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  const rows = [['Art','Bezeichnung','Aktenzeichen','Vertragspartner','Flurstücke','Fläche m²','Status','Unterzeichnet','Beginn','Laufzeit Jahre','Ende Grundlaufzeit',
    'Verlängerung','Kündigungsfrist Monate','Rücktrittsrecht bis','Pachtmodell','Pachthöhe','Jahrespacht €','Wertsicherung','Reservierung €','Reservierung bis',
    'Zahlungsrhythmus','Fälligkeit','Erste Zahlung','Nächste Zahlung','Kaufpreis €','Dienstbarkeit','Rückbausicherheit €','Notiz']];
  vertraegeVon(p).forEach(v => rows.push([
    (VERTRAGSTYP_BY_ID[v.typ] || {}).name || v.typ, v.bezeichnung, v.aktenzeichen, vertragPartnerNamen(p, v).join(', '),
    vertragFlurstuecke(p, v).map(f => `${flurText(f.flur)} ${f.zaehler ?? ''}${f.nenner ? '/' + f.nenner : ''}`).join(', '),
    Math.round(vertragFlaecheM2(p, v)) || '', (VSTATUS_BY_ID[v.status] || {}).name || v.status, v.unterschriebenAm || '', vertragBeginn(p, v) || '',
    v.laufzeitJahre ?? '', vertragEnde(p, v) || '', v.verlaengerungAnzahl && v.verlaengerungJahre ? `${v.verlaengerungAnzahl}×${v.verlaengerungJahre} J.` : '',
    v.kuendigungsfristMonate ?? '', v.ruecktrittBis || '', (PACHT_MODELLE.find(m => m[0] === v.pachtModell) || [])[1] || '', v.pachtBetrag ?? '',
    vertragJahresbetrag(p, v) != null ? Math.round(vertragJahresbetrag(p, v) * 100) / 100 : '', v.wertsicherung + (v.wertsicherungText ? ': ' + v.wertsicherungText : ''),
    vertragReservierungGesamt(p, v) ?? '', v.reservierungBis || '', (ZAHLUNGS_RHYTHMEN.find(z => z[0] === v.zahlungsRhythmus) || [])[1] || '',
    v.faelligkeit, v.ersteZahlungAm || '', vertragNaechsteZahlung(p, v) || '', v.kaufpreis ?? '',
    (DIENSTBARKEIT_STATUS.find(d => d[0] === v.dienstbarkeit) || [])[1] || '', v.rueckbauSicherheit ?? '', v.notiz,
  ]));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Verträge');
  XLSX.writeFile(wb, `Vertragsliste_${fileBase()}.xlsx`);
});
document.getElementById('vtm-speichern').addEventListener('click', speichereVertragModal);
document.getElementById('vtm-abbrechen').addEventListener('click', closeVertragModal);
document.getElementById('vtm-close').addEventListener('click', closeVertragModal);
document.getElementById('view-vertrag').addEventListener('click', e => { if(e.target.id === 'view-vertrag') closeVertragModal(); });
document.getElementById('vtm-loeschen').addEventListener('click', () => {
  const p = getActiveProject(); const v = vtmEntwurf; if(!p || !v) return;
  if(!confirm(`Vertrag „${vertragTitel(v)}" löschen? Der Sicherungsstand der Flurstücke bleibt unverändert.`)) return;
  p.vertraege = vertraegeVon(p).filter(x => x.id !== v.id);
  const pfade = v.dateien.map(f => f.storagePath).filter(Boolean);
  if(pfade.length && window.sb) window.sb.storage.from(DOKU_BUCKET).remove(pfade);
  touchActiveProject(); saveProjects();
  logAction(p, `Vertrag gelöscht: ${vertragTitel(v)}`);
  closeVertragModal(); renderVertraegeTab(); renderSicherungTable(); renderNavBadges(p);
});
document.getElementById('vtm-entwurf').addEventListener('click', () => {
  const p = getActiveProject(); const v = vtmEntwurf; if(!p || !v) return;
  const owner = p.eigentuemer.find(e => e.id === v.partnerIds[0]);
  if(!owner){ alert('Bitte zuerst einen Vertragspartner wählen.'); return; }
  closeVertragModal();
  switchGrundstueckSubtab('eigentuemer');
  renderPachtvertragPreview(p, owner);
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && !document.getElementById('view-vertrag').classList.contains('hidden')) closeVertragModal();
});
