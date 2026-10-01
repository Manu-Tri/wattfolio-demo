// Grundstück-Unterreiter, Flurstücke, Eigentümer und Pachtvertrag
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ---------- Grundstück-Unterreiter: Karte / Flurstücke / Eigentümer ----------
function switchGrundstueckSubtab(name){ // 'karte' | 'flurstuecke' | 'eigentuemer' | 'anschreiben' | 'sicherung' | 'vertraege'
  document.querySelectorAll('.sub-tab[data-gtab],.detail-subtab[data-gtab]')
    .forEach(t => t.classList.toggle('active', t.dataset.gtab===name));
  ['karte','flurstuecke','eigentuemer','anschreiben','sicherung','vertraege'].forEach(k => {
    document.getElementById('gtab-'+k).classList.toggle('hidden', k!==name);
  });
  document.querySelectorAll('#gtab-'+name+' .gs-grow').forEach(gsGrow);
  if(name==='karte'){ requestAnimationFrame(()=>map.invalidateSize()); renderQualiChecks(); }
  if(name==='flurstuecke') renderFlurstueckeTable();
  if(name==='eigentuemer') renderEigentuemerTable();
  if(name==='anschreiben') renderAnschreibenTab();
  if(name==='sicherung') renderSicherungTable();
  if(name==='vertraege') renderVertraegeTab();
  if(activeProjectId){ tabStateFor(activeProjectId).grundSub = name; persistTabState(); }
}
document.querySelectorAll('.sub-tab[data-gtab],.detail-subtab[data-gtab]').forEach(t => {
  t.addEventListener('click', () => switchGrundstueckSubtab(t.dataset.gtab));
});

// Zusatzdaten (Pachtfläche/Eigentümer) sind an das Flurstückskennzeichen gebunden, nicht an
// den Index im ALKIS-Ergebnis, damit sie eine Neuabfrage von project.lage überstehen.
function getFlurstueckExtra(project, flurstueckId){
  // Defaults per Object.assign, damit auch ältere gespeicherte Einträge die neuen
  // Sicherungs-Felder (AP3) bekommen, ohne dass eine separate Migration nötig ist.
  if(!project.flurstueckDaten) project.flurstueckDaten = {};
  project.flurstueckDaten[flurstueckId] = Object.assign(
    { pachtflaeche:null, eigentuemerId:null,
      // true = Pachtfläche stammt aus der automatischen Polygon-Verschneidung und darf bei
      // einer erneuten Lage-Abfrage nachgeführt werden. Sobald jemand den Wert von Hand
      // ändert oder ihn importiert, steht hier false und der Wert bleibt unangetastet.
      pachtflaecheAuto:false,
      sicherungArt:null, vertragsStatus:'offen', rueckTrittsfrist:null,
      preisProM2:null, reservierungsentgelt:null, ersteZahlungAm:null, notiz:'',
      // aus dem ALB-Import bzw. dem Erstanschreiben an den Eigentümer
      grundbuch:'', anteil:'', anschreibenAm:null },
    project.flurstueckDaten[flurstueckId]||{});
  return project.flurstueckDaten[flurstueckId];
}

// Übernimmt die verschnittene Projektfläche als Pachtfläche in die Flurstücksliste.
// Bewusst nicht bedingungslos: ein von Hand gesetzter oder importierter Wert (z.B. weil nur
// ein Teilstück gepachtet wird oder ein Zuwegungsstreifen dazukommt) hat Vorrang und wird
// beim Neuzeichnen des Polygons nicht überschrieben.
function uebernehmeProjektflaecheAlsPacht(project){
  if(!project.lage || !Array.isArray(project.lage.flurstuecke)) return;
  project.lage.flurstuecke.forEach(f => {
    if(f.projektflaeche == null || f.id == null) return;
    const extra = getFlurstueckExtra(project, f.id);
    if(extra.pachtflaeche == null || extra.pachtflaecheAuto){
      extra.pachtflaeche = f.projektflaeche;
      extra.pachtflaecheAuto = true;
    }
  });
}

