// Projektkopf, Reiter-Felder, Absender, Gutachten-Typen und Anfrage-Mails
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---------- Detail header bindings (Projektname + Status, sichtbar über alle Reiter) ----------
const detailTitleEl = document.getElementById('detail-title');
// Mehrzeilig (textarea), damit lange Projektnamen umbrechen statt abgeschnitten zu werden.
// Höhe wächst mit dem Inhalt (CSS field-sizing, hier zusätzlich per JS für ältere Browser);
// Enter beendet die Eingabe, statt einen Zeilenumbruch in den Namen zu schreiben.
function fitDetailTitle(){ detailTitleEl.style.height = 'auto'; detailTitleEl.style.height = detailTitleEl.scrollHeight + 'px'; }
detailTitleEl.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); detailTitleEl.blur(); } });
detailTitleEl.addEventListener('input', ()=>{
  const p = getActiveProject(); if(!p) return;
  detailTitleEl.value = detailTitleEl.value.replace(/[\r\n]+/g, ' '); // eingefügte Umbrüche
  p.name = detailTitleEl.value; touchActiveProject(); saveProjects();
  fitDetailTitle();
  updateHeaderNav('detail'); // Projekt-Chip im Header live mitziehen
});
function loadActiveProjectHeader(p){
  detailTitleEl.value = p.name || '';
  requestAnimationFrame(fitDetailTitle);
  document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
  document.getElementById('detail-quickmap').innerHTML = miniGermanyMapHtml(projectLocationLatLon(p));
  renderNavBadges(p);
}

// Offene Punkte je Bereich, direkt in der Navigation. Bewusst nur dort, wo die Zahl zu
// einer Handlung führt — und nur, wenn sie größer null ist: eine Reihe von Nullen wäre
// genau das Rauschen, das die Sidebar vermeiden soll.
function navBadgeCounts(p){
  const o = overallProgress(p);
  const flur = sicherungRows(p);
  const ungesichert = flur.filter(r => r.extra.vertragsStatus !== 'unterschrieben').length;
  const gutachtenOffen = gutachtenZeilen(p)
    .filter(z => z.e.erforderlich==='ja' && z.status !== 'erledigt').length;
  const auflagenOffen = (p.genehmigung.auflagen||[]).filter(a => !a.erledigt).length;
  // Netz: die drei Stationen, die den Anschluss tragen
  const netzOffen = [
    !p.netz.anaGestelltAm,
    p.netz.nvpStatus !== 'gesichert',
    p.netz.trasseStatus !== 'gesichert',
  ].filter(Boolean).length;
  // Termine: was in den nächsten 30 Tagen fällig oder bereits überfällig ist
  const bald = projectDeadlines(p).filter(d => daysUntil(d.datum) <= 30).length;
  return {
    prozess: o.total - o.done,
    grundstueck: ungesichert,
    genehmigung: gutachtenOffen + auflagenOffen,
    netz: netzOffen,
    termine: bald,
    kosten: kostenOffenAnzahl(p), // offene Zahlungen
  };
}

function renderNavBadges(p){
  const zahlen = p ? navBadgeCounts(p) : {};
  document.querySelectorAll('.detail-tab .tab-badge[data-badge]').forEach(el => {
    const n = zahlen[el.dataset.badge];
    el.textContent = n ? String(n) : '';
    el.style.display = n ? '' : 'none';
    el.title = n ? `${n} offene${n===1?'r':''} Punkt${n===1?'':'e'} in diesem Bereich` : '';
  });
  // Unterpunkte zeigen Bestandszahlen, keine offenen Punkte — deshalb getrennt gezählt.
  const mengen = !p ? {} : {
    flurstuecke:     ((p.lage && p.lage.flurstuecke) || []).length,
    eigentuemer:     (p.eigentuemer || []).length,
    vertraege:       (p.vertraege || []).length,
    'bet-genehmigung': beteiligteFuer(p, 'genehmigung').length,
    'bet-netz':        beteiligteFuer(p, 'netz').length,
  };
  document.querySelectorAll('.detail-subtab .sub-count[data-count]').forEach(el => {
    const n = mengen[el.dataset.count];
    el.textContent = n ? String(n) : '';
  });
}

