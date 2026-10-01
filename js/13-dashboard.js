// Dashboard / Projekt-Übersicht
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Dashboard / Übersicht: verdichtet die wichtigsten Stati aus allen Fachreitern auf
// eine Landeseite (Kopfzeile, Stand je Bereich, Als Nächstes, Updates, Gantt).
// ═════════════════════════════════════════════════════════════════════════════
function dashPill(cls, txt){ return `<span class="pill ${cls}">${escapeHtml(txt)}</span>`; }
function dashUpdateRowHtml(u){
  const when = new Date(u.createdAt).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const who = u.author ? `${escapeHtml(u.author)} · ` : '';
  const toggle = u.type==='task'
    ? `<button type="button" class="dash-update-toggle${u.done?' done':''}" data-action="toggle" title="${u.done?'Als offen markieren':'Als erledigt markieren'}">${u.done?'✓':''}</button>`
    : `<span class="dash-update-dot" title="Status-Update"></span>`;
  return `<div class="dash-update-row${u.done?' done':''}" data-update="${escapeAttr(u.id)}">
    ${toggle}
    <span class="dash-update-text">${escapeHtml(u.text)}</span>
    <span class="dash-update-meta">${who}${escapeHtml(when)}</span>
    <button type="button" class="dash-update-del" data-action="delete" title="Eintrag löschen">×</button>
  </div>`;
}
// Eine Zeile in „Stand je Bereich": Bereich · Kurzbefund · Status. Klick springt in den Reiter.
function dashAreaRow(o){
  return `<button type="button" class="dash-area" data-dash-nav='${escapeAttr(JSON.stringify(o.nav))}'>
    <span class="dash-area-name">${escapeHtml(o.name)}</span>
    <span class="dash-area-detail">${o.detail}</span>
    <span class="dash-area-status">${o.pill}</span>
    <span class="dash-area-go" aria-hidden="true">›</span>
  </button>`;
}

