// Netz NVP/Trasse, Fristen-Dashboard, Kalender, ICS-Export, Termine-Reiter
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---- Netz: NVP/Trasse (AP8) ----
(function initNetzProzessFields(){
  const nvpSel = document.getElementById('netz-nvp-status');
  const trSel = document.getElementById('netz-trasse-status');
  nvpSel.innerHTML = NVP_STATUS.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
  trSel.innerHTML = TRASSE_STATUS.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
  document.getElementById('netz-ana').addEventListener('change', e => {
    const p = getActiveProject(); if(!p) return;
    p.netz.anaGestelltAm = e.target.value || null; touchActiveProject(); saveProjects();
  });
  nvpSel.addEventListener('change', () => {
    const p = getActiveProject(); if(!p) return;
    p.netz.nvpStatus = nvpSel.value; touchActiveProject(); saveProjects();
    document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
  });
  trSel.addEventListener('change', () => {
    const p = getActiveProject(); if(!p) return;
    p.netz.trasseStatus = trSel.value; touchActiveProject(); saveProjects();
    document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
  });
  document.getElementById('netz-trasse-notiz').addEventListener('input', e => {
    const p = getActiveProject(); if(!p) return;
    p.netz.trasseNotiz = e.target.value; touchActiveProject(); saveProjects();
  });
})();

// ---- Fristen-Dashboard (AP6, Startseite) ----
function projectDeadlines(p){
  const out = [];
  const fsByeId = Object.fromEntries(((p.lage&&p.lage.flurstuecke)||[]).map(f => [String(f.id), f]));
  Object.entries(p.flurstueckDaten||{}).forEach(([fid, ex]) => {
    // Flurstücke, die ein Pacht-/Kaufvertrag führt, melden ihre Fristen über den Vertrag (vertragDeadlines)
    if(vertragFuerFlurstueck(p, fid)) return;
    if(ex.rueckTrittsfrist && !['aufgelöst','kein Interesse'].includes(ex.vertragsStatus)){
      const f = fsByeId[String(fid)];
      const label = f ? `${f.gemarkung||''} ${flurText(f.flur)} Flst. ${f.zaehler??''}${f.nenner?'/'+f.nenner:''}`.trim() : `#${fid}`;
      out.push({ datum:ex.rueckTrittsfrist, text:`Rücktrittsfrist Flurstück ${label}`, p, tab:'grundstueck', sub:'sicherung', warnTage:42 });
    }
  });
  Object.entries(p.gutachten||{}).forEach(([gid, e]) => {
    const def = gutachtenDef(gid);
    if(!def || e.erforderlich!=='ja' || !e.erwartetAm) return;
    if(def.doku && dokuDerivedState(p, def.doku)==='erledigt') return; // liegt bereits vor
    out.push({ datum:e.erwartetAm, text:`Gutachten erwartet: ${def.name}`, p, tab:'genehmigung', warnTage:21 });
  });
  const aus = p.genehmigung.bplan.meilensteine.auslegung;
  if(aus.bis && !aus.erledigt)
    out.push({ datum:aus.bis, text:'Ende öffentliche Auslegung (B-Plan)', p, tab:'genehmigung', warnTage:14 });
  const bv = p.genehmigung.bauverfahren;
  if(bv.baubeginnAm && !bv.baubeginnsanzeigeAm){
    const d = new Date(bv.baubeginnAm+'T12:00:00'); d.setDate(d.getDate()-7);
    out.push({ datum:d.toISOString().slice(0,10), text:'Baubeginnsanzeige einreichen (1 Woche vor Baubeginn)', p, tab:'genehmigung', warnTage:14 });
  }
  (p.genehmigung.fristenListe||[]).forEach(f => {
    if(f.datum) out.push({ datum:f.datum, text:f.text||'Frist', p, tab:'genehmigung', warnTage:14 });
  });
  out.push(...vertragDeadlines(p));
  out.push(...kostenDeadlines(p));
  return out;
}
function collectDeadlines(){
  return projects.flatMap(projectDeadlines).sort((a,b) => a.datum.localeCompare(b.datum));
}