// ---------- Reiter-Felder: Grundstück / Genehmigungsplanung / Netz / Technik ----------
function bindProjectField(id, key){
  const el = document.getElementById(id);
  el.addEventListener('input', ()=>{
    const p = getActiveProject(); if(!p) return;
    p[key] = el.value; touchActiveProject(); saveProjects();
  });
}
function bindNestedField(id, group, key){
  const el = document.getElementById(id);
  el.addEventListener('input', ()=>{
    const p = getActiveProject(); if(!p) return;
    p[group][key] = el.value; touchActiveProject(); saveProjects();
  });
}
function bindNestedNumberField(id, group, key){
  const el = document.getElementById(id);
  el.addEventListener('input', ()=>{
    const p = getActiveProject(); if(!p) return;
    p[group][key] = el.value === '' ? null : Number(el.value);
    touchActiveProject(); saveProjects();
  });
}
function bindProjectNumberField(id, key){
  const el = document.getElementById(id);
  el.addEventListener('input', ()=>{
    const p = getActiveProject(); if(!p) return;
    p[key] = el.value === '' ? null : Number(el.value);
    touchActiveProject(); saveProjects();
    renderDashboard();
  });
}
bindProjectField('proj-location', 'location');
bindProjectNumberField('proj-power-dc', 'powerDcKwp');
bindProjectNumberField('proj-power-ac', 'powerAcKw');
bindProjectField('proj-timeline', 'timeline');
bindProjectField('proj-notes', 'notes');
bindNestedField('gen-behoerde', 'genehmigung', 'behoerde');
bindNestedField('gen-verfahrensstand', 'genehmigung', 'verfahrensstand');
bindNestedField('gen-fristen', 'genehmigung', 'fristen');
bindNestedField('netz-betreiber', 'netz', 'betreiber');
bindNestedField('netz-anschlusspunkt', 'netz', 'anschlusspunkt');
bindNestedField('netz-anschlussleistung', 'netz', 'anschlussleistung');
bindNestedField('netz-status', 'netz', 'status');
bindNestedNumberField('netz-leistung-mw', 'netz', 'leistungMw');
document.getElementById('netz-leistung-mw').addEventListener('input', () => runVergleichAndRender());
bindNestedField('tech-anlagentyp', 'technik', 'anlagentyp');
bindNestedField('tech-module', 'technik', 'module');
bindNestedField('tech-wechselrichter', 'technik', 'wechselrichter');
bindNestedField('tech-bemerkungen', 'technik', 'bemerkungen');

function loadActiveProjectGrundstueck(p){
  document.getElementById('proj-location').value = p.location || '';
}
function loadActiveProjectGenehmigung(p){
  document.getElementById('proj-timeline').value = p.timeline || '';
  document.getElementById('proj-notes').value = p.notes || '';
  document.getElementById('gen-behoerde').value = p.genehmigung.behoerde || '';
  document.getElementById('gen-verfahrensstand').value = p.genehmigung.verfahrensstand || '';
  document.getElementById('gen-fristen').value = p.genehmigung.fristen || '';
}
function loadActiveProjectNetz(p){
  document.getElementById('netz-betreiber').value = p.netz.betreiber || '';
  document.getElementById('netz-anschlusspunkt').value = p.netz.anschlusspunkt || '';
  document.getElementById('netz-anschlussleistung').value = p.netz.anschlussleistung || '';
  document.getElementById('netz-status').value = p.netz.status || '';
  document.getElementById('netz-leistung-mw').value = (p.netz.leistungMw ?? '');
  document.getElementById('netz-ana').value = p.netz.anaGestelltAm || '';
  document.getElementById('netz-nvp-status').value = p.netz.nvpStatus || 'offen';
  document.getElementById('netz-trasse-status').value = p.netz.trasseStatus || 'offen';
  document.getElementById('netz-trasse-notiz').value = p.netz.trasseNotiz || '';
}
function loadActiveProjectTechnik(p){
  document.getElementById('proj-power-dc').value = (p.powerDcKwp ?? '');
  document.getElementById('proj-power-ac').value = (p.powerAcKw ?? '');
  document.getElementById('tech-anlagentyp').value = p.technik.anlagentyp || '';
  document.getElementById('tech-module').value = p.technik.module || '';
  document.getElementById('tech-wechselrichter').value = p.technik.wechselrichter || '';
  document.getElementById('tech-bemerkungen').value = p.technik.bemerkungen || '';
}
function loadActiveProjectIntoSidebar(p){
  loadActiveProjectHeader(p);
  loadActiveProjectGrundstueck(p);
  loadActiveProjectGenehmigung(p);
  loadActiveProjectNetz(p);
  loadActiveProjectTechnik(p);
}