// Übersicht: bewusst wenige, ruhige Flächen — eine Kopfzeile (Phase, Kennzahlen, Fortschritt),
// daneben/darunter „Stand je Bereich" als Liste statt Kacheln und „Als Nächstes" (Fristen +
// nächste Schritte) plus Updates. Nur Lesen aus den Fachdaten, keine eigene Persistenz.
function renderDashboard(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('dashboard'); if(!root) return;
  document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
  renderProzessGantt(p);
  renderUebersichtExtras(p);

  // ---- Kopfzeile ----
  const o = overallProgress(p);
  const ph = currentPhase(p);
  const pctVal = o.total ? Math.round(o.done / o.total * 100) : 0;
  const abgebrochen = p.prozess.abgebrochen;
  const ha = (combinedArea(p) / 10000).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const facts = [
    ['Größe', `${ha} ha`],
    ['Leistung', formatLeistung(p) || '—'],
    ['Anlagentyp', p.technik.anlagentyp],
    ['Vermarktung', p.prozess.vermarktung],
    ['Gesellschaft', p.prozess.gesellschaft],
    ['Projekt-ID', p.prozess.projektnummer],
  ].filter(([, v]) => v); // leere Angaben weglassen statt „—"-Kästchen
  const standort = standortText(p);
  const headHtml = `<div class="info dash-head">
      <div class="dash-head-top">
        <div class="dash-head-phase">
          <span class="dash-head-label">${abgebrochen ? 'Zurückgestellt / abgebrochen' : `Phase ${ph.nr} von 10`}</span>
          <strong>${escapeHtml(abgebrochen ? (p.prozess.abbruchGrund || 'Projekt ruht') : ph.name)}</strong>
          ${standort && standort !== '—' ? `<span class="dash-head-sub">${escapeHtml(standort)}</span>` : ''}
        </div>
        <dl class="dash-facts">${facts.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
      </div>
      <div class="dash-progress">
        <div class="dash-bar"><b style="width:${pctVal}%"></b></div>
        <span><b>${pctVal} %</b> · ${o.done} von ${o.total} Schritten erledigt</span>
      </div>
    </div>`;

  // ---- Stand je Bereich ----
  const rows = [];
  const secRows = sicherungRows(p);
  const secDone = secRows.filter(r => r.extra.vertragsStatus === 'unterschrieben').length;
  const secWork = secRows.filter(r => ['Interesse','Vertrag verhandelt','Eigentümer kontaktiert'].includes(r.extra.vertragsStatus)).length;
  rows.push({ name:'Flächensicherung', nav:{ tab:'grundstueck', sub:'sicherung' },
    detail: secRows.length ? `${secDone} von ${secRows.length} unterschrieben${secWork ? ` · ${secWork} in Verhandlung` : ''}` : 'noch keine Flurstücke',
    pill: !secRows.length ? dashPill('', 'offen') : secDone === secRows.length ? dashPill('ok', 'gesichert') : secDone ? dashPill('warn', 'teilweise') : dashPill('', 'offen') });

  // Verträge (Grundstück → Verträge): unterschrieben von laufenden, dazu fehlende Eckdaten
  const vtr = (p.vertraege || []).filter(v => v.status !== 'abgebrochen');
  if(vtr.length){
    const vSigned = vtr.filter(vertragSigned).length;
    const vFehlt = vtr.filter(v => vertragFehlendeEckdaten(p, v).length).length;
    rows.push({ name:'Verträge', nav:{ tab:'grundstueck', sub:'vertraege' },
      detail: `${vSigned} von ${vtr.length} unterschrieben${vFehlt ? ` · bei ${vFehlt} fehlen Eckdaten` : ''}`,
      pill: vSigned === vtr.length ? (vFehlt ? dashPill('warn', 'Eckdaten fehlen') : dashPill('ok', 'unterschrieben')) : vSigned ? dashPill('warn', 'teilweise') : dashPill('', 'offen') });
  }

  const qStatus = k => {
    const st = (p.qualifikation[k] || {}).status || 'offen';
    if(st === 'problem') return 'err';
    if(st === 'ok' || (k === 'schutz' && p.naturschutz)) return 'ok';
    return 'off';
  };
  const qDone = QUALI_KEYS.filter(k => qStatus(k) === 'ok').length;
  const qProblem = QUALI_KEYS.filter(k => qStatus(k) === 'err').length;
  rows.push({ name:'Flächenqualifikation', nav:{ tab:'grundstueck', sub:'karte' },
    detail: `${qDone} von ${QUALI_KEYS.length} Prüfungen ok${qProblem ? ` · ${qProblem} mit Problem` : ''}`,
    pill: qProblem ? dashPill('err', 'Problem') : qDone === QUALI_KEYS.length ? dashPill('ok', 'ok') : qDone ? dashPill('warn', 'läuft') : dashPill('', 'offen') });

  const nvp = p.netz.nvpStatus || 'offen', trasse = p.netz.trasseStatus || 'offen';
  const netzTeile = [p.netz.anaGestelltAm ? `ANA ${fmtDate(p.netz.anaGestelltAm)}` : 'ANA offen', `NVP ${nvp}`, `Trasse ${trasse}`];
  const netzFertig = nvp === 'gesichert' && trasse === 'gesichert';
  const netzBegonnen = p.netz.anaGestelltAm || nvp !== 'offen' || trasse !== 'offen';
  rows.push({ name:'Netzanschluss', nav:{ tab:'netz' }, detail: escapeHtml(netzTeile.join(' · ')),
    pill: netzFertig ? dashPill('ok', 'gesichert') : netzBegonnen ? dashPill('warn', 'läuft') : dashPill('', 'offen') });

  const weg = verfahrensweg(p);
  if(!weg || weg.bplan){
    const msReached = BPLAN_MEILENSTEINE.filter(([key]) => msState(p, key) === 'erledigt').length;
    const satzung = msState(p, 'satzungsbeschluss') === 'erledigt';
    rows.push({ name:'B-Plan', nav:{ tab:'genehmigung' },
      detail: `${msReached} von ${BPLAN_MEILENSTEINE.length} Meilensteinen${weg ? ` · ${escapeHtml(weg.norm)}` : ''}`,
      pill: satzung ? dashPill('ok', 'beschlossen') : msReached ? dashPill('warn', 'läuft') : dashPill('', 'offen') });
  } else {
    const vf = p.genehmigung.verfahren;
    const pruef = weg.privileg ? pruefePrivilegierung(p) : null;
    const einv = { offen:'offen', ersucht:'ersucht', erteilt:'erteilt', fiktion:'Fiktion', verweigert:'verweigert' }[vf.einvernehmenStatus] || 'offen';
    rows.push({ name:'Planungsrecht', nav:{ tab:'genehmigung' },
      detail: escapeHtml([weg.norm, 'kein B-Plan', weg.einvernehmen ? `Einvernehmen ${einv}` : null].filter(Boolean).join(' · ')),
      pill: pruef ? (pruef.erfuellt ? dashPill('ok', 'privilegiert') : pruef.verletzt.length ? dashPill('err', 'verfehlt') : dashPill('warn', 'unvollständig'))
                  : dashPill('', escapeHtml(weg.name)) });
  }

  const bv = p.genehmigung.bauverfahren;
  rows.push({ name:'Baugenehmigung', nav:{ tab:'genehmigung' },
    detail: escapeHtml([bv.art || null, bv.eingereichtAm ? `eingereicht ${fmtDate(bv.eingereichtAm)}` : 'nicht eingereicht',
                        bv.genehmigtAm ? `erteilt ${fmtDate(bv.genehmigtAm)}` : null].filter(Boolean).join(' · ')),
    pill: bv.genehmigtAm ? dashPill('ok', 'erteilt') : bv.eingereichtAm ? dashPill('warn', 'im Verfahren') : dashPill('', 'offen') });

  const gutDone = GANTT_GUTACHTEN.filter(g => ['erhalten','abgelegt'].includes((p.dokumente[g.doku] || {}).status)).length;
  const gutReq = GANTT_GUTACHTEN.filter(g => (p.dokumente[g.doku] || {}).status === 'angefragt').length;
  rows.push({ name:'Gutachten', nav:{ tab:'prozess' },
    detail: `${gutDone} von ${GANTT_GUTACHTEN.length} erhalten${gutReq ? ` · ${gutReq} angefragt` : ''}`,
    pill: gutDone === GANTT_GUTACHTEN.length ? dashPill('ok', 'vollständig') : (gutDone || gutReq) ? dashPill('warn', `${GANTT_GUTACHTEN.length - gutDone} offen`) : dashPill('', 'offen') });

  // Kosten: Summe netto und spezifische Kosten, Status nach offenen/überfälligen Zahlungen
  if((p.kosten || []).length){
    const ks = kostenSummen(p);
    rows.push({ name:'Kosten', nav:{ tab:'kosten' },
      detail: escapeHtml([`${EUR2(ks.netto)} netto`, ks.jeKwp != null ? `${EUR2(ks.jeKwp)}/kWp` : null, ks.jeKw != null ? `${EUR2(ks.jeKw)}/kW` : null].filter(Boolean).join(' · ')),
      pill: ks.ueberfaelligAnzahl ? dashPill('err', `${ks.ueberfaelligAnzahl} überfällig`) : ks.offenAnzahl ? dashPill('warn', `${ks.offenAnzahl} offen`) : dashPill('ok', 'bezahlt') });
  }

  const areasHtml = `<div class="info dash-areas">
      <div class="card-head"><strong>Stand je Bereich</strong></div>
      ${rows.map(dashAreaRow).join('')}
    </div>`;

  // ---- Als Nächstes: fällige/anstehende Fristen (60 Tage) + die nächsten offenen Schritte ----
  const fristen = projectDeadlines(p).filter(f => daysUntil(f.datum) <= 60)
    .sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, 4);
  const fristenHtml = fristen.map(f => {
    const t = daysUntil(f.datum);
    const cls = fristPillClass(f.datum, f.warnTage || 14).replace('pill', '').trim();
    const rest = t < 0 ? `${-t} T. überfällig` : (t === 0 ? 'heute' : `in ${t} T.`);
    return `<div class="dash-next-row">
      <span class="dash-next-date">${escapeHtml(fmtDate(f.datum))}</span>
      <span class="dash-next-text">${escapeHtml(f.text)}</span>
      <span class="pill ${cls}">${escapeHtml(rest)}</span>
    </div>`;
  }).join('');
  const naechste = [];
  for(const phase of PROCESS_TEMPLATE){
    for(const step of phase.steps){
      if(step.optional) continue;
      const st = stepState(p, step);
      if(!stepDone(st)) naechste.push({ phase, step, st });
      if(naechste.length >= 3) break;
    }
    if(naechste.length >= 3) break;
  }
  const schritteHtml = abgebrochen ? '' : naechste.map(n => `<div class="dash-next-row">
      <span class="dash-next-date">Phase ${n.phase.nr}</span>
      <span class="dash-next-text">${escapeHtml(n.step.name)}</span>
      ${n.st === 'laufend' ? '<span class="pill warn">läuft</span>' : ''}
    </div>`).join('');
  const nextHtml = `<div class="info dash-next">
      <div class="card-head"><strong>Als Nächstes</strong></div>
      ${fristenHtml || schritteHtml ? fristenHtml + schritteHtml
        : '<div class="dash-quiet">Keine Fristen in den nächsten 60 Tagen, alle Pflicht-Schritte erledigt.</div>'}
    </div>`;

  const updates = [...p.updates].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
  const updatesHtml = `<div class="info dash-updates">
      <div class="card-head"><strong>Updates und Aufgaben</strong></div>
      <form id="dash-update-form" class="dash-update-form">
        <input type="text" id="dash-update-text" placeholder="Update oder Aufgabe eintragen" autocomplete="off" />
        <select id="dash-update-type" aria-label="Art des Eintrags">
          <option value="status">Update</option>
          <option value="task">Aufgabe</option>
        </select>
        <button type="submit" class="small" aria-label="Eintragen">+</button>
      </form>
      ${updates.length ? `<div class="dash-updates-list">${updates.map(dashUpdateRowHtml).join('')}</div>` : ''}
    </div>`;

  // Links „Stand je Bereich" + Updates, rechts „Als Nächstes" — hält beide Spalten etwa gleich hoch.
  root.innerHTML = headHtml + `<div class="dash-cols"><div class="dash-side">${areasHtml}${updatesHtml}</div><div class="dash-side">${nextHtml}</div></div>`;

  root.querySelectorAll('[data-dash-nav]').forEach(el => {
    el.addEventListener('click', () => {
      let nav; try { nav = JSON.parse(el.dataset.dashNav); } catch { return; }
      if(nav.tab) switchDetailTab(nav.tab);
      if(nav.sub) switchGrundstueckSubtab(nav.sub);
    });
  });

  // Updates und Aufgaben: neuer Eintrag + Erledigt-Toggle/Löschen bestehender Einträge
  document.getElementById('dash-update-form').addEventListener('submit', e => {
    e.preventDefault();
    const textEl = document.getElementById('dash-update-text');
    const text = textEl.value.trim();
    if(!text) return;
    const cur = getActiveProject(); if(!cur) return;
    cur.updates.push(normalizeUpdate({ type: document.getElementById('dash-update-type').value, text }));
    touchActiveProject(); saveProjects();
    renderDashboard();
  });
  root.querySelectorAll('.dash-update-row [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.dash-update-row');
      const cur = getActiveProject(); if(!cur) return;
      const item = cur.updates.find(x => x.id === row.dataset.update); if(!item) return;
      if(btn.dataset.action === 'toggle') item.done = !item.done;
      else if(btn.dataset.action === 'delete') cur.updates = cur.updates.filter(x => x.id !== item.id);
      touchActiveProject(); saveProjects();
      renderDashboard();
    });
  });
}