// ═════════════════════════════════════════════════════════════════════════════
// Kalender: sammelt alle Termine eines Projekts automatisch aus den Fachdaten
// (Prozess-Schritte, Dokumente, B-Plan, Bauverfahren, Netz, Qualifikation,
// Fristen, Kommunikationslog) — nichts wird doppelt gepflegt.
// ═════════════════════════════════════════════════════════════════════════════
const EVENT_KINDS = {
  frist:       { label:'Frist',           color:'#d75651' },
  termin:      { label:'Termin',          color:'#dd8a2f' },
  schritt:     { label:'Prozess-Schritt', color:'#0e9d6e' },
  dokument:    { label:'Dokument',        color:'#5b6b7a' },
  bplan:       { label:'B-Plan / Bau',    color:'#a8762c' },
  netz:        { label:'Netz',            color:'#7c5cbf' },
  quali:       { label:'Qualifikation',   color:'#2f7dd1' },
  komm:        { label:'Kommunikation',   color:'#128b8b' },
  kosten:      { label:'Kosten',          color:'#a34d6d' },
};
const STEP_NAME_BY_ID = Object.fromEntries(PROCESS_TEMPLATE.flatMap(ph => ph.steps.map(s => [s.id, s.name])));
const toDay = iso => (iso||'').slice(0,10); // volle ISO-Timestamps auf YYYY-MM-DD kürzen

function collectProjectEvents(p){
  const out = [];
  const add = (datum, kind, text, nav) => {
    const d = toDay(datum);
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)) out.push(Object.assign({ datum:d, kind, text, p }, nav||{}));
  };
  // Fristen (gleiche Quelle wie das Fristen-Dashboard)
  projectDeadlines(p).forEach(f => out.push(Object.assign({ kind:'frist' }, f)));
  // Prozess-Schritte: manuell auf „erledigt" gesetzte Schritte tragen einen Zeitstempel
  Object.entries(p.prozess.schritte||{}).forEach(([id, st]) => {
    if(st && st.status==='erledigt' && st.datum)
      add(st.datum, 'schritt', `Erledigt: ${STEP_NAME_BY_ID[id]||id}`, { tab:'prozess' });
  });
  // Dokumente: angefragt / erhalten
  Object.entries(p.dokumente||{}).forEach(([typId, d]) => {
    const name = (dokumentType(typId)||{}).name || typId;
    if(d.angefragtAm) add(d.angefragtAm, 'dokument', `Angefragt: ${name}`, { tab:'prozess' });
    if(d.erhaltenAm)  add(d.erhaltenAm,  'dokument', `Erhalten: ${name}`,  { tab:'prozess' });
  });
  // B-Plan-Meilensteine (Datum bzw. Auslegungszeitraum)
  BPLAN_MEILENSTEINE.forEach(([key, label]) => {
    const m = p.genehmigung.bplan.meilensteine[key] || {};
    if(m.datum) add(m.datum, 'bplan', label, { tab:'genehmigung' });
    if(m.von)   add(m.von,   'bplan', `Beginn: ${label}`, { tab:'genehmigung' });
    if(m.bis && m.erledigt) add(m.bis, 'bplan', `Ende: ${label}`, { tab:'genehmigung' }); // offenes „bis" kommt schon als Frist
  });
  // Bauverfahren
  const bv = p.genehmigung.bauverfahren;
  [['eingereichtAm','Bauantrag eingereicht'],['vollstaendigAm','Vollständigkeitsbestätigung'],
   ['genehmigtAm','Baugenehmigung erteilt'],['baubeginnAm','Baubeginn'],['baubeginnsanzeigeAm','Baubeginnsanzeige eingereicht']]
    .forEach(([k,label]) => { if(bv[k]) add(bv[k], 'bplan', label, { tab:'genehmigung' }); });
  // Netz
  if(p.netz.anaGestelltAm) add(p.netz.anaGestelltAm, 'netz', 'Netzanschlussanfrage (ANA) gestellt', { tab:'netz' });
  // Qualifikations-Prüfungen
  QUALI_KEYS.forEach(k => {
    const q = p.qualifikation[k];
    if(q && q.geprueftAm) add(q.geprueftAm, 'quali', `${QUALI_LABELS[k]} geprüft`, { tab:'grundstueck', sub:'karte' });
  });
  // Sicherung: erste Zahlungen je Flurstück
  Object.entries(p.flurstueckDaten||{}).forEach(([kennz, ex]) => {
    if(vertragFuerFlurstueck(p, kennz)) return; // steht beim Vertrag
    if(ex.ersteZahlungAm) add(ex.ersteZahlungAm, 'frist', `Erste Zahlung Flurstück ${kennz}`, { tab:'grundstueck', sub:'sicherung' });
  });
  // Verträge: Unterzeichnung (Fristen/Zahlungen kommen über projectDeadlines)
  (p.vertraege||[]).forEach(v => {
    if(v.unterschriebenAm) add(v.unterschriebenAm, 'frist', `Vertrag unterzeichnet: ${vertragTitel(v)}`, { tab:'grundstueck', sub:'vertraege' });
  });
  // Kosten: Eingang der Belege und Bescheide (Zahlungs- und Widerspruchsfristen kommen über projectDeadlines)
  (p.kosten||[]).forEach(k => {
    if(k.bezahltAm) add(k.bezahltAm, 'kosten', `Bezahlt: ${kostenTitel(k)} (${EUR2(kostenBrutto(k))})`, { tab:'kosten' });
  });
  // Kommunikationslog
  (p.kommunikation||[]).forEach(k => {
    if(k.datum) add(k.datum, 'komm', `${k.kanal||'Kontakt'}: ${k.kontakt||'—'}${k.notiz?' — '+k.notiz:''}`, { tab:'termine' });
  });
  // Manuell angelegte Termine
  (p.termine||[]).forEach(t => {
    if(t.datum) add(t.datum, 'termin', t.titel||'Termin', { tab:'termine', terminId:t.id });
  });
  return out;
}
function collectAllEvents(){ return projects.flatMap(collectProjectEvents); }

