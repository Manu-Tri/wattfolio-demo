// Aufgaben-Tabellen, Qualifikations-Checks, Sicherung und Genehmigungs-Tab
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Aufgaben-Tabellen (linke Seite Prozess-Tab): die operativ abzuarbeitenden
// Aufgaben inkl. einzuholender Dokumente, gruppiert in drei Kategorien.
// Die Zeilen referenzieren bestehende PROCESS_TEMPLATE-Schritte (per id) — damit
// bleibt der Status synchron mit Fachdaten, Prozessfortschritt und Dokumenten.
// ═════════════════════════════════════════════════════════════════════════════
const STEP_BY_ID = {};
PROCESS_TEMPLATE.forEach(ph => ph.steps.forEach(s => { STEP_BY_ID[s.id] = s; }));

const TASK_CATEGORIES = [
  { id:'sicherung', name:'Sicherung',
    hint:'Fläche vertraglich sichern. Rücktrittsfristen und Zahlungen je Flurstück im Reiter Grundstück → Sicherung pflegen.',
    steps:['p4-alkalb','p4-kontakt','p4-art','p4-vertraege','p4-tabelle','p4-zahlung','p4-controlling'] },
  { id:'voruntersuchung', name:'Voruntersuchung',
    hint:'Kataster- und Behördenauskünfte sowie Aufnahmen einholen — die Datengrundlage des Projekts.',
    steps:['p5-grundbuch','p5-altlasten','p5-altlast-gate','p5-baulasten','p5-kampfmittel','p5-luftbild','p5-erschliessung','p5-topo','p5-medienplan','p5-vermessung'] },
  { id:'gutachten', name:'Gutachten',
    hint:'Fachgutachten für B-Plan-Verfahren und Baugenehmigung beauftragen und ablegen.',
    steps:['p8-arten','p8-umwelt','p8-brand','p8-blend','p9-baugrund'] },
];

// Zusatzfelder (Verantwortlich/Deadline/Priorität/Subelemente) zu einem PROCESS_TEMPLATE-Schritt —
// unabhängig vom Status (der weiterhin aus Fachdaten/Dokumenten/manuellem Klick kommt, siehe
// stepState()). Analog zu getFlurstueckExtra(): legt beim ersten Zugriff Default-Werte an.
function getStepExtra(p, stepId){
  if(!p.prozess.schritte[stepId]) p.prozess.schritte[stepId] = { status:'offen', datum:null };
  const ex = p.prozess.schritte[stepId];
  if(!Array.isArray(ex.subelemente)) ex.subelemente = [];
  return ex;
}
// Löst ein data-target-JSON ("step"/"stepsub"/"custom"/"customsub") auf das mutierbare Objekt
// auf — ein gemeinsamer Mechanismus für Zeilen aus dem festen Prozess UND frei angelegte
// Aufgaben/Subelemente, damit Verantwortlich/Deadline/Priorität/Erledigt-Toggle nur je einmal
// implementiert werden müssen.
function resolveTaskTarget(p, raw){
  let t; try { t = JSON.parse(raw); } catch { return null; }
  if(t.kind==='step') return { obj: getStepExtra(p, t.id) };
  if(t.kind==='stepsub'){
    const extra = getStepExtra(p, t.id);
    const sub = extra.subelemente.find(s => s.id===t.sub);
    return sub ? { obj:sub, container:extra.subelemente } : null;
  }
  if(t.kind==='custom'){
    const task = p.prozess.aufgaben.find(a => a.id===t.id);
    return task ? { obj:task } : null;
  }
  if(t.kind==='customsub'){
    const task = p.prozess.aufgaben.find(a => a.id===t.id);
    if(!task) return null;
    const sub = task.subelemente.find(s => s.id===t.sub);
    return sub ? { obj:sub, container:task.subelemente } : null;
  }
  return null;
}
// „Zuständig": Auswahl einer Person aus den Team-Profilen — angezeigt werden nur Name und
// Profilbild (intern gespeichert wird die E-Mail als stabiler Schlüssel, sie erscheint nirgends).
// Eine native <select> kann keine Bilder zeigen, daher ein eigenes Auswahlfeld (#zust-pop).
// Ältere Freitext-Einträge („PD", „Legal" …) bleiben sichtbar, bis eine Person gewählt wird.
// Die Prozess-Rolle erscheint nur noch als Hinweis im Tooltip.
// Anzeige eines gespeicherten Werts ohne passendes Profil: nie die Adresse selbst zeigen
function zustaendigAltLabel(value){ return String(value).includes('@') ? nameAusEmail(value) : String(value); }
function zustaendigSelectHtml(targetStr, value, rolle){
  const person = teamProfil(value);
  const label = person ? person.name : value ? zustaendigAltLabel(value) : 'niemand';
  const title = person ? `Zuständig: ${person.name}`
    : value ? `Alter Eintrag „${zustaendigAltLabel(value)}" — bitte eine Person wählen`
    : `Noch niemand zugewiesen${rolle ? ` (Rolle laut Prozess: ${rolle})` : ''}`;
  return `<button type="button" class="zust-btn${person ? '' : ' leer'}" data-zust="${escapeAttr(targetStr)}" title="${escapeAttr(title)}"
      aria-haspopup="listbox" aria-expanded="false" aria-label="Zuständige Person: ${escapeAttr(label)}">
    ${person ? `<span class="avatar zust-avatar" aria-hidden="true">${avatarHtml(person, person.name)}</span>`
             : `<span class="zust-avatar zust-avatar-leer" aria-hidden="true"></span>`}
    <span class="zust-name">${escapeHtml(label)}${!person && value ? ' <em>(alt)</em>' : ''}</span>
    <span class="zust-caret" aria-hidden="true">▾</span>
  </button>`;
}

