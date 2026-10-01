// Benachrichtigungsglocke im Header: Benachrichtigungen (z. B. „Aufgabe zugewiesen") und Erinnerungen
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Zwei Quellen unter einer Glocke:
//  1. Benachrichtigungen — gespeichert in p.benachrichtigungen (je Projekt). Dadurch kommen sie
//     über den normalen Projekt-Sync (Supabase) beim Empfänger an, ohne eigene Tabelle.
//     Eintrag: { id, an, von, typ, titel, text, ziel, am, gelesenAm }. an/von = E-Mail
//     (bzw. Benutzername ohne Supabase) — angezeigt werden nur Name und Profilbild.
//  2. Erinnerungen — nicht gespeichert, sondern bei jedem Öffnen abgeleitet: eigene Aufgaben
//     mit Deadline in ≤ 7 Tagen oder überfällig, dazu alle Projektfristen (Fristen-Dashboard)
//     der nächsten 14 Tage bzw. überfällige.
// Der Zähler an der Glocke = ungelesene Benachrichtigungen + überfällige/heute fällige Erinnerungen.
// ═════════════════════════════════════════════════════════════════════════════

const BENACHRICHTIGUNGEN_MAX = 200; // je Projekt, älteste fallen heraus

function ichBin(){ return (typeof paCurrentUser === 'function' ? paCurrentUser() : '') || ''; }
function personName(email){ const t = teamProfil(email); return t ? t.name : (email ? (String(email).includes('@') ? nameAusEmail(email) : email) : '—'); }

// ---- Benachrichtigung anlegen --------------------------------------------------
function benachrichtige(p, eintrag){
  if(!p || !eintrag.an) return;
  if(!Array.isArray(p.benachrichtigungen)) p.benachrichtigungen = [];
  p.benachrichtigungen.push(Object.assign({
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    von: ichBin(), am: new Date().toISOString(), gelesenAm: null,
  }, eintrag));
  if(p.benachrichtigungen.length > BENACHRICHTIGUNGEN_MAX) p.benachrichtigungen = p.benachrichtigungen.slice(-BENACHRICHTIGUNGEN_MAX);
}

// Aufgabe (Prozessschritt, eigene Aufgabe oder Subelement) hat eine neue zuständige Person.
// targetStr = data-target-JSON der Aufgabenliste (siehe resolveTaskTarget).
function aufgabenTitel(p, targetStr){
  let t; try { t = JSON.parse(targetStr); } catch { return 'Aufgabe'; }
  const schritt = id => (STEP_BY_ID[id] || {}).name || 'Aufgabe';
  const eigene = id => ((p.prozess.aufgaben || []).find(a => a.id === id) || {}).titel || 'Eigene Aufgabe';
  if(t.kind === 'step') return schritt(t.id);
  if(t.kind === 'custom') return eigene(t.id);
  const r = resolveTaskTarget(p, targetStr);
  const sub = (r && r.obj && r.obj.titel) || 'Subelement';
  return `${sub} (zu „${t.kind === 'stepsub' ? schritt(t.id) : eigene(t.id)}")`;
}
function aufgabenKategorie(targetStr){
  let t; try { t = JSON.parse(targetStr); } catch { return null; }
  if(t.kind === 'custom' || t.kind === 'customsub') return 'eigene';
  const cat = TASK_CATEGORIES.find(c => c.steps.includes(t.id));
  return cat ? cat.id : null;
}
function benachrichtigeZuweisung(p, targetStr, an, vorher){
  if(!an || an === vorher) return;
  if(an === ichBin()) return; // sich selbst zuweisen braucht keine Nachricht
  const titel = aufgabenTitel(p, targetStr);
  benachrichtige(p, { an, typ:'zuweisung', titel,
    text:`${personName(ichBin())} hat dir eine Aufgabe zugewiesen`,
    ziel:{ tab:'prozess', task:targetStr, kategorie:aufgabenKategorie(targetStr) } });
}

// ---- Lesen ------------------------------------------------------------------------
function meineBenachrichtigungen(){
  const ich = ichBin(); if(!ich) return [];
  return projects.flatMap(p => (p.benachrichtigungen || []).filter(n => n.an === ich).map(n => ({ n, p })))
    .sort((a, b) => (b.n.am || '').localeCompare(a.n.am || ''));
}