// ---------- Sender ----------
['name','company','strasse','plz','ort','phone','email','signature'].forEach(k=>{
  const el = document.getElementById('me-'+k);
  el.value = sender[k] || '';
  el.addEventListener('input', ()=>{ sender[k]=el.value; });
});
document.getElementById('btn-save-sender').onclick = ()=>{
  save(LS_KEYS.sender, sender); alert('Absender gespeichert.');
};

// ---------- Contacts (Gutachten-Typen) ----------
function renderContacts(){
  const root = document.getElementById('contacts-list');
  root.innerHTML = '';
  if(!types.length){ root.innerHTML = '<div class="empty">Keine Gutachten-Typen.</div>'; return; }
  types.forEach((t, i) => {
    const card = document.createElement('div'); card.className='card';
    const officeCount = t.offices.length;
    const pill = officeCount
      ? `<span class="pill ok">${officeCount} Büro${officeCount>1?'s':''}</span>`
      : `<span class="pill warn">Kein Büro</span>`;
    card.innerHTML = `
      <h3><span>${escapeHtml(t.name)}</span> ${pill}</h3>
      <label>Bezeichnung der Kategorie</label>
      <input type="text" data-k="name" value="${escapeAttr(t.name)}" />
      <label>Hinweis im Mailtext (optional)</label>
      <textarea data-k="notes">${escapeHtml(t.notes||'')}</textarea>

      <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="font-size:12px">Gutachterbüros in dieser Kategorie</strong>
          <button class="small" data-act="addoffice">+ Büro</button>
        </div>
        <div class="offices"></div>
      </div>

      <div class="actions">
        <button class="danger small" data-act="del">Kategorie entfernen</button>
      </div>
    `;
    card.querySelectorAll(':scope > input, :scope > textarea').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        t[inp.dataset.k] = inp.value; save(LS_KEYS.types, types);
      });
    });
    const officesEl = card.querySelector('.offices');
    renderOffices(t, officesEl);
    card.querySelector('[data-act=addoffice]').onclick = ()=>{
      t.offices.push({ id:'o'+Date.now(), name:'', contact:'', email:'', phone:'', notes:'' });
      save(LS_KEYS.types, types); renderContacts();
    };
    card.querySelector('[data-act=del]').onclick = ()=>{
      if(!confirm('Diese Kategorie inkl. aller Büros entfernen?')) return;
      supabaseDelete('expert_types', t.id);
      types.splice(i,1); save(LS_KEYS.types, types); renderContacts();
    };
    root.appendChild(card);
  });
}