// Gemeinsames Auswahl-Popover für alle „Zuständig"-Felder
function oeffneZustaendigAuswahl(btn, onWahl){
  schliesseZustaendigAuswahl();
  const p = getActiveProject(); if(!p) return;
  const resolved = resolveTaskTarget(p, btn.dataset.zust); if(!resolved) return;
  const aktuell = resolved.obj.verantwortlich || '';
  const team = teamProfile();
  const eintraege = [{ email:'', name:'Niemand' }, ...team];
  if(aktuell && !team.some(t => t.email === aktuell)) eintraege.push({ email:aktuell, name:zustaendigAltLabel(aktuell), alt:true });
  const pop = document.createElement('div');
  pop.id = 'zust-pop'; pop.className = 'zust-pop'; pop.setAttribute('role', 'listbox'); pop.setAttribute('aria-label', 'Zuständige Person wählen');
  pop.innerHTML = eintraege.map((t, i) => `<button type="button" role="option" class="zust-opt${t.email === aktuell ? ' aktiv' : ''}" data-i="${i}" aria-selected="${t.email === aktuell}">
      ${t.email && !t.alt ? `<span class="avatar zust-avatar" aria-hidden="true">${avatarHtml(t, t.name)}</span>` : '<span class="zust-avatar zust-avatar-leer" aria-hidden="true"></span>'}
      <span class="zust-name">${escapeHtml(t.name)}${t.alt ? ' <em>(alt)</em>' : ''}</span>
    </button>`).join('');
  document.body.appendChild(pop);
  // Unter dem Feld platzieren, im Fenster halten (oberhalb, wenn unten kein Platz ist)
  const r = btn.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  pop.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  pop._btn = btn;
  const opts = [...pop.querySelectorAll('.zust-opt')];
  opts.forEach(o => o.addEventListener('click', () => { const t = eintraege[Number(o.dataset.i)]; schliesseZustaendigAuswahl(); onWahl(t.email || null); }));
  pop.addEventListener('keydown', e => {
    const i = opts.indexOf(document.activeElement);
    if(e.key === 'ArrowDown'){ e.preventDefault(); opts[Math.min(i + 1, opts.length - 1)].focus(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); opts[Math.max(i - 1, 0)].focus(); }
    else if(e.key === 'Escape' || e.key === 'Tab'){ e.preventDefault(); schliesseZustaendigAuswahl(); btn.focus(); }
  });
  (pop.querySelector('.zust-opt.aktiv') || opts[0]).focus();
}
function schliesseZustaendigAuswahl(){
  const pop = document.getElementById('zust-pop'); if(!pop) return;
  if(pop._btn) pop._btn.setAttribute('aria-expanded', 'false');
  pop.remove();
}
document.addEventListener('mousedown', e => {
  if(!e.target.closest('#zust-pop') && !e.target.closest('.zust-btn')) schliesseZustaendigAuswahl();
});
window.addEventListener('resize', schliesseZustaendigAuswahl);
document.addEventListener('scroll', e => { if(!e.target.closest || !e.target.closest('#zust-pop')) schliesseZustaendigAuswahl(); }, true);
function prioritaetSelectHtml(targetStr, value){
  const opts = ['<option value="">—</option>'].concat(
    PRIORITAET_LEVELS.map(lv => `<option value="${lv}"${value===lv?' selected':''}>${lv}</option>`)
  ).join('');
  return `<select class="cell-select prio-${(value||'none').toLowerCase()}" data-field="prioritaet" data-target="${escapeAttr(targetStr)}">${opts}</select>`;
}
// Monday-artige Status-Pille: <select> mit den frei definierten taskStatusOptions, Hintergrund
// = gewählte Farbe. Für Eigene Aufgaben & alle Subelemente (dort gibt es keine an Fachdaten
// gekoppelte Ableitung, die Statusliste kann also frei gewählt werden).
function statusSelectHtml(targetStr, statusId){
  const current = taskStatusOptions.find(o => o.id===statusId) || taskStatusOptions[0] || normalizeStatusOption({});
  const opts = taskStatusOptions.map(o => `<option value="${escapeAttr(o.id)}"${o.id===current.id?' selected':''}>${escapeHtml(o.label||'(ohne Namen)')}</option>`).join('');
  return `<select class="status-pill" data-field="statusId" data-target="${escapeAttr(targetStr)}" style="background:${current.color};color:${contrastTextColor(current.color)}">${opts}</select>`;
}
// Status-Pille für feste PROCESS_TEMPLATE-Schritte: bleibt ein Button (Klick zyklisch weiter wie
// bisher über cycleManualStep()/cycleDokument()) — nur optisch jetzt eine farbige Pille statt
// eines kleinen Hakens, damit die Spalte einheitlich mit den frei wählbaren Stati aussieht.
const STEP_STATE_STYLE = {
  offen:{label:'Offen',color:'#9699a6'}, laufend:{label:'Läuft',color:'#fdab3d'},
  erledigt:{label:'Erledigt',color:'#00c875'}, entfaellt:{label:'Entfällt',color:'#c4c4c4'},
};
const DOKU_STATE_STYLE = {
  offen:{label:'Offen',color:'#9699a6'}, angefragt:{label:'Angefragt',color:'#fdab3d'},
  erhalten:{label:'Erhalten',color:'#00c875'}, abgelegt:{label:'Abgelegt',color:'#0e9d6e'},
};
function stepStatusPillHtml(displayState, styleMap, attrs, disabled, title){
  const style = styleMap[displayState] || STEP_STATE_STYLE.offen;
  return `<button type="button" class="status-pill status-pill-btn${disabled?' disabled':''}" style="background:${style.color};color:${contrastTextColor(style.color)}" ${attrs} ${disabled?'disabled':''} title="${escapeAttr(title)}">${escapeHtml(style.label)}</button>`;
}
// Subelement-Zeile — eingerückt, gleiche Spalten wie die Elternzeile, aber ohne Dateien/weitere
// Subelemente (nur eine Verschachtelungsebene). Gemeinsam für Schritt- und Eigene-Aufgabe-Kinder.
function subRowHtml(parentTarget, sub){
  const targetStr = JSON.stringify(parentTarget.kind==='step'
    ? { kind:'stepsub', id:parentTarget.id, sub:sub.id }
    : { kind:'customsub', id:parentTarget.id, sub:sub.id });
  return `<tr class="task-row task-subrow${isTaskDone(sub)?' done':''}">
    <td class="col-status">${statusSelectHtml(targetStr, sub.statusId)}</td>
    <td><div class="task-name sub">↳ <input type="text" class="cell-input cell-input-title" data-field="titel" data-target="${escapeAttr(targetStr)}" value="${escapeAttr(sub.titel)}" placeholder="Subelement …" /></div>${sub.erstelltAm ? `<div class="task-sub">angelegt ${escapeHtml(fmtDate(sub.erstelltAm))}</div>` : ''}</td>
    <td class="col-rolle">${zustaendigSelectHtml(targetStr, sub.verantwortlich)}</td>
    <td class="col-deadline"><input type="date" class="cell-input" data-field="deadline" data-target="${escapeAttr(targetStr)}" value="${sub.deadline||''}" /></td>
    <td class="col-prio">${prioritaetSelectHtml(targetStr, sub.prioritaet)}</td>
    <td class="col-files"><span class="task-nofile">—</span></td>
    <td class="col-actions"><button type="button" class="danger small" data-del-sub="${escapeAttr(targetStr)}" title="Subelement löschen">×</button></td>
  </tr>`;
}
// Kategorien sind einklappbar und standardmäßig zu. Welche offen sind, wird je Projekt im
// Tab-Zustand gemerkt — so bleibt eine Kategorie beim Statuswechsel (voller Rerender) und
// nach einem Reload offen.
function offeneTaskKategorien(){
  if(!activeProjectId) return [];
  const st = tabStateFor(activeProjectId);
  if(!Array.isArray(st.offeneKategorien)) st.offeneKategorien = [];
  return st.offeneKategorien;
}
function taskKategorieOffen(id){ return offeneTaskKategorien().includes(id); }
function setTaskKategorieOffen(id, offen){
  if(!activeProjectId) return;
  const st = tabStateFor(activeProjectId);
  const rest = offeneTaskKategorien().filter(x => x !== id);
  st.offeneKategorien = offen ? [...rest, id] : rest;
  persistTabState();
}
function taskCatHeaderHtml(id, name, hint, done, total, color, extraHtml){
  const offen = taskKategorieOffen(id);
  return `<tbody class="task-cat-head-body"><tr class="task-cat-row${offen?' offen':''}" style="--cat-color:${color}" data-cat-toggle="${escapeAttr(id)}"
      tabindex="0" role="button" aria-expanded="${offen}" title="${offen?'Einklappen':'Aufklappen'}">
    <td colspan="7">
      <div class="task-cat-head"><span class="task-cat-caret" aria-hidden="true">▸</span><strong>${escapeHtml(name)}${hint?infoBtn(hint):''}</strong><span class="pill ${total && done===total?'ok':'phase'}">${done}/${total}</span>${extraHtml||''}</div>
    </td>
  </tr></tbody>`;
}
// Zeilen einer Kategorie in eigenem tbody, damit sie gemeinsam aus- und eingeblendet werden
function taskCatRowsHtml(id, rowsHtml){
  return `<tbody data-cat-rows="${escapeAttr(id)}"${taskKategorieOffen(id)?'':' class="hidden"'}>${rowsHtml}</tbody>`;
}
function stepRowHtml(p, step){
  const s = stepState(p, step);
  const isDoku = !!step.doku;
  const isDerived = !!step.state && !isDoku;      // aus Fachdaten abgeleitet → nur Anzeige, nicht klickbar
  const d = isDoku ? (p.dokumente[step.doku] || { status:'offen' }) : null;
  const extra = getStepExtra(p, step.id);
  const target = { kind:'step', id:step.id };
  const targetStr = JSON.stringify(target);

  const attrs = isDoku ? `data-doku="${escapeAttr(step.doku)}"` : (isDerived ? '' : `data-step="${escapeAttr(step.id)}"`);
  const title = isDoku ? `Dokument: ${d.status||'offen'} — Klick schaltet weiter`
    : isDerived ? `Status: ${s} — wird automatisch aus Fachdaten abgeleitet`
    : `Status: ${s} — Klick schaltet weiter`;
  const statusHtml = isDoku
    ? stepStatusPillHtml(d.status||'offen', DOKU_STATE_STYLE, attrs, false, title)
    : stepStatusPillHtml(s, STEP_STATE_STYLE, attrs, isDerived, title);

  // Unterzeile: Herkunft (abgeleitet) + wann erledigt/angefragt/erhalten wurde.
  let erledigtTxt = null;
  const manualDatum = extra.datum;
  if(isDoku){
    if(d.erhaltenAm) erledigtTxt = `erhalten ${fmtDate(d.erhaltenAm)}`;
    else if(d.angefragtAm) erledigtTxt = `angefragt ${fmtDate(d.angefragtAm)}`;
  } else if(!isDerived && s==='erledigt' && manualDatum){
    erledigtTxt = `erledigt ${fmtDate(manualDatum)}`;
  }
  const subLines = [isDerived ? 'aus Fachdaten abgeleitet' : null, erledigtTxt].filter(Boolean).join(' · ');

  // Datei-Zelle (nur für Dokument-Aufgaben): kompakt — ein Zähler-Aufklapper
  // statt einer wachsenden Chip-Liste; die Einzeldateien erscheinen erst auf
  // Klick als Popover und nehmen der Zeile keinen dauerhaften Platz weg.
  let fileCell = '<span class="task-nofile">—</span>';
  if(isDoku){
    const dateien = Array.isArray(d.dateien) ? d.dateien : [];
    const list = dateien.map(f => `<div class="doku-file-row">
        ${dateiLinkHtml(f, escapeHtml(f.name))}
        <span class="doku-file-size">${fmtBytes(f.size)}</span>
        <button type="button" class="doku-file-x" data-del-datei="${escapeAttr(step.doku)}" data-file="${escapeAttr(f.id)}" title="Datei entfernen">×</button>
      </div>`).join('');
    fileCell = `<div class="file-cell">
      ${dateien.length ? `<details class="doku-filelist">
        <summary title="${dateien.length} Datei(en) — Klick zeigt die Liste">📎 ${dateien.length}</summary>
        <div class="doku-filelist-pop">${list}</div>
      </details>` : ''}
      <button type="button" class="secondary small task-attach" data-attach="${escapeAttr(step.doku)}" title="Datei anhängen">+</button>
    </div>`;
  }

  const row = `<tr class="task-row${stepDone(s)?' done':''}${step.gate?' gate':''}">
    <td class="col-status">${statusHtml}</td>
    <td>
      <div class="task-name">${step.gate?'⬧ ':''}${escapeHtml(step.name)}${step.hinweis?infoBtn(step.hinweis):''}${step.optional?' <span style="color:var(--muted);font-weight:500">(optional)</span>':''}</div>
      ${subLines?`<div class="task-sub">${escapeHtml(subLines)}</div>`:''}
    </td>
    <td class="col-rolle">${zustaendigSelectHtml(targetStr, extra.verantwortlich, step.rolle||'PD')}</td>
    <td class="col-deadline"><input type="date" class="cell-input" data-field="deadline" data-target="${escapeAttr(targetStr)}" value="${extra.deadline||''}" /></td>
    <td class="col-prio">${prioritaetSelectHtml(targetStr, extra.prioritaet)}</td>
    <td class="col-files">${fileCell}</td>
    <td class="col-actions"><button type="button" class="secondary small" data-add-sub="${escapeAttr(targetStr)}" title="Subelement hinzufügen">+ Sub</button></td>
  </tr>`;
  return row + extra.subelemente.map(sub => subRowHtml(target, sub)).join('');
}
function customTaskRowHtml(task){
  const target = { kind:'custom', id:task.id };
  const targetStr = JSON.stringify(target);
  const row = `<tr class="task-row${isTaskDone(task)?' done':''}">
    <td class="col-status">${statusSelectHtml(targetStr, task.statusId)}</td>
    <td><div class="task-name"><input type="text" class="cell-input cell-input-title" data-field="titel" data-target="${escapeAttr(targetStr)}" value="${escapeAttr(task.titel)}" placeholder="Neue Aufgabe …" /></div>${task.erstelltAm ? `<div class="task-sub">angelegt ${escapeHtml(fmtDate(task.erstelltAm))}</div>` : ''}</td>
    <td class="col-rolle">${zustaendigSelectHtml(targetStr, task.verantwortlich)}</td>
    <td class="col-deadline"><input type="date" class="cell-input" data-field="deadline" data-target="${escapeAttr(targetStr)}" value="${task.deadline||''}" /></td>
    <td class="col-prio">${prioritaetSelectHtml(targetStr, task.prioritaet)}</td>
    <td class="col-files"><span class="task-nofile">—</span></td>
    <td class="col-actions">
      <button type="button" class="secondary small" data-add-sub="${escapeAttr(targetStr)}" title="Subelement hinzufügen">+ Sub</button>
      <button type="button" class="danger small" data-del-aufgabe="${escapeAttr(task.id)}" title="Aufgabe löschen">×</button>
    </td>
  </tr>`;
  return row + task.subelemente.map(sub => subRowHtml(target, sub)).join('');
}
// Verwaltungs-Panel für die frei definierbaren Stati (Farbe/Bezeichnung/"gilt als erledigt").
// Global statt je Projekt — analog zu den Gutachten-Typen — damit dieselbe Statusliste in
// jedem Projekt zur Verfügung steht, ohne sie mehrfach anlegen zu müssen.
function statusManagerHtml(){
  const rows = taskStatusOptions.map((o,i) => `<div class="status-manager-row">
    <input type="color" data-si="${i}" data-sk="color" value="${o.color}" title="Farbe" />
    <input type="text" data-si="${i}" data-sk="label" value="${escapeAttr(o.label)}" placeholder="Bezeichnung" />
    <label class="status-done-toggle"><input type="checkbox" data-si="${i}" data-sk="done" ${o.done?'checked':''} /> gilt als erledigt</label>
    <button type="button" class="danger small" data-del-status="${i}" title="Status löschen">×</button>
  </div>`).join('');
  return `<details class="status-manager">
    <summary>⚙ Status verwalten (${taskStatusOptions.length})</summary>
    <div class="status-manager-list">${rows}</div>
    <button type="button" class="small" id="btn-add-status">+ Status</button>
  </details>`;
}