// ---- Monatskalender-Komponente (für Startseite und Projekt-Reiter „Termine") ----
function createCalendar(rootId, opts){
  const root = () => document.getElementById(rootId);
  const today = new Date();
  // Angezeigter Monat überlebt einen Reload (pro Kalender-Instanz)
  const stateKey = 'pa_cal_' + rootId + '_v1';
  const savedMonth = loadOr(stateKey, null);
  const state = {
    y: (savedMonth && Number.isInteger(savedMonth.y)) ? savedMonth.y : today.getFullYear(),
    m: (savedMonth && Number.isInteger(savedMonth.m)) ? savedMonth.m : today.getMonth(),
    selected: null, events: []
  };
  const pad = n => String(n).padStart(2,'0');
  const dayKey = (y,m,d) => `${y}-${pad(m+1)}-${pad(d)}`;
  const saveMonth = () => save(stateKey, { y:state.y, m:state.m });

  // Darstellungsstufe nach der tatsächlichen Breite des Kalenders (opts.adaptive), sonst fest:
  //   klein  (< 400 px): farbige Punkte je Tag, Tagesliste unter dem Monat
  //   mittel (< 640 px): Einträge mit Projektname (2 je Tag), Tagesliste darunter
  //   gross  (< 900 px): 3 Einträge je Tag, Tagesliste neben dem Monat
  //   xl     (ab 900 px): 4 Einträge je Tag mit Projekt und Termintext, Tagesliste daneben
  const MODI = { klein:{ chips:0 }, mittel:{ chips:2 }, gross:{ chips:3 }, xl:{ chips:4 } };
  function modus(){
    if(!opts.adaptive) return opts.mini ? 'klein' : 'gross';
    const w = (root() || {}).clientWidth || 0;
    return w < 400 ? 'klein' : w < 640 ? 'mittel' : w < 900 ? 'gross' : 'xl';
  }
  let letzterModus = null;
  if(opts.adaptive && 'ResizeObserver' in window){
    // Nur beim Wechsel der Stufe neu aufbauen — nicht bei jedem Pixel während des Ziehens
    new ResizeObserver(() => { if(root() && root().offsetParent && modus() !== letzterModus) render(); })
      .observe(document.getElementById(rootId));
  }

  function render(){
    state.events = opts.getEvents();
    const el = root(); if(!el) return;
    const m = modus(); letzterModus = m;
    el.dataset.calMode = m;
    const maxChips = MODI[m].chips;
    const chipText = ev => !opts.global ? ev.text : m === 'xl' ? `${ev.p.name || '?'} · ${ev.text}` : (ev.p.name || '?');
    const byDay = {};
    state.events.forEach(ev => { (byDay[ev.datum] = byDay[ev.datum] || []).push(ev); });
    const first = new Date(state.y, state.m, 1);
    const startOffset = (first.getDay()+6) % 7; // Montag = 0
    const start = new Date(state.y, state.m, 1 - startOffset);
    const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
    const monthName = first.toLocaleDateString('de-DE', { month:'long', year:'numeric' });
    let cells = '';
    for(let i=0; i<42; i++){
      const d = new Date(start); d.setDate(start.getDate()+i);
      const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
      const evs = byDay[key] || [];
      const cls = ['cal-day', d.getMonth()!==state.m?'out':'', key===todayKey?'today':'', key===state.selected?'selected':''].filter(Boolean).join(' ');
      // Stufe „klein": nur farbige Punkt-Marker; sonst Text-Chips (Anzahl je nach Stufe)
      const chips = !maxChips
        ? (evs.length?`<div class="cal-dots" title="${escapeAttr(evs.length+' Termin'+(evs.length===1?'':'e'))}">${evs.slice(0,4).map(ev=>`<i style="--ev-color:${EVENT_KINDS[ev.kind].color}"></i>`).join('')}${evs.length>4?`<b>+${evs.length-4}</b>`:''}</div>`:'')
        : evs.slice(0,maxChips).map(ev =>
            `<div class="cal-ev" style="--ev-color:${EVENT_KINDS[ev.kind].color}" title="${escapeAttr((opts.global?(ev.p.name||'(unbenannt)')+': ':'')+ev.text)}"><i></i><span>${escapeHtml(chipText(ev))}</span></div>`).join('')
          + (evs.length>maxChips?`<div class="cal-ev more">+${evs.length-maxChips} weitere</div>`:'');
      cells += `<div class="${cls}" data-day="${key}"><div class="d">${d.getDate()}</div>${chips}</div>`;
    }
    const usedKinds = [...new Set(state.events.map(e=>e.kind))];
    el.innerHTML = `
      <div class="cal-head">
        <button type="button" class="secondary small" data-cal="prev">‹</button>
        <span class="cal-title">${monthName}</span>
        <button type="button" class="secondary small" data-cal="next">›</button>
        <span class="spacer" style="flex:1"></span>
        <button type="button" class="secondary small" data-cal="today">Heute</button>
        <button type="button" class="secondary small" data-cal="ics" title="Alle Termine als .ics-Datei für Outlook/Google/Apple Kalender exportieren">${m==='klein'||m==='mittel'?'⤓ .ics':'In Kalender übernehmen (.ics)'}</button>
      </div>
      <div class="cal-body">
        <div class="cal-grid">
          ${['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
          ${cells}
        </div>
        <div class="cal-daylist" data-cal-daylist></div>
      </div>
      ${usedKinds.length?`<div class="cal-legend">${usedKinds.map(k=>`<span><i style="background:${EVENT_KINDS[k].color}"></i>${EVENT_KINDS[k].label}</span>`).join('')}</div>`:''}`;
    el.querySelector('[data-cal=prev]').onclick = () => { state.m--; if(state.m<0){state.m=11;state.y--;} saveMonth(); render(); };
    el.querySelector('[data-cal=next]').onclick = () => { state.m++; if(state.m>11){state.m=0;state.y++;} saveMonth(); render(); };
    el.querySelector('[data-cal=today]').onclick = () => { state.y=today.getFullYear(); state.m=today.getMonth(); state.selected=todayKey; saveMonth(); render(); };
    el.querySelector('[data-cal=ics]').onclick = () => exportIcs(state.events, opts.global);
    el.querySelectorAll('.cal-day').forEach(cell => {
      cell.addEventListener('click', () => { state.selected = cell.dataset.day; render(); });
    });
    renderDayList(byDay);
  }
  function renderDayList(byDay){
    const el = root(); if(!el) return;
    const list = el.querySelector('[data-cal-daylist]');
    const evs = state.selected ? (byDay[state.selected]||[]) : [];
    if(!state.selected){
      list.innerHTML = '<div class="pane-hint" style="margin:0">Tag anklicken, um die Termine anzuzeigen oder einen neuen Termin anzulegen.</div>';
      return;
    }
    // Formular „+ Termin": legt einen manuellen Termin am gewählten Tag an.
    // Im globalen Kalender wird zusätzlich das Ziel-Projekt gewählt.
    const addForm = `<div class="cal-add">
        ${opts.global?`<select data-add-proj>${projects.map(pr=>`<option value="${escapeAttr(pr.id)}">${escapeHtml(pr.name||'(unbenanntes Projekt)')}</option>`).join('')}</select>`:''}
        <input type="text" data-add-titel placeholder="Neuer Termin, z.B. Ortstermin Vermesser" />
        <button type="button" class="small" data-add-btn ${opts.global&&!projects.length?'disabled':''}>+ Termin</button>
      </div>`;
    const rows = evs.map((ev,i) => `<div class="frist-row">
        <span class="ev-dot" style="--ev-color:${EVENT_KINDS[ev.kind].color}"></span>
        <span style="flex:1">${escapeHtml(ev.text)}</span>
        ${opts.global?`<span class="frist-link" data-ev-idx="${i}">${escapeHtml(ev.p.name||'(unbenanntes Projekt)')} →</span>`:''}
        ${ev.terminId?`<button type="button" class="danger small" data-del-termin="${i}" title="Termin löschen">×</button>`:''}
      </div>`).join('');
    list.innerHTML = `<div style="font-weight:800;font-size:12.5px;margin-bottom:6px">${fmtDate(state.selected)}</div>`
      + (rows || '<div class="pane-hint" style="margin:0 0 8px">Keine Termine an diesem Tag.</div>')
      + addForm;
    list.querySelectorAll('[data-ev-idx]').forEach(elLink => {
      elLink.addEventListener('click', () => {
        const ev = evs[Number(elLink.dataset.evIdx)];
        selectProject(ev.p.id);
        if(ev.tab) switchDetailTab(ev.tab);
        if(ev.sub) switchGrundstueckSubtab(ev.sub);
      });
    });
    list.querySelectorAll('[data-del-termin]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = evs[Number(btn.dataset.delTermin)];
        if(!confirm(`Termin "${ev.text}" löschen?`)) return;
        ev.p.termine = (ev.p.termine||[]).filter(t => t.id !== ev.terminId);
        ev.p.updatedAt = new Date().toISOString();
        saveProjects();
        render();
      });
    });
    const addBtn = list.querySelector('[data-add-btn]');
    const addInput = list.querySelector('[data-add-titel]');
    const doAdd = () => {
      const titel = addInput.value.trim();
      if(!titel) { addInput.focus(); return; }
      const projSel = list.querySelector('[data-add-proj]');
      const target = opts.global ? projects.find(pr => pr.id === projSel.value) : getActiveProject();
      if(!target) return;
      target.termine.push({ id:'t'+Date.now()+Math.random().toString(36).slice(2,6), datum:state.selected, titel });
      target.updatedAt = new Date().toISOString();
      saveProjects();
      render();
    };
    addBtn.addEventListener('click', doAdd);
    addInput.addEventListener('keydown', e => { if(e.key==='Enter') doAdd(); });
  }
  // Stufe neu bestimmen und nur bei einem Wechsel neu aufbauen (vom Breiten-Griff und bei Fenster-Resize aufgerufen)
  function pruefeModus(){ if(opts.adaptive && root() && root().offsetParent && modus() !== letzterModus) render(); }
  return { render, pruefeModus };
}
// Startseite: Kalender in der rechten, in der Breite verstellbaren Spalte — Darstellung passt sich an (adaptive)
const globalCalendar = createCalendar('global-kalender', { global:true, adaptive:true, getEvents: () => collectAllEvents() });
const projektCalendar = createCalendar('projekt-kalender', { global:false, getEvents: () => { const p = getActiveProject(); return p ? collectProjectEvents(p) : []; } });
function renderGlobalCalendar(){ globalCalendar.render(); }