// Eigene Aufgaben (zuständig = ich) mit Deadline in ≤ 7 Tagen oder überfällig, noch nicht erledigt
function meineAufgabenErinnerungen(){
  const ich = ichBin(); if(!ich) return [];
  const out = [];
  projects.forEach(p => {
    const push = (obj, targetStr, titel) => {
      if(obj.verantwortlich !== ich || !obj.deadline) return;
      const t = daysUntil(obj.deadline); if(t > 7) return;
      out.push({ p, datum:obj.deadline, tage:t, titel, art:'aufgabe',
        ziel:{ tab:'prozess', task:targetStr, kategorie:aufgabenKategorie(targetStr) } });
    };
    Object.entries(p.prozess.schritte || {}).forEach(([id, ex]) => {
      const step = STEP_BY_ID[id]; if(!step) return;
      if(!stepDone(stepState(p, step))) push(ex, JSON.stringify({ kind:'step', id }), step.name);
      (ex.subelemente || []).forEach(s => { if(!isTaskDone(s)) push(s, JSON.stringify({ kind:'stepsub', id, sub:s.id }), `${s.titel || 'Subelement'} (zu „${step.name}")`); });
    });
    (p.prozess.aufgaben || []).forEach(a => {
      if(!isTaskDone(a)) push(a, JSON.stringify({ kind:'custom', id:a.id }), a.titel || 'Eigene Aufgabe');
      (a.subelemente || []).forEach(s => { if(!isTaskDone(s)) push(s, JSON.stringify({ kind:'customsub', id:a.id, sub:s.id }), `${s.titel || 'Subelement'} (zu „${a.titel || 'Eigene Aufgabe'}")`); });
    });
  });
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}
// Projektfristen (dieselbe Quelle wie Fristen-Dashboard und „Als Nächstes"): überfällig oder in ≤ 14 Tagen
function fristErinnerungen(){
  return collectDeadlines().map(d => ({ p:d.p, datum:d.datum, tage:daysUntil(d.datum), titel:d.text, art:'frist',
    ziel:{ tab:d.tab, sub:d.sub } })).filter(e => e.tage <= 14);
}

function glockeZaehler(){
  const ungelesen = meineBenachrichtigungen().filter(x => !x.n.gelesenAm).length;
  const faellig = [...meineAufgabenErinnerungen(), ...fristErinnerungen()].filter(e => e.tage <= 0).length;
  return { ungelesen, faellig, gesamt: ungelesen + faellig };
}

// ---- Glocke + Panel ------------------------------------------------------------------
function aktualisiereGlocke(){
  const badge = document.getElementById('glocke-badge'); if(!badge) return;
  let z; try { z = glockeZaehler(); } catch { return; } // während des Ladens (Profile/Projekte noch nicht da)
  badge.textContent = z.gesamt > 99 ? '99+' : String(z.gesamt);
  badge.classList.toggle('hidden', !z.gesamt);
  badge.classList.toggle('nur-faellig', !z.ungelesen && !!z.faellig);
  const btn = document.getElementById('btn-glocke');
  const teile = [z.ungelesen ? `${z.ungelesen} ungelesen` : '', z.faellig ? `${z.faellig} fällig` : ''].filter(Boolean);
  btn.setAttribute('aria-label', 'Benachrichtigungen' + (teile.length ? ` (${teile.join(', ')})` : ''));
  if(!document.getElementById('glocke-panel').classList.contains('hidden')) renderGlockePanel();
}
let glockeTimer = null;
function glockeSpaeterAktualisieren(){ clearTimeout(glockeTimer); glockeTimer = setTimeout(aktualisiereGlocke, 400); }

function wannText(iso){
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if(min < 1) return 'gerade eben';
  if(min < 60) return `vor ${min} Min.`;
  if(min < 60 * 24) return `vor ${Math.round(min / 60)} Std.`;
  const tage = Math.round(min / 1440);
  return tage === 1 ? 'gestern' : tage < 7 ? `vor ${tage} Tagen` : fmtDate(iso.slice(0,10));
}
function faelligText(t){ return t < 0 ? `${-t} T. überfällig` : t === 0 ? 'heute' : t === 1 ? 'morgen' : `in ${t} T.`; }
function faelligKlasse(t){ return t < 0 ? 'err' : t <= 2 ? 'warn' : ''; }