function renderOffices(type, root){
  root.innerHTML = '';
  if(!type.offices.length){
    root.innerHTML = '<div style="font-size:11px;color:var(--muted);font-style:italic;padding:6px 0">Noch kein Büro hinterlegt.</div>';
    return;
  }
  type.offices.forEach((o, idx) => {
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px';
    box.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input type="text" data-k="name" placeholder="Büro-/Firmenname" value="${escapeAttr(o.name)}" />
        <button class="danger small" data-act="del">×</button>
      </div>
      <input type="text" data-k="contact" placeholder="Ansprechpartner" value="${escapeAttr(o.contact)}" style="margin-bottom:4px" />
      <input type="email" data-k="email" placeholder="E-Mail*" value="${escapeAttr(o.email)}" style="margin-bottom:4px" />
      <input type="text" data-k="phone" placeholder="Telefon (optional)" value="${escapeAttr(o.phone)}" style="margin-bottom:4px" />
      <input type="text" data-k="notes" placeholder="Interne Notiz (optional)" value="${escapeAttr(o.notes||'')}" />
    `;
    box.querySelectorAll('input').forEach(inp=>{
      inp.addEventListener('input', ()=>{ o[inp.dataset.k] = inp.value; save(LS_KEYS.types, types); });
    });
    box.querySelector('[data-act=del]').onclick = ()=>{
      type.offices.splice(idx,1); save(LS_KEYS.types, types); renderContacts();
    };
    root.appendChild(box);
  });
}
document.getElementById('btn-add-type').onclick = ()=>{
  types.push({ id:'t'+Date.now(), name:'Neuer Gutachten-Typ', email:'', notes:'' });
  save(LS_KEYS.types, types); renderContacts();
};
document.getElementById('btn-reset-types').onclick = ()=>{
  if(!confirm('Standard-Liste wiederherstellen? Eigene Einträge gehen verloren.')) return;
  types = JSON.parse(JSON.stringify(DEFAULT_TYPES));
  save(LS_KEYS.types, types); renderContacts();
};

// ---------- Requests / Mail generation ----------
function buildMail(type, office){
  const project = getActiveProject();
  const hasGeo = !!(project && project.features.length);
  const fc = hasGeo ? combinedFeatureCollection(project) : null;
  const c = hasGeo ? turf.centroid(fc).geometry.coordinates : null;
  const a = hasGeo ? combinedArea(project) : 0;
  const bb = hasGeo ? turf.bbox(fc) : null;
  const partsCount = hasGeo ? project.features.length : 0;
  const ringCount = hasGeo ? project.features.reduce((s,f)=>s+f.geometry.coordinates[0].length, 0) : 0;
  const sampleCoords = hasGeo
    ? project.features.map((f,i) => {
        const header = partsCount>1 ? `-- Teilfläche ${i+1} --\n` : '';
        return header + f.geometry.coordinates[0].slice(0, partsCount>1?15:50).map(p=>`${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
      }).join('\n')
    : '';

  const subject = `Anfrage ${type.name} — ${(project&&project.name) || 'Projektgebiet'}`;
  const greeting = (office && office.contact)
    ? `Sehr geehrte/r ${office.contact},`
    : `Sehr geehrte Damen und Herren,`;
  const lines = [
    greeting,
    ``,
    `für die untenstehende Projektfläche möchten wir Sie um ein Angebot für folgendes Gutachten bitten:`,
    ``,
    `  • Leistung: ${type.name}`,
    type.notes ? `  • Hinweise: ${type.notes}` : null,
    ``,
    `Projektdaten`,
    `------------`,
    `Bezeichnung:     ${(project&&project.name) || '(noch offen)'}`,
    `Lage:            ${(project&&project.location) || '(siehe Koordinaten)'}`,
    `Geplante Leistung: ${(project && formatLeistung(project)) || '(noch offen)'}`,
    `Zeitrahmen:      ${(project&&project.timeline) || '(noch offen)'}`,
    ``,
    `Flächendaten`,
    `------------`,
    hasGeo ? `Fläche:          ${(a/10000).toFixed(2)} ha (${Math.round(a).toLocaleString('de-DE')} m²)` : `Fläche:          (Bereich noch nicht definiert)`,
    hasGeo ? `Teilflächen:     ${partsCount}` : null,
    hasGeo ? `Mittelpunkt:     ${c[1].toFixed(6)}, ${c[0].toFixed(6)} (WGS84)` : null,
    hasGeo ? `Bounding-Box:    SW ${bb[1].toFixed(5)}, ${bb[0].toFixed(5)}  →  NE ${bb[3].toFixed(5)}, ${bb[2].toFixed(5)}` : null,
    hasGeo ? `Stützpunkte:     ${ringCount}` : null,
    ``,
    currentLage ? `Lage (laut ALKIS / Verwaltung)` : null,
    currentLage ? `------------------------------` : null,
    currentLage && currentLage.land      ? `Bundesland:      ${currentLage.land}` : null,
    currentLage && currentLage.kreise.length    ? `Landkreis:       ${currentLage.kreise.join(', ')}` : null,
    currentLage && currentLage.gemeinden.length ? `Gemeinde:        ${currentLage.gemeinden.join(', ')}` : null,
    currentLage && currentLage.gemarkungen.length ? `Gemarkung(en):   ${currentLage.gemarkungen.join(', ')}` : null,
    currentLage && currentLage.fluren.length    ? `Flur(en):        ${currentLage.fluren.join(', ')}` : null,
    currentLage && currentLage.flurstuecke.length ? `Flurstücke (${currentLage.flurstuecke.length}${currentLage.truncated?' — gekürzt':''}):\n${currentLage.flurstuecke.slice(0,200).map(f=>`  • ${f.gemarkung} · ${f.flur} · Flst. ${f.zaehler}${f.nenner?'/'+f.nenner:''} (${f.flaeche} m²)${f.lage?' — '+f.lage:''}`).join('\n')}${currentLage.flurstuecke.length>200?`\n  ... ${currentLage.flurstuecke.length-200} weitere`:''}` : null,
    currentLage ? `Datenquelle:     ${currentLage.source}` : null,
    currentLage ? `` : null,
    currentNaturschutz ? `Naturschutz (BfN-Vorab-Scan, BBOX)` : null,
    currentNaturschutz ? `----------------------------------` : null,
    ...(currentNaturschutz ? currentNaturschutz.results.filter(r=>r.items.length).map(r =>
      `${r.cat.label}: ${r.items.length} Treffer\n${r.items.slice(0,10).map(it=>`  • ${it.name||'(ohne Name)'}${it.land?' ['+it.land+']':''}${it.id?' '+it.id:''}${it.legLink?'\n    '+it.legLink:''}`).join('\n')}${r.items.length>10?`\n  ... ${r.items.length-10} weitere`:''}`
    ) : []),
    currentNaturschutz && currentNaturschutz.results.every(r=>!r.items.length) ? `Keine BfN-Schutzgebiete im Umfeld der Bounding-Box festgestellt.` : null,
    currentNaturschutz ? `(Hinweis: BBOX-Vorab-Check, keine exakte Polygon-Überschneidung — Fachgutachter prüft definitiv.)` : null,
    currentNaturschutz ? `` : null,
    project&&project.notes ? `Zusatzinfos\n-----------\n${project.notes}\n` : null,
    `Eine KMZ-Datei mit der exakten Flächengeometrie ist als Anhang beigefügt.`,
    hasGeo ? `(Die Koordinaten finden Sie zusätzlich am Ende dieser Mail.)` : null,
    ``,
    `Wir bitten um Ihr Angebot inkl. Bearbeitungsdauer und Honorarrahmen.`,
    ``,
    sender.signature || 'Mit freundlichen Grüßen',
    sender.name || '',
    sender.company || '',
    sender.phone ? `Tel.: ${sender.phone}` : '',
    sender.email ? `E-Mail: ${sender.email}` : '',
  ].filter(x => x !== null && x !== undefined).join('\n');

  let body = lines;
  if(hasGeo){
    body += `\n\n--- Polygonkoordinaten (Lat, Lon — WGS84) ---\n` + sampleCoords;
    if(ringCount > 50) body += `\n... (weitere Stützpunkte in der angehängten KMZ)`;
  }
  return { subject, body };
}

function mailtoUrl(type, office){
  const { subject, body } = buildMail(type, office);
  const to = encodeURIComponent(office?.email || '');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function renderRequests(){
  const root = document.getElementById('requests-list'); root.innerHTML='';
  const activeProject = getActiveProject();
  if(!activeProject || !activeProject.features.length){
    root.innerHTML = '<div class="empty">Bitte erst einen Bereich zeichnen oder eine KMZ hochladen.</div>';
    return;
  }
  if(!types.length){ root.innerHTML='<div class="empty">Keine Gutachten-Typen konfiguriert.</div>'; return; }

  // Summary line
  const totalOffices = types.reduce((s,t)=>s+t.offices.filter(o=>o.email).length, 0);
  const missingCats = types.filter(t => !t.offices.some(o=>o.email)).length;
  const summary = document.createElement('div'); summary.className='info';
  summary.innerHTML = `
    <div class="stat"><span>Versandbereite Mails</span><b>${totalOffices}</b></div>
    <div class="stat"><span>Kategorien ohne Büro</span><b style="color:${missingCats?'var(--warn)':'var(--ok)'}">${missingCats}</b></div>
  `;
  root.appendChild(summary);

  types.forEach(t=>{
    const card = document.createElement('div'); card.className='card';
    const ready = t.offices.filter(o=>o.email).length;
    const pill = ready
      ? `<span class="pill ok">${ready} bereit</span>`
      : `<span class="pill warn">Kein Büro</span>`;
    card.innerHTML = `<h3><span>${escapeHtml(t.name)}</span> ${pill}</h3>`;

    if(!t.offices.length){
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:12px;color:var(--muted);font-style:italic';
      hint.textContent = 'Noch kein Büro in dieser Kategorie hinterlegt — Tab „Gutachter" → „+ Büro".';
      card.appendChild(hint);
    }

    t.offices.forEach(o=>{
      const { subject, body } = buildMail(t, o);
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:8px;margin-top:8px';
      const label = o.name || o.email || '(unbenanntes Büro)';
      const sub = [o.contact, o.email, o.phone].filter(Boolean).join(' · ');
      box.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:2px">${escapeHtml(label)} ${o.email?'':'<span class="pill warn">keine E-Mail</span>'}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">${escapeHtml(sub||'—')}</div>
        <details><summary style="font-size:11px">Mailtext anzeigen</summary><div style="padding-top:6px"><textarea readonly rows="12" style="font-size:11px">${escapeHtml(body)}</textarea></div></details>
        <div class="actions" style="margin-top:6px">
          <a href="${mailtoUrl(t,o)}"><button class="small">In Outlook öffnen</button></a>
          <button class="secondary small" data-act="copy">Text kopieren</button>
        </div>
      `;
      box.querySelector('[data-act=copy]').onclick = ()=>{
        navigator.clipboard.writeText(`An: ${o.email}\nBetreff: ${subject}\n\n${body}`).then(()=>flash(box,'Text kopiert'));
      };
      card.appendChild(box);
    });

    const actions = document.createElement('div'); actions.className='actions'; actions.style.marginTop='8px';
    actions.innerHTML = `<button class="secondary small" data-act="kmz">KMZ herunterladen</button>`;
    actions.querySelector('[data-act=kmz]').onclick = downloadKMZ;
    card.appendChild(actions);

    root.appendChild(card);
  });
}

function toast(text){
  const t = document.createElement('div');
  t.textContent = text;
  t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ok);color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;z-index:9999';
  document.body.appendChild(t); setTimeout(()=>t.remove(), 1800);
}
function flash(el, text){
  const old = el.style.outline; el.style.outline='2px solid var(--ok)';
  setTimeout(()=>el.style.outline=old, 800);
  toast(text);
}

document.getElementById('btn-generate-all').onclick = renderRequests;
document.getElementById('btn-open-all').onclick = ()=>{
  const activeProject = getActiveProject();
  if(!activeProject || !activeProject.features.length){ alert('Bitte erst Bereich definieren.'); return; }
  const pairs = [];
  types.forEach(t => t.offices.forEach(o => { if(o.email) pairs.push([t,o]); }));
  if(!pairs.length){ alert('Keine Büros mit E-Mail-Adresse hinterlegt.'); return; }
  if(!confirm(`${pairs.length} Mailto-Links nacheinander öffnen?`)) return;
  pairs.forEach(([t,o],i)=>{
    setTimeout(()=>{ window.location.href = mailtoUrl(t,o); }, i*600);
  });
};