function renderFlurstueckeTable(){
  const wrap = document.getElementById('flurstuecke-table-wrap');
  const empty = document.getElementById('flurstuecke-empty');
  if(!wrap || !empty) return; // Tab noch nicht im DOM (z.B. vor dem ersten Projekt-Öffnen)
  const p = getActiveProject();
  const list = p ? ensureFlurstueckIds(p) : [];
  if(!p || !list.length){
    wrap.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const ownerOptions = (selectedId) => '<option value="">—</option>' + p.eigentuemer.map(e =>
    `<option value="${escapeAttr(e.id)}"${selectedId===e.id?' selected':''}>${escapeHtml(e.name||'(unbenannt)')}</option>`
  ).join('');
  // Verwaltungsangaben, die in allen Zeilen gleich sind (typisch: ein Bundesland, ein Kreis,
  // oft eine Gemarkung), stehen einmal über der Tabelle statt als Spalte in jeder Zeile.
  const VERW = [['land','Bundesland'],['kreis','Landkreis'],['gemeinde','Gemeinde'],['gemarkung','Gemarkung']];
  const einheitlich = VERW.filter(([k]) => new Set(list.map(f => f[k] || '')).size === 1);
  const variabel = VERW.filter(v => !einheitlich.includes(v));
  const summary = einheitlich.filter(([k]) => list[0][k])
    .map(([k, label]) => `<span>${escapeHtml(label)} <b>${escapeHtml(list[0][k])}</b></span>`).join('')
    + `<span><b>${list.length}</b> Flurstücke</span>`;
  const rows = list.map((f) => {
    const fid = f.id;
    const extra = getFlurstueckExtra(p, fid);
    const fnr = `${f.zaehler ?? ''}${f.nenner?'/'+f.nenner:''}`;
    // Anteil des Flurstücks, der im Projektgebiet liegt — macht auf einen Blick sichtbar,
    // ob ein Flurstück ganz oder nur mit einer Ecke betroffen ist.
    const quote = (f.projektflaeche != null && f.flaeche)
      ? f.projektflaeche / Number(f.flaeche) * 100 : null;
    // „0 %" wäre bei einem angeschnittenen Zipfel irreführend (dort liegt ja Fläche) —
    // deshalb "<1 %", sobald überhaupt etwas betroffen ist.
    const anteilTxt = quote == null ? null
      : (quote > 0 && quote < 1) ? '&lt;1 %' : `${Math.round(quote)} %`;
    const projektZelle = f.projektflaeche != null
      ? `${Number(f.projektflaeche).toLocaleString('de-DE')} m²`
        + (anteilTxt ? `<span class="sub">${anteilTxt}</span>` : '')
      : '—';
    return `<tr>
      ${variabel.map(([k]) => `<td>${escapeHtml(f[k]||'—')}</td>`).join('')}
      <td>${escapeHtml(f.flur||'—')}</td>
      <td><span class="strong">${escapeHtml(fnr || '—')}</span></td>
      <td class="num">${f.flaeche!=null ? Number(f.flaeche).toLocaleString('de-DE')+' m²' : '—'}</td>
      <td class="num">${projektZelle}</td>
      <td><input type="number" data-fid="${fid}" data-k="pachtflaeche" value="${extra.pachtflaeche ?? ''}" placeholder="m²" aria-label="Pachtfläche in m²" /></td>
      <td><select data-fid="${fid}" data-k="eigentuemerId" aria-label="Eigentümer">${ownerOptions(extra.eigentuemerId)}</select></td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<div class="gs-table-summary">${summary}</div>
  <table class="gs-table">
    <colgroup>${variabel.map(() => '<col>').join('')}<col style="width:6rem"><col style="width:7rem"><col style="width:8rem"><col style="width:8rem"><col style="width:8rem"><col></colgroup>
    <tr>${variabel.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th>Flur</th><th>Flurstück</th><th class="num">amtl. Fläche</th><th class="num">im Projekt${infoBtn(
      'Aus dem gezeichneten Projektpolygon berechnet: die Fläche des Flurstücks, die tatsächlich im Projektgebiet liegt (Verschneidung), mit ihrem Anteil an der amtlichen Fläche. Dieser Wert wird automatisch als <b>Pachtfläche</b> übernommen — bis du ihn dort von Hand änderst; danach bleibt dein Wert auch bei einer erneuten Lage-Abfrage stehen.')}</th><th>Pachtfläche</th><th>Eigentümer</th></tr>
    ${rows}
  </table>`;
  wrap.querySelectorAll('[data-fid]').forEach(inp => {
    const ev = inp.tagName==='SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const extra = getFlurstueckExtra(p, inp.dataset.fid);
      if(inp.dataset.k==='pachtflaeche'){
        extra.pachtflaeche = inp.value===''?null:Number(inp.value);
        // Ab jetzt ist der Wert von Hand gesetzt und wird nicht mehr automatisch nachgeführt.
        extra.pachtflaecheAuto = false;
      }
      else extra.eigentuemerId = inp.value || null;
      touchActiveProject(); saveProjects();
    });
  });
}

// ---------- Eigentümer (projektbezogen, Vorbereitung für Pachtvertrags-Erzeugung) ----------
function renderEigentuemerTable(){
  const wrap = document.getElementById('eigentuemer-table-wrap');
  const empty = document.getElementById('eigentuemer-empty');
  if(!wrap || !empty) return;
  const previewRoot = document.getElementById('pachtvertrag-preview');
  if(previewRoot) previewRoot.innerHTML = ''; // vermeidet veraltete Vertragsvorschau nach Datenänderung
  const p = getActiveProject();
  if(!p || !p.eigentuemer.length){
    wrap.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  const anredeOptions = sel => ['','Herr','Frau','Eheleute','Firma']
    .map(a => `<option value="${escapeAttr(a)}"${a===(sel||'')?' selected':''}>${escapeHtml(a||'—')}</option>`).join('');
  // Zugeordnete Flurstücke je Eigentümer — Kontext für Anschreiben und Vertrag
  const flstJeEig = {};
  Object.values(p.flurstueckDaten || {}).forEach(x => { if(x.eigentuemerId) flstJeEig[x.eigentuemerId] = (flstJeEig[x.eigentuemerId] || 0) + 1; });
  const rows = p.eigentuemer.map((e,i) => `<tr>
    <td><div class="gs-stack">
      <select data-i="${i}" data-k="anrede" aria-label="Anrede">${anredeOptions(e.anrede)}</select>
      <textarea class="gs-grow" rows="1" data-i="${i}" data-k="name" placeholder="Name" aria-label="Name">${escapeHtml(e.name)}</textarea>
      <span class="sub">${flstJeEig[e.id] ? `${flstJeEig[e.id]} Flurstück(e)` : 'keine Flurstücke zugeordnet'}</span>
    </div></td>
    <td><div class="gs-stack">
      <input type="text" data-i="${i}" data-k="strasse" value="${escapeAttr(e.strasse)}" placeholder="Straße und Nr." aria-label="Straße" />
      <div class="gs-inline">
        <input type="text" data-i="${i}" data-k="plz" value="${escapeAttr(e.plz)}" placeholder="PLZ" aria-label="PLZ" style="flex:0 0 5.5rem" />
        <input type="text" data-i="${i}" data-k="ort" value="${escapeAttr(e.ort)}" placeholder="Ort" aria-label="Ort" style="flex:1" />
      </div>
    </div></td>
    <td><div class="gs-stack">
      <input type="text" data-i="${i}" data-k="telefon" value="${escapeAttr(e.telefon)}" placeholder="Telefon" aria-label="Telefon" />
      <input type="email" data-i="${i}" data-k="email" value="${escapeAttr(e.email)}" placeholder="E-Mail" aria-label="E-Mail" />
    </div></td>
    <td><textarea class="gs-grow" rows="1" data-i="${i}" data-k="notiz" placeholder="Notiz" aria-label="Notiz">${escapeHtml(e.notiz)}</textarea></td>
    <td><div class="gs-row-actions">
      <button class="secondary small" data-act="vertrag" data-i="${i}">Pachtvertrag</button>
      <button class="secondary small" data-act="vorlage" data-i="${i}" title="Vertrag aus hochgeladener Word-Vorlage erzeugen">Aus Vorlage</button>
      <button class="danger small" data-act="del" data-i="${i}" title="Eigentümer entfernen">Entfernen</button>
    </div></td>
  </tr>`).join('');
  wrap.innerHTML = `<table class="gs-table">
    <colgroup><col style="width:27%"><col style="width:24%"><col style="width:20%"><col><col style="width:8.5rem"></colgroup>
    <tr><th>Name</th><th>Anschrift</th><th>Kontakt</th><th>Notiz</th><th></th></tr>
    ${rows}
  </table>`;
  wrap.querySelectorAll('.gs-grow').forEach(gsGrow);
  wrap.querySelectorAll('input[data-i],select[data-i],textarea[data-i]').forEach(inp => {
    inp.addEventListener(inp.tagName==='SELECT' ? 'change' : 'input', () => {
      if(inp.tagName==='TEXTAREA'){ inp.value = inp.value.replace(/[\r\n]+/g, ' '); gsGrow(inp); }
      p.eigentuemer[Number(inp.dataset.i)][inp.dataset.k] = inp.value;
      touchActiveProject(); saveProjects();
      if(inp.dataset.k==='name') renderFlurstueckeTable(); // Auswahl-Label im Flurstücke-Reiter aktuell halten
    });
  });
  wrap.querySelectorAll('[data-act=vertrag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const owner = p.eigentuemer[Number(btn.dataset.i)];
      renderPachtvertragPreview(p, owner);
    });
  });
  wrap.querySelectorAll('[data-act=vorlage]').forEach(btn => {
    btn.addEventListener('click', () => {
      const owner = p.eigentuemer[Number(btn.dataset.i)];
      openVertragFillModal(owner);
    });
  });
  wrap.querySelectorAll('[data-act=del]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(!confirm('Diesen Eigentümer entfernen?')) return;
      p.eigentuemer.splice(Number(btn.dataset.i), 1);
      touchActiveProject(); saveProjects();
      renderEigentuemerTable();
      renderFlurstueckeTable();
    });
  });
}