function renderProzessTasks(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('prozess-tasks'); if(!root) return;
  const statusManagerWasOpen = !!root.querySelector('details.status-manager[open]');

  const CAT_COLORS = { sicherung:'#579bfc', voruntersuchung:'#a25ddc', gutachten:'#fdab3d' };
  const catRowsHtml = TASK_CATEGORIES.map(cat => {
    const steps = cat.steps.map(id => STEP_BY_ID[id]).filter(Boolean);
    const done = steps.filter(s => stepDone(stepState(p, s))).length;
    return taskCatHeaderHtml(cat.id, cat.name, cat.hint, done, steps.length, CAT_COLORS[cat.id]||'#9699a6')
      + taskCatRowsHtml(cat.id, steps.map(step => stepRowHtml(p, step)).join(''));
  }).join('');

  const aufgaben = p.prozess.aufgaben;
  const customDone = aufgaben.filter(isTaskDone).length;
  const customHeader = taskCatHeaderHtml('eigene', 'Eigene Aufgaben',
    'Frei anlegbare Aufgaben für dieses Projekt, unabhängig vom Standardprozess.',
    customDone, aufgaben.length, '#0e9d6e',
    '<button type="button" class="small" id="btn-add-aufgabe" style="margin-left:auto">+ Aufgabe</button>');
  const customRowsHtml = taskCatRowsHtml('eigene', aufgaben.map(a => customTaskRowHtml(a)).join(''));

  root.innerHTML = `<div class="info task-cat">
    ${statusManagerHtml()}
    <table class="task-table">
      <thead><tr>
        <th class="col-status">Status</th><th>Aufgabe</th><th class="col-rolle" title="Verantwortlich">Zuständig</th>
        <th class="col-deadline">Deadline</th><th class="col-prio">Priorität</th>
        <th class="col-files">Dateien</th><th class="col-actions"></th>
      </tr></thead>
      ${catRowsHtml}${customHeader}${customRowsHtml}
    </table>
  </div>`;
  if(statusManagerWasOpen) root.querySelector('details.status-manager').open = true;

  // Kategorie auf-/zuklappen: Klick oder Enter/Leertaste auf die Kopfzeile
  // (nicht, wenn der Klick dem Info-Knopf oder „+ Aufgabe" im Kopf gilt)
  root.querySelectorAll('[data-cat-toggle]').forEach(tr => {
    const umschalten = () => {
      const id = tr.dataset.catToggle, offen = !taskKategorieOffen(id);
      setTaskKategorieOffen(id, offen);
      tr.classList.toggle('offen', offen);
      tr.setAttribute('aria-expanded', String(offen));
      tr.title = offen ? 'Einklappen' : 'Aufklappen';
      root.querySelector(`[data-cat-rows="${CSS.escape(id)}"]`)?.classList.toggle('hidden', !offen);
    };
    tr.addEventListener('click', e => { if(e.target.closest('button, a, input, select')) return; umschalten(); });
    tr.addEventListener('keydown', e => {
      if(e.target !== tr || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); umschalten();
    });
  });

  // Nach jeder Mutation die abhängigen Ansichten mitziehen
  const rerender = () => {
    renderProzessTasks(); renderProzessPhasen(); renderProzessNext();
    const p2 = getActiveProject();
    if(p2) document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p2);
  };
  // Datei-Popover: immer nur eines gleichzeitig offen halten
  root.querySelectorAll('details.doku-filelist').forEach(det => det.addEventListener('toggle', () => {
    if(det.open) root.querySelectorAll('details.doku-filelist[open]').forEach(o => { if(o !== det) o.open = false; });
  }));
  root.querySelectorAll('[data-doku]').forEach(btn => btn.addEventListener('click', () => {
    const p2 = getActiveProject(); if(!p2) return; cycleDokument(p2, btn.dataset.doku); rerender();
  }));
  root.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => {
    const p2 = getActiveProject(); const step = STEP_BY_ID[btn.dataset.step];
    if(!p2 || !step) return; cycleManualStep(p2, step); rerender();
  }));
  root.querySelectorAll('[data-attach]').forEach(btn => btn.addEventListener('click', () => {
    const typId = btn.dataset.attach;
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
    inp.addEventListener('change', () => {
      const p2 = getActiveProject(); if(!p2) return;
      attachDokumentDateien(p2, typId, inp.files, rerender);
    });
    inp.click();
  }));
  root.querySelectorAll('[data-del-datei]').forEach(btn => btn.addEventListener('click', () => {
    const p2 = getActiveProject(); if(!p2) return;
    if(!confirm('Diese Datei entfernen?')) return;
    removeDokumentDatei(p2, btn.dataset.delDatei, btn.dataset.file); rerender();
  }));
  // Verantwortlich/Deadline/Priorität/Titel: direkt speichern, kein Rerender (sonst springt der
  // Fokus beim Tippen weg) — Auswahl-Farbe der Priorität wird trotzdem sofort aktualisiert.
  // Status ist die Ausnahme: wirkt sich auf Erledigt-Optik & Kategorie-Zähler aus → voller Rerender.
  root.querySelectorAll('[data-field]').forEach(el => {
    const evName = (el.tagName==='SELECT' || el.type==='date') ? 'change' : 'input';
    el.addEventListener(evName, () => {
      const p2 = getActiveProject(); if(!p2) return;
      const resolved = resolveTaskTarget(p2, el.dataset.target); if(!resolved) return;
      resolved.obj[el.dataset.field] = el.value || null;
      touchActiveProject(); saveProjects();
      if(el.dataset.field==='prioritaet') el.className = 'cell-select prio-' + (el.value||'none').toLowerCase();
      if(el.dataset.field==='statusId') rerender();
    });
  });
  // Zuständig: eigenes Auswahlfeld mit Profilbild und Name
  root.querySelectorAll('[data-zust]').forEach(btn => btn.addEventListener('click', () => {
    if(document.getElementById('zust-pop')?._btn === btn){ schliesseZustaendigAuswahl(); return; }
    oeffneZustaendigAuswahl(btn, wert => {
      const p2 = getActiveProject(); if(!p2) return;
      const resolved = resolveTaskTarget(p2, btn.dataset.zust); if(!resolved) return;
      const vorher = resolved.obj.verantwortlich || null;
      resolved.obj.verantwortlich = wert;
      benachrichtigeZuweisung(p2, btn.dataset.zust, wert, vorher); // Glocke beim Empfänger
      touchActiveProject(); saveProjects(); rerender();
    });
  }));
  root.querySelectorAll('[data-add-sub]').forEach(btn => btn.addEventListener('click', () => {
    const p2 = getActiveProject(); if(!p2) return;
    const resolved = resolveTaskTarget(p2, btn.dataset.addSub); if(!resolved || !Array.isArray(resolved.obj.subelemente)) return;
    resolved.obj.subelemente.push(normalizeSubelement({}));
    touchActiveProject(); saveProjects(); rerender();
  }));
  root.querySelectorAll('[data-del-sub]').forEach(btn => btn.addEventListener('click', () => {
    const p2 = getActiveProject(); if(!p2) return;
    const resolved = resolveTaskTarget(p2, btn.dataset.delSub); if(!resolved) return;
    if(!confirm('Dieses Subelement löschen?')) return;
    resolved.container.splice(resolved.container.indexOf(resolved.obj), 1);
    touchActiveProject(); saveProjects(); rerender();
  }));
  const addBtn = document.getElementById('btn-add-aufgabe');
  if(addBtn) addBtn.addEventListener('click', () => {
    const p2 = getActiveProject(); if(!p2) return;
    p2.prozess.aufgaben.push(normalizeAufgabe({}));
    setTaskKategorieOffen('eigene', true); // neue Zeile muss sichtbar sein
    touchActiveProject(); saveProjects(); rerender();
  });
  root.querySelectorAll('[data-del-aufgabe]').forEach(btn => btn.addEventListener('click', () => {
    const p2 = getActiveProject(); if(!p2) return;
    if(!confirm('Diese Aufgabe inkl. Subelemente löschen?')) return;
    p2.prozess.aufgaben = p2.prozess.aufgaben.filter(a => a.id !== btn.dataset.delAufgabe);
    touchActiveProject(); saveProjects(); rerender();
  }));
  // ---- Status-Manager: Farbe/Bezeichnung/Erledigt-Flag/Hinzufügen/Löschen ----
  const rerenderStatus = () => { renderProzessTasks(); const dEl = document.getElementById('prozess-tasks').querySelector('details.status-manager'); if(dEl) dEl.open = true; };
  root.querySelectorAll('[data-si]').forEach(el => {
    const evName = el.type==='text' ? 'input' : 'change';
    el.addEventListener(evName, () => {
      const opt = taskStatusOptions[Number(el.dataset.si)]; if(!opt) return;
      opt[el.dataset.sk] = el.type==='checkbox' ? el.checked : el.value;
      saveTaskStatusOptions();
      if(el.dataset.sk==='label') return; // Tippen soll den Fokus nicht verlieren
      rerenderStatus();
    });
  });
  root.querySelectorAll('[data-del-status]').forEach(btn => btn.addEventListener('click', () => {
    if(taskStatusOptions.length <= 1){ alert('Mindestens ein Status muss bestehen bleiben.'); return; }
    if(!confirm('Diesen Status wirklich löschen? Aufgaben mit diesem Status wechseln auf den ersten verbleibenden Status.')) return;
    taskStatusOptions.splice(Number(btn.dataset.delStatus), 1);
    saveTaskStatusOptions(); reassignOrphanStatusIds(); rerenderStatus();
  }));
  const addStatusBtn = document.getElementById('btn-add-status');
  if(addStatusBtn) addStatusBtn.addEventListener('click', () => {
    taskStatusOptions.push(normalizeStatusOption({ label:'Neuer Status' }));
    saveTaskStatusOptions(); rerenderStatus();
  });
}

