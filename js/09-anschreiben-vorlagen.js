// Eigentümer-Anschreiben (Serienbrief) und Vertragsvorlagen (.docx)
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Eigentümer-Anschreiben (Serienbrief)
// ─────────────────────────────────────────────────────────────────────────────
// Bindeglied zwischen Flurstücksliste und Flächensicherung: Phase 4 verlangt „Eigentümer
// kontaktieren und Projekt vorstellen" — dafür braucht es je Eigentümer einen Brief, der
// genau dessen Flurstücke benennt. Empfänger, Anschrift und Flurstücksaufstellung werden
// deshalb nicht erneut erfasst, sondern aus der Flurstücksliste abgeleitet. Der Versand
// schreibt zurück in die Sicherungstabelle (Vertragsstatus „Eigentümer kontaktiert"),
// sodass der Prozess-Schritt p4-kontakt automatisch mitzieht.
// ═════════════════════════════════════════════════════════════════════════════
const LS_ANSCHREIBEN = 'pa_anschreiben_vorlagen_v1';

const ANSCHREIBEN_STANDARD = [
  { id:'erst-pacht', name:'Erstanschreiben — Pacht', text:
`{{absender_briefkopf}}

{{adressblock}}

{{absender_ort}}, den {{datum}}

Photovoltaik-Freiflächenanlage in {{gemeinde}} — Anfrage zur Verpachtung Ihrer Flächen

{{anrede}}

wir planen in der Gemarkung {{gemarkung}} die Errichtung einer Photovoltaik-Freiflächenanlage.
Nach den uns vorliegenden Katasterunterlagen sind Sie Eigentümer der folgenden Flurstücke,
die innerhalb des von uns betrachteten Bereichs liegen:

{{flurstuecke}}

Gesamtfläche laut Kataster: {{flaeche_ha}} ha ({{flaeche_qm}} m²)

Gerne möchten wir Ihnen unser Vorhaben persönlich vorstellen und mit Ihnen über eine
langfristige Verpachtung Ihrer Flächen sprechen. Für Sie bedeutet das eine über die gesamte
Laufzeit planbare, vom Ertrag der Landwirtschaft unabhängige Pachteinnahme. Die Flächen
bleiben in Ihrem Eigentum und werden nach Ende der Laufzeit vollständig zurückgebaut.

Sämtliche Kosten der Planung und Genehmigung übernehmen wir. Für Sie entsteht kein Risiko:
Kommt das Projekt nicht zustande, wird der Vertrag über die vereinbarte Rücktrittsfrist
aufgelöst.

Wir würden uns freuen, wenn Sie sich unter den unten genannten Kontaktdaten bei uns melden.
Gerne rufen wir Sie auch zurück oder besuchen Sie vor Ort.

{{grussformel}}

{{absender_name}}
{{absender_firma}}
{{absender_kontakt}}` },

  { id:'erst-kauf', name:'Erstanschreiben — Kauf', text:
`{{absender_briefkopf}}

{{adressblock}}

{{absender_ort}}, den {{datum}}

Ankaufinteresse an Ihren Flurstücken in {{gemarkung}}

{{anrede}}

im Rahmen der Entwicklung einer Photovoltaik-Freiflächenanlage in {{gemeinde}} sind wir an
einem Erwerb der folgenden, in Ihrem Eigentum stehenden Flurstücke interessiert:

{{flurstuecke}}

Gesamtfläche laut Kataster: {{flaeche_ha}} ha ({{flaeche_qm}} m²)

Wir unterbreiten Ihnen gerne ein konkretes, marktgerechtes Angebot. Sämtliche Neben- und
Notarkosten übernehmen wir. Selbstverständlich ist auch eine Verpachtung statt eines
Verkaufs möglich, falls Sie die Flächen im Eigentum behalten möchten.

Für ein Gespräch stehen wir Ihnen jederzeit zur Verfügung.

{{grussformel}}

{{absender_name}}
{{absender_firma}}
{{absender_kontakt}}` },

  { id:'nachfass', name:'Nachfassschreiben', text:
`{{absender_briefkopf}}

{{adressblock}}

{{absender_ort}}, den {{datum}}

Unser Schreiben vom {{angeschrieben_am}} — Photovoltaik-Projekt {{gemeinde}}

{{anrede}}

vor einiger Zeit hatten wir Ihnen unser Vorhaben einer Photovoltaik-Freiflächenanlage in
{{gemarkung}} vorgestellt und Sie zu Ihren Flurstücken

{{flurstuecke_kurz}}

angeschrieben. Eine Rückmeldung liegt uns bislang nicht vor.

Da die Planung inzwischen fortgeschritten ist, würden wir Ihre Flächen gerne weiterhin
berücksichtigen. Für Rückfragen jeder Art — auch wenn Sie kein Interesse haben — sind wir
Ihnen für eine kurze Nachricht dankbar.

{{grussformel}}

{{absender_name}}
{{absender_firma}}
{{absender_kontakt}}` },

  { id:'termin', name:'Terminvorschlag Ortstermin', text:
`{{absender_briefkopf}}

{{adressblock}}

{{absender_ort}}, den {{datum}}

Terminvorschlag: Ortstermin zu Ihren Flurstücken in {{gemarkung}}

{{anrede}}

vielen Dank für Ihr Interesse an unserem Photovoltaik-Vorhaben in {{gemeinde}}.

Zur Abstimmung der Einzelheiten zu Ihren Flurstücken

{{flurstuecke_kurz}}

schlagen wir einen gemeinsamen Termin vor Ort vor. Dabei können wir den geplanten
Anlagenumfang, die Zuwegung sowie die konditionellen Eckpunkte in Ruhe besprechen.

Bitte teilen Sie uns mit, welcher Termin Ihnen passt — wir richten uns nach Ihnen.

{{grussformel}}

{{absender_name}}
{{absender_firma}}
{{absender_kontakt}}` },
];