// ---------- Pachtvertrag-Generierung (Muster, projektbezogen je Eigentümer) ----------
// Ein Eigentümer kann mehrere Flurstücke besitzen — der Vertrag listet alle Flurstücke auf,
// die im Reiter "Flurstücke" diesem Eigentümer zugeordnet wurden.
function getFlurstueckeForOwner(project, ownerId){
  // Schlüssel ist die stabile Flurstücks-ID (siehe ensureFlurstueckIds) — nicht das Kennzeichen:
  // die Zuordnung im Reiter „Flurstücke" schreibt ebenfalls unter dieser ID.
  return ensureFlurstueckIds(project)
    .filter(f => (project.flurstueckDaten[f.id] || {}).eigentuemerId === ownerId);
}

// ═════════════════════════════════════════════════════════════════════════════
// Pachtvertrag
// ─────────────────────────────────────────────────────────────────────────────
// Der Vertrag wird EINMAL als Blockstruktur beschrieben (pachtvertragBloecke) und daraus
// zweimal gerendert: als Klartext (Vorschau + .txt) und als formatiertes .docx im Layout
// einer anwaltlichen Vertragsurkunde. Zwei getrennte Textfassungen würden zwangsläufig
// auseinanderlaufen, sobald jemand nur eine davon pflegt.
//
// Blocktypen:
//   titel | untertitel | hinweis | zentriert | partei | zeile | kursiv
//   ueberschrift (§ …) | absatz ((1) …, mit hängendem Einzug) | fliess | liste
//   tabelle (JSON: kopf, zeilen, summe, rechts) | sigtabelle | leer | fuss
// ═════════════════════════════════════════════════════════════════════════════

