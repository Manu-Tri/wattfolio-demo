// Zeitplan / Gantt inkl. Excel- und PDF-Export
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Zeitplan / Gantt: Grundstückssicherung, Gutachten, Genehmigungsplanung bis Baugenehmigung.
// Nutzt echte Daten, wo vorhanden (Dokument-Anfrage/-Erhalt, B-Plan-Meilensteine, Bauverfahren);
// fehlt ein Abschnitt komplett, wird ein gestrichelter Richtwert (typische Dauer) angezeigt, damit
// auch frühe Projekte schon eine plausible Zeitschiene sehen. Nichts davon wird zusätzlich
// gespeichert — der Gantt liest ausschließlich Felder, die in den Fachreitern ohnehin gepflegt werden.
// ═════════════════════════════════════════════════════════════════════════════
const GANTT_GUTACHTEN = [
  { doku:'artenschutz',   label:'Artenschutzrechtl. Fachbeitrag', wochen:12 },
  { doku:'umweltbericht', label:'Umweltbericht',                  wochen:10 },
  { doku:'brandschutz',   label:'Brandschutzkonzept',             wochen:6  },
  { doku:'blend',         label:'Blendgutachten',                 wochen:4, optional:true },
  { doku:'baugrund',      label:'Baugrundgutachten',               wochen:6  },
];
const GANTT_WOCHEN_SICHERUNG = 8;
const GANTT_WOCHEN_BPLAN = 52;
const GANTT_WOCHEN_BAUGENEHMIGUNG = 16;

const ganttDay = iso => (iso||'').slice(0,10);
function ganttParseDay(iso){ return new Date(ganttDay(iso)+'T12:00:00'); }
function ganttAddWeeks(iso, weeks){
  const d = ganttParseDay(iso); d.setDate(d.getDate() + Math.round(weeks*7));
  return d.toISOString().slice(0,10);
}
const ganttTodayIso = () => new Date().toISOString().slice(0,10);