// Prozess-Reiter: nur noch die Aufgabenliste. Stammdaten, Projektordner und der
// Projektfortschritt (alle Phasen zum Abhaken) stehen in der Übersicht, siehe renderUebersichtExtras.
function renderProzessTab(){
  const p = getActiveProject(); if(!p) return;
  renderProzessTasks();
  document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
}
function renderUebersichtExtras(p){
  document.getElementById('proz-quelle').value = p.quelle || '';
  document.getElementById('proz-vermarktung').value = p.prozess.vermarktung || '';
  document.getElementById('proz-projektnummer').textContent = p.prozess.projektnummer || '—';
  document.getElementById('proz-abgebrochen').checked = !!p.prozess.abgebrochen;
  document.getElementById('proz-abbruchgrund').value = p.prozess.abbruchGrund || '';
  document.getElementById('proz-abbruch-wrap').style.display = p.prozess.abgebrochen ? '' : 'none';
  renderProzessPhasen();
  renderProzessNext();
  renderOrdnerCard();
}

function renderProzessPhasen(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('prozess-phasen');
  // Auf-/Zugeklappt-Zustand über Re-Renders erhalten; beim ersten Aufbau nur aktuelle Phase öffnen
  const prevOpen = [...root.querySelectorAll('details[data-phase]')];
  const openSet = new Set(prevOpen.filter(d => d.open).map(d => d.dataset.phase));
  const firstRender = prevOpen.length === 0;
  const cur = currentPhase(p);
  root.innerHTML = '';
  PROCESS_TEMPLATE.forEach(phase => {
    const pr = phaseProgress(p, phase);
    const isCur = phase.id === cur.id && !p.prozess.abgebrochen;
    const done = pr.done === pr.total;
    // Phase entfällt durch den gewählten Verfahrensweg (z. B. B-Plan-Verfahren bei einem
    // privilegierten Vorhaben) — als „erledigt" auszuweisen wäre irreführend. Bewusst NUR
    // dieser Grund: ein Schritt kann auch fachlich „entfaellt" sein (etwa Phase 10, solange
    // keine Auflagen erfasst sind), und das ist keine entfallene Phase.
    const entfaellt = phase.steps.length > 0 && phase.steps.every(st => stepEntfaelltDurchVerfahren(p, st));
    const det = document.createElement('details');
    det.className = 'phase-card' + (done ? ' done' : '') + (isCur ? ' current' : '');
    det.dataset.phase = phase.id;
    det.open = firstRender ? isCur : openSet.has(phase.id);
    const stepsHtml = phase.steps.map(step => {
      const s = stepState(p, step);
      const derived = !!(step.state || step.doku);
      const clickable = !step.state; // manuelle + Dokument-Schritte sind klickbar
      const dok = step.doku ? (p.dokumente[step.doku]||{}) : null;
      const manualDatum = (p.prozess.schritte[step.id]||{}).datum;
      const durchWeg = stepEntfaelltDurchVerfahren(p, step);
      const sub = [
        durchWeg ? `entfällt beim gewählten Verfahrensweg (${escapeHtml((verfahrensweg(p)||{}).norm||'')})` : null,
        (step.doku && !durchWeg) ? `Dokument: ${escapeHtml((dokumentType(step.doku)||{}).name||step.doku)} — ${escapeHtml(dok.status||'offen')}` : null,
        s==='erledigt' && manualDatum ? `erledigt am ${fmtDate(manualDatum)}` : null,
        (step.state && !step.doku && !durchWeg) ? 'wird automatisch aus den Fachdaten abgeleitet' : null,
      ].filter(Boolean).join(' · ');
      return `<div class="step-row${stepDone(s)?' done':''}${step.gate?' gate':''}">
        <button type="button" class="step-check ${s}${step.gate?' gate':''}${(derived&&!step.doku)||durchWeg?' derived':''}"
          data-step="${escapeAttr(step.id)}" ${(step.state&&!step.doku)||durchWeg?'disabled':''}
          title="${escapeAttr(durchWeg?'entfällt beim gewählten Verfahrensweg':s)}">${STEP_ICONS[s]||''}</button>
        <div class="step-main">
          <div class="step-name">${step.gate?'⬧ ':''}${escapeHtml(step.name)}${step.hinweis?infoBtn(step.hinweis):''}${step.optional?' <span style="color:var(--muted);font-weight:500">(optional)</span>':''}</div>
          ${sub?`<div class="step-sub">${sub}</div>`:''}
        </div>
        <span class="rolle-badge">${escapeHtml(step.rolle||'PD')}</span>
      </div>`;
    }).join('');
    const wegName = entfaellt ? ((verfahrensweg(p)||{}).norm || '') : '';
    det.innerHTML = `<summary>
        <span class="phase-num">${entfaellt?'–':(done?'✓':phase.nr)}</span>
        <span class="phase-title">${escapeHtml(phase.name)}${
          entfaellt ? ` <span class="pill" title="${escapeAttr('Entfällt beim gewählten Verfahrensweg' + (wegName?' ('+wegName+')':''))}">entfällt</span>`
                    : (isCur?' <span class="pill phase">aktuell</span>':'')}</span>
        <span class="phase-bar"><b style="width:${pr.total?Math.round(pr.done/pr.total*100):0}%"></b></span>
        <span class="phase-count">${entfaellt?'—':pr.done+'/'+pr.total}</span>
      </summary>${stepsHtml}`;
    root.appendChild(det);
  });
  // Klick-Handler: manuelle Schritte zyklisch schalten, Dokument-Schritte schalten das Dokument
  root.querySelectorAll('.step-check[data-step]:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = PROCESS_TEMPLATE.flatMap(ph => ph.steps).find(st => st.id === btn.dataset.step);
      const p2 = getActiveProject(); if(!p2 || !step) return;
      if(step.doku) cycleDokument(p2, step.doku);
      else cycleManualStep(p2, step);
      renderDashboard(); // zeichnet Kopfzeile, „Als Nächstes" und diese Phasenliste neu (Aufklapp-Zustand bleibt)
      renderProzessTasks();
    });
  });
}