function pachtvertragBloecke(project, owner){
  const B = [];
  const add = (t, x) => B.push({ t, x: x==null ? '' : String(x) });

  const flurstuecke = getFlurstueckeForOwner(project, owner.id);
  const gesamtPachtM2 = flurstuecke.reduce((sum,f) => {
    const extra = project.flurstueckDaten[f.id] || {};
    const wert = extra.pachtflaeche!=null ? extra.pachtflaeche : f.flaeche;
    return sum + (Number(wert)||0);
  }, 0);
  const gesamtHa = (gesamtPachtM2/10000);

  const paechterName = sender.company || sender.name || '[Pächter – bitte in den Absender-Einstellungen hinterlegen]';
  const projektName  = project.name || '[Projektbezeichnung]';
  const gemeinden    = (project.lage && project.lage.gemeinden || []).join(', ');
  const anlagenArt   = ANLAGENARTEN.find(a => a.id === (project.genehmigung.verfahren.anlagenart||''));
  const anlagenText  = anlagenArt
    ? ({ pv:'einer Photovoltaik-Freiflächenanlage',
         bess:'eines Batteriespeichers',
         'pv-bess':'einer Photovoltaik-Freiflächenanlage mit Batteriespeicher' })[anlagenArt.id]
    : 'einer Anlage zur Erzeugung erneuerbarer Energien';

  // ── Kopf ──────────────────────────────────────────────────────────────────
  add('titel', 'LANDPACHTVERTRAG');
  add('untertitel', `über die Verpachtung von Grundstücksflächen zur Errichtung und zum Betrieb\n${anlagenText}`);
  add('hinweis', 'Vertragsmuster, automatisch erzeugt aus den hinterlegten Projekt- und Eigentümerdaten. '
    + 'Vor Verwendung anwaltlich prüfen und um die einzelfallbezogenen Regelungen ergänzen. Keine Rechtsberatung.');
  add('leer');

  // ── Rubrum (Parteien) ─────────────────────────────────────────────────────
  add('zentriert', 'zwischen');
  add('leer');
  add('partei', owner.name || '[Name des Eigentümers]');
  const vAdr = [owner.strasse, [owner.plz, owner.ort].filter(Boolean).join(' ')].filter(Boolean);
  vAdr.forEach(z => add('zeile', z));
  if(!vAdr.length) add('zeile', '[Straße, PLZ und Ort]');
  if(owner.telefon) add('zeile', `Telefon: ${owner.telefon}`);
  if(owner.email)   add('zeile', `E-Mail: ${owner.email}`);
  add('kursiv', '– nachfolgend „Verpächter" genannt –');
  add('leer');
  add('zentriert', 'und');
  add('leer');
  add('partei', paechterName);
  if(sender.name && sender.company && sender.name !== sender.company)
    add('zeile', `vertreten durch ${sender.name}`);
  const pAdr = [sender.strasse, [sender.plz, sender.ort].filter(Boolean).join(' ')].filter(Boolean);
  pAdr.forEach(z => add('zeile', z));
  if(!pAdr.length) add('zeile', '[Straße, PLZ und Ort]');
  if(sender.phone) add('zeile', `Telefon: ${sender.phone}`);
  if(sender.email) add('zeile', `E-Mail: ${sender.email}`);
  add('kursiv', '– nachfolgend „Pächter" genannt –');
  add('leer');
  add('kursiv', '– Verpächter und Pächter nachfolgend einzeln auch „Partei" und gemeinsam „Parteien" genannt –');
  add('leer');

  // ── Präambel ──────────────────────────────────────────────────────────────
  add('ueberschrift', 'Präambel');
  add('fliess', `Der Verpächter ist Eigentümer der in § 1 näher bezeichneten Grundstücksflächen `
    + `${gemeinden ? `in der Gemarkung bzw. Gemeinde ${gemeinden}` : 'in der in § 1 genannten Gemarkung'}.`);
  add('fliess', `Der Pächter befasst sich mit der Projektierung, Errichtung und dem Betrieb von Anlagen zur `
    + `Erzeugung erneuerbarer Energien. Er beabsichtigt, auf den Pachtflächen im Rahmen des Vorhabens `
    + `„${projektName}" ${anlagenText.replace(/^einer /,'eine ').replace(/^eines /,'einen ')} nebst der `
    + `erforderlichen Nebenanlagen zu errichten und für die Dauer dieses Vertrages zu betreiben.`);
  add('fliess', 'Dies vorausgeschickt, vereinbaren die Parteien was folgt:');
  add('leer');

  // ── § 1 Pachtgegenstand ───────────────────────────────────────────────────
  add('ueberschrift', '§ 1 Pachtgegenstand');
  add('absatz', '(1) Der Verpächter verpachtet dem Pächter die nachstehend bezeichneten Grundstücksflächen:');
  if(flurstuecke.length){
    // Aufstellung als Tabelle (Block „tabelle", Inhalt als JSON) — im .docx eine echte
    // Word-Tabelle, in der Textfassung ein ausgerichtetes Raster. Die Grundbuch-Spalte
    // erscheint nur, wenn für mindestens ein Flurstück ein Blatt hinterlegt ist.
    const mitGrundbuch = flurstuecke.some(f => (project.flurstueckDaten[f.id] || {}).grundbuch);
    const m2 = v => v!=null && v!=='' ? Number(v).toLocaleString('de-DE')+'\u00A0m²' : '—'; // geschütztes Leerzeichen: „m²“ bricht nie allein um
    const zeilen = flurstuecke.map((f, i) => {
      const extra = project.flurstueckDaten[f.id] || {};
      const pacht = extra.pachtflaeche!=null ? extra.pachtflaeche : f.flaeche; // wie gesamtPachtM2
      return [
        String(i + 1),
        f.gemarkung || '—',
        String(f.flur ?? '').replace(/^flur\s*/i, '') || '—',
        `${f.zaehler ?? ''}${f.nenner?'/'+f.nenner:''}` || '—',
        ...(mitGrundbuch ? [extra.grundbuch || '—'] : []),
        m2(f.flaeche),
        m2(pacht),
      ];
    });
    add('tabelle', JSON.stringify({
      kopf: ['Nr.', 'Gemarkung', 'Flur', 'Flurstück', ...(mitGrundbuch ? ['Grundbuchblatt'] : []), 'Fläche amtlich', 'davon verpachtet'],
      rechts: [false, false, false, false, ...(mitGrundbuch ? [false] : []), true, true],
      zeilen,
      summe: ['', 'Gesamtpachtfläche', '', '', ...(mitGrundbuch ? [''] : []), '', m2(gesamtPachtM2)],
    }));
    add('absatz', `(2) Die Gesamtpachtfläche beträgt danach ${gesamtPachtM2.toLocaleString('de-DE')} m² `
      + `(${gesamtHa.toLocaleString('de-DE',{minimumFractionDigits:2, maximumFractionDigits:2})} ha). `
      + `Maßgeblich für die Berechnung des Pachtzinses nach § 4 ist die tatsächlich in Anspruch genommene Fläche `
      + `nach Maßgabe des Absatzes 3.`);
  } else {
    add('liste', '[Diesem Eigentümer ist noch kein Flurstück zugeordnet. Die Zuordnung erfolgt im Reiter '
      + '„Grundstück – Flurstücke"; die Aufstellung wird anschließend automatisch eingesetzt.]');
    add('absatz', '(2) Die Gesamtpachtfläche ergibt sich aus der Aufstellung in Absatz 1.');
  }
  add('absatz', '(3) Die verpachtete Teilfläche ist in dem diesem Vertrag als Anlage 1 beigefügten Lageplan '
    + 'zeichnerisch dargestellt. Der Lageplan ist Bestandteil dieses Vertrages. Die endgültige Festlegung der '
    + 'Pachtfläche erfolgt nach Vorliegen der Genehmigungsplanung durch Aufmaß; die Parteien werden das Ergebnis '
    + 'in einem Nachtrag zu diesem Vertrag festhalten.');
  add('absatz', '(4) Der Verpächter versichert, dass er alleiniger Eigentümer der Pachtflächen ist und dass '
    + 'diese frei von Rechten Dritter sind, die der vertragsgemäßen Nutzung entgegenstehen. Bestehende Belastungen '
    + 'in Abteilung II des Grundbuchs sowie laufende Bewirtschaftungs- oder Pachtverhältnisse hat der Verpächter '
    + 'dem Pächter vor Vertragsschluss vollständig offengelegt.');
  add('leer');

  // ── § 2 Nutzungszweck ─────────────────────────────────────────────────────
  add('ueberschrift', '§ 2 Nutzungszweck und Umfang der Gestattung');
  add('absatz', '(1) Die Pachtflächen werden ausschließlich zur Errichtung, zum Betrieb, zur Wartung, zur '
    + 'Instandsetzung, zur Erneuerung und zum Rückbau von Anlagen zur Erzeugung erneuerbarer Energien nebst allen '
    + 'hierfür erforderlichen Nebenanlagen verpachtet. Hierzu zählen insbesondere Modultische, Wechselrichter, '
    + 'Transformatoren- und Übergabestationen, Batteriespeicher, Zuwegungen, Kabeltrassen, Einfriedungen sowie '
    + 'Einrichtungen der technischen Überwachung.');
  add('absatz', '(2) Der Pächter ist berechtigt, die Pachtflächen zu betreten und zu befahren sowie die zur '
    + 'Erschließung erforderlichen Leitungen über die Pachtflächen zu führen. Der Verpächter gestattet dem Pächter '
    + 'ferner die Mitbenutzung der auf seinem übrigen Grundbesitz vorhandenen Wege zur Erreichung der Pachtflächen.');
  add('absatz', '(3) Der Pächter ist berechtigt, die zur Umsetzung des Vorhabens erforderlichen öffentlich-rechtlichen '
    + 'Genehmigungen im eigenen Namen zu beantragen. Der Verpächter wird die hierfür erforderlichen Erklärungen '
    + 'unverzüglich abgeben, insbesondere Anträge als Grundstückseigentümer mitunterzeichnen, soweit ihm hieraus '
    + 'keine Kosten oder Verpflichtungen entstehen.');
  add('absatz', '(4) Eine landwirtschaftliche Nutzung der Pachtflächen durch den Verpächter ist ab Übergabe '
    + 'ausgeschlossen, soweit sie der vertragsgemäßen Nutzung entgegensteht. [Optional: Regelung zur Fortführung '
    + 'einer extensiven Beweidung oder Pflegenutzung.]');
  add('leer');

  // ── § 3 Vertragsbeginn und Laufzeit ───────────────────────────────────────
  add('ueberschrift', '§ 3 Vertragsbeginn und Vertragslaufzeit');
  add('absatz', '(1) Dieser Vertrag tritt mit seiner beiderseitigen Unterzeichnung in Kraft.');
  add('absatz', '(2) Das Pachtverhältnis beginnt mit dem Ersten des Monats, der auf die Inbetriebnahme der Anlage '
    + 'folgt, spätestens jedoch am [Datum]. Es wird fest auf [XX] Jahre geschlossen.');
  add('absatz', '(3) Der Pächter ist berechtigt, die Vertragslaufzeit zweimal um jeweils [XX] Jahre zu verlängern. '
    + 'Die Ausübung der Verlängerungsoption erfolgt durch schriftliche Erklärung gegenüber dem Verpächter '
    + 'spätestens zwölf Monate vor Ablauf der jeweiligen Laufzeit.');
  add('absatz', '(4) Der Pächter ist berechtigt, diesen Vertrag mit einer Frist von drei Monaten zum Monatsende zu '
    + 'kündigen, solange die Anlage noch nicht errichtet ist, insbesondere wenn die erforderlichen Genehmigungen '
    + 'nicht oder nicht in wirtschaftlich zumutbarer Weise erteilt werden oder ein Netzanschluss nicht zu '
    + 'wirtschaftlich vertretbaren Bedingungen hergestellt werden kann.');
  add('leer');

  // ── § 4 Pachtzins ─────────────────────────────────────────────────────────
  add('ueberschrift', '§ 4 Pachtzins und Zahlungsbedingungen');
  add('absatz', `(1) Der jährliche Pachtzins beträgt [Betrag] EUR je Hektar Pachtfläche`
    + (gesamtPachtM2 ? `, bei der derzeit vorgesehenen Pachtfläche von `
        + `${gesamtHa.toLocaleString('de-DE',{minimumFractionDigits:2, maximumFractionDigits:2})} ha mithin `
        + `[Gesamtbetrag] EUR pro Jahr` : '')
    + '. Der Pachtzins versteht sich zuzüglich der gesetzlichen Umsatzsteuer, sofern der Verpächter zur '
    + 'Umsatzsteuer optiert.');
  add('absatz', '(2) Der Pachtzins ist jährlich im Voraus, jeweils zum [Datum] eines Jahres, kostenfrei auf ein vom '
    + 'Verpächter zu benennendes Konto zu zahlen. Für ein angefangenes Pachtjahr ist der Pachtzins zeitanteilig zu '
    + 'entrichten.');
  add('absatz', '(3) Bis zur Inbetriebnahme der Anlage zahlt der Pächter ab Vertragsbeginn eine jährliche '
    + 'Sicherungsvergütung in Höhe von [Betrag] EUR. Geleistete Sicherungsvergütungen werden auf den Pachtzins '
    + 'nicht angerechnet.');
  add('absatz', '(4) Ändert sich der vom Statistischen Bundesamt veröffentlichte Verbraucherpreisindex für '
    + 'Deutschland (Basis [Jahr] = 100) gegenüber dem Stand bei Vertragsbeginn um mehr als [XX] Prozent, so ändert '
    + 'sich der Pachtzins ab dem folgenden Pachtjahr im gleichen prozentualen Verhältnis. Die Anpassung erfolgt auf '
    + 'schriftliches Verlangen einer Partei.');
  add('leer');

  // ── § 5 Errichtung und Betrieb ────────────────────────────────────────────
  add('ueberschrift', '§ 5 Errichtung, Betrieb und Unterhaltung der Anlage');
  add('absatz', '(1) Der Pächter errichtet und betreibt die Anlage auf eigene Kosten und eigenes Risiko. Er trägt '
    + 'sämtliche mit der Errichtung, dem Betrieb, der Unterhaltung und dem Rückbau verbundenen Kosten einschließlich '
    + 'der Kosten des Netzanschlusses.');
  add('absatz', '(2) Die vom Pächter errichteten Anlagen werden nur zu einem vorübergehenden Zweck im Sinne des '
    + '§ 95 Abs. 1 Satz 1 BGB mit dem Grundstück verbunden. Sie bleiben Eigentum des Pächters und werden nicht '
    + 'wesentlicher Bestandteil des Grundstücks (Scheinbestandteil).');
  add('absatz', '(3) Der Pächter trägt die Verkehrssicherungspflicht für die Pachtflächen und die auf ihnen '
    + 'errichteten Anlagen ab Übergabe bis zum Abschluss des Rückbaus.');
  add('absatz', '(4) Der Pächter hält die Pachtflächen in einem ordnungsgemäßen Zustand und führt die zur '
    + 'Freihaltung der Anlage erforderliche Pflege durch. Die naturschutzfachlichen Auflagen der Genehmigung sind '
    + 'einzuhalten.');
  add('leer');

  // ── § 6 Dingliche Sicherung ───────────────────────────────────────────────
  add('ueberschrift', '§ 6 Dingliche Sicherung');
  add('absatz', '(1) Der Verpächter bewilligt und beantragt, zugunsten des Pächters eine beschränkte persönliche '
    + 'Dienstbarkeit (§ 1090 BGB) an rangbereiter Stelle, mindestens jedoch an erster Rangstelle in Abteilung II '
    + 'des Grundbuchs, einzutragen. Inhalt der Dienstbarkeit ist das Recht, auf den Pachtflächen Anlagen zur '
    + 'Erzeugung erneuerbarer Energien nebst Nebenanlagen zu errichten, zu betreiben, zu unterhalten und zu '
    + 'erneuern sowie die Flächen hierzu zu betreten und zu befahren.');
  add('absatz', '(2) Die Kosten der Beurkundung und der Eintragung sowie der späteren Löschung trägt der Pächter.');
  add('absatz', '(3) Der Verpächter verpflichtet sich, bei einer Veräußerung der Pachtflächen den Erwerber zur '
    + 'Übernahme sämtlicher Verpflichtungen aus diesem Vertrag zu verpflichten und diese Verpflichtung an einen '
    + 'jeden weiteren Rechtsnachfolger weiterzugeben.');
  add('leer');

  // ── § 7 Rückbau ───────────────────────────────────────────────────────────
  add('ueberschrift', '§ 7 Rückbauverpflichtung und Sicherheitsleistung');
  add('absatz', '(1) Der Pächter ist verpflichtet, die Anlage nach Beendigung des Vertragsverhältnisses auf eigene '
    + 'Kosten vollständig zurückzubauen und die Pachtflächen in einem ordnungsgemäßen, landwirtschaftlich nutzbaren '
    + 'Zustand zurückzugeben. Fundamente sind bis zu einer Tiefe von mindestens [XX] cm unter Geländeoberkante zu '
    + 'entfernen.');
  add('absatz', '(2) Der Rückbau ist innerhalb von zwölf Monaten nach Vertragsende abzuschließen.');
  add('absatz', '(3) Zur Sicherung der Rückbauverpflichtung stellt der Pächter spätestens mit Inbetriebnahme der '
    + 'Anlage eine Sicherheit in Höhe von [Betrag] EUR, wahlweise durch unbefristete selbstschuldnerische '
    + 'Bankbürgschaft oder durch Rückbaubürgschaft eines Versicherers. Die Sicherheit ist alle fünf Jahre auf ihre '
    + 'Angemessenheit zu überprüfen.');
  add('leer');

  // ── § 8 Haftung und Versicherung ──────────────────────────────────────────
  add('ueberschrift', '§ 8 Haftung und Versicherung');
  add('absatz', '(1) Der Pächter haftet für alle Schäden, die durch die Errichtung, den Betrieb oder den Rückbau '
    + 'der Anlage an den Pachtflächen oder an benachbarten Flächen des Verpächters entstehen. Flurschäden sind zu '
    + 'ersetzen oder zu beseitigen.');
  add('absatz', '(2) Der Pächter unterhält für die Dauer dieses Vertrages eine Betriebshaftpflichtversicherung mit '
    + 'einer Deckungssumme von mindestens [Betrag] EUR je Schadensereignis und weist deren Bestehen auf Verlangen '
    + 'nach.');
  add('absatz', '(3) Der Verpächter haftet nicht für den Bestand der öffentlich-rechtlichen Zulässigkeit des '
    + 'Vorhabens.');
  add('leer');

  // ── § 9 Übertragung ───────────────────────────────────────────────────────
  add('ueberschrift', '§ 9 Vertragsübernahme und Übertragung');
  add('absatz', '(1) Der Pächter ist berechtigt, seine Rechte und Pflichten aus diesem Vertrag ganz oder teilweise '
    + 'auf eine Projektgesellschaft oder ein verbundenes Unternehmen im Sinne der §§ 15 ff. AktG zu übertragen. Der '
    + 'Verpächter erteilt hierzu bereits jetzt seine Zustimmung.');
  add('absatz', '(2) Der Pächter ist berechtigt, seine Ansprüche aus diesem Vertrag zur Finanzierung des Vorhabens '
    + 'an finanzierende Kreditinstitute abzutreten und zu verpfänden.');
  add('leer');

  // ── § 10 Vorzeitige Beendigung ────────────────────────────────────────────
  add('ueberschrift', '§ 10 Vorzeitige Beendigung');
  add('absatz', '(1) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt für beide Parteien '
    + 'unberührt. Ein wichtiger Grund liegt für den Verpächter insbesondere vor, wenn der Pächter mit der Zahlung '
    + 'des Pachtzinses für mehr als zwei aufeinanderfolgende Termine in Verzug ist und trotz schriftlicher '
    + 'Mahnung mit angemessener Nachfrist nicht leistet.');
  add('absatz', '(2) Vor Ausübung eines Kündigungsrechts hat der Verpächter die den Pächter finanzierenden '
    + 'Kreditinstitute schriftlich zu unterrichten und ihnen Gelegenheit zu geben, binnen drei Monaten in den '
    + 'Vertrag einzutreten oder die Vertragsverletzung zu heilen.');
  add('leer');

  // ── § 11 Vertraulichkeit ──────────────────────────────────────────────────
  add('ueberschrift', '§ 11 Vertraulichkeit');
  add('fliess', 'Die Parteien verpflichten sich, den Inhalt dieses Vertrages sowie alle im Zusammenhang mit seiner '
    + 'Durchführung erlangten Informationen vertraulich zu behandeln und Dritten nicht zugänglich zu machen. '
    + 'Ausgenommen sind Offenlegungen gegenüber Behörden, finanzierenden Kreditinstituten, Erwerbsinteressenten '
    + 'sowie rechtlichen und steuerlichen Beratern, die ihrerseits zur Verschwiegenheit verpflichtet sind.');
  add('leer');

  // ── § 12 Schlussbestimmungen ──────────────────────────────────────────────
  add('ueberschrift', '§ 12 Schlussbestimmungen');
  add('absatz', '(1) Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Dies gilt auch für die '
    + 'Aufhebung dieses Schriftformerfordernisses. Die Parteien verpflichten sich, jederzeit alle Handlungen '
    + 'vorzunehmen, die erforderlich sind, um dem gesetzlichen Schriftformerfordernis zu genügen.');
  add('absatz', '(2) Mündliche Nebenabreden bestehen nicht. Dieser Vertrag gibt die Vereinbarungen der Parteien '
    + 'vollständig wieder.');
  add('absatz', '(3) Sollte eine Bestimmung dieses Vertrages ganz oder teilweise unwirksam oder undurchführbar sein '
    + 'oder werden, so berührt dies die Wirksamkeit der übrigen Bestimmungen nicht. Die Parteien verpflichten sich, '
    + 'die unwirksame Bestimmung durch eine wirksame zu ersetzen, die dem wirtschaftlich Gewollten am nächsten '
    + 'kommt. Entsprechendes gilt für Vertragslücken.');
  add('absatz', '(4) Es gilt das Recht der Bundesrepublik Deutschland. Ausschließlicher Gerichtsstand ist, soweit '
    + 'gesetzlich zulässig, [Ort].');
  add('leer');

  // ── Anlagen ───────────────────────────────────────────────────────────────
  add('ueberschrift', 'Anlagen');
  add('liste', 'Anlage 1: Lageplan der Pachtflächen');
  add('liste', 'Anlage 2: Flurstücksaufstellung');
  add('leer');

  // ── Unterschriften ────────────────────────────────────────────────────────
  add('sigtabelle', JSON.stringify({
    links:  { ort:'[Ort]', rolle:'Der Verpächter', name: owner.name || '' },
    rechts: { ort:'[Ort]', rolle:'Der Pächter',    name: paechterName }
  }));

  add('leer');
  add('fuss', `Vertragsmuster, erzeugt am ${new Date().toLocaleDateString('de-DE')} mit Wattfolio. `
    + 'Unverbindlicher Textvorschlag, der eine anwaltliche Prüfung des Einzelfalls nicht ersetzt.');
  return B;
}