const ANSCHREIBEN_PLATZHALTER = [
  ['{{anrede}}','Sehr geehrter Herr … (aus Anrede + Name)'],
  ['{{name}}','Name des Eigentümers'],
  ['{{adressblock}}','Name, Straße, PLZ Ort (Anschriftenfeld)'],
  ['{{strasse}} {{plz}} {{ort}}','Adressteile einzeln'],
  ['{{flurstuecke}}','Aufstellung der Flurstücke dieses Eigentümers (je Zeile)'],
  ['{{flurstuecke_kurz}}','dieselben Flurstücke in einer Zeile'],
  ['{{anzahl_flurstuecke}}','Anzahl'],
  ['{{flaeche_qm}} {{flaeche_ha}}','Summe der amtlichen Flächen'],
  ['{{pachtflaeche_qm}}','Summe der eingetragenen Pachtflächen'],
  ['{{gemarkung}} {{gemeinde}} {{landkreis}} {{bundesland}}','Lage laut Kataster'],
  ['{{projekt}} {{projekt_id}}','Projektbezeichnung / -nummer'],
  ['{{datum}}','heutiges Datum'],
  ['{{angeschrieben_am}}','Datum des letzten Anschreibens an diesen Eigentümer'],
  ['{{absender_briefkopf}} {{absender_name}} {{absender_firma}} {{absender_ort}} {{absender_kontakt}} {{grussformel}}','aus den Absender-Einstellungen'],
];

let anschreibenVorlagen = loadOr(LS_ANSCHREIBEN, []);
let anschrVorlageId = null;
let anschrAuswahl = {};   // ownerId -> bool, bewusst nur für die laufende Sitzung

function saveAnschreibenVorlagen(){ save(LS_ANSCHREIBEN, anschreibenVorlagen); }
// Standardvorlagen sind Code, eigene Vorlagen liegen im Speicher — beide erscheinen in
// derselben Liste; eine bearbeitete Standardvorlage wird als Kopie mit gleicher id abgelegt
// und überlagert dann das eingebaute Original.
function anschreibenAlleVorlagen(){
  const eigene = anschreibenVorlagen;
  const std = ANSCHREIBEN_STANDARD.filter(v => !eigene.some(e => e.id===v.id));
  return [...std, ...eigene];
}
function anschrVorlage(){
  const all = anschreibenAlleVorlagen();
  return all.find(v => v.id===anschrVorlageId) || all[0] || null;
}

// Empfänger = Eigentümer mit mindestens einem zugeordneten Flurstück in diesem Projekt.
function anschreibenEmpfaenger(p){
  const list = ensureFlurstueckIds(p);
  return p.eigentuemer.map(o => {
    const fs = list.filter(f => (p.flurstueckDaten[f.id]||{}).eigentuemerId === o.id);
    if(!fs.length) return null;
    const flaeche = fs.reduce((s,f) => s + (Number(f.flaeche)||0), 0);
    const pacht   = fs.reduce((s,f) => s + (Number((p.flurstueckDaten[f.id]||{}).pachtflaeche)||0), 0);
    const extras  = fs.map(f => p.flurstueckDaten[f.id]||{});
    const anschreibenAm = extras.map(x => x.anschreibenAm).filter(Boolean).sort().pop() || null;
    return { owner:o, fs, extras, flaeche, pacht, anschreibenAm,
             status: extras.map(x => x.vertragsStatus).find(v => v && v!=='offen') || 'offen' };
  }).filter(Boolean);
}

const flstBezeichnung = f => `Gemarkung ${f.gemarkung||'—'}, Flur ${f.flur||'—'}, Flurstück ${f.zaehler??'—'}${f.nenner?'/'+f.nenner:''}`;