// ---- Prozess-Kopf-Bindings (einmalig) ----
document.getElementById('proz-quelle').addEventListener('change', e => {
  const p = getActiveProject(); if(!p) return;
  p.quelle = e.target.value || null; touchActiveProject(); saveProjects();
  renderDashboard(); // Stammdaten stehen in der Übersicht: Kopfzeile + Fortschritt mitziehen
});
document.getElementById('proz-vermarktung').addEventListener('change', e => {
  const p = getActiveProject(); if(!p) return;
  p.prozess.vermarktung = e.target.value || null; touchActiveProject(); saveProjects();
  renderDashboard();
});
document.getElementById('proz-abgebrochen').addEventListener('change', e => {
  const p = getActiveProject(); if(!p) return;
  p.prozess.abgebrochen = e.target.checked; touchActiveProject(); saveProjects();
  renderDashboard();
});
document.getElementById('proz-abbruchgrund').addEventListener('change', () => renderDashboard());
document.getElementById('proz-abbruchgrund').addEventListener('input', e => {
  const p = getActiveProject(); if(!p) return;
  p.prozess.abbruchGrund = e.target.value; touchActiveProject(); saveProjects();
});

// ---- Qualifikations-Checks (AP7, Reiter Grundstück → Karte) ----
const QUALI_LABELS = {
  lep:'Landesraumentwicklungsplan (LEP)', rep:'Regionalentwicklungsplan (REP)',
  fnp:'Flächennutzungsplan (FNP)', schutz:'Schutzgebiete (BfN)'
};
const QUALI_CYCLE = ['offen','ok','problem'];
function qualiPill(status){
  const cls = status==='ok' ? 'pill ok' : status==='problem' ? 'pill err' : 'pill';
  const txt = status==='ok' ? '✓ ok' : status==='problem' ? '✗ Problem' : 'offen';
  return `<span class="${cls}">${txt}</span>`;
}
function renderQualiChecks(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('quali-checks'); if(!root) return;
  // Kompakte Zeile: Name + (geprüft am · durch …) links, Status-Pill rechts. Die Auswahl
  // „selbst / Planungsbüro" sitzt in der Meta-Zeile, damit die Zeile in der schmalen
  // Spalte neben der Karte nicht drei Elemente nebeneinander quetschen muss.
  root.innerHTML = QUALI_KEYS.map(k => {
    const q = p.qualifikation[k];
    const scan = (k==='schutz' && p.naturschutz) ? `<div class="gs-quali-meta">BfN-Scan: ${escapeHtml(naturschutzSummary(p)||'')}</div>` : '';
    return `<div class="gs-quali-row">
      <div class="gs-quali-main">
        <div class="gs-quali-name">${escapeHtml(QUALI_LABELS[k])}</div>
        <div class="gs-quali-meta">${q.geprueftAm ? `geprüft ${fmtDate(q.geprueftAm)} · ` : ''}durch
          <select data-quali-durch="${k}" aria-label="Geprüft durch">
            <option value="selbst"${q.durch!=='planungsbuero'?' selected':''}>selbst (GIS)</option>
            <option value="planungsbuero"${q.durch==='planungsbuero'?' selected':''}>Planungsbüro</option>
          </select>
        </div>
        ${scan}
      </div>
      <button type="button" class="gs-quali-status" data-quali="${k}" title="Status weiterschalten">${qualiPill(q.status)}</button>
    </div>`;
  }).join('');
  root.querySelectorAll('[data-quali]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      const q = p2.qualifikation[btn.dataset.quali];
      q.status = QUALI_CYCLE[(QUALI_CYCLE.indexOf(q.status)+1) % QUALI_CYCLE.length];
      q.geprueftAm = q.status==='offen' ? null : new Date().toISOString();
      touchActiveProject(); saveProjects(); renderQualiChecks();
    });
  });
  root.querySelectorAll('[data-quali-durch]').forEach(sel => {
    sel.addEventListener('change', () => {
      const p2 = getActiveProject(); if(!p2) return;
      p2.qualifikation[sel.dataset.qualiDurch].durch = sel.value;
      touchActiveProject(); saveProjects();
    });
  });
}