// Zeilenumbruch für die Klartextfassung — im .docx bricht Word selbst um.
function umbrechen(text, breite){
  return String(text).split('\n').map(zeile => {
    const worte = zeile.split(' ');
    const out = []; let akt = '';
    worte.forEach(w => {
      if(akt && (akt + ' ' + w).length > breite){ out.push(akt); akt = w; }
      else akt = akt ? akt + ' ' + w : w;
    });
    if(akt) out.push(akt);
    return out.join('\n');
  }).join('\n');
}

// Blockstruktur -> Klartext (Vorschau im Reiter und .txt-Download)
function bloeckeAlsText(bloecke){
  const BREITE = 95;
  const zeilen = [];
  bloecke.forEach(b => {
    switch(b.t){
      case 'titel':      zeilen.push(b.x.toUpperCase(), '='.repeat(b.x.length)); break;
      case 'untertitel': zeilen.push(umbrechen(b.x, BREITE)); break;
      case 'hinweis':    zeilen.push('', umbrechen('[ ' + b.x + ' ]', BREITE)); break;
      case 'zentriert':  zeilen.push(b.x); break;
      case 'partei':     zeilen.push(b.x); break;
      case 'zeile':      zeilen.push(b.x); break;
      case 'kursiv':     zeilen.push(b.x); break;
      case 'ueberschrift': zeilen.push('', b.x, '-'.repeat(b.x.length)); break;
      case 'absatz':     zeilen.push(umbrechen(b.x, BREITE)); break;
      case 'fliess':     zeilen.push(umbrechen(b.x, BREITE)); break;
      case 'liste':      zeilen.push(umbrechen(b.x, BREITE-6).split('\n').map((z,i) => (i===0?'  •  ':'     ')+z).join('\n')); break;
      case 'leer':       zeilen.push(''); break;
      case 'fuss':       zeilen.push('', umbrechen(b.x, BREITE)); break;
      case 'tabelle': {
        const tb = JSON.parse(b.x);
        const alle = [tb.kopf, ...tb.zeilen, ...(tb.summe ? [tb.summe] : [])];
        const breiten = tb.kopf.map((_, c) => Math.max(...alle.map(z => String(z[c] ?? '').length)));
        const fmt = z => '  ' + z.map((v, c) => tb.rechts[c] ? String(v).padStart(breiten[c]) : String(v).padEnd(breiten[c])).join('   ').trimEnd();
        const linie = '  ' + breiten.map(w => '-'.repeat(w)).join('   ');
        zeilen.push('', fmt(tb.kopf), linie, ...tb.zeilen.map(fmt));
        if(tb.summe) zeilen.push(linie, fmt(tb.summe));
        zeilen.push('');
        break;
      }
      case 'sigtabelle': {
        const s = JSON.parse(b.x);
        zeilen.push('',
          `${s.links.ort}, den ______________`.padEnd(46) + `${s.rechts.ort}, den ______________`,
          '', '',
          '_'.padEnd(38,'_').padEnd(46) + '_'.padEnd(38,'_'),
          s.links.rolle.padEnd(46) + s.rechts.rolle,
          (s.links.name||'').padEnd(46) + (s.rechts.name||''));
        break;
      }
    }
  });
  return zeilen.join('\n');
}