function anrede(owner){
  const nachname = (owner.name||'').trim().split(/\s+/).pop() || '';
  switch(owner.anrede){
    case 'Herr':      return `Sehr geehrter Herr ${nachname},`;
    case 'Frau':      return `Sehr geehrte Frau ${nachname},`;
    case 'Eheleute':  return `Sehr geehrte Eheleute ${nachname},`;
    default:          return 'Sehr geehrte Damen und Herren,';
  }
}

function anschreibenPlatzhalterWerte(p, rec){
  const o = rec.owner;
  const senderOrt = sender.ort || (p.lage && p.lage.gemeinden && p.lage.gemeinden[0]) || '';
  const briefkopf = [sender.company, sender.name, sender.strasse,
                     [sender.plz, sender.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const kontakt = [sender.phone ? 'Tel.: '+sender.phone : '', sender.email ? 'E-Mail: '+sender.email : '']
                    .filter(Boolean).join('   ');
  const L = p.lage || {};
  return {
    anrede: anrede(o),
    name: o.name || '',
    strasse: o.strasse || '',
    plz: o.plz || '',
    ort: o.ort || '',
    adressblock: [o.name, o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
    flurstuecke: rec.fs.map(f => {
      const flaeche = f.flaeche != null ? `${Number(f.flaeche).toLocaleString('de-DE')} m²` : 'Fläche unbekannt';
      return `  • ${flstBezeichnung(f)} — ${flaeche}`;
    }).join('\n'),
    flurstuecke_kurz: rec.fs.map(f => `Flur ${f.flur||'—'} / Flst. ${f.zaehler??'—'}${f.nenner?'/'+f.nenner:''}`).join(', '),
    anzahl_flurstuecke: String(rec.fs.length),
    flaeche_qm: Math.round(rec.flaeche).toLocaleString('de-DE'),
    flaeche_ha: (rec.flaeche/10000).toLocaleString('de-DE',{minimumFractionDigits:2, maximumFractionDigits:2}),
    pachtflaeche_qm: Math.round(rec.pacht).toLocaleString('de-DE'),
    gemarkung: uniqueSorted(rec.fs.map(f=>f.gemarkung)).join(', ') || (L.gemarkungen||[]).join(', '),
    gemeinde: uniqueSorted(rec.fs.map(f=>f.gemeinde)).join(', ') || (L.gemeinden||[]).join(', '),
    landkreis: (L.kreise||[]).join(', '),
    bundesland: L.land || '',
    projekt: p.name || '',
    projekt_id: p.prozess.projektnummer || p.id || '',
    datum: new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}),
    angeschrieben_am: rec.anschreibenAm ? fmtDate(rec.anschreibenAm) : '—',
    absender_briefkopf: briefkopf,
    absender_name: sender.name || '',
    absender_firma: sender.company || '',
    absender_ort: senderOrt,
    absender_kontakt: kontakt,
    grussformel: sender.signature || 'Mit freundlichen Grüßen',
  };
}

function renderAnschreibenText(p, rec, vorlagenText){
  const werte = anschreibenPlatzhalterWerte(p, rec);
  // Unbekannte Platzhalter bleiben sichtbar stehen, damit ein Tippfehler in der Vorlage
  // auffällt statt still eine Lücke im fertigen Brief zu hinterlassen.
  return String(vorlagenText||'').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (m, key) => Object.prototype.hasOwnProperty.call(werte, key) ? werte[key] : m);
}

function anschrGewaehlt(p){
  return anschreibenEmpfaenger(p).filter(r => anschrAuswahl[r.owner.id]);
}

