// Kostenerfassung (Reiter „Kosten"): Belege und Kostenbescheide je Projekt, Übersicht nach
// Kategorien und spezifische Kosten je kWp (DC) und kW (AC)
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Datenmodell: p.kosten = [Kostenposition]. Eine Position ist ein Beleg (Rechnung, Quittung,
// Gutschrift) oder ein Kostenbescheid einer Behörde — mit Betrag (netto ODER brutto erfasst,
// je nachdem, was auf dem Beleg steht), USt-Satz, Kategorie, Zahlungsstand und dem Beleg
// selbst als Datei. Kennzahlen je kWp/kW rechnen immer mit den Nettobeträgen: die Umsatz-
// steuer ist für die Projektgesellschaft in aller Regel Vorsteuer und keine Projektkosten.
// Bezugsgröße sind p.powerDcKwp / p.powerAcKw (dieselben Felder wie „Technische Planung").
// ═════════════════════════════════════════════════════════════════════════════

const KOSTEN_ARTEN = [
  { id:'rechnung',   name:'Rechnung',                  kurz:'Rechnung',   aussteller:'Rechnungssteller', nummer:'Rechnungsnummer',              datum:'Rechnungsdatum', ust:19, erfassung:'netto',  vorzeichen:1 },
  { id:'bescheid',   name:'Kostenbescheid (Behörde)',  kurz:'Bescheid',   aussteller:'Behörde',          nummer:'Aktenzeichen / Kassenzeichen', datum:'Bescheiddatum',  ust:0,  erfassung:'brutto', vorzeichen:1, kategorie:'genehmigung' },
  { id:'quittung',   name:'Quittung / Kassenbeleg',    kurz:'Quittung',   aussteller:'Aussteller',       nummer:'Belegnummer',                  datum:'Belegdatum',     ust:19, erfassung:'brutto', vorzeichen:1 },
  { id:'gutschrift', name:'Gutschrift / Erstattung',   kurz:'Gutschrift', aussteller:'Aussteller',       nummer:'Belegnummer',                  datum:'Belegdatum',     ust:19, erfassung:'netto',  vorzeichen:-1 },
  { id:'sonstig',    name:'Sonstiger Beleg',           kurz:'Beleg',      aussteller:'Aussteller',       nummer:'Belegnummer',                  datum:'Belegdatum',     ust:19, erfassung:'netto',  vorzeichen:1 },
];
const KOSTEN_ART_BY_ID = Object.fromEntries(KOSTEN_ARTEN.map(a => [a.id, a]));

const KOSTEN_KATEGORIEN = [
  { id:'flaeche',     name:'Flächensicherung',         hinweis:'Reservierungsentgelte, Pacht vor Baubeginn, Kaufpreise' },
  { id:'kataster',    name:'Kataster und Auskünfte',   hinweis:'ALK/ALB, Grundbuchauszüge, Altlasten-, Baulasten-, Kampfmittelauskunft' },
  { id:'gutachten',   name:'Gutachten',                hinweis:'Artenschutz, Umweltbericht, Blend, Baugrund, Brandschutz' },
  { id:'planung',     name:'Planung und Engineering',  hinweis:'Vermessung, Topographie, Layout, B-Planer, Architekt' },
  { id:'genehmigung', name:'Genehmigung und Gebühren', hinweis:'Baugenehmigungs- und Verwaltungsgebühren, Planungskosten der Gemeinde' },
  { id:'netz',        name:'Netzanschluss',            hinweis:'Baukostenzuschuss, Netzanschlusskosten, Reifegradverfahren, Trasse' },
  { id:'ausgleich',   name:'Ausgleich und Maßnahmen',  hinweis:'Ökopunkte, CEF- und A&E-Maßnahmen' },
  { id:'recht',       name:'Recht und Notar',          hinweis:'Rechtsberatung, Notar, Beurkundung, Grundbucheintragung' },
  { id:'komponenten', name:'Komponenten',              hinweis:'Module, Wechselrichter, Speicher, Trafo, Unterkonstruktion' },
  { id:'bau',         name:'Bau und Montage',          hinweis:'Tiefbau, Montage, Zaun, Zuwegung, Inbetriebnahme' },
  { id:'sonstig',     name:'Sonstiges',                hinweis:'' },
];
const KOSTEN_KAT_BY_ID = Object.fromEntries(KOSTEN_KATEGORIEN.map(k => [k.id, k]));
const UST_SAETZE = [19, 7, 0];

function normalizeKosten(k){
  k = k || {};
  const art = KOSTEN_ART_BY_ID[k.art] ? k.art : 'rechnung';
  const a = KOSTEN_ART_BY_ID[art];
  const zahl = v => (v === '' || v == null || Number.isNaN(Number(v))) ? null : Number(v);
  return Object.assign({
    id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    bezeichnung:'', aussteller:'', nummer:'', belegDatum:null,
    faelligAm:null, bezahltAm:null,
    zugegangenAm:null, widerspruchBis:null, widerspruchEingelegt:false, // nur Kostenbescheide
    notiz:'', angelegtAm: new Date().toISOString(),
  }, k, {
    art,
    kategorie: KOSTEN_KAT_BY_ID[k.kategorie] ? k.kategorie : (a.kategorie || 'sonstig'),
    betrag: zahl(k.betrag),
    betragArt: k.betragArt === 'brutto' || k.betragArt === 'netto' ? k.betragArt : a.erfassung,
    ustSatz: zahl(k.ustSatz) ?? a.ust,
    dateien: Array.isArray(k.dateien) ? k.dateien : [],
  });
}
function kostenVon(p){
  if(!Array.isArray(p.kosten)) p.kosten = [];
  p.kosten = p.kosten.map(normalizeKosten);
  return p.kosten;
}

// ---- Berechnungen ----------------------------------------------------------
// Beträge immer mit Cent (auch 1.200,00 €), damit die Spalten sauber untereinander stehen
const EUR2 = n => n == null || Number.isNaN(Number(n)) ? '—'
  : Number(n).toLocaleString('de-DE', { style:'currency', currency:'EUR', minimumFractionDigits:2, maximumFractionDigits:2 });
const ZAHL = n => Number(n).toLocaleString('de-DE', { maximumFractionDigits:2 });
const rund2 = n => Math.round(n * 100) / 100;

function kostenVorzeichen(k){ return (KOSTEN_ART_BY_ID[k.art] || {}).vorzeichen || 1; }
function kostenNetto(k){
  if(k.betrag == null) return 0;
  const u = Number(k.ustSatz) || 0;
  return rund2(kostenVorzeichen(k) * (k.betragArt === 'brutto' ? k.betrag / (1 + u / 100) : k.betrag));
}
function kostenBrutto(k){
  if(k.betrag == null) return 0;
  const u = Number(k.ustSatz) || 0;
  return rund2(kostenVorzeichen(k) * (k.betragArt === 'brutto' ? k.betrag : k.betrag * (1 + u / 100)));
}
// Widerspruch gegen einen Bescheid: ein Monat ab Bekanntgabe (§ 70 VwGO), sofern die
// Rechtsbehelfsbelehrung nichts anderes sagt. Ohne eigenes Datum aus dem Zugang abgeleitet.
function kostenWiderspruchBis(k){
  if(k.art !== 'bescheid') return null;
  return k.widerspruchBis || (k.zugegangenAm ? isoPlus(k.zugegangenAm, 0, 1) : null);
}
function kostenStatus(k){
  if(k.bezahltAm) return 'bezahlt';
  if(k.faelligAm && daysUntil(k.faelligAm) < 0) return 'ueberfaellig';
  return 'offen';
}
function kostenTitel(k){
  const a = KOSTEN_ART_BY_ID[k.art] || KOSTEN_ART_BY_ID.sonstig;
  return k.bezeichnung || (k.nummer ? `${a.kurz} ${k.nummer}` : a.name);
}
// Summen über eine Liste von Positionen + spezifische Kosten je kWp (DC) / kW (AC).
// „Offen" zählt nur echte Zahlungen (keine Gutschriften) — die sind es, die jemand anstoßen muss.
function kostenSummen(p, liste){
  liste = liste || kostenVon(p);
  const s = { anzahl:liste.length, netto:0, brutto:0, bezahltBrutto:0, offenBrutto:0, offenAnzahl:0, ueberfaelligBrutto:0, ueberfaelligAnzahl:0 };
  liste.forEach(k => {
    const n = kostenNetto(k), b = kostenBrutto(k);
    s.netto += n; s.brutto += b;
    const st = kostenStatus(k);
    if(st === 'bezahlt') s.bezahltBrutto += b;
    else if(kostenVorzeichen(k) > 0){
      s.offenBrutto += b; s.offenAnzahl++;
      if(st === 'ueberfaellig'){ s.ueberfaelligBrutto += b; s.ueberfaelligAnzahl++; }
    }
  });
  s.netto = rund2(s.netto); s.brutto = rund2(s.brutto); s.ust = rund2(s.brutto - s.netto);
  s.jeKwp = p.powerDcKwp > 0 ? s.netto / p.powerDcKwp : null;
  s.jeKw  = p.powerAcKw  > 0 ? s.netto / p.powerAcKw  : null;
  return s;
}
function kostenJe(netto, leistung){ return leistung > 0 ? netto / leistung : null; }
// Anzahl offener Zahlungen — Zähler in der Projektnavigation
function kostenOffenAnzahl(p){ return (p.kosten || []).length ? kostenSummen(p).offenAnzahl : 0; }

// ---- Fristen für „Als Nächstes", Fristen-Dashboard und Kalender -----------------
function kostenDeadlines(p){
  const out = [];
  (p.kosten || []).map(normalizeKosten).forEach(k => {
    const name = kostenTitel(k) + (k.aussteller ? ' · ' + k.aussteller : '');
    if(!k.bezahltAm && k.faelligAm && kostenVorzeichen(k) > 0)
      out.push({ datum:k.faelligAm, text:`Zahlung fällig (${EUR2(kostenBrutto(k))}): ${name}`, p, tab:'kosten', kid:k.id, warnTage:14 });
    const w = kostenWiderspruchBis(k);
    if(w && !k.widerspruchEingelegt && daysUntil(w) >= 0)
      out.push({ datum:w, text:`Widerspruchsfrist Kostenbescheid endet: ${name}`, p, tab:'kosten', kid:k.id, warnTage:10 });
  });
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// Reiter „Kosten": Kennzahlen, Übersicht nach Kategorie, Belegliste
// ═════════════════════════════════════════════════════════════════════════════
let kostenFilter = 'alle';     // alle | rechnung | bescheid | offen | ueberfaellig | bezahlt
let kostenKatFilter = null;    // Kategorie-ID aus der Übersichtstabelle
let kostenSuche = '';

function renderKostenTab(){
  const p = getActiveProject(); if(!p) return;
  kostenVon(p);
  const kwpEl = document.getElementById('kosten-kwp'), kwEl = document.getElementById('kosten-kw');
  if(document.activeElement !== kwpEl) kwpEl.value = p.powerDcKwp ?? '';
  if(document.activeElement !== kwEl) kwEl.value = p.powerAcKw ?? '';
  renderKostenKennzahlen(p);
  renderKostenKategorien(p);
  renderKostenListe(p);
}

function renderKostenKennzahlen(p){
  const s = kostenSummen(p);
  const kpi = (label, wert, sub, cls) => `<div class="kpi${cls ? ' ' + cls : ''}"><span>${label}</span><b>${wert}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const fehlt = was => `<button type="button" class="linklike" data-kosten-leistung>${was} eintragen</button>`;
  document.getElementById('kosten-kpis').innerHTML = [
    kpi('Kosten netto', EUR2(s.netto), `${s.anzahl} Position${s.anzahl === 1 ? '' : 'en'}`),
    kpi('Kosten brutto', EUR2(s.brutto), `darin USt ${EUR2(s.ust)}`),
    kpi('Offen zu zahlen', EUR2(s.offenBrutto),
      s.ueberfaelligAnzahl ? `<span class="kosten-err">${s.ueberfaelligAnzahl} überfällig · ${EUR2(s.ueberfaelligBrutto)}</span>`
        : s.offenAnzahl ? `${s.offenAnzahl} offen` : (s.anzahl ? 'alles bezahlt' : '—'),
      s.ueberfaelligAnzahl ? 'kosten-kpi-err' : ''),
    kpi('Je kWp (DC)', s.jeKwp != null ? EUR2(s.jeKwp) : '—',
      p.powerDcKwp > 0 ? `bei ${ZAHL(p.powerDcKwp)} kWp` : fehlt('Leistung DC'), 'kosten-kpi-spez'),
    kpi('Je kW (AC)', s.jeKw != null ? EUR2(s.jeKw) : '—',
      p.powerAcKw > 0 ? `bei ${ZAHL(p.powerAcKw)} kW` : fehlt('Leistung AC'), 'kosten-kpi-spez'),
  ].join('');
  document.querySelectorAll('[data-kosten-leistung]').forEach(b => b.addEventListener('click', () => {
    const el = document.getElementById(p.powerDcKwp > 0 ? 'kosten-kw' : 'kosten-kwp'); el.focus();
  }));
}

function renderKostenKategorien(p){
  const root = document.getElementById('kosten-kategorien');
  const liste = kostenVon(p);
  const card = document.getElementById('kosten-kat-card');
  card.classList.toggle('hidden', !liste.length);
  if(!liste.length){ root.innerHTML = ''; return; }
  const gesamt = kostenSummen(p);
  const zeilen = KOSTEN_KATEGORIEN.map(kat => {
    const teil = liste.filter(k => k.kategorie === kat.id);
    return { kat, teil, s: kostenSummen(p, teil) };
  }).filter(z => z.teil.length).sort((a, b) => b.s.netto - a.s.netto);
  const basis = zeilen.reduce((m, z) => m + Math.max(0, z.s.netto), 0);
  root.innerHTML = `<table class="gs-table kosten-kat">
    <colgroup><col><col style="width:5rem"><col style="width:9rem"><col style="width:22%"><col style="width:8rem"><col style="width:8rem"></colgroup>
    <tr><th>Kategorie</th><th class="num">Belege</th><th class="num">Netto</th><th>Anteil</th><th class="num">€ / kWp</th><th class="num">€ / kW</th></tr>
    ${zeilen.map(z => {
      const anteil = basis > 0 ? Math.max(0, z.s.netto) / basis * 100 : 0;
      const aktiv = kostenKatFilter === z.kat.id;
      return `<tr class="kosten-kat-row${aktiv ? ' aktiv' : ''}" data-kkat="${escapeAttr(z.kat.id)}" tabindex="0" role="button" aria-pressed="${aktiv}"
          title="${escapeAttr(aktiv ? 'Filter aufheben' : 'Nur Belege dieser Kategorie zeigen')}">
        <td><span class="strong">${escapeHtml(z.kat.name)}</span>${z.kat.hinweis ? `<span class="sub">${escapeHtml(z.kat.hinweis)}</span>` : ''}</td>
        <td class="num">${z.teil.length}</td>
        <td class="num">${EUR2(z.s.netto)}</td>
        <td><span class="kosten-bar"><b style="width:${anteil.toFixed(1)}%"></b></span><span class="kosten-anteil">${anteil < 1 && anteil > 0 ? '<1' : Math.round(anteil)} %</span></td>
        <td class="num">${EUR2(kostenJe(z.s.netto, p.powerDcKwp))}</td>
        <td class="num">${EUR2(kostenJe(z.s.netto, p.powerAcKw))}</td>
      </tr>`;
    }).join('')}
    <tr class="kosten-summe"><td>Summe</td><td class="num">${liste.length}</td><td class="num">${EUR2(gesamt.netto)}</td><td></td>
      <td class="num">${EUR2(gesamt.jeKwp)}</td><td class="num">${EUR2(gesamt.jeKw)}</td></tr>
  </table>`;
  root.querySelectorAll('[data-kkat]').forEach(tr => {
    const umschalten = () => { kostenKatFilter = kostenKatFilter === tr.dataset.kkat ? null : tr.dataset.kkat; renderKostenKategorien(p); renderKostenListe(p); };
    tr.addEventListener('click', umschalten);
    tr.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); umschalten(); } });
  });
}

const KOSTEN_FILTER = [
  ['alle', 'Alle', () => true],
  ['rechnung', 'Rechnungen', k => k.art === 'rechnung' || k.art === 'quittung' || k.art === 'sonstig'],
  ['bescheid', 'Kostenbescheide', k => k.art === 'bescheid'],
  ['gutschrift', 'Gutschriften', k => k.art === 'gutschrift'],
  ['offen', 'Offen', k => kostenStatus(k) !== 'bezahlt' && kostenVorzeichen(k) > 0],
  ['ueberfaellig', 'Überfällig', k => kostenStatus(k) === 'ueberfaellig' && kostenVorzeichen(k) > 0],
  ['bezahlt', 'Bezahlt', k => kostenStatus(k) === 'bezahlt'],
];

function kostenZahlungHtml(k){
  const st = kostenStatus(k);
  const gs = kostenVorzeichen(k) < 0;
  let html;
  if(st === 'bezahlt') html = `<span class="pill ok">${gs ? 'erstattet' : 'bezahlt'}</span><span class="sub">${escapeHtml(fmtDate(k.bezahltAm))}</span>`;
  else if(k.faelligAm){
    const t = daysUntil(k.faelligAm);
    html = `<span class="${fristPillClass(k.faelligAm, 14)}">${t < 0 ? `${-t} T. überfällig` : t === 0 ? 'heute fällig' : `fällig in ${t} T.`}</span><span class="sub">${escapeHtml(fmtDate(k.faelligAm))}</span>`;
  } else html = `<span class="pill warn">${gs ? 'ausstehend' : 'offen'}</span>`;
  const w = kostenWiderspruchBis(k);
  if(w) html += `<span class="sub">${k.widerspruchEingelegt ? 'Widerspruch eingelegt' : `Widerspruch bis ${escapeHtml(fmtDate(w))}`}</span>`;
  return html;
}

function renderKostenListe(p){
  const root = document.getElementById('kosten-liste');
  const alle = kostenVon(p);
  document.getElementById('kosten-empty').style.display = alle.length ? 'none' : '';
  document.getElementById('kosten-suche').classList.toggle('hidden', !alle.length);
  const filterEl = document.getElementById('kosten-filter');
  if(!alle.length){ root.innerHTML = ''; filterEl.innerHTML = ''; return; }

  const basis = kostenKatFilter ? alle.filter(k => k.kategorie === kostenKatFilter) : alle;
  filterEl.innerHTML = KOSTEN_FILTER.map(([id, name, fn]) => {
    const n = basis.filter(fn).length;
    if(!n && id !== 'alle' && kostenFilter !== id) return '';
    return `<button type="button" class="vt-chip${kostenFilter === id ? ' active' : ''}" data-kfilter="${id}" aria-pressed="${kostenFilter === id}">${escapeHtml(name)} <span>${n}</span></button>`;
  }).join('') + (kostenKatFilter ? `<button type="button" class="vt-chip active" data-kkat-weg title="Kategorie-Filter aufheben">${escapeHtml((KOSTEN_KAT_BY_ID[kostenKatFilter] || {}).name || '')} ×</button>` : '');
  filterEl.querySelectorAll('[data-kfilter]').forEach(b => b.addEventListener('click', () => { kostenFilter = b.dataset.kfilter; renderKostenListe(p); }));
  filterEl.querySelector('[data-kkat-weg]')?.addEventListener('click', () => { kostenKatFilter = null; renderKostenKategorien(p); renderKostenListe(p); });

  const fn = (KOSTEN_FILTER.find(f => f[0] === kostenFilter) || KOSTEN_FILTER[0])[2];
  const q = kostenSuche.trim().toLowerCase();
  const sichtbar = basis.filter(fn).filter(k => !q ||
    [k.bezeichnung, k.aussteller, k.nummer, k.notiz, (KOSTEN_KAT_BY_ID[k.kategorie] || {}).name, (KOSTEN_ART_BY_ID[k.art] || {}).name]
      .some(t => String(t || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.belegDatum || b.angelegtAm || '').localeCompare(a.belegDatum || a.angelegtAm || ''));
  if(!sichtbar.length){ root.innerHTML = '<div class="empty">Keine Belege für diese Auswahl.</div>'; return; }

  const s = kostenSummen(p, sichtbar);
  const teilmenge = sichtbar.length !== alle.length;
  root.innerHTML = `<table class="gs-table kosten-table">
    <colgroup><col style="width:5.5rem"><col><col style="width:12%"><col style="width:7.5rem"><col style="width:7.5rem"><col style="width:10.5rem"><col style="width:12%"></colgroup>
    <tr><th>Datum</th><th>Beleg</th><th>Kategorie</th><th class="num">Netto</th><th class="num">Brutto</th><th>Zahlung</th><th>Dateien</th></tr>
    ${sichtbar.map(k => {
      const a = KOSTEN_ART_BY_ID[k.art] || KOSTEN_ART_BY_ID.sonstig;
      const dateien = k.dateien.slice(0, 2).map(f => `<span class="kosten-datei">${dateiLinkHtml(f, '📎 ' + escapeHtml(f.name))}</span>`).join('')
        + (k.dateien.length > 2 ? `<span class="sub">+${k.dateien.length - 2} weitere</span>` : '');
      return `<tr class="kosten-row" data-kedit="${escapeAttr(k.id)}" tabindex="0" title="Bearbeiten">
        <td>${k.belegDatum ? escapeHtml(fmtDate(k.belegDatum)) : '<span class="sub">ohne Datum</span>'}</td>
        <td><span class="vt-typ${k.art === 'bescheid' ? ' kosten-typ-bescheid' : ''}">${escapeHtml(a.kurz)}</span> <span class="strong">${escapeHtml(kostenTitel(k))}</span>
          <span class="sub">${escapeHtml([k.aussteller, k.bezeichnung && k.nummer ? k.nummer : ''].filter(Boolean).join(' · ') || '—')}</span></td>
        <td>${escapeHtml((KOSTEN_KAT_BY_ID[k.kategorie] || {}).name || '')}</td>
        <td class="num">${k.betrag == null ? '<span class="pill warn">Betrag fehlt</span>' : EUR2(kostenNetto(k))}</td>
        <td class="num">${k.betrag == null ? '' : EUR2(kostenBrutto(k))}<span class="sub">${k.betrag == null ? '' : `USt ${ZAHL(k.ustSatz)} %`}</span></td>
        <td>${kostenZahlungHtml(k)}</td>
        <td>${dateien || '<span class="sub">kein Beleg</span>'}</td>
      </tr>`;
    }).join('')}
    <tr class="kosten-summe"><td></td><td>${teilmenge ? `Summe der ${sichtbar.length} angezeigten` : 'Summe'}</td><td></td>
      <td class="num">${EUR2(s.netto)}</td><td class="num">${EUR2(s.brutto)}</td>
      <td colspan="2">${s.offenAnzahl ? `offen ${EUR2(s.offenBrutto)}` : ''}</td></tr>
  </table>`;
  root.querySelectorAll('[data-kedit]').forEach(tr => {
    tr.addEventListener('click', e => { if(e.target.closest('a')) return; openKostenModal(tr.dataset.kedit); });
    tr.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); openKostenModal(tr.dataset.kedit); } });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Eingabemaske (Dialog). Bearbeitet eine Arbeitskopie; erst „Speichern" übernimmt sie.
// Dateien werden sofort hochgeladen (sonst wären sie nach dem Dialog weg). Deshalb merkt
// sich die Maske, was in dieser Sitzung hinzukam bzw. entfernt wurde: Abbrechen räumt neu
// hochgeladene Dateien wieder aus dem Storage, Löschen wird erst beim Speichern wirksam.
// ═════════════════════════════════════════════════════════════════════════════
let kmEntwurf = null;
let kmIstNeu = false;
let kmNeuePfade = [];      // in dieser Sitzung hochgeladen (Storage-Pfade)
let kmEntferntePfade = []; // in dieser Sitzung entfernt, werden beim Speichern gelöscht

function openKostenModal(id){
  const p = getActiveProject(); if(!p) return;
  const vorhanden = id ? kostenVon(p).find(k => k.id === id) : null;
  kmIstNeu = !vorhanden;
  kmEntwurf = normalizeKosten(JSON.parse(JSON.stringify(vorhanden || { belegDatum:new Date().toISOString().slice(0,10) })));
  kmNeuePfade = []; kmEntferntePfade = [];
  document.getElementById('km-titel').textContent = kmIstNeu ? 'Neue Kostenposition' : kostenTitel(kmEntwurf);
  document.getElementById('km-sub').textContent = kmIstNeu ? '' : ((KOSTEN_ART_BY_ID[kmEntwurf.art] || {}).name || '');
  document.getElementById('km-loeschen').classList.toggle('hidden', kmIstNeu);
  document.getElementById('view-kosten').classList.remove('hidden');
  renderKostenModal();
  document.getElementById('km-body').scrollTop = 0;
}
function closeKostenModal(gespeichert){
  if(!gespeichert && kmNeuePfade.length && window.sb)
    window.sb.storage.from(DOKU_BUCKET).remove(kmNeuePfade).then(({ error }) => { if(error) console.warn('Beleg nicht aufgeräumt:', error); });
  document.getElementById('view-kosten').classList.add('hidden');
  kmEntwurf = null; kmNeuePfade = []; kmEntferntePfade = [];
}
function kostenModalOffen(){ return !document.getElementById('view-kosten').classList.contains('hidden'); }

// Vorschläge für „Aussteller / Behörde": bisher verwendete Aussteller aller Projekte und
// die Beteiligten dieses Projekts (Behörden, Planer, Netzbetreiber)
function kostenAusstellerVorschlaege(p){
  const namen = new Set();
  projects.forEach(pr => (pr.kosten || []).forEach(k => { if(k && k.aussteller) namen.add(k.aussteller); }));
  (p.beteiligte || []).forEach(b => { if(b.organisation) namen.add(b.organisation); });
  return [...namen].sort((a, b) => a.localeCompare(b, 'de'));
}

function renderKostenModal(){
  const p = getActiveProject(); const k = kmEntwurf; if(!p || !k) return;
  const a = KOSTEN_ART_BY_ID[k.art] || KOSTEN_ART_BY_ID.sonstig;
  const opt = (liste, wert) => liste.map(([id, l]) => `<option value="${escapeAttr(String(id))}"${String(wert) === String(id) ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
  const feld = (label, inner, o) => `<div class="vtm-f${o && o.breit ? ' breit' : ''}"><label>${label}</label>${inner}${o && o.hilfe ? `<small>${o.hilfe}</small>` : ''}</div>`;
  const inp = (key, type, extra) => `<input type="${type || 'text'}" data-kk="${key}" value="${escapeAttr(String(k[key] ?? ''))}" ${extra || ''} />`;
  const dat = key => inp(key, 'date');
  const berechnet = (label, wert) => `<div class="vtm-calc"><span>${label}</span><b>${wert}</b></div>`;
  const netto = kostenNetto(k), brutto = kostenBrutto(k);
  const hatBetrag = k.betrag != null;
  const wAuto = k.art === 'bescheid' && !k.widerspruchBis && k.zugegangenAm ? isoPlus(k.zugegangenAm, 0, 1) : null;

  document.getElementById('km-body').innerHTML = `
    <datalist id="km-aussteller-liste">${kostenAusstellerVorschlaege(p).map(n => `<option value="${escapeAttr(n)}"></option>`).join('')}</datalist>
    <section class="vtm-sec">
      <h3>Beleg</h3>
      <div class="vtm-grid">
        ${feld('Art', `<select data-kk="art">${opt(KOSTEN_ARTEN.map(x => [x.id, x.name]), k.art)}</select>`)}
        ${feld('Kategorie', `<select data-kk="kategorie">${opt(KOSTEN_KATEGORIEN.map(x => [x.id, x.name]), k.kategorie)}</select>`,
          { hilfe: escapeHtml((KOSTEN_KAT_BY_ID[k.kategorie] || {}).hinweis || '') })}
        ${feld('Bezeichnung / Leistung', inp('bezeichnung', 'text', `placeholder="${escapeAttr(k.art === 'bescheid' ? 'z. B. Gebühr Baugenehmigung' : 'z. B. Artenschutzgutachten, 1. Abschlag')}"`), { breit:true })}
        ${feld(escapeHtml(a.aussteller), inp('aussteller', 'text', `list="km-aussteller-liste" placeholder="${escapeAttr(k.art === 'bescheid' ? 'z. B. Kreisverwaltung Trier-Saarburg' : 'Firma / Büro')}"`))}
        ${feld(escapeHtml(a.nummer), inp('nummer', 'text'))}
        ${feld(escapeHtml(a.datum), dat('belegDatum'))}
      </div>
    </section>

    <section class="vtm-sec">
      <h3>Betrag</h3>
      <div class="vtm-grid">
        ${feld('Betrag laut Beleg (€)', `<div class="vtm-inline">${inp('betrag', 'number', 'step="0.01" min="0" placeholder="0,00"')}<select data-kk="betragArt">${opt([['netto','netto'],['brutto','brutto']], k.betragArt)}</select></div>`,
          { hilfe: k.art === 'gutschrift' ? 'Positiv eintragen — die Gutschrift mindert die Kosten.' : 'So eintragen, wie er auf dem Beleg steht.' })}
        ${feld('Umsatzsteuer', `<select data-kk="ustSatz">${opt(UST_SAETZE.map(u => [u, u ? `${u} %` : '0 % (keine USt, z. B. Gebühren)']), k.ustSatz)}</select>`)}
        ${berechnet('Netto', hatBetrag ? EUR2(netto) : '—')}
        ${berechnet('USt', hatBetrag ? EUR2(rund2(brutto - netto)) : '—')}
        ${berechnet('Brutto', hatBetrag ? EUR2(brutto) : '—')}
        ${berechnet('Je kWp / je kW (netto)', hatBetrag ? `${p.powerDcKwp > 0 ? EUR2(netto / p.powerDcKwp) : '— '} / ${p.powerAcKw > 0 ? EUR2(netto / p.powerAcKw) : ' —'}` : '—')}
      </div>
    </section>

    <section class="vtm-sec">
      <h3>Zahlung${k.art === 'bescheid' ? ' und Rechtsbehelf' : ''}</h3>
      <div class="vtm-grid">
        ${feld(k.art === 'bescheid' ? 'Zahlungsfrist' : 'Fällig am (Zahlungsziel)', dat('faelligAm'), { hilfe:'Erscheint als Frist in „Als Nächstes" und im Kalender, solange nicht bezahlt.' })}
        ${feld(kostenVorzeichen(k) < 0 ? 'Erstattet am' : 'Bezahlt am', `<div class="vtm-inline">${dat('bezahltAm')}${k.bezahltAm ? '' : '<button type="button" class="secondary small" id="km-heute-bezahlt">heute</button>'}</div>`)}
        ${k.art === 'bescheid' ? `
          ${feld('Bescheid zugegangen am', dat('zugegangenAm'))}
          ${feld('Widerspruch möglich bis', inp('widerspruchBis', 'date', wAuto ? `placeholder="${escapeAttr(wAuto)}"` : ''),
            { hilfe: wAuto ? `Ohne Eintrag: ${escapeHtml(fmtDate(wAuto))} (ein Monat ab Zugang, § 70 VwGO) — Rechtsbehelfsbelehrung im Bescheid prüfen.` : 'Ein Monat ab Bekanntgabe (§ 70 VwGO), sofern die Rechtsbehelfsbelehrung nichts anderes sagt.' })}
          ${feld('Widerspruch', `<label class="vtm-check"><input type="checkbox" data-kk="widerspruchEingelegt" ${k.widerspruchEingelegt ? 'checked' : ''} /><span>Widerspruch eingelegt</span></label>`)}
        ` : ''}
      </div>
    </section>

    <section class="vtm-sec">
      <h3>Beleg-Dateien und Notiz</h3>
      <div class="vtm-grid">
        ${feld('Dateien (Rechnung, Bescheid als PDF oder Foto)', `<div class="vtm-dateien">${k.dateien.map(f =>
          `<span class="doku-file">${dateiLinkHtml(f, '📎 ' + escapeHtml(f.name))}<span class="doku-file-size">${fmtBytes(f.size)}</span><button type="button" class="doku-file-x" data-kdel="${escapeAttr(f.id)}" title="Datei entfernen">×</button></span>`).join('')}
          <button type="button" class="secondary small" id="km-datei">+ Datei anhängen</button><span id="km-upload-status" class="sub"></span></div>`, { breit:true })}
        ${feld('Notiz', `<textarea data-kk="notiz" rows="2">${escapeHtml(k.notiz || '')}</textarea>`, { breit:true })}
      </div>
    </section>`;
  bindKostenModal();
}

function kostenModalNeuAufbauen(){
  const body = document.getElementById('km-body');
  const pos = body.scrollTop; renderKostenModal(); document.getElementById('km-body').scrollTop = pos;
}

function bindKostenModal(){
  const body = document.getElementById('km-body'); const k = kmEntwurf; if(!k) return;
  // Felder, deren Änderung Aufbau oder Berechnungen der Maske verändert → neu rendern
  const strukturell = new Set(['art','kategorie','betrag','betragArt','ustSatz','bezahltAm','zugegangenAm','widerspruchBis']);
  body.querySelectorAll('[data-kk]').forEach(el => {
    const key = el.dataset.kk;
    const wert = () => el.type === 'checkbox' ? el.checked
      : (el.type === 'number' || key === 'ustSatz') ? (el.value === '' ? null : Number(el.value))
      : (el.value || (el.type === 'date' ? null : ''));
    if(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date'){
      el.addEventListener('change', () => {
        if(key === 'art') artGeaendert(k, el.value);
        else k[key] = wert();
        if(strukturell.has(key)) kostenModalNeuAufbauen();
      });
    } else {
      // Tippen: nur speichern (Fokus bleibt); Berechnungen beim Verlassen des Felds aktualisieren
      el.addEventListener('input', () => { k[key] = wert(); });
      if(strukturell.has(key)) el.addEventListener('change', kostenModalNeuAufbauen);
    }
  });
  document.getElementById('km-heute-bezahlt')?.addEventListener('click', () => {
    k.bezahltAm = new Date().toISOString().slice(0,10); kostenModalNeuAufbauen();
  });
  document.getElementById('km-datei')?.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
    inp.accept = '.pdf,image/*,.doc,.docx,.xls,.xlsx,.eml,.msg';
    inp.addEventListener('change', () => kostenDateienAnhaengen(inp.files));
    inp.click();
  });
  body.querySelectorAll('[data-kdel]').forEach(b => b.addEventListener('click', () => {
    if(!confirm('Diese Datei entfernen?')) return;
    const f = k.dateien.find(x => x.id === b.dataset.kdel);
    k.dateien = k.dateien.filter(x => x.id !== b.dataset.kdel);
    if(f && f.storagePath){
      if(kmNeuePfade.includes(f.storagePath)){
        // erst in dieser Sitzung hochgeladen → sofort wieder weg
        kmNeuePfade = kmNeuePfade.filter(x => x !== f.storagePath);
        if(window.sb) window.sb.storage.from(DOKU_BUCKET).remove([f.storagePath]);
      } else kmEntferntePfade.push(f.storagePath);
    }
    kostenModalNeuAufbauen();
  }));
}

// Artwechsel: Standardwerte der neuen Art übernehmen, soweit die bisherigen noch die
// Standardwerte der alten Art waren (von Hand gesetzte Werte bleiben stehen)
function artGeaendert(k, neu){
  const alt = KOSTEN_ART_BY_ID[k.art] || KOSTEN_ART_BY_ID.sonstig, n = KOSTEN_ART_BY_ID[neu] || KOSTEN_ART_BY_ID.sonstig;
  if(Number(k.ustSatz) === alt.ust) k.ustSatz = n.ust;
  if(k.betragArt === alt.erfassung) k.betragArt = n.erfassung;
  if(n.kategorie && (k.kategorie === (alt.kategorie || 'sonstig') || k.kategorie === 'sonstig')) k.kategorie = n.kategorie;
  k.art = neu;
}

async function kostenDateienAnhaengen(fileList){
  const p = getActiveProject(); const k = kmEntwurf; if(!p || !k) return;
  const files = Array.from(fileList || []); if(!files.length) return;
  const status = document.getElementById('km-upload-status');
  if(status) status.textContent = `${files.length} Datei${files.length === 1 ? '' : 'en'} ${window.sb ? 'werden hochgeladen' : 'werden angehängt'} …`;
  for(const file of files){
    const id = 'f' + Date.now() + Math.random().toString(36).slice(2,7);
    const entry = { id, name:file.name, mime:file.type || '', size:file.size, addedAt:new Date().toISOString() };
    try {
      if(window.sb){
        entry.storagePath = storageDateiPfad(p.id, 'kosten-' + k.id, id, file.name);
        await ladeDateiHoch(entry.storagePath, file, file.type);
        kmNeuePfade.push(entry.storagePath);
      } else {
        if(file.size > DOKU_FILE_WARN_BYTES && !confirm(`„${file.name}" ist ${fmtBytes(file.size)} groß. Große Dateien können den lokalen Speicher sprengen. Trotzdem anhängen?`)) continue;
        entry.dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      }
      if(kmEntwurf !== k) return; // Dialog inzwischen geschlossen
      k.dateien.push(entry);
    } catch(err){ alert(`„${file.name}" konnte nicht hochgeladen werden: ${err.message || err}`); }
  }
  // Bezeichnung aus dem ersten Dateinamen vorschlagen, solange keine eingetragen ist
  if(!k.bezeichnung && k.dateien.length) k.bezeichnung = k.dateien[0].name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  if(kmEntwurf === k) kostenModalNeuAufbauen();
}

// Neue Position direkt aus Dateien (Upload-Button oder Drag & Drop auf den Reiter)
function kostenAusDateien(fileList){
  if(!fileList || !fileList.length) return;
  openKostenModal(null);
  kostenDateienAnhaengen(fileList);
}

function speichereKostenModal(){
  const p = getActiveProject(); const k = kmEntwurf; if(!p || !k) return;
  if(!k.bezeichnung && !k.aussteller && !k.nummer && !k.dateien.length && k.betrag == null){
    alert('Bitte mindestens einen Betrag, eine Bezeichnung, einen Aussteller oder eine Datei angeben.'); return;
  }
  if(k.betrag == null && !confirm('Es ist noch kein Betrag eingetragen — die Position zählt dann mit 0 €. Trotzdem speichern?')) return;
  if(k.betrag != null && k.betrag < 0) k.betrag = Math.abs(k.betrag);
  if(kmEntferntePfade.length && window.sb)
    window.sb.storage.from(DOKU_BUCKET).remove(kmEntferntePfade).then(({ error }) => { if(error) console.warn('Beleg nicht gelöscht:', error); });
  const liste = kostenVon(p);
  const i = liste.findIndex(x => x.id === k.id);
  if(i >= 0) liste[i] = k; else liste.push(k);
  touchActiveProject(); saveProjects();
  logAction(p, `${kmIstNeu ? 'Kostenposition angelegt' : 'Kostenposition geändert'}: ${kostenTitel(k)} (${k.betrag == null ? 'ohne Betrag' : EUR2(kostenNetto(k)) + ' netto'})`);
  const neu = kmIstNeu;
  closeKostenModal(true);
  renderKostenTab(); renderNavBadges(p);
  toast(neu ? 'Kostenposition angelegt' : 'Kostenposition gespeichert');
}

function loescheKostenModal(){
  const p = getActiveProject(); const k = kmEntwurf; if(!p || !k) return;
  if(!confirm(`Kostenposition „${kostenTitel(k)}" mit ${k.dateien.length} Datei(en) löschen?`)) return;
  p.kosten = kostenVon(p).filter(x => x.id !== k.id);
  const pfade = [...k.dateien.map(f => f.storagePath).filter(Boolean), ...kmEntferntePfade];
  if(pfade.length && window.sb) window.sb.storage.from(DOKU_BUCKET).remove(pfade);
  kmNeuePfade = []; // sind in `pfade` enthalten
  touchActiveProject(); saveProjects();
  logAction(p, `Kostenposition gelöscht: ${kostenTitel(k)}`);
  closeKostenModal(true); renderKostenTab(); renderNavBadges(p);
}

// ---- Excel-Export: Belegliste + Übersicht nach Kategorie ----------------------
function exportKostenXlsx(){
  const p = getActiveProject(); if(!p) return;
  const liste = kostenVon(p);
  if(!liste.length){ alert('Noch keine Kosten erfasst.'); return; }
  const belege = [['Datum','Art','Kategorie','Bezeichnung','Aussteller / Behörde','Nummer / Aktenzeichen','Netto €','USt-Satz %','USt €','Brutto €',
    'Fällig am','Bezahlt am','Status','Widerspruch bis','Widerspruch eingelegt','Dateien','Notiz']];
  liste.slice().sort((a, b) => (a.belegDatum || '').localeCompare(b.belegDatum || '')).forEach(k => {
    const n = kostenNetto(k), b = kostenBrutto(k);
    belege.push([k.belegDatum || '', (KOSTEN_ART_BY_ID[k.art] || {}).name || k.art, (KOSTEN_KAT_BY_ID[k.kategorie] || {}).name || k.kategorie,
      k.bezeichnung, k.aussteller, k.nummer, k.betrag == null ? '' : n, k.ustSatz, k.betrag == null ? '' : rund2(b - n), k.betrag == null ? '' : b,
      k.faelligAm || '', k.bezahltAm || '', { bezahlt:'bezahlt', offen:'offen', ueberfaellig:'überfällig' }[kostenStatus(k)],
      kostenWiderspruchBis(k) || '', k.art === 'bescheid' ? (k.widerspruchEingelegt ? 'ja' : 'nein') : '',
      k.dateien.map(f => f.name).join(', '), k.notiz]);
  });
  const s = kostenSummen(p);
  const uebersicht = [['Kategorie','Belege','Netto €','Anteil %','€ je kWp (DC)','€ je kW (AC)']];
  KOSTEN_KATEGORIEN.forEach(kat => {
    const teil = liste.filter(k => k.kategorie === kat.id); if(!teil.length) return;
    const t = kostenSummen(p, teil);
    uebersicht.push([kat.name, teil.length, t.netto, s.netto ? Math.round(t.netto / s.netto * 1000) / 10 : '',
      t.jeKwp != null ? rund2(t.jeKwp) : '', t.jeKw != null ? rund2(t.jeKw) : '']);
  });
  uebersicht.push(['Summe', liste.length, s.netto, s.netto ? 100 : '', s.jeKwp != null ? rund2(s.jeKwp) : '', s.jeKw != null ? rund2(s.jeKw) : '']);
  uebersicht.push([]);
  uebersicht.push(['Kosten brutto €', s.brutto]);
  uebersicht.push(['davon offen €', rund2(s.offenBrutto)]);
  uebersicht.push(['Leistung DC (kWp)', p.powerDcKwp ?? '']);
  uebersicht.push(['Leistung AC (kW)', p.powerAcKw ?? '']);
  uebersicht.push(['Stand', new Date().toISOString().slice(0,10)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(uebersicht), 'Übersicht');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(belege), 'Belege');
  XLSX.writeFile(wb, `Kosten_${fileBase()}.xlsx`);
}

// ---- Bindungen (einmal beim Laden) ----------------------------------------------
document.getElementById('btn-kosten-neu').addEventListener('click', () => openKostenModal(null));
document.getElementById('btn-kosten-upload').addEventListener('click', () => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
  inp.accept = '.pdf,image/*,.doc,.docx,.xls,.xlsx,.eml,.msg';
  inp.addEventListener('change', () => kostenAusDateien(inp.files));
  inp.click();
});
document.getElementById('btn-kosten-export').addEventListener('click', exportKostenXlsx);
document.getElementById('kosten-suche').addEventListener('input', e => {
  kostenSuche = e.target.value; const p = getActiveProject(); if(p) renderKostenListe(p);
});
// Bezugsleistung: dieselben Felder wie im Reiter „Technische Planung"
[['kosten-kwp', 'powerDcKwp', 'proj-power-dc'], ['kosten-kw', 'powerAcKw', 'proj-power-ac']].forEach(([id, key, technikId]) => {
  document.getElementById(id).addEventListener('input', e => {
    const p = getActiveProject(); if(!p) return;
    p[key] = e.target.value === '' ? null : Number(e.target.value);
    const t = document.getElementById(technikId); if(t) t.value = e.target.value;
    touchActiveProject(); saveProjects();
    renderKostenKennzahlen(p); renderKostenKategorien(p);
  });
});
// Drag & Drop von Belegen auf den ganzen Reiter
(function(){
  const pane = document.getElementById('dpane-kosten');
  let tiefe = 0;
  const hatDateien = e => [...(e.dataTransfer?.types || [])].includes('Files');
  pane.addEventListener('dragenter', e => { if(!hatDateien(e)) return; e.preventDefault(); tiefe++; pane.classList.add('kosten-drop'); });
  pane.addEventListener('dragover', e => { if(hatDateien(e)){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  pane.addEventListener('dragleave', () => { tiefe = Math.max(0, tiefe - 1); if(!tiefe) pane.classList.remove('kosten-drop'); });
  pane.addEventListener('drop', e => {
    if(!hatDateien(e)) return;
    e.preventDefault(); tiefe = 0; pane.classList.remove('kosten-drop');
    if(getActiveProject()) kostenAusDateien(e.dataTransfer.files);
  });
})();
// Dateien auf den offenen Dialog ziehen = an diese Position anhängen
(function(){
  const ov = document.getElementById('view-kosten');
  ov.addEventListener('dragover', e => { if([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  ov.addEventListener('drop', e => { if(!e.dataTransfer?.files?.length) return; e.preventDefault(); kostenDateienAnhaengen(e.dataTransfer.files); });
})();
document.getElementById('km-speichern').addEventListener('click', speichereKostenModal);
document.getElementById('km-abbrechen').addEventListener('click', () => closeKostenModal(false));
document.getElementById('km-close').addEventListener('click', () => closeKostenModal(false));
document.getElementById('km-loeschen').addEventListener('click', loescheKostenModal);
document.getElementById('view-kosten').addEventListener('click', e => { if(e.target.id === 'view-kosten') closeKostenModal(false); });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && kostenModalOffen()) closeKostenModal(false); });