function buildPachtvertrag(project, owner){
  return bloeckeAlsText(pachtvertragBloecke(project, owner));
}

function escapeXml(s){
  return String(s==null?'':s)
    // XML 1.0 erlaubt von den Steuerzeichen nur Tab, LF und CR. Gelangt ein anderes (z.B. das
    // Seitenumbruch-Zeichen \f oder ein aus einer Fremdquelle importierter Name) in eine
    // <w:t>-Zelle, ist die gesamte document.xml ungültig und Word verweigert die Datei —
    // ohne dass beim Erzeugen ein Fehler aufträte. Deshalb hier zentral entfernen.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

// Baut aus dem Vertragstext ein minimales, aber valides .docx (OOXML/WordprocessingML) —
// eine .docx-Datei ist im Kern ein ZIP mit XML-Teilen; JSZip ist bereits für den KMZ-Export
// geladen, eine zusätzliche Docx-Bibliothek ist dafür nicht nötig. Jede Zeile wird ein
// eigener Absatz; Titel und §-Überschriften werden fett hervorgehoben.
function textToDocxBodyXml(text){
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    // \f auf einer eigenen Zeile = harter Seitenumbruch (Serienbrief: ein Brief je Seite).
    // Nicht gegen `trimmed` prüfen: \f IST Whitespace, trim() entfernt es und die Bedingung
    // träfe nie zu — der Umbruch fiele aus und das rohe \f landete im XML.
    if(line.includes('\f')) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const isTitle = trimmed === 'PACHTVERTRAG (LANDPACHT)';
    const isHeading = /^§\s?\d/.test(trimmed);
    const rPr = isTitle ? '<w:rPr><w:b/><w:sz w:val="28"/></w:rPr>'
              : isHeading ? '<w:rPr><w:b/></w:rPr>'
              : '';
    const pPr = isTitle ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : '';
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
  }).join('');
}