// Ein Abschnitt: echte Start-/Ende-Daten haben Vorrang. Nur Start bekannt → „läuft" bis heute.
// Kein Datum bekannt → Richtwert ab `fallbackStart` mit `wochen` Dauer.
function ganttSegment(label, startIso, endIso, fallbackStart, wochen, extra){
  let seg;
  if(startIso && endIso) seg = { start:ganttDay(startIso), end:ganttDay(endIso), state:'erledigt' };
  else if(startIso)      seg = { start:ganttDay(startIso), end:ganttTodayIso(), state:'laufend' };
  else                    seg = { start:fallbackStart, end:ganttAddWeeks(fallbackStart, wochen), state:'geplant' };
  return Object.assign({ label }, seg, extra||{});
}
function sicherungAlleGesichert(p){
  const rows = sicherungRows(p);
  return rows.length>0 && rows.every(r => r.extra.vertragsStatus==='unterschrieben');
}
function sicherungEndeIso(p){
  const dates = Object.values(p.flurstueckDaten||{}).map(ex=>ex.ersteZahlungAm).filter(Boolean).sort();
  return dates.length ? dates[dates.length-1] : ganttTodayIso();
}
function buildGanttSegments(p){
  const projektStart = ganttDay(p.createdAt) || ganttTodayIso();
  const flaeche = ganttSegment('Grundstückssicherung',
    p.dokumente.alkalb ? p.dokumente.alkalb.angefragtAm : null,
    sicherungAlleGesichert(p) ? sicherungEndeIso(p) : null,
    projektStart, GANTT_WOCHEN_SICHERUNG);

  // Gutachten laufen i. d. R. parallel zum B-Plan-Verfahren, nicht erst danach.
  const gutachten = GANTT_GUTACHTEN.map(g => {
    const d = p.dokumente[g.doku] || {};
    const erhalten = ['erhalten','abgelegt'].includes(d.status);
    return ganttSegment(g.label, d.angefragtAm, erhalten ? d.erhaltenAm : null, flaeche.end, g.wochen, { optional:g.optional });
  });

  const ms = p.genehmigung.bplan.meilensteine;
  const bplanStart = (ms.aufstellungsbeschluss||{}).datum || (ms.bplanerBeauftragt||{}).datum;
  const bplanEndeReal = (ms.genehmigungLandkreis||{}).erledigt ? ms.genehmigungLandkreis.datum : null;
  const bplan = ganttSegment('B-Plan-Verfahren', bplanStart, bplanEndeReal, flaeche.end, GANTT_WOCHEN_BPLAN);

  const bv = p.genehmigung.bauverfahren;
  const bau = ganttSegment('Baugenehmigungsverfahren', bv.eingereichtAm, bv.genehmigtAm, bplan.end, GANTT_WOCHEN_BAUGENEHMIGUNG);

  const milestone = { label:'Baugenehmigung', datum: bv.genehmigtAm || bau.end, state: bv.genehmigtAm ? 'erledigt' : 'geplant' };
  return { flaeche, gutachten, bplan, bau, milestone };
}
// Auf ganze Monate gerundeter Anzeigebereich — von Gantt-Ansicht und beiden Exporten gemeinsam genutzt.
function ganttMonthRange(seg){
  const allSegs = [seg.flaeche, ...seg.gutachten, seg.bplan, seg.bau];
  const allDates = allSegs.flatMap(s => [s.start, s.end]).concat([seg.milestone.datum, ganttTodayIso()]);
  let start = ganttParseDay(allDates.reduce((a,b) => a<b?a:b));
  let end   = ganttParseDay(allDates.reduce((a,b) => a>b?a:b));
  start = new Date(start.getFullYear(), start.getMonth(), 1);
  end   = new Date(end.getFullYear(), end.getMonth()+1, 0);
  return { start, end };
}
// Monatsspalten (jeweils Monatsanfang) über den Anzeigebereich.
function ganttMonths(range){
  const months = [];
  const cur = new Date(range.start);
  while(cur <= range.end){ months.push(new Date(cur)); cur.setMonth(cur.getMonth()+1); }
  return months;
}
const GANTT_STATE_LABEL = { erledigt:'erledigt', laufend:'läuft', geplant:'Richtwert' };
function ganttDauerTage(s){ return Math.max(1, Math.round((ganttParseDay(s.end)-ganttParseDay(s.start))/86400000)); }
function renderProzessGantt(p){
  const root = document.getElementById('prozess-gantt'); if(!root) return;
  const seg = buildGanttSegments(p);
  const range = ganttMonthRange(seg);
  const rangeStart = range.start, rangeEnd = range.end;
  const totalMs = Math.max(1, rangeEnd - rangeStart);
  const pct = iso => Math.min(100, Math.max(0, (ganttParseDay(iso) - rangeStart) / totalMs * 100));

  let gridLines = '', gridLabels = '';
  const cur = new Date(rangeStart);
  while(cur <= rangeEnd){
    const left = (cur - rangeStart) / totalMs * 100;
    gridLines  += `<div class="gantt-grid-line" style="left:${left}%"></div>`;
    gridLabels += `<div class="gantt-grid-label" style="left:${left}%">${cur.toLocaleDateString('de-DE',{month:'short',year:'2-digit'})}</div>`;
    cur.setMonth(cur.getMonth()+1);
  }
  const todayPct = pct(ganttTodayIso());
  const todayLine = `<div class="gantt-today-line" style="left:${todayPct}%"></div>`;

  const barHtml = s => {
    const left = pct(s.start), width = Math.max(pct(s.end) - pct(s.start), 1.2);
    return `<div class="gantt-bar ${s.state}" style="left:${left}%;width:${width}%"
      title="${escapeAttr(s.label)}: ${escapeAttr(fmtDate(s.start))} – ${escapeAttr(fmtDate(s.end))} (${ganttDauerTage(s)} Tage, ${GANTT_STATE_LABEL[s.state]})"></div>`;
  };
  const row = (label, s, optional) => `<div class="gantt-row">
      <div class="gantt-label">${escapeHtml(label)}${optional?' <span class="optional-tag">(optional)</span>':''}</div>
      <div class="gantt-track">${gridLines}${todayLine}${barHtml(s)}</div>
    </div>`;

  const milestoneLeft = pct(seg.milestone.datum);
  const milestoneHtml = `<div class="gantt-row">
      <div class="gantt-label">⬧ Baugenehmigung</div>
      <div class="gantt-track">${gridLines}${todayLine}<div class="gantt-milestone ${seg.milestone.state}" style="left:${milestoneLeft}%"
        title="Baugenehmigung: ${escapeAttr(fmtDate(seg.milestone.datum))} (${seg.milestone.state==='erledigt'?'erteilt':'Richtwert'})"></div></div>
    </div>`;

  root.innerHTML = `<div class="gantt">
      <div class="gantt-row gantt-header">
        <div class="gantt-label"></div>
        <div class="gantt-track">${gridLines}${gridLabels}${todayLine}</div>
      </div>
      ${row('Grundstückssicherung', seg.flaeche)}
      <div class="gantt-group">Gutachten</div>
      ${seg.gutachten.map((g,i) => row(g.label, g, GANTT_GUTACHTEN[i].optional)).join('')}
      <div class="gantt-group">Genehmigungsplanung</div>
      ${row('B-Plan-Verfahren', seg.bplan)}
      ${row('Baugenehmigungsverfahren', seg.bau)}
      ${milestoneHtml}
      <div class="gantt-legend">
        <span><i style="background:var(--accent)"></i>erledigt (echte Daten)</span>
        <span><i style="background:repeating-linear-gradient(45deg,var(--warn),var(--warn) 3px,#c97a20 3px,#c97a20 6px)"></i>läuft</span>
        <span><i style="background:var(--panel2);border:1.5px dashed var(--border-strong)"></i>Richtwert (noch keine Daten)</span>
      </div>
    </div>`;
}