// ---- Kalenderspalte der Startseite in der Breite verstellbar ----
// Griff links an der Spalte: Maus/Touch ziehen, Pfeiltasten (←/→ je 20 px, mit Umschalt 80 px),
// Doppelklick setzt die Standardbreite zurück. Die Breite liegt als --cal-w am Raster (.list-wrap);
// die CSS-clamp-Regel hält sie im erlaubten Bereich. Pro Browser gemerkt.
(function(){
  const griff = document.getElementById('cal-resizer');
  const wrap = document.querySelector('.list-wrap');
  if(!griff || !wrap) return;
  const KEY = 'pa_cal_breite_v1';
  const aktuell = () => Math.round(document.querySelector('.list-cal').getBoundingClientRect().width);
  const setze = px => {
    if(px == null) wrap.style.removeProperty('--cal-w');
    else wrap.style.setProperty('--cal-w', Math.round(px) + 'px');
    griff.setAttribute('aria-valuenow', String(aktuell()));
    globalCalendar.pruefeModus(); // Darstellung sofort an die neue Breite anpassen (ResizeObserver kommt ggf. später)
  };
  const merke = () => { try { const v = wrap.style.getPropertyValue('--cal-w'); v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} };
  try { const v = localStorage.getItem(KEY); if(v) wrap.style.setProperty('--cal-w', v); } catch {}
  griff.setAttribute('aria-valuemin', '260');

  griff.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { griff.setPointerCapture(e.pointerId); } catch {}
    griff.classList.add('ziehen'); document.body.classList.add('cal-ziehen');
    // Rechte Kante der Spalte bleibt stehen, die linke folgt dem Zeiger
    const rechts = document.querySelector('.list-cal').getBoundingClientRect().right;
    const bewegen = ev => setze(rechts - ev.clientX);
    const ende = () => {
      griff.classList.remove('ziehen'); document.body.classList.remove('cal-ziehen');
      griff.removeEventListener('pointermove', bewegen); griff.removeEventListener('pointerup', ende); griff.removeEventListener('pointercancel', ende);
      setze(aktuell()); merke(); // auf die tatsächlich erreichte (geclampte) Breite festschreiben
    };
    griff.addEventListener('pointermove', bewegen);
    griff.addEventListener('pointerup', ende);
    griff.addEventListener('pointercancel', ende);
  });
  griff.addEventListener('keydown', e => {
    const schritt = e.shiftKey ? 80 : 20;
    if(e.key === 'ArrowLeft'){ e.preventDefault(); setze(aktuell() + schritt); merke(); }
    else if(e.key === 'ArrowRight'){ e.preventDefault(); setze(aktuell() - schritt); merke(); }
    else if(e.key === 'Home'){ e.preventDefault(); setze(null); merke(); }
  });
  griff.addEventListener('dblclick', () => { setze(null); merke(); });
  window.addEventListener('resize', () => globalCalendar.pruefeModus());
  setze(wrap.style.getPropertyValue('--cal-w') ? parseFloat(wrap.style.getPropertyValue('--cal-w')) : null);
})();