let glockeEintraege = []; // Index → Ziel, für die Klick-Handler
function renderGlockePanel(){
  const panel = document.getElementById('glocke-panel');
  const nachrichten = meineBenachrichtigungen().slice(0, 30);
  const aufgaben = meineAufgabenErinnerungen();
  const fristen = fristErinnerungen().sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, 15);
  const ungelesen = nachrichten.filter(x => !x.n.gelesenAm).length;
  glockeEintraege = [];
  const eintrag = (x) => { glockeEintraege.push(x); return glockeEintraege.length - 1; };
  const projektName = p => escapeHtml(p.name || '(unbenanntes Projekt)');

  const nachrichtenHtml = nachrichten.length ? nachrichten.map(({ n, p }) => {
    const von = teamProfil(n.von);
    const vonName = personName(n.von);
    return `<button type="button" class="glocke-item${n.gelesenAm ? '' : ' ungelesen'}" data-g="${eintrag({ p, ziel:n.ziel, nid:n.id })}">
      <span class="avatar glocke-avatar" aria-hidden="true">${avatarHtml(von || { displayName:vonName }, vonName)}</span>
      <span class="glocke-text"><b>${escapeHtml(n.text || 'Neue Benachrichtigung')}</b>
        <span class="glocke-titel">${escapeHtml(n.titel || '')}</span>
        <span class="glocke-meta">${projektName(p)} · ${escapeHtml(wannText(n.am))}</span></span>
      ${n.gelesenAm ? '' : '<span class="glocke-punkt" aria-label="ungelesen"></span>'}
    </button>`;
  }).join('') : '<div class="glocke-leer">Keine Benachrichtigungen. Wird dir eine Aufgabe zugewiesen, erscheint sie hier.</div>';

  const erinnerung = e => `<button type="button" class="glocke-item" data-g="${eintrag({ p:e.p, ziel:e.ziel })}">
      <span class="glocke-icon ${e.art}" aria-hidden="true">${e.art === 'aufgabe' ? '✓' : '⏰'}</span>
      <span class="glocke-text"><b>${escapeHtml(e.titel)}</b>
        <span class="glocke-meta">${projektName(e.p)} · ${escapeHtml(fmtDate(e.datum))}</span></span>
      <span class="pill ${faelligKlasse(e.tage)}">${escapeHtml(faelligText(e.tage))}</span>
    </button>`;
  const erinnerungenHtml = (aufgaben.length ? `<div class="glocke-sub">Meine Aufgaben</div>${aufgaben.map(erinnerung).join('')}` : '')
    + (fristen.length ? `<div class="glocke-sub">Projektfristen (14 Tage)</div>${fristen.map(erinnerung).join('')}` : '')
    || '<div class="glocke-leer">Keine fälligen Aufgaben oder Fristen in den nächsten 14 Tagen.</div>';

  panel.innerHTML = `
    <div class="glocke-kopf">
      <strong>Benachrichtigungen</strong>
      ${ungelesen ? `<button type="button" class="linklike" id="glocke-alle-gelesen">Alle als gelesen markieren</button>` : ''}
    </div>
    <div class="glocke-liste">
      <section>${nachrichtenHtml}</section>
      <div class="glocke-abschnitt">Erinnerungen</div>
      <section>${erinnerungenHtml}</section>
    </div>`;
  panel.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => oeffneGlockenEintrag(glockeEintraege[Number(b.dataset.g)])));
  document.getElementById('glocke-alle-gelesen')?.addEventListener('click', () => {
    const jetzt = new Date().toISOString();
    meineBenachrichtigungen().forEach(({ n }) => { if(!n.gelesenAm) n.gelesenAm = jetzt; });
    saveProjects(); aktualisiereGlocke(); renderGlockePanel();
  });
}

function oeffneGlockenEintrag(e){
  if(!e) return;
  if(e.nid){
    const n = (e.p.benachrichtigungen || []).find(x => x.id === e.nid);
    if(n && !n.gelesenAm){ n.gelesenAm = new Date().toISOString(); saveProjects(); }
  }
  schliesseGlocke();
  selectProject(e.p.id);
  const z = e.ziel || {};
  if(z.tab) switchDetailTab(z.tab);
  if(z.sub) switchGrundstueckSubtab(z.sub);
  if(z.task){
    // Aufgabe sichtbar machen: Kategorie aufklappen, zur Zeile scrollen, kurz hervorheben
    if(z.kategorie) setTaskKategorieOffen(z.kategorie, true);
    renderProzessTasks();
    // Doppeltes rAF: selectProject stellt die gemerkte Scrollposition ebenfalls per doppeltem rAF
    // wieder her — das Scrollen zur Zeile muss danach kommen, sonst wird es überschrieben.
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      const feld = document.querySelector(`#prozess-tasks [data-zust="${CSS.escape(z.task)}"]`);
      const zeile = feld && feld.closest('tr');
      if(!zeile) return;
      zeile.scrollIntoView({ behavior:'auto', block:'center' });
      zeile.classList.add('glocke-ziel');
      setTimeout(() => zeile.classList.remove('glocke-ziel'), 2400);
    })));
  }
  aktualisiereGlocke();
}

function oeffneGlocke(){
  renderGlockePanel();
  document.getElementById('glocke-panel').classList.remove('hidden');
  document.getElementById('btn-glocke').setAttribute('aria-expanded', 'true');
}
function schliesseGlocke(){
  document.getElementById('glocke-panel').classList.add('hidden');
  document.getElementById('btn-glocke').setAttribute('aria-expanded', 'false');
}
document.getElementById('btn-glocke').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('glocke-panel').classList.contains('hidden') ? oeffneGlocke() : schliesseGlocke();
});
document.addEventListener('click', e => { if(!e.target.closest('#glocke')) schliesseGlocke(); });
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && !document.getElementById('glocke-panel').classList.contains('hidden')){ schliesseGlocke(); document.getElementById('btn-glocke').focus(); }
});
// Fälligkeiten ändern sich mit der Zeit — Zähler regelmäßig nachziehen
setInterval(aktualisiereGlocke, 60 * 1000);
glockeSpaeterAktualisieren();