function renderAnschreibenTab(){
  const p = getActiveProject();
  const wrap = document.getElementById('anschreiben-table-wrap');
  const empty = document.getElementById('anschreiben-empty');
  if(!wrap || !empty) return;

  // Vorlagenauswahl
  const sel = document.getElementById('anschr-vorlage');
  const all = anschreibenAlleVorlagen();
  if(!all.some(v => v.id===anschrVorlageId)) anschrVorlageId = all.length ? all[0].id : null;
  sel.innerHTML = all.map(v => `<option value="${escapeAttr(v.id)}"${v.id===anschrVorlageId?' selected':''}>${escapeHtml(v.name)}</option>`).join('');
  const vorlage = anschrVorlage();
  document.getElementById('anschr-text').value = vorlage ? vorlage.text : '';
  document.getElementById('anschr-platzhalter').innerHTML =
    ANSCHREIBEN_PLATZHALTER.map(([tag,desc]) =>
      `<code>${escapeHtml(tag)}</code>${infoBtn(desc)}`).join(' &nbsp; ');
  setFoldStatus('anschr-platzhalter-anzahl'.replace('-anzahl',''), '');
  const anz = document.getElementById('anschr-platzhalter-anzahl');
  if(anz) anz.textContent = ANSCHREIBEN_PLATZHALTER.length + ' Gruppen';

  document.getElementById('anschreiben-preview').innerHTML = '';
  const alle = p ? anschreibenEmpfaenger(p) : [];
  const nurOffen = document.getElementById('anschr-nur-offen').checked;
  const rows = nurOffen ? alle.filter(r => !r.anschreibenAm) : alle;
  document.getElementById('anschr-aktionen').style.display = rows.length ? '' : 'none';
  if(!rows.length){
    wrap.innerHTML = '';
    empty.textContent = alle.length
      ? 'Alle Eigentümer wurden bereits angeschrieben — Filter abwählen, um sie erneut anzuzeigen.'
      : 'Noch keine Eigentümer mit zugeordneten Flurstücken – im Reiter „Flurstücke" Eigentümer zuordnen oder eine ALB-Liste importieren.';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  wrap.innerHTML = `<table class="gs-table">
    <tr><th style="width:32px"></th><th>Eigentümer</th><th>Anschrift</th><th>Flurstücke</th><th class="num">Fläche</th><th>Angeschrieben</th><th>Status</th><th></th></tr>
    ${rows.map(r => {
      const o = r.owner;
      const fehlt = !impTxt(o.strasse) || !impTxt(o.ort);
      return `<tr>
        <td><input type="checkbox" data-oid="${escapeAttr(o.id)}" ${anschrAuswahl[o.id]?'checked':''} style="width:auto;margin:0" /></td>
        <td><strong>${escapeHtml(o.name||'(unbenannt)')}</strong><span class="sub">${escapeHtml(o.anrede||'ohne Anrede')}</span></td>
        <td>${fehlt
              ? '<span class="pill warn" title="Ohne vollständige Anschrift kann kein Brief erzeugt werden">Anschrift unvollständig</span>'
              : escapeHtml(`${o.strasse}, ${o.plz} ${o.ort}`)}</td>
        <td>${r.fs.length}<span class="sub">${escapeHtml(r.fs.map(f=>`${f.flur||'—'}/${f.zaehler??'—'}${f.nenner?'-'+f.nenner:''}`).join(', ').slice(0,60))}</span></td>
        <td class="num">${(r.flaeche/10000).toLocaleString('de-DE',{maximumFractionDigits:2})} ha</td>
        <td>${r.anschreibenAm ? fmtDate(r.anschreibenAm) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${escapeHtml(r.status)}</td>
        <td><div class="gs-row-actions">
          <button class="secondary small" data-act="preview" data-oid="${escapeAttr(o.id)}">Vorschau</button>
          ${impTxt(o.email) ? `<button class="secondary small" data-act="mail" data-oid="${escapeAttr(o.id)}" title="Als E-Mail an ${escapeAttr(o.email)}">E-Mail</button>` : ''}
        </div></td>
      </tr>`;
    }).join('')}
  </table>`;

  wrap.querySelectorAll('input[type=checkbox][data-oid]').forEach(cb => {
    cb.addEventListener('change', () => { anschrAuswahl[cb.dataset.oid] = cb.checked; });
  });
  wrap.querySelectorAll('[data-act=preview]').forEach(b => {
    b.addEventListener('click', () => anschreibenVorschau(b.dataset.oid));
  });
  wrap.querySelectorAll('[data-act=mail]').forEach(b => {
    b.addEventListener('click', () => {
      const rec = anschreibenEmpfaenger(p).find(r => r.owner.id===b.dataset.oid); if(!rec) return;
      const text = renderAnschreibenText(p, rec, document.getElementById('anschr-text').value);
      // Betreffzeile = erste nicht-leere Zeile nach dem Datumsblock, sonst Projektname
      const zeilen = text.split('\n').map(z=>z.trim());
      const betreff = zeilen.find(z => z && !z.includes('den ') && z.length > 15 && !z.startsWith('•')) || `Projekt ${p.name||''}`;
      window.location.href = `mailto:${encodeURIComponent(rec.owner.email)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
    });
  });
}

function anschreibenVorschau(ownerId){
  const p = getActiveProject(); if(!p) return;
  const rec = anschreibenEmpfaenger(p).find(r => r.owner.id===ownerId); if(!rec) return;
  const text = renderAnschreibenText(p, rec, document.getElementById('anschr-text').value);
  const root = document.getElementById('anschreiben-preview');
  root.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'info';
  card.style.marginTop = '16px';
  card.innerHTML = `
    <div class="card-head">
      <strong>Vorschau — ${escapeHtml(rec.owner.name||'(unbenannt)')}</strong>
      <div class="btn-row" style="margin:0">
        <button class="secondary small" data-act="copy">Text kopieren</button>
        <button class="small" data-act="docx">Als Word-Datei (.docx)</button>
      </div>
    </div>
    <textarea readonly rows="22" style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px">${escapeHtml(text)}</textarea>`;
  card.querySelector('[data-act=copy]').onclick = () =>
    navigator.clipboard.writeText(text).then(() => toast('Anschreiben kopiert'));
  card.querySelector('[data-act=docx]').onclick = async () => {
    downloadBlob(await buildDocxBlob(text), `Anschreiben_${fsSafeName(p.name||'Projekt')}_${fsSafeName(rec.owner.name||'Eigentuemer')}.docx`);
  };
  root.appendChild(card);
  card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// Serienbrief: ein Dokument, ein Brief je Seite — so wie es zum Drucken und Kuvertieren
// gebraucht wird. Einzeldateien gibt es als Alternative für digitale Ablage je Eigentümer.
async function anschreibenExport(einzeln){
  const p = getActiveProject(); if(!p) return;
  const gewaehlt = anschrGewaehlt(p);
  if(!gewaehlt.length){ alert('Bitte zuerst mindestens einen Empfänger auswählen.'); return; }
  const vorlagenText = document.getElementById('anschr-text').value;
  const unvollstaendig = gewaehlt.filter(r => !impTxt(r.owner.strasse) || !impTxt(r.owner.ort));
  if(unvollstaendig.length && !confirm(
      `${unvollstaendig.length} ausgewählte(r) Empfänger ohne vollständige Anschrift:\n`
      + unvollstaendig.map(r => '  • '+(r.owner.name||'(unbenannt)')).join('\n')
      + `\n\nTrotzdem erzeugen?`)) return;
  try {
    if(einzeln){
      for(const rec of gewaehlt){
        const text = renderAnschreibenText(p, rec, vorlagenText);
        downloadBlob(await buildDocxBlob(text),
          `Anschreiben_${fsSafeName(p.name||'Projekt')}_${fsSafeName(rec.owner.name||'Eigentuemer')}.docx`);
      }
    } else {
      const text = gewaehlt.map(rec => renderAnschreibenText(p, rec, vorlagenText)).join('\n\f\n');
      downloadBlob(await buildDocxBlob(text),
        `Serienbrief_${fsSafeName(p.name||'Projekt')}_${fsStamp().slice(0,10)}.docx`);
    }
    logAction(p, `Eigentümer-Anschreiben erzeugt (${gewaehlt.length} Empfänger)`);
  } catch(err){
    alert('Erzeugung fehlgeschlagen: ' + err.message);
  }
}

// Rückschreibung in die Fachdaten: das ist der Punkt, an dem aus einem Brief ein
// Prozessfortschritt wird (Schritt p4-kontakt leitet seinen Status hieraus ab).
function anschreibenMarkieren(){
  const p = getActiveProject(); if(!p) return;
  const gewaehlt = anschrGewaehlt(p);
  if(!gewaehlt.length){ alert('Bitte zuerst mindestens einen Empfänger auswählen.'); return; }
  const heute = new Date().toISOString().slice(0,10);
  if(!confirm(`${gewaehlt.length} Eigentümer als am ${fmtDate(heute)} angeschrieben markieren?\n\n`
    + `Bei allen zugehörigen Flurstücken wird der Vertragsstatus „offen" auf „Eigentümer kontaktiert" gesetzt.`)) return;
  let flurstuecke = 0;
  gewaehlt.forEach(rec => {
    rec.fs.forEach(f => {
      const ex = getFlurstueckExtra(p, f.id);
      ex.anschreibenAm = heute;
      if(!ex.vertragsStatus || ex.vertragsStatus==='offen') ex.vertragsStatus = 'Eigentümer kontaktiert';
      flurstuecke++;
    });
    p.kommunikation.push({ id:'k'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      datum: heute, kanal:'Brief', kontakt: rec.owner.name || '(unbenannt)',
      notiz: `Erstanschreiben zu ${rec.fs.length} Flurstück(en) versendet` });
  });
  touchActiveProject(); saveProjects();
  logAction(p, `${gewaehlt.length} Eigentümer als angeschrieben markiert (${flurstuecke} Flurstücke)`);
  renderAnschreibenTab(); renderSicherungTable();
  if(typeof renderKommLog==='function') renderKommLog();
  if(typeof renderProzessTasks==='function') renderProzessTasks();
  toast(`${gewaehlt.length} Eigentümer als angeschrieben markiert`);
}

document.getElementById('anschr-vorlage').addEventListener('change', e => {
  anschrVorlageId = e.target.value; renderAnschreibenTab();
});
document.getElementById('anschr-nur-offen').addEventListener('change', renderAnschreibenTab);
document.getElementById('btn-anschr-alle').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  anschreibenEmpfaenger(p).forEach(r => { anschrAuswahl[r.owner.id] = true; });
  renderAnschreibenTab();
});
document.getElementById('btn-anschr-keine').addEventListener('click', () => {
  anschrAuswahl = {}; renderAnschreibenTab();
});
document.getElementById('btn-anschr-neu').addEventListener('click', () => {
  const name = prompt('Name der neuen Vorlage:', 'Eigene Vorlage');
  if(!name) return;
  const v = { id:'av'+Date.now().toString(36), name, text: document.getElementById('anschr-text').value };
  anschreibenVorlagen.push(v); saveAnschreibenVorlagen();
  anschrVorlageId = v.id; renderAnschreibenTab();
});
document.getElementById('btn-anschr-speichern').addEventListener('click', () => {
  const v = anschrVorlage(); if(!v) return;
  const text = document.getElementById('anschr-text').value;
  const eigen = anschreibenVorlagen.find(x => x.id===v.id);
  if(eigen) eigen.text = text;
  else anschreibenVorlagen.push({ id:v.id, name:v.name, text }); // Standardvorlage überlagern
  saveAnschreibenVorlagen();
  toast('Vorlage gespeichert');
});
document.getElementById('btn-anschr-reset').addEventListener('click', () => {
  const v = anschrVorlage(); if(!v) return;
  const istStandard = ANSCHREIBEN_STANDARD.some(x => x.id===v.id);
  if(!confirm(istStandard ? `Vorlage „${v.name}" auf den Standardtext zurücksetzen?`
                          : `Vorlage „${v.name}" löschen?`)) return;
  anschreibenVorlagen = anschreibenVorlagen.filter(x => x.id!==v.id);
  saveAnschreibenVorlagen();
  if(!istStandard) anschrVorlageId = null;
  renderAnschreibenTab();
});
document.getElementById('btn-anschr-serienbrief').addEventListener('click', () => anschreibenExport(false));
document.getElementById('btn-anschr-einzeln').addEventListener('click', () => anschreibenExport(true));
document.getElementById('btn-anschr-markieren').addEventListener('click', anschreibenMarkieren);

// ═════════════════════════════════════════════════════════════════════════════
// Vertragsvorlagen: Word-Muster (.docx) mit {{Feld}}-Platzhaltern (Serienbrief-Prinzip).
// Der Entwickler markiert Einsatzfelder direkt im Word-Text (z.B. {{Laufzeit}}); das Tool
// liest sie beim Hochladen aus (docxtemplater) und bietet sie je Vertrag als Eingabemaske an
// (Reiter Grundstück → Eigentümer), ohne dass wieder in Word gesprungen werden muss.
// ═════════════════════════════════════════════════════════════════════════════
const VORLAGE_TAG_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

function dataUrlToUint8Array(dataUrl){
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Erzeugt eine docxtemplater-Instanz aus dem Inhalt einer Vorlage (Uint8Array, siehe vorlageBytes).
function loadDocxtemplater(bytes){
  const zip = new PizZip(bytes);
  return new window.docxtemplater(zip, { paragraphLoop:true, linebreaks:true, delimiters:{ start:'{{', end:'}}' } });
}

// Liest alle {{Feld}}-Platzhalter aus einem hochgeladenen .docx aus (auch wenn eine
// Formatierung mitten im Platzhalter sitzt — docxtemplater führt die Textläufe beim
// Kompilieren zusammen, getFullText() liefert daher den bereits gemergten Text).
function extractVorlagenFelder(bytes){
  const doc = loadDocxtemplater(bytes);
  const text = doc.getFullText();
  const keys = [];
  let m;
  VORLAGE_TAG_RE.lastIndex = 0;
  while((m = VORLAGE_TAG_RE.exec(text))){
    const key = m[1].trim();
    if(key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

// ---- Vertragsvorlagen in Supabase ----
// Mit Login: .docx im Storage-Bucket „dokumente" unter vorlagen/…, Metadaten in der Tabelle
// contract_templates (supabase/schema.sql) — damit sind die Vorlagen für das ganze Team und
// auf jedem Rechner da. Ohne Supabase wie bisher als dataUrl im localStorage.
// vorlagenCloudOk wird erst gesetzt, wenn contract_templates beim Login lesbar war.
let vorlagenCloudOk = false;
const vorlageBytesCache = new Map(); // storagePath → Uint8Array (spart wiederholte Downloads)
async function vorlageBytes(v){
  if(v.dataUrl) return dataUrlToUint8Array(v.dataUrl);
  if(vorlageBytesCache.has(v.storagePath)) return vorlageBytesCache.get(v.storagePath);
  const bytes = new Uint8Array(await (await dateiBlob(v)).arrayBuffer());
  vorlageBytesCache.set(v.storagePath, bytes);
  return bytes;
}
function vorlageZeile(v){
  return { id:v.id, name:v.name, storage_path:v.storagePath, felder:v.felder, added_at:v.addedAt };
}
async function speichereVorlageCloud(v){
  const { error } = await window.sb.from('contract_templates').upsert(vorlageZeile(v));
  if(error) throw error;
}
function loescheVorlageCloud(v){
  if(!window.sb || !v.storagePath) return;
  window.sb.from('contract_templates').delete().eq('id', v.id)
    .then(({ error }) => { if(error) console.error('Vorlage nicht aus contract_templates gelöscht:', v.id, error); });
  window.sb.storage.from(DOKU_BUCKET).remove([v.storagePath])
    .then(({ error }) => { if(error) console.warn('Vorlagen-Datei nicht gelöscht:', v.storagePath, error); });
}
// Nach dem Login: Cloud-Stand übernehmen. Lokale Vorlagen, die es nur als dataUrl gibt
// (noch nie hochgeladen), bleiben erhalten — migriereDateienNachStorage() lädt sie danach hoch.
async function ladeVorlagenAusCloud(){
  const { data, error } = await window.sb.from('contract_templates').select('*');
  if(error){ console.warn('contract_templates nicht lesbar — Vertragsvorlagen bleiben lokal.', error); return; }
  vorlagenCloudOk = true;
  const cloud = data.filter(r => r.storage_path).map(r => ({
    id:r.id, name:r.name || 'Vorlage', dateiName:String(r.storage_path).split('/').pop().replace(/^vt[^-]*-/, ''),
    storagePath:r.storage_path, felder:Array.isArray(r.felder) ? r.felder : [], addedAt:r.added_at,
  }));
  const nurLokal = vertragsvorlagen.filter(v => v.dataUrl && !cloud.some(c => c.id === v.id));
  vertragsvorlagen = [...cloud, ...nurLokal];
  saveVertragsvorlagen(); renderVorlagenList();
}

function renderVorlagenList(){
  const wrap = document.getElementById('vorlagen-list');
  const empty = document.getElementById('vorlagen-empty');
  if(!wrap || !empty) return;
  if(!vertragsvorlagen.length){ wrap.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  wrap.innerHTML = vertragsvorlagen.map(v => `<div class="vorlage-row" data-vid="${escapeAttr(v.id)}">
    <div class="vorlage-main">
      <div class="vorlage-name">${escapeHtml(v.name)}</div>
      <div class="vorlage-felder">${v.felder.length ? v.felder.map(f=>`{{${escapeHtml(f)}}}`).join(' &middot; ') : 'Keine Felder gefunden — Platzhalter im Format {{Feldname}} in Word einfügen.'}</div>
    </div>
    <button type="button" class="secondary small" data-act="vorlage-rename" data-vid="${escapeAttr(v.id)}" title="Umbenennen">✎</button>
    <button type="button" class="danger small" data-act="vorlage-del" data-vid="${escapeAttr(v.id)}" title="Löschen">×</button>
  </div>`).join('');
  wrap.querySelectorAll('[data-act=vorlage-rename]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = vertragsvorlagen.find(x => x.id === btn.dataset.vid); if(!v) return;
      const name = prompt('Name der Vorlage:', v.name);
      if(name === null) return;
      v.name = name.trim() || v.name;
      saveVertragsvorlagen(); renderVorlagenList();
      if(window.sb && vorlagenCloudOk && v.storagePath) speichereVorlageCloud(v)
        .catch(err => console.error('Umbenennen nicht in Supabase gespeichert:', err));
    });
  });
  wrap.querySelectorAll('[data-act=vorlage-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = vertragsvorlagen.find(x => x.id === btn.dataset.vid); if(!v) return;
      if(!confirm(`Vorlage „${v.name}" wirklich löschen?`)) return;
      vertragsvorlagen = vertragsvorlagen.filter(x => x.id !== v.id);
      saveVertragsvorlagen(); renderVorlagenList();
      loescheVorlageCloud(v);
    });
  });
}

document.getElementById('btn-vorlage-upload').onclick = () => {
  document.getElementById('vorlage-upload-input').click();
};
document.getElementById('vorlage-upload-input').addEventListener('change', async function(){
  const file = this.files[0];
  this.value = '';
  if(!file) return;
  let bytes, felder;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    felder = extractVorlagenFelder(bytes);
  } catch(err){
    alert('Vorlage konnte nicht gelesen werden (ist es eine gültige .docx-Datei?): ' + err.message);
    return;
  }
  const v = {
    id: 'vt'+Date.now()+Math.random().toString(36).slice(2,7),
    name: file.name.replace(/\.docx$/i,''),
    dateiName: file.name,
    felder, addedAt: new Date().toISOString(),
  };
  try {
    if(window.sb && vorlagenCloudOk){
      v.storagePath = storageVorlagePfad(v.id, file.name);
      await ladeDateiHoch(v.storagePath, file, file.type);
      await speichereVorlageCloud(v);
      vorlageBytesCache.set(v.storagePath, bytes);
    } else {
      v.dataUrl = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file);
      });
    }
  } catch(err){
    alert('Vorlage konnte nicht hochgeladen werden: ' + (err.message || err));
    return;
  }
  vertragsvorlagen.push(v);
  saveVertragsvorlagen(); renderVorlagenList();
  toast(felder.length ? `Vorlage hochgeladen — ${felder.length} Feld(er) gefunden` : 'Vorlage hochgeladen — keine {{Feld}}-Platzhalter gefunden');
});
renderVorlagenList();