// Baut ein minimales .docx aus reinem Text — genutzt für Pachtverträge UND Serienbriefe.
async function buildDocxBlob(text){
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${textToDocxBodyXml(text)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body>
</w:document>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', docRelsXml);
  return zip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ── .docx im Layout einer Vertragsurkunde ───────────────────────────────────
// Bewusst getrennt von buildDocxBlob(): jenes rendert die Serienbriefe (ein Absatz je Zeile,
// Standardschrift) und darf sich hier nicht mitverändern. Ein Vertrag braucht Serifenschrift,
// Blocksatz, hängende Einzüge unter der Absatznummer, eine Unterschriftentabelle und eine
// Fußzeile mit Seitenzahlen — Merkmale, an denen eine Urkunde als solche erkennbar ist.
const VTR_FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';

function vtrRun(text, opts){
  const o = opts || {};
  const rPr = '<w:rPr>' + VTR_FONT
    + (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '')
    + (o.caps ? '<w:caps/>' : '')
    + (o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : '')
    + `<w:sz w:val="${o.sz || 22}"/><w:szCs w:val="${o.sz || 22}"/>`
    + (o.color ? `<w:color w:val="${o.color}"/>` : '')
    + '</w:rPr>';
  // \n innerhalb eines Blocks = weicher Zeilenumbruch im selben Absatz
  const teile = String(text).split('\n');
  return teile.map((t,i) =>
    `<w:r>${rPr}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`).join('');
}

function vtrP(inhalt, pPrTeile){
  const pPr = (pPrTeile && pPrTeile.length) ? `<w:pPr>${pPrTeile.join('')}</w:pPr>` : '';
  return `<w:p>${pPr}${inhalt}</w:p>`;
}

// Unterschriftenblock als echte Word-Tabelle (rahmenlos): nur so stehen die beiden Spalten
// unabhängig von der Schriftbreite sauber nebeneinander — mit Leerzeichen ausgerichteter
// Text verrutscht in Word zuverlässig.
function vtrSignaturTabelle(s){
  const zelle = (seite) => {
    const p = [
      vtrP(vtrRun(`${seite.ort}, den ______________`), []),
      vtrP('', ['<w:spacing w:before="600"/>']),
      vtrP('', ['<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>']),
      vtrP(vtrRun(seite.rolle, { b:true, sz:20 }), ['<w:spacing w:before="60"/>']),
      seite.name ? vtrP(vtrRun(seite.name, { sz:20 }), []) : '',
    ].join('');
    return `<w:tc><w:tcPr><w:tcW w:w="4400" w:type="dxa"/></w:tcPr>${p}</w:tc>`;
  };
  return '<w:tbl>'
    + '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/>'
    + '<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="284" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    + '<w:tblGrid><w:gridCol w:w="4400"/><w:gridCol w:w="4400"/></w:tblGrid>'
    + `<w:tr>${zelle(s.links)}${zelle(s.rechts)}</w:tr>`
    + '</w:tbl>'
    + vtrP('', []); // Word verlangt einen Absatz nach einer Tabelle
}

// Flurstücks-Aufstellung als Word-Tabelle mit Rahmen, Kopfzeile (wiederholt sich bei
// Seitenumbruch) und fetter Summenzeile. Eingerückt wie der Absatztext (454 twips).
function vtrDatenTabelle(tb){
  const EINZUG = 454, BREITE = 8787 - EINZUG; // Satzspiegel: A4 minus Ränder links 1701 / rechts 1418
  // Gewichte je Spalte (Nr. schmal, Gemarkung breit), auf die verfügbare Breite skaliert
  const gewichte = tb.kopf.map(k => ({ 'Nr.':5, 'Gemarkung':17, 'Flur':7, 'Flurstück':11, 'Grundbuchblatt':14,
                                        'Fläche amtlich':14, 'davon verpachtet':15 })[k] || 12);
  const summeG = gewichte.reduce((a, b) => a + b, 0);
  const breiten = gewichte.map(g => Math.floor(g / summeG * BREITE));
  const rand = '<w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/>'
    + '<w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/>'
    + '<w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/>';
  const zelle = (text, c, o) => `<w:tc><w:tcPr><w:tcW w:w="${breiten[c]}" w:type="dxa"/>`
    + (o.kopf ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>'
    + vtrP(vtrRun(text, { b: !!(o.kopf || o.summe), sz:20 }),
        [`<w:jc w:val="${tb.rechts[c] && !o.kopf ? 'right' : 'left'}"/>`, '<w:spacing w:before="40" w:after="40"/>'])
    + '</w:tc>';
  const zeile = (z, o) => `<w:tr>${o.kopf ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}`
    + z.map((v, c) => zelle(v, c, o)).join('') + '</w:tr>';
  // Summenzeile: Beschriftung als eine über alle Spalten bis auf die letzte verbundene Zelle
  const n = tb.kopf.length;
  const summeZeile = z => '<w:tr><w:trPr><w:cantSplit/></w:trPr>'
    + `<w:tc><w:tcPr><w:tcW w:w="${breiten.slice(0, n-1).reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:gridSpan w:val="${n-1}"/><w:vAlign w:val="center"/></w:tcPr>`
    + vtrP(vtrRun(z.slice(0, n-1).filter(Boolean).join(' '), { b:true, sz:20 }), ['<w:jc w:val="right"/>', '<w:spacing w:before="40" w:after="40"/>'])
    + '</w:tc>' + zelle(z[n-1], n-1, { summe:true }) + '</w:tr>';
  return '<w:tbl>'
    + `<w:tblPr><w:tblW w:w="${BREITE}" w:type="dxa"/><w:tblInd w:w="${EINZUG}" w:type="dxa"/>`
    + `<w:tblBorders>${rand}</w:tblBorders><w:tblLayout w:type="fixed"/>`
    + '<w:tblCellMar><w:left w:w="85" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    + `<w:tblGrid>${breiten.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + zeile(tb.kopf, { kopf:true })
    + tb.zeilen.map(z => zeile(z, {})).join('')
    + (tb.summe ? summeZeile(tb.summe) : '')
    + '</w:tbl>'
    + vtrP('', ['<w:spacing w:after="120"/>']); // Word verlangt einen Absatz nach einer Tabelle
}

function vertragDocxBodyXml(bloecke){
  const BLOCK = '<w:jc w:val="both"/>';
  return bloecke.map(b => {
    switch(b.t){
      case 'titel':
        return vtrP(vtrRun(b.x, { b:true, sz:36, spacing:80 }),
          ['<w:jc w:val="center"/>', '<w:spacing w:before="240" w:after="120"/>', '<w:keepNext/>']);
      case 'untertitel':
        return vtrP(vtrRun(b.x, { sz:22 }),
          ['<w:jc w:val="center"/>', '<w:spacing w:after="180"/>',
           '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="000000"/></w:pBdr>']);
      case 'hinweis':
        return vtrP(vtrRun(b.x, { i:true, sz:17, color:'595959' }),
          ['<w:jc w:val="center"/>', '<w:spacing w:before="120" w:after="240"/>']);
      case 'zentriert':
        return vtrP(vtrRun(b.x, { sz:22 }), ['<w:jc w:val="center"/>', '<w:spacing w:before="60" w:after="60"/>']);
      case 'partei':
        return vtrP(vtrRun(b.x, { b:true }), ['<w:spacing w:before="60"/>']);
      case 'zeile':
        return vtrP(vtrRun(b.x), []);
      case 'kursiv':
        return vtrP(vtrRun(b.x, { i:true }), ['<w:spacing w:before="80" w:after="80"/>']);
      case 'ueberschrift':
        return vtrP(vtrRun(b.x, { b:true, sz:24 }),
          ['<w:spacing w:before="320" w:after="140"/>', '<w:keepNext/>', '<w:keepLines/>']);
      case 'absatz': {
        // Hängender Einzug: die Folgezeilen stehen unter dem Text, nicht unter der „(1)".
        return vtrP(vtrRun(b.x), [BLOCK, '<w:ind w:left="454" w:hanging="454"/>',
          '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>']);
      }
      case 'fliess':
        return vtrP(vtrRun(b.x), [BLOCK, '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>']);
      case 'liste':
        return vtrP(vtrRun(b.x), [BLOCK, '<w:ind w:left="907" w:hanging="340"/>',
          '<w:spacing w:after="100" w:line="264" w:lineRule="auto"/>']);
      case 'fuss':
        return vtrP(vtrRun(b.x, { i:true, sz:16, color:'595959' }),
          ['<w:jc w:val="center"/>', '<w:spacing w:before="240"/>',
           '<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="BFBFBF"/></w:pBdr>']);
      case 'tabelle':
        return vtrDatenTabelle(JSON.parse(b.x));
      case 'sigtabelle':
        return vtrSignaturTabelle(JSON.parse(b.x));
      case 'leer':
        return vtrP('', ['<w:spacing w:after="0"/>']);
      default:
        return vtrP(vtrRun(b.x), []);
    }
  }).join('');
}

// Fußzeile „Seite X von Y" über Word-Felder (PAGE/NUMPAGES) — wird von Word beim Öffnen
// berechnet, deshalb genügt hier ein Platzhalterwert zwischen separate und end.
function vertragFooterXml(){
  const feld = (name) =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>`
  + `<w:r><w:instrText xml:space="preserve"> ${name} </w:instrText></w:r>`
  + `<w:r><w:fldChar w:fldCharType="separate"/></w:r>`
  + `<w:r><w:rPr>${VTR_FONT}<w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r>`
  + `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:jc w:val="center"/></w:pPr>
${vtrRun('Seite ', { sz:18, color:'595959' })}${feld('PAGE')}${vtrRun(' von ', { sz:18, color:'595959' })}${feld('NUMPAGES')}
</w:p></w:ftr>`;
}

async function buildVertragDocxBlob(bloecke){
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${vertragDocxBodyXml(bloecke)}<w:sectPr>
<w:footerReference w:type="default" r:id="rIdFooter"/>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/>
</w:sectPr></w:body>
</w:document>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/footer1.xml', vertragFooterXml());
  zip.file('word/_rels/document.xml.rels', docRelsXml);
  return zip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function renderPachtvertragPreview(project, owner){
  const bloecke = pachtvertragBloecke(project, owner);
  const text = bloeckeAlsText(bloecke);
  const root = document.getElementById('pachtvertrag-preview');
  const card = document.createElement('div');
  card.className = 'info';
  card.style.marginTop = '16px';
  card.innerHTML = `
    <div class="card-head">
      <strong>Pachtvertrag (Muster) — ${escapeHtml(owner.name||'(unbenannt)')}</strong>
      <div class="btn-row" style="margin:0">
        <button class="secondary small" data-act="copy">Text kopieren</button>
        <button class="secondary small" data-act="download-txt">Als .txt herunterladen</button>
        <button class="small" data-act="download-docx">Als Word-Datei (.docx)</button>
      </div>
    </div>
    <!-- Bewusst Monospace: die Klartextfassung richtet Unterschriftenspalten und die
         Unterstriche unter den Überschriften über Leerzeichen aus — in einer Proportional-
         schrift verrutscht das. Das Serifen-Layout der Urkunde steckt im .docx. -->
    <textarea readonly rows="24" style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;line-height:1.45">${escapeHtml(text)}</textarea>
  `;
  const safeName = (owner.name||'Eigentuemer').replace(/[^a-zA-Z0-9-_]+/g,'_');
  card.querySelector('[data-act=copy]').onclick = () => {
    navigator.clipboard.writeText(text).then(() => toast('Vertragstext kopiert'));
  };
  card.querySelector('[data-act=download-txt]').onclick = () => {
    const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
    downloadBlob(blob, `Pachtvertrag_${fileBase()}_${safeName}.txt`);
  };
  card.querySelector('[data-act=download-docx]').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Erzeuge …';
    try {
      const blob = await buildVertragDocxBlob(bloecke);
      downloadBlob(blob, `Pachtvertrag_${fileBase()}_${safeName}.docx`);
    } catch(err){
      alert('Word-Export fehlgeschlagen: ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  };
  root.innerHTML = '';
  root.appendChild(card);
  card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