// ---- Gantt-Export: gemeinsame Zeilen-Daten für Excel & PDF ----
// Flache Liste aller Balken-/Meilensteinzeilen in Anzeigereihenfolge.
function ganttExportRows(seg){
  const rows = [
    { bereich:'Flächensicherung', label:'Grundstückssicherung', seg:seg.flaeche },
    ...seg.gutachten.map(g => ({ bereich:'Gutachten', label:g.label + (g.optional?' (optional)':''), seg:g })),
    { bereich:'Genehmigungsplanung', label:'B-Plan-Verfahren', seg:seg.bplan },
    { bereich:'Genehmigungsplanung', label:'Baugenehmigungsverfahren', seg:seg.bau },
  ];
  return rows;
}

// ---- Excel-Export (.xlsx): Datentabelle + visuelles Monatsraster (SheetJS) ----
function exportGanttXlsx(p){
  if(typeof XLSX === 'undefined'){ alert('Excel-Bibliothek nicht geladen.'); return; }
  const seg = buildGanttSegments(p);
  const range = ganttMonthRange(seg);
  const months = ganttMonths(range);
  const monthLabel = d => d.toLocaleDateString('de-DE',{month:'short',year:'2-digit'});
  const SYM = { erledigt:'█', laufend:'▓', geplant:'░' };
  const overlaps = (s, m) => {
    const ms = new Date(m.getFullYear(), m.getMonth(), 1), me = new Date(m.getFullYear(), m.getMonth()+1, 0);
    return ganttParseDay(s.start) <= me && ganttParseDay(s.end) >= ms;
  };
  const inMonth = (iso, m) => {
    const ms = new Date(m.getFullYear(), m.getMonth(), 1), me = new Date(m.getFullYear(), m.getMonth()+1, 0);
    return ganttParseDay(iso) >= ms && ganttParseDay(iso) <= me;
  };
  const taskRow = r => [r.bereich, r.label, fmtDate(r.seg.start), fmtDate(r.seg.end), ganttDauerTage(r.seg),
    GANTT_STATE_LABEL[r.seg.state], ...months.map(m => overlaps(r.seg, m) ? SYM[r.seg.state] : '')];

  const header = ['Bereich','Aufgabe','Start','Ende','Dauer (Tage)','Status', ...months.map(monthLabel)];
  const aoa = [
    ['Zeitplan (Gantt) — ' + (p.name || 'Projekt')],
    ['Projekt-ID: ' + (p.prozess.projektnummer || '—'), '', '', '', 'Stand: ' + fmtDate(ganttTodayIso())],
    [],
    header,
    ...ganttExportRows(seg).map(taskRow),
    ['Meilenstein','⬧ Baugenehmigung', fmtDate(seg.milestone.datum), '', '',
      seg.milestone.state==='erledigt'?'erteilt':'Richtwert', ...months.map(m => inMonth(seg.milestone.datum, m) ? '◆' : '')],
    [],
    ['Legende:', '█ erledigt', '▓ läuft', '░ Richtwert', '◆ Meilenstein'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:20},{wch:32},{wch:12},{wch:12},{wch:13},{wch:12}, ...months.map(()=>({wch:6}))];
  ws['!merges'] = [
    { s:{r:0,c:0}, e:{r:0,c:Math.min(header.length-1, 6)} },
    { s:{r:1,c:0}, e:{r:1,c:3} },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Zeitplan');
  const fname = 'wattfolio-zeitplan' + (p.name ? '-'+p.name.replace(/[^a-z0-9äöüß_-]+/gi,'_') : '') + '.xlsx';
  XLSX.writeFile(wb, fname);
}

// ---- PDF-Export: eigenes Druckfenster im Querformat, nutzt das gerenderte Gantt-HTML ----
// Reproduziert die Gantt-Optik 1:1 (kein zusätzliches PDF-Framework nötig); der Browser
// erzeugt aus dem „Drucken"-Dialog das PDF (Als PDF speichern).
function exportGanttPdf(p){
  const el = document.getElementById('prozess-gantt');
  if(!el || !el.innerHTML.trim()){ alert('Kein Zeitplan zum Exportieren vorhanden.'); return; }
  const ganttHtml = el.innerHTML;
  const css = `
    @page{size:A4 landscape;margin:10mm}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    :root{--panel2:#f4f7f4;--border:#e8eae4;--border-strong:#d9ddd4;--text:#1b2420;--muted:#69736c;
      --accent:#0e9d6e;--accent2:#0b8159;--warn:#dd8a2f;--err:#d75651}
    html,body{margin:0}
    body{font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--text)}
    .pdf-head{display:flex;justify-content:space-between;align-items:flex-end;
      border-bottom:2px solid #0d3b42;padding-bottom:9px;margin-bottom:16px}
    .pdf-title{display:flex;align-items:center;gap:11px}
    .pdf-logo{width:34px;height:34px;border-radius:9px;flex:none;padding:5px;
      background:linear-gradient(150deg,#134a54,#0d3b42);display:grid;place-items:center}
    .pdf-logo svg{width:100%;height:100%;display:block}
    .pdf-head h1{margin:0;font-size:18px;font-weight:800;letter-spacing:-.01em}
    .pdf-head p{margin:3px 0 0;color:var(--muted);font-size:11.5px;font-weight:600}
    .pdf-meta{text-align:right;color:var(--muted);font-size:11px;line-height:1.5}
    .pdf-meta b{color:#0d3b42}
    .gantt{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#fff}
    .gantt-row{display:flex;align-items:stretch;border-top:1px solid var(--border);page-break-inside:avoid}
    .gantt-row:first-child{border-top:0}
    .gantt-group{padding:6px 12px;background:var(--panel2);font-size:10px;font-weight:800;
      text-transform:uppercase;letter-spacing:.03em;color:var(--muted);border-top:1px solid var(--border)}
    .gantt-label{flex:none;width:200px;padding:7px 12px;font-size:11.5px;font-weight:600;
      display:flex;align-items:center;gap:6px;border-right:1px solid var(--border)}
    .gantt-label .optional-tag{font-weight:500;color:var(--muted);font-size:10px}
    .gantt-track{flex:1;position:relative;min-height:30px}
    .gantt-header .gantt-track{min-height:22px}
    .gantt-grid-line{position:absolute;top:0;bottom:0;width:0;border-left:1px dashed var(--border)}
    .gantt-grid-label{position:absolute;top:5px;font-size:9px;color:var(--muted);font-weight:700;
      white-space:nowrap;transform:translateX(3px)}
    .gantt-today-line{position:absolute;top:0;bottom:0;width:0;border-left:1.5px solid var(--err);z-index:3}
    .gantt-bar{position:absolute;top:6px;height:17px;border-radius:5px;min-width:6px}
    .gantt-bar.erledigt{background:var(--accent)}
    .gantt-bar.laufend{background:repeating-linear-gradient(45deg,var(--warn),var(--warn) 6px,#c97a20 6px,#c97a20 12px)}
    .gantt-bar.geplant{background:var(--panel2);border:1.5px dashed var(--border-strong)}
    .gantt-milestone{position:absolute;top:6px;width:15px;height:15px;transform:translateX(-7.5px) rotate(45deg);
      border-radius:3px;background:var(--accent)}
    .gantt-milestone.geplant{background:var(--panel2);border:1.5px dashed var(--border-strong)}
    .gantt-legend{display:flex;gap:14px;flex-wrap:wrap;padding:8px 12px;font-size:10.5px;color:var(--muted);
      border-top:1px solid var(--border);background:var(--panel2)}
    .gantt-legend span{display:inline-flex;align-items:center;gap:5px}
    .gantt-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}`;
  const logoSvg = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><polygon points="28,10 50,10 44,21 22,21" fill="#ffffff"/><polygon points="21,25 43,25 37,36 15,36" fill="#e0d33b"/><polygon points="14,40 32,40 26,51 8,51" fill="#ffffff"/></svg>';
  const head = `<div class="pdf-head">
      <div class="pdf-title"><div class="pdf-logo">${logoSvg}</div>
        <div><h1>Zeitplan — ${escapeHtml(p.name || 'Projekt')}</h1>
        <p>Grundstückssicherung · Gutachten · Genehmigungsplanung bis Baugenehmigung</p></div></div>
      <div class="pdf-meta"><b>Wattfolio</b> — Projektentwicklung<br>
        Projekt-ID: ${escapeHtml(p.prozess.projektnummer || '—')}<br>Stand: ${escapeHtml(fmtDate(ganttTodayIso()))}</div>
    </div>`;
  const win = window.open('', '_blank');
  if(!win){ alert('Bitte Pop-ups für den PDF-Export erlauben.'); return; }
  win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Zeitplan — ${escapeHtml(p.name || 'Projekt')}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>${css}</style></head><body>${head}${ganttHtml}</body></html>`);
  win.document.close();
  win.focus();
  // Kurzer Verzug, damit Schrift/Layout stehen, bevor der Druckdialog öffnet.
  setTimeout(() => { try { win.print(); } catch(e){} }, 450);
}

// Export-Buttons in der Gantt-Kopfzeile (statisch im DOM) — einmalig binden.
// preventDefault verhindert, dass der Klick das <details> auf-/zuklappt.
(function initGanttExportButtons(){
  const bind = (id, fn) => {
    const btn = document.getElementById(id); if(!btn) return;
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const p = getActiveProject(); if(!p) return;
      fn(p);
    });
  };
  bind('btn-gantt-xlsx', exportGanttXlsx);
  bind('btn-gantt-pdf', exportGanttPdf);
})();