// ---------- Vertrag aus Vorlage erzeugen (je Eigentümer, Eingabemaske statt Word) ----------
let vfActiveOwner = null;

function ownerVorlagenDaten(owner, vorlageId){
  if(!owner.vorlagenDaten || typeof owner.vorlagenDaten !== 'object') owner.vorlagenDaten = {};
  if(!owner.vorlagenDaten[vorlageId] || typeof owner.vorlagenDaten[vorlageId] !== 'object') owner.vorlagenDaten[vorlageId] = {};
  return owner.vorlagenDaten[vorlageId];
}

function openVertragFillModal(owner){
  if(!vertragsvorlagen.length){
    alert('Noch keine Vertragsvorlage hochgeladen. Bitte zuerst in der Projektliste unter „Vertragsvorlagen (Word-Muster)" ein .docx-Muster hochladen.');
    return;
  }
  vfActiveOwner = owner;
  document.getElementById('vf-owner-name').textContent = owner.name ? `— ${owner.name}` : '';
  const sel = document.getElementById('vf-vorlage-select');
  sel.innerHTML = vertragsvorlagen.map(v => `<option value="${escapeAttr(v.id)}">${escapeHtml(v.name)}</option>`).join('');
  document.getElementById('view-vertrag-fill').classList.remove('hidden');
  renderVertragFillFields();
}
function closeVertragFillModal(){
  document.getElementById('view-vertrag-fill').classList.add('hidden');
  vfActiveOwner = null;
}
function renderVertragFillFields(){
  const root = document.getElementById('vf-fields');
  const sel = document.getElementById('vf-vorlage-select');
  const vorlage = vertragsvorlagen.find(v => v.id === sel.value);
  if(!vorlage){
    root.innerHTML = '<div class="vt-empty">Keine Vorlage ausgewählt.</div>';
    return;
  }
  if(!vorlage.felder.length){
    root.innerHTML = '<div class="vt-empty">Diese Vorlage enthält keine {{Feld}}-Platzhalter.</div>';
    return;
  }
  const data = ownerVorlagenDaten(vfActiveOwner, vorlage.id);
  root.innerHTML = vorlage.felder.map(f => `<div class="vt-field">
    <label for="vf-f-${escapeAttr(f)}">${escapeHtml(f)}</label>
    <input type="text" id="vf-f-${escapeAttr(f)}" data-feld="${escapeAttr(f)}" value="${escapeAttr(data[f]||'')}" />
  </div>`).join('');
  root.querySelectorAll('[data-feld]').forEach(inp => {
    inp.addEventListener('input', () => {
      const d = ownerVorlagenDaten(vfActiveOwner, vorlage.id);
      d[inp.dataset.feld] = inp.value;
      touchActiveProject(); saveProjects();
    });
  });
}
document.getElementById('vf-vorlage-select').addEventListener('change', renderVertragFillFields);
document.getElementById('vf-close').onclick = closeVertragFillModal;
document.getElementById('vf-generate').onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Erzeuge …';
  try { await generateVertragAusVorlage(); } finally { btn.disabled = false; btn.textContent = old; }
};
document.getElementById('view-vertrag-fill').addEventListener('click', (e) => {
  if(e.target.id === 'view-vertrag-fill') closeVertragFillModal();
});