// ---- Sicherung je Flurstück (AP3) ----
function eigentuemerName(p, id){
  const e = p.eigentuemer.find(x => x.id===id);
  return e ? (e.name||'(unbenannt)') : null;
}
const sicherungDetailsOffen = new Set(); // aufgeklappte Detailzeilen (Flurstücks-IDs), übersteht Re-Render
function renderSicherungTable(){
  const p = getActiveProject(); if(!p) return;
  const wrap = document.getElementById('sicherung-table-wrap');
  const empty = document.getElementById('sicherung-empty');
  if(!wrap || !empty) return;
  const rows = sicherungRows(p);
  // KPIs
  const withF = rows.filter(r => r.f && r.f.flaeche!=null);
  const totalArea = withF.reduce((s,r)=>s+Number(r.f.flaeche),0);
  const securedArea = withF.filter(r=>r.extra.vertragsStatus==='unterschrieben').reduce((s,r)=>s+Number(r.f.flaeche),0);
  document.getElementById('sich-stat-quote').textContent = totalArea ? `${Math.round(securedArea/totalArea*100)} %` : '—';
  const fristen = rows.map(r=>r.extra.rueckTrittsfrist).filter(Boolean).sort();
  document.getElementById('sich-stat-frist').textContent = fristen.length ? fmtDate(fristen[0]) : '—';
  document.getElementById('sich-stat-anzahl').textContent = rows.length || '—';
  if(!rows.length){ wrap.innerHTML=''; empty.style.display=''; return; }
  empty.style.display = 'none';
  const statusOptions = sel => VERTRAGS_STATUS.map(s=>`<option value="${escapeAttr(s)}"${s===sel?' selected':''}>${escapeHtml(s)}</option>`).join('');
  // Hauptzeile: das, was man beim Durchsehen braucht. Konditionen (Preis, Reservierung,
  // 1. Zahlung) und Notiz liegen in einer aufklappbaren Detailzeile — sonst passt die
  // Tabelle mit zehn Spalten nicht in die Breite.
  const html = rows.map(r => {
    const ex = r.extra;
    const flst = r.f ? `${flurText(r.f.flur)} · ${r.f.zaehler??''}${r.f.nenner?'/'+r.f.nenner:''}` : `Flurstück ${r.fid}`;
    const owner = eigentuemerName(p, ex.eigentuemerId);
    const t = ex.rueckTrittsfrist ? daysUntil(ex.rueckTrittsfrist) : null;
    const fristBadge = ex.rueckTrittsfrist
      ? `<span class="${fristPillClass(ex.rueckTrittsfrist,42)}" style="margin-top:4px;align-self:flex-start">${t<0?'überschritten':`in ${t} Tagen`}</span>` : '';
    const hatDetails = ex.preisProM2 != null || ex.reservierungsentgelt != null || ex.ersteZahlungAm || ex.notiz;
    // Führt ein Pacht-/Kaufvertrag dieses Flurstück, kommen Art, Status und Rücktrittsfrist aus dem Vertrag
    const vtr = vertragFuerFlurstueck(p, r.fid);
    const gesperrt = vtr ? ' disabled title="Wird im Vertrag gepflegt (Grundstück → Verträge)"' : '';
    const offen = sicherungDetailsOffen.has(String(r.fid));
    return `<tr${r.verwaist?' style="opacity:.75"':''}>
      <td><span class="strong">${escapeHtml(flst)}</span>${r.verwaist?' <span class="pill warn" title="Flurstück ist nach einer Lage-Neuabfrage nicht mehr im ALKIS-Ergebnis, hat aber Sicherungsdaten">verwaist</span>':''}
        <span class="sub">${owner ? escapeHtml(owner) : 'kein Eigentümer zugeordnet'}</span>
        ${vtr ? `<button type="button" class="linklike sub" data-zum-vertrag="${escapeAttr(vtr.id)}">Vertrag: ${escapeHtml(vertragTitel(vtr))} →</button>` : ''}</td>
      <td class="num">${r.f && r.f.flaeche!=null ? Number(r.f.flaeche).toLocaleString('de-DE')+' m²' : '—'}</td>
      <td><select data-fid="${r.fid}" data-k="sicherungArt" aria-label="Art der Sicherung"${gesperrt}>
        <option value="">—</option>
        <option value="Pacht"${ex.sicherungArt==='Pacht'?' selected':''}>Pacht</option>
        <option value="Kauf"${ex.sicherungArt==='Kauf'?' selected':''}>Kauf</option>
      </select></td>
      <td><select data-fid="${r.fid}" data-k="vertragsStatus" aria-label="Vertragsstatus"${gesperrt}>${statusOptions(ex.vertragsStatus)}</select>
        ${ex.anschreibenAm ? `<span class="sub">angeschrieben ${escapeHtml(fmtDate(ex.anschreibenAm))}</span>` : ''}</td>
      <td><div class="gs-stack"><input type="date" data-fid="${r.fid}" data-k="rueckTrittsfrist" value="${escapeAttr(ex.rueckTrittsfrist||'')}" aria-label="Rücktrittsfrist"${gesperrt} />${fristBadge}</div></td>
      <td><button type="button" class="secondary small gs-detail-btn" data-details="${r.fid}" aria-expanded="${offen}">${offen?'Weniger':'Details'}${hatDetails&&!offen?'<span class="dot" title="Konditionen oder Notiz erfasst"></span>':''}</button></td>
    </tr>${offen ? `<tr class="gs-detail-row"><td colspan="6"><div class="gs-detail-grid">
      <div><label>Preis €/m²</label><input type="number" step="0.01" data-fid="${r.fid}" data-k="preisProM2" value="${ex.preisProM2 ?? ''}" placeholder="0,00" /></div>
      <div><label>Reservierung €</label><input type="number" step="1" data-fid="${r.fid}" data-k="reservierungsentgelt" value="${ex.reservierungsentgelt ?? ''}" placeholder="0" /></div>
      <div><label>1. Zahlung</label><input type="date" data-fid="${r.fid}" data-k="ersteZahlungAm" value="${escapeAttr(ex.ersteZahlungAm||'')}" /></div>
      <div><label>Notiz</label><input type="text" data-fid="${r.fid}" data-k="notiz" value="${escapeAttr(ex.notiz||'')}" placeholder="Notiz" /></div>
    </div></td></tr>` : ''}`;
  }).join('');
  wrap.innerHTML = `<table class="gs-table">
    <colgroup><col><col style="width:7.5rem"><col style="width:6.5rem"><col style="width:12rem"><col style="width:10rem"><col style="width:6.5rem"></colgroup>
    <tr><th>Flurstück / Eigentümer</th><th class="num">amtl. Fläche</th><th>Art</th><th>Vertragsstatus</th><th>Rücktrittsfrist</th><th></th></tr>
    ${html}
  </table>`;
  wrap.querySelectorAll('[data-zum-vertrag]').forEach(b => b.addEventListener('click', () => {
    switchGrundstueckSubtab('vertraege'); openVertragModal(b.dataset.zumVertrag);
  }));
  wrap.querySelectorAll('[data-details]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.details;
    if(sicherungDetailsOffen.has(id)) sicherungDetailsOffen.delete(id); else sicherungDetailsOffen.add(id);
    renderSicherungTable();
  }));
  wrap.querySelectorAll('[data-fid]').forEach(inp => {
    const ev = (inp.tagName==='SELECT' || inp.type==='date') ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const p2 = getActiveProject(); if(!p2) return;
      const ex = getFlurstueckExtra(p2, inp.dataset.fid);
      const k = inp.dataset.k;
      const numeric = ['preisProM2','reservierungsentgelt'];
      ex[k] = numeric.includes(k) ? (inp.value===''?null:Number(inp.value)) : (inp.value || (k==='notiz'?'':null));
      touchActiveProject(); saveProjects();
      // KPIs/Badges nur bei strukturellen Änderungen neu aufbauen (Fokus in Textfeldern erhalten)
      if(ev==='change') renderSicherungTable();
    });
  });
}