// Zähler und Balken der Karte „Projektfortschritt" (Übersicht). Die frühere Liste „Nächste
// Schritte" im Prozess-Reiter ist entfallen — die Übersicht zeigt dasselbe unter „Als Nächstes".
function renderProzessNext(){
  const p = getActiveProject(); if(!p) return;
  const o = overallProgress(p);
  const label = document.getElementById('prozess-progress-label');
  if(label) label.textContent = `${o.done}/${o.total} Schritte`;
  const ovBar = document.getElementById('prozess-overall-bar');
  if(ovBar) ovBar.style.width = o.total ? Math.round(o.done/o.total*100) + '%' : '0%';
}

function renderDokumenteTable(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('prozess-dokumente');
  if(!root) return; // Dokumente sind jetzt in die Aufgaben-Tabellen integriert (renderProzessTasks)
  // Nach Prozessphase gruppiert (statt einer langen, undifferenzierten Liste),
  // damit erkennbar bleibt, in welchem Abschnitt des Ablaufs ein Dokument gebraucht wird.
  let lastPhase = null;
  const rows = DOCUMENT_TYPES.map(t => {
    const d = p.dokumente[t.id] || { status:'offen' };
    const dates = [
      d.angefragtAm ? `angefragt ${fmtDate(d.angefragtAm)}` : null,
      d.erhaltenAm ? `erhalten ${fmtDate(d.erhaltenAm)}` : null,
    ].filter(Boolean).join(' · ');
    let label = '';
    if(t.phase !== lastPhase){
      lastPhase = t.phase;
      const phase = PROCESS_TEMPLATE.find(ph => ph.nr===t.phase);
      label = `<div class="doku-phase-label">Phase ${t.phase} &middot; ${escapeHtml(phase ? phase.name : '')}</div>`;
    }
    const dateien = Array.isArray(d.dateien) ? d.dateien : [];
    const filesHtml = dateien.length ? `<div class="doku-files">${dateien.map(f => `
        <span class="doku-file">
          ${dateiLinkHtml(f, '📎 ' + escapeHtml(f.name))}
          <span class="doku-file-size">${fmtBytes(f.size)}</span>
          <button type="button" class="doku-file-x" data-del-datei="${escapeAttr(t.id)}" data-file="${escapeAttr(f.id)}" title="Datei entfernen">×</button>
        </span>`).join('')}</div>` : '';
    return `${label}<div class="frist-row" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${escapeHtml(t.name)}</div>
        ${dates?`<div class="step-sub">${dates}</div>`:''}
        ${filesHtml}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <button type="button" class="secondary small doku-attach" data-attach="${escapeAttr(t.id)}" title="Datei anhängen">📎${dateien.length?` ${dateien.length}`:' +'}</button>
        <button type="button" class="secondary small" data-doku="${escapeAttr(t.id)}" style="padding:2px 4px;background:none;border:none">${dokuPill(d.status)}</button>
      </div>
    </div>`;
  }).join('');
  root.innerHTML = rows;
  root.querySelectorAll('[data-doku]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      cycleDokument(p2, btn.dataset.doku);
      renderDokumenteTable(); renderProzessPhasen(); renderProzessNext();
      document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p2);
    });
  });
  root.querySelectorAll('[data-attach]').forEach(btn => {
    btn.addEventListener('click', () => {
      const typId = btn.dataset.attach;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = true;
      inp.addEventListener('change', () => {
        const p2 = getActiveProject(); if(!p2) return;
        attachDokumentDateien(p2, typId, inp.files, () => {
          renderDokumenteTable(); renderProzessPhasen(); renderProzessNext();
          document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p2);
        });
      });
      inp.click();
    });
  });
  root.querySelectorAll('[data-del-datei]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      if(!confirm('Diese Datei entfernen?')) return;
      removeDokumentDatei(p2, btn.dataset.delDatei, btn.dataset.file);
      renderDokumenteTable();
    });
  });
}