// ---- ICS-Export: alle Kalender-Termine als Datei für Outlook/Google/Apple ----
// Fristen bekommen eine Erinnerung (VALARM) mit dem gleichen Vorlauf wie die
// Warnschwelle im Fristen-Dashboard (Rücktrittsfristen 42 Tage, sonst 14).
function icsEscape(s){
  return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}
function buildIcs(events, global){
  const stamp = new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)+'Z';
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Wattfolio//Projektkalender//DE','CALSCALE:GREGORIAN'];
  events.forEach((ev,i) => {
    const d = ev.datum.replace(/-/g,'');
    const end = new Date(ev.datum+'T12:00:00'); end.setDate(end.getDate()+1);
    const summary = icsEscape((global ? `[${ev.p.name||'(unbenannt)'}] ` : '') + ev.text);
    lines.push('BEGIN:VEVENT',
      `UID:wattfolio-${d}-${i}-${(ev.p&&ev.p.id)||'x'}@wattfolio`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`,
      `SUMMARY:${summary}`,
      `CATEGORIES:${icsEscape(EVENT_KINDS[ev.kind].label)}`);
    if(ev.kind==='frist')
      lines.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${summary}`,`TRIGGER:-P${ev.warnTage||14}D`,'END:VALARM');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n')+'\r\n';
}
function exportIcs(events, global){
  if(!events.length){ alert('Keine Termine zum Exportieren vorhanden.'); return; }
  const blob = new Blob([buildIcs(events, global)], { type:'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const projName = (!global && getActiveProject()) ? '-'+(getActiveProject().name||'projekt').replace(/[^a-z0-9äöüß_-]+/gi,'_') : '';
  a.download = `wattfolio-termine${projName}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---- Reiter „Termine": Projektkalender + Kommunikationslog ----
const KOMM_KANAELE = ['Telefonat','E-Mail','Termin vor Ort','Videocall','Brief','Sonstiges'];
function renderTermineTab(){
  const p = getActiveProject(); if(!p) return;
  projektCalendar.render();
  renderKommLog();
}
function renderKommLog(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('komm-list'); if(!root) return;
  const list = [...p.kommunikation].sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
  if(!list.length){ root.innerHTML = '<div class="empty" style="padding:14px">Noch keine Einträge. „+ Eintrag" legt eine Gesprächsnotiz an.</div>'; return; }
  root.innerHTML = list.map(k => `<div class="komm-entry" data-komm="${escapeAttr(k.id)}">
    <div class="komm-top">
      <input type="date" data-k="datum" value="${escapeAttr(k.datum||'')}" />
      <select data-k="kanal">${KOMM_KANAELE.map(c=>`<option${c===k.kanal?' selected':''}>${c}</option>`).join('')}</select>
      <input type="text" data-k="kontakt" value="${escapeAttr(k.kontakt||'')}" placeholder="Mit wem? (z.B. Bürgermeister Müller)" />
      <button class="danger small" data-del-komm="${escapeAttr(k.id)}">×</button>
    </div>
    <textarea data-k="notiz" placeholder="Ergebnis / Absprachen ...">${escapeHtml(k.notiz||'')}</textarea>
  </div>`).join('');
  root.querySelectorAll('.komm-entry').forEach(entry => {
    entry.querySelectorAll('[data-k]').forEach(inp => {
      const ev = (inp.type==='date' || inp.tagName==='SELECT') ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        const p2 = getActiveProject(); if(!p2) return;
        const item = p2.kommunikation.find(x => x.id===entry.dataset.komm); if(!item) return;
        item[inp.dataset.k] = inp.value;
        touchActiveProject(); saveProjects();
        if(inp.dataset.k==='datum') projektCalendar.render();
      });
    });
  });
  root.querySelectorAll('[data-del-komm]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      if(!confirm('Eintrag löschen?')) return;
      p2.kommunikation = p2.kommunikation.filter(x => x.id!==btn.dataset.delKomm);
      touchActiveProject(); saveProjects(); renderTermineTab();
    });
  });
}
document.getElementById('btn-add-komm').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  p.kommunikation.push({ id:'k'+Date.now()+Math.random().toString(36).slice(2,6),
    datum:new Date().toISOString().slice(0,10), kanal:'Telefonat', kontakt:'', notiz:'' });
  touchActiveProject(); saveProjects(); renderTermineTab();
  const first = document.querySelector('#komm-list .komm-entry input[data-k="kontakt"]');
  if(first) first.focus();
});
function renderFristenDashboard(){
  const card = document.getElementById('fristen-dashboard');
  const root = document.getElementById('fristen-dashboard-list');
  const deadlines = collectDeadlines();
  if(!deadlines.length){ card.style.display='none'; return; }
  card.style.display = '';
  document.getElementById('fristen-count').textContent = deadlines.length;
  root.innerHTML = deadlines.slice(0,10).map((d,i) => {
    const t = daysUntil(d.datum);
    return `<div class="frist-row">
      <span class="frist-datum">${fmtDate(d.datum)}</span>
      <span class="${fristPillClass(d.datum, d.warnTage)}">${t<0?Math.abs(t)+' Tage überfällig':t===0?'heute':'in '+t+' Tagen'}</span>
      <span style="flex:1">${escapeHtml(d.text)}</span>
      <span class="frist-link" data-frist-idx="${i}">${escapeHtml(d.p.name||'(unbenanntes Projekt)')} →</span>
    </div>`;
  }).join('');
  root.querySelectorAll('[data-frist-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const d = deadlines[Number(el.dataset.fristIdx)];
      selectProject(d.p.id);
      switchDetailTab(d.tab);
      if(d.sub) switchGrundstueckSubtab(d.sub);
    });
  });
}

function selectProject(id, opts){
  saveActiveScroll();          // Scrollposition des bisher aktiven Tabs sichern
  map.closePopup();
  activeProjectId = id;
  const p = getActiveProject(); if(!p) return;
  openProjectTab(id);
  try { localStorage.setItem('pa_last_project_v1', id); } catch{}
  // Gemerkten Ansichtszustand dieses Tabs wiederherstellen (Reiter, Unterreiter, Scroll)
  const st = tabStateFor(id);
  const savedSub = st.grundSub, savedScroll = st.scrollTop || 0;
  // Beim Öffnen eines Projekts landet man immer auf der Übersicht (Dashboard) —
  // außer ein abweichender Start-Tab wurde explizit angefordert (z.B. Kartenansicht bei Neuanlage).
  const tab = (opts && opts.startTab) || 'uebersicht';
  switchView('detail');
  switchDetailTab(tab);
  if(tab==='grundstueck' && savedSub && savedSub!=='karte') switchGrundstueckSubtab(savedSub);
  loadActiveProjectIntoSidebar(p);
  loadActiveProjectGeometryIntoMap(p);
  renderOtherProjectsOnMap();
  syncLageNaturschutzUI(p);
  refreshStats();
  if(p.features.length){
    fitMapWhenVisible(() => { map.fitBounds(combinedBounds(p), { padding:[20,20] }); updateAlkisWms(); });
  } else if(p.planBundesland){
    // Noch keine Fläche gezeichnet, aber ein Bundesland wurde beim Anlegen gewählt:
    // Kartenausschnitt schon vorab dorthin legen, damit ALKIS-WMS/Layer-Umschaltung
    // (updateAlkisWms, an map "moveend" gebunden) sofort für dieses Bundesland greift.
    const st = STATES.find(s => s.key===p.planBundesland);
    if(st) fitMapWhenVisible(() => {
      map.fitBounds([[st.bbox[0],st.bbox[1]],[st.bbox[2],st.bbox[3]]], { padding:[20,20] });
      updateAlkisWms();
    });
  }
  // Scroll erst nach dem Rendern setzen (doppeltes rAF, da Karten-invalidateSize via rAF läuft)
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const el = detailScroller(); if(el) el.scrollTop = savedScroll;
  }));
}

function standortText(p){
  const l = p.lage;
  if(l && (l.land || (l.kreise&&l.kreise.length) || (l.gemeinden&&l.gemeinden.length))){
    return [l.land, (l.kreise||[]).join(', '), (l.gemeinden||[]).join(', ')].filter(Boolean).join(' · ');
  }
  return p.location || 'Lage nicht ermittelt';
}

function naturschutzSummary(p){
  if(!p.naturschutz) return null;
  const total = p.naturschutz.results.reduce((s,r)=>s+r.items.length, 0);
  return total === 0
    ? 'Keine Treffer (BBOX-Scan)'
    : `${total} Treffer in ${p.naturschutz.results.filter(r=>r.items.length).length} Kategorie(n)`;
}

function projectExtraInfoHtml(p){
  const l = p.lage;
  const rows = [
    ['Erstellt', new Date(p.createdAt).toLocaleString('de-DE')],
    ['Zeitrahmen', p.timeline || '—'],
    ['Gemarkung(en)', (l && l.gemarkungen && l.gemarkungen.length) ? l.gemarkungen.join(', ') : '—'],
    ['Flur(en)', (l && l.fluren && l.fluren.length) ? l.fluren.join(', ') : '—'],
    ['Flurstücke', (l && l.flurstuecke) ? String(l.flurstuecke.length) : '—'],
    ['Naturschutz-Scan', naturschutzSummary(p) || 'Noch nicht geprüft'],
  ];
  const rowsHtml = rows.map(([k,v]) => `<div class="stat"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join('');
  const notesHtml = p.notes
    ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
         <span style="color:var(--muted);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Zusatzinfos</span>
         <div style="margin-top:4px">${escapeHtml(p.notes)}</div>
       </div>`
    : '';
  return rowsHtml + notesHtml;
}