// ---- Genehmigungs-Tab: B-Plan-Meilensteine, Bauverfahren, Auflagen, Fristen (AP5) ----
const BAU_ART_HINTS = {
  regulaer:'Reguläres Baugenehmigungsverfahren: vollständige Unterlagen; Bestätigung der Vollständigkeit gesetzlich max. ~3 Monate (real bis 3–4).',
  vereinfacht:'Vereinfachtes Verfahren: reduzierter Unterlagenumfang. Möglich, wenn bereits ein Bebauungsplan existiert (z. B. Gewerbefläche) und wir uns verpflichten, ihn nicht zu verändern.',
  verfahrensfrei:'Verfahrensfrei: das Vorhaben ist nach der Landesbauordnung von der Genehmigungspflicht ausgenommen. Bei Freiflächen-PV und Speichern die Ausnahme — und nur dann tragfähig, wenn die Landesbauordnung es ausdrücklich vorsieht. Alle materiellen Anforderungen gelten unverändert weiter.',
  freistellung:'Genehmigungsfreistellung: bei kleinen/mittleren Vorhaben statt Baugenehmigung. Je Bundesland verschieden — Mecklenburg-Vorpommern und Sachsen-Anhalt ermöglichen sie, Brandenburg und NRW nicht. Freistellung offiziell per Rückmeldung oder automatisch nach ca. 3 Wochen Frist.'
};
function renderBplanMeilensteine(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('bplan-meilensteine'); if(!root) return;
  // Tabellenform: die Nummer macht die Abfolge des Verfahrens explizit, Status und
  // Datum stehen in eigenen Spalten statt frei in der Zeile.
  const doneCount = BPLAN_MEILENSTEINE.filter(([k]) => p.genehmigung.bplan.meilensteine[k].erledigt).length;
  const rows = BPLAN_MEILENSTEINE.map(([key,name],i) => {
    const m = p.genehmigung.bplan.meilensteine[key];
    const datumCell = key==='auslegung'
      ? `<span class="ms-range">
           <span class="ms-pair"><span>von</span><input type="date" data-ms="${key}" data-k="von" value="${escapeAttr(m.von||'')}" /></span>
           <span class="ms-pair"><span>bis</span><input type="date" data-ms="${key}" data-k="bis" value="${escapeAttr(m.bis||'')}" /></span>
         </span>`
      : `<input type="date" data-ms="${key}" data-k="datum" value="${escapeAttr(m.datum||'')}" />`;
    return `<tr class="${m.erledigt?'done':''}">
      <td class="col-check"><input type="checkbox" data-ms="${key}" data-k="erledigt" ${m.erledigt?'checked':''} title="Meilenstein erledigt" /></td>
      <td class="col-nr">${i+1}</td>
      <td><span class="row-name">${escapeHtml(name)}</span></td>
      <td class="col-date">${datumCell}</td>
    </tr>`;
  }).join('');
  root.innerHTML = `<table class="data-table ms-table">
    <thead><tr>
      <th class="col-check" title="Erledigt">✓</th>
      <th class="col-nr">Nr.</th>
      <th>Meilenstein</th>
      <th class="col-date">Datum / Zeitraum</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="table-foot">${doneCount} von ${BPLAN_MEILENSTEINE.length} Meilensteinen erledigt</div>`;
  root.querySelectorAll('[data-ms]').forEach(inp => {
    inp.addEventListener('change', () => {
      const p2 = getActiveProject(); if(!p2) return;
      const m = p2.genehmigung.bplan.meilensteine[inp.dataset.ms];
      if(inp.dataset.k==='erledigt'){
        m.erledigt = inp.checked;
        if(inp.checked && !m.datum && inp.dataset.ms!=='auslegung') m.datum = new Date().toISOString().slice(0,10);
      } else {
        m[inp.dataset.k] = inp.value || null;
      }
      touchActiveProject(); saveProjects();
      renderBplanMeilensteine();
      document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p2);
    });
  });
}
function renderAuflagenList(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('auflagen-list'); if(!root) return;
  const list = p.genehmigung.auflagen;
  const rows = list.length ? list.map((a,i) => `<tr class="${a.erledigt?'done':''}">
    <td class="col-check"><input type="checkbox" data-i="${i}" data-k="erledigt" ${a.erledigt?'checked':''} title="Erledigt" /></td>
    <td><input type="text" data-i="${i}" data-k="text" value="${escapeAttr(a.text||'')}" placeholder="Auflage / Maßnahme …" style="width:100%" /></td>
    <td class="col-typ"><select data-i="${i}" data-k="typ">
      ${['Auflage','A&E','CEF','Ökopunkte'].map(t=>`<option value="${t}"${a.typ===t?' selected':''}>${t}</option>`).join('')}
    </select></td>
    <td class="col-check"><input type="checkbox" data-i="${i}" data-k="faelligVorBaubeginn" ${a.faelligVorBaubeginn?'checked':''} title="Muss vor Baubeginn umgesetzt sein (typisch für CEF)" /></td>
    <td class="col-act"><button class="danger small" data-del-auflage="${i}" title="Auflage löschen">×</button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="table-empty">Keine Auflagen / Maßnahmen erfasst.</td></tr>';
  root.innerHTML = `<table class="data-table">
    <thead><tr>
      <th class="col-check" title="Erledigt">✓</th>
      <th>Auflage / Maßnahme</th>
      <th class="col-typ">Typ</th>
      <th class="col-check" title="Muss vor Baubeginn umgesetzt sein">Vor&nbsp;Baubeginn</th>
      <th class="col-act"></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  root.querySelectorAll('[data-i]').forEach(inp => {
    const ev = inp.type==='text' ? 'input' : 'change';
    inp.addEventListener(ev, () => {
      const p2 = getActiveProject(); if(!p2) return;
      const a = p2.genehmigung.auflagen[Number(inp.dataset.i)]; if(!a) return;
      a[inp.dataset.k] = (inp.type==='checkbox') ? inp.checked : inp.value;
      touchActiveProject(); saveProjects();
    });
  });
  root.querySelectorAll('[data-del-auflage]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      p2.genehmigung.auflagen.splice(Number(btn.dataset.delAuflage),1);
      touchActiveProject(); saveProjects(); renderAuflagenList();
    });
  });
}
function renderFristenListe(){
  const p = getActiveProject(); if(!p) return;
  const root = document.getElementById('fristen-list'); if(!root) return;
  const list = p.genehmigung.fristenListe;
  const rows = list.length ? list.map((f,i) => `<tr>
    <td class="col-date"><input type="date" data-fi="${i}" data-k="datum" value="${escapeAttr(f.datum||'')}" /></td>
    <td class="col-typ">${f.datum?`<span class="${fristPillClass(f.datum,14)}">${daysUntil(f.datum)<0?'überfällig':daysUntil(f.datum)+' Tage'}</span>`:'<span style="color:var(--muted)">—</span>'}</td>
    <td><input type="text" data-fi="${i}" data-k="text" value="${escapeAttr(f.text||'')}" placeholder="z.B. Stellungnahmefrist TÖB" style="width:100%" /></td>
    <td class="col-act"><button class="danger small" data-del-frist="${i}" title="Frist löschen">×</button></td>
  </tr>`).join('') : '<tr><td colspan="4" class="table-empty">Keine manuellen Fristen erfasst.</td></tr>';
  root.innerHTML = `<table class="data-table">
    <thead><tr>
      <th class="col-date">Datum</th>
      <th class="col-typ">Rest</th>
      <th>Frist</th>
      <th class="col-act"></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  root.querySelectorAll('[data-fi]').forEach(inp => {
    const ev = inp.type==='date' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const p2 = getActiveProject(); if(!p2) return;
      const f = p2.genehmigung.fristenListe[Number(inp.dataset.fi)]; if(!f) return;
      f[inp.dataset.k] = inp.value || (inp.dataset.k==='datum' ? null : '');
      touchActiveProject(); saveProjects();
      if(ev==='change') renderFristenListe();
    });
  });
  root.querySelectorAll('[data-del-frist]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      p2.genehmigung.fristenListe.splice(Number(btn.dataset.delFrist),1);
      touchActiveProject(); saveProjects(); renderFristenListe();
    });
  });
}
function updateBauArtHint(){
  const hint = document.getElementById('bau-art-hint');
  const art = document.getElementById('bau-art').value;
  hint.style.display = art ? '' : 'none';
  hint.textContent = BAU_ART_HINTS[art] || '';
}
function renderGenehmigungProzess(){
  const p = getActiveProject(); if(!p) return;
  document.getElementById('bplaner-name').value = p.genehmigung.bplan.bplaner.name || '';
  document.getElementById('bplaner-kontakt').value = p.genehmigung.bplan.bplaner.email || '';
  const bv = p.genehmigung.bauverfahren;
  document.getElementById('bau-art').value = bv.art || '';
  document.getElementById('bau-eingereicht').value = bv.eingereichtAm || '';
  document.getElementById('bau-vollstaendig').value = bv.vollstaendigAm || '';
  document.getElementById('bau-genehmigt').value = bv.genehmigtAm || '';
  document.getElementById('bau-baubeginn').value = bv.baubeginnAm || '';
  document.getElementById('bau-anzeige').value = bv.baubeginnsanzeigeAm || '';
  updateBauArtHint();
  renderVerfahrenKarte();
  applyVerfahrenSichtbarkeit();
  loadVerfahrenFelder(p);
  renderPrivilegierung();
  renderEinvernehmenFrist();
  renderBauArtWarnung();
  renderFoerderrahmen();
  renderBplanMeilensteine();
  renderAuflagenList();
  renderFristenListe();
  renderGutachtenTabelle();
  renderGenehmigungFoldStatus();
}
// Bindings (einmalig)
document.getElementById('bplaner-name').addEventListener('input', e => {
  const p = getActiveProject(); if(!p) return;
  p.genehmigung.bplan.bplaner.name = e.target.value; touchActiveProject(); saveProjects();
});
document.getElementById('bplaner-kontakt').addEventListener('input', e => {
  const p = getActiveProject(); if(!p) return;
  p.genehmigung.bplan.bplaner.email = e.target.value; touchActiveProject(); saveProjects();
});
document.getElementById('bau-art').addEventListener('change', e => {
  const p = getActiveProject(); if(!p) return;
  p.genehmigung.bauverfahren.art = e.target.value || null; touchActiveProject(); saveProjects();
  updateBauArtHint();
  renderBauArtWarnung();
  document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
});
[['bau-eingereicht','eingereichtAm'],['bau-vollstaendig','vollstaendigAm'],['bau-genehmigt','genehmigtAm'],
 ['bau-baubeginn','baubeginnAm'],['bau-anzeige','baubeginnsanzeigeAm']].forEach(([id,key]) => {
  document.getElementById(id).addEventListener('change', e => {
    const p = getActiveProject(); if(!p) return;
    p.genehmigung.bauverfahren[key] = e.target.value || null; touchActiveProject(); saveProjects();
    document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
  });
});
document.getElementById('btn-add-auflage').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  p.genehmigung.auflagen.push({ id:'a'+Date.now(), text:'', typ:'Auflage', faelligVorBaubeginn:false, erledigt:false });
  touchActiveProject(); saveProjects(); renderAuflagenList(); renderGenehmigungFoldStatus();
});
document.getElementById('btn-add-frist').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  p.genehmigung.fristenListe.push({ id:'fr'+Date.now(), text:'', datum:null });
  touchActiveProject(); saveProjects(); renderFristenListe(); renderGenehmigungFoldStatus();
});