async function generateVertragAusVorlage(){
  const sel = document.getElementById('vf-vorlage-select');
  const vorlage = vertragsvorlagen.find(v => v.id === sel.value);
  if(!vorlage || !vfActiveOwner) return;
  const data = ownerVorlagenDaten(vfActiveOwner, vorlage.id);
  try {
    const doc = loadDocxtemplater(await vorlageBytes(vorlage));
    doc.render(Object.fromEntries(vorlage.felder.map(f => [f, data[f] || ''])));
    const blob = doc.getZip().generate({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const safeName = (vfActiveOwner.name||'Eigentuemer').replace(/[^a-zA-Z0-9-_]+/g,'_');
    downloadBlob(blob, `${vorlage.name.replace(/[^a-zA-Z0-9-_]+/g,'_')}_${safeName}.docx`);
  } catch(err){
    alert('Vertrag konnte nicht erzeugt werden: ' + (err.properties && err.properties.errors ? err.properties.errors.map(e=>e.message).join(', ') : err.message));
  }
}

document.getElementById('btn-add-eigentuemer').onclick = () => {
  const p = getActiveProject(); if(!p) return;
  p.eigentuemer.push({ id:'e'+Date.now()+Math.random().toString(36).slice(2), anrede:'', name:'', strasse:'', plz:'', ort:'', telefon:'', email:'', notiz:'' });
  touchActiveProject(); saveProjects();
  renderEigentuemerTable();
};
