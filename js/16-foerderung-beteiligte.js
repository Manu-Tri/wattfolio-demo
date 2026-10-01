// Förder-/Netzrahmen, Info-Buttons/Aufklapper und Beteiligte
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// =============================================================================
// Förder- und Netzrahmen: EEG-Flächenkulisse und Netzanschluss-Regime
// -----------------------------------------------------------------------------
// Baurecht beantwortet nur, ob gebaut werden darf. Ob das Projekt Geld verdient, entscheiden
// zwei weitere Gesetze, die im Tool bisher gar nicht vorkamen:
//   EEG  — liegt die Fläche in der Förderkulisse des § 37, und ist die Anlage
//          ausschreibungspflichtig?
//   EnWG — nach welchem Regime läuft der Netzanschluss, und gilt die Netzentgeltbefreiung?
// Der teuerste Irrtum in der Praxis steckt genau zwischen diesen Ebenen: das EEG fördert
// Flächen bis 500 m längs Autobahn und Schiene, baurechtlich privilegiert (§ 35 Abs. 1
// Nr. 8 lit. b BauGB) ist aber nur der 200-m-Streifen. Wer das verwechselt, sichert eine
// förderfähige Fläche, für die er trotzdem ein B-Plan-Verfahren braucht. Deshalb stehen
// beide Abstände hier nebeneinander und werden gegeneinander geprüft.
// =============================================================================
const EEG_AUSSCHREIBUNG_AB_MW = 1;          // § 37 EEG, erstes Segment
const EEG_KORRIDOR_M = 500;                 // § 37 Abs. 1 Nr. 2 lit. c EEG
const BAUGB_KORRIDOR_M = 200;               // § 35 Abs. 1 Nr. 8 lit. b BauGB
const EEG_BIODIV_MINDESTENS = 3;            // § 37 Abs. 1a EEG: drei von fünf Kriterien
const EEG_KOMMUNAL_CT = 0.2;                // § 6 EEG

const EEG_FLAECHEN = [
  { id:'baulich',      norm:'§ 37 Abs. 1 Nr. 1 EEG',        label:'Auf einer sonstigen baulichen Anlage',
    hinweis:'Bauliche Anlage, die zu einem anderen Zweck als der Stromerzeugung errichtet wurde.' },
  { id:'versiegelt',   norm:'§ 37 Abs. 1 Nr. 2 lit. a EEG', label:'Versiegelte Fläche',
    hinweis:'Versiegelung muss bereits bei Aufstellung des Bebauungsplans bestanden haben.' },
  { id:'konversion',   norm:'§ 37 Abs. 1 Nr. 2 lit. b EEG', label:'Konversionsfläche',
    hinweis:'Ehemals wirtschaftlich, verkehrlich, wohnungsbaulich oder militärisch genutzt.' },
  { id:'korridor',     norm:'§ 37 Abs. 1 Nr. 2 lit. c EEG', label:'Korridor längs Autobahn oder Schienenweg', korridor:true,
    hinweis:'Bis 500 m, gemessen vom äußeren Rand der Fahrbahn. Baurechtlich privilegiert ist nur der innere 200-m-Streifen.' },
  { id:'bplan2003',    norm:'§ 37 Abs. 1 Nr. 2 lit. d EEG', label:'Bebauungsplan vor dem 01.09.2003 aufgestellt' },
  { id:'gewerbe2010',  norm:'§ 37 Abs. 1 Nr. 2 lit. e EEG', label:'Gewerbe- oder Industriegebiet, ausgewiesen vor dem 01.01.2010' },
  { id:'planfest',     norm:'§ 37 Abs. 1 Nr. 2 lit. f EEG', label:'Planfeststellung für eine Abfallbeseitigungsanlage' },
  { id:'bima',         norm:'§ 37 Abs. 1 Nr. 2 lit. g EEG', label:'Fläche der Bundesanstalt für Immobilienaufgaben' },
  { id:'acker-benacht',norm:'§ 37 Abs. 1 Nr. 2 lit. h EEG', label:'Ackerland in benachteiligtem Gebiet', biodiv:true, optout:true },
  { id:'gruen-benacht',norm:'§ 37 Abs. 1 Nr. 2 lit. i EEG', label:'Grünland in benachteiligtem Gebiet', biodiv:true, optout:true },
  { id:'besondere',    norm:'§ 37 Abs. 1 Nr. 3 EEG',        label:'Besondere Solaranlage (Agri-, Moor-, Parkplatz-, Floating-PV)',
    hinweis:'Eigene, erhöhte Höchstwerte. Nicht zu verwechseln mit der baurechtlichen Privilegierung nach § 35 Abs. 1 Nr. 9 BauGB, die zusätzlich 25.000 m² und eine Anlage je Hofstelle verlangt.' },
];
const eegFlaecheDef = id => EEG_FLAECHEN.find(x => x.id===id) || null;

// Netzanschluss-Regime. Der wichtigste Punkt ist die KraftNAV-Änderungsverordnung vom
// 23.12.2025: § 1 Abs. 1 Satz 2 KraftNAV nimmt Energiespeicheranlagen im Sinne des § 3 Nr. 36
// EnWG ausdrücklich vom Anwendungsbereich aus. Großbatteriespeicher verlieren damit das
// Windhundverfahren mit gesetzlichen Fristen und laufen über § 17 EnWG.
function netzRegime(p){
  const v = p.genehmigung.verfahren;
  const art = v.anlagenart;
  const mw = Number(p.netz && p.netz.leistungMw);
  const speicher = art==='bess' || art==='pv-bess';
  if(speicher){
    return {
      titel:'§ 17 EnWG — KraftNAV nicht anwendbar',
      norm:'§ 1 Abs. 1 Satz 2 KraftNAV (Änderungsverordnung vom 23.12.2025)',
      text:'Energiespeicheranlagen sind seit dem 23.12.2025 ausdrücklich vom Anwendungsbereich der KraftNAV ausgenommen. Damit entfallen für Großbatteriespeicher das Windhundprinzip und die gesetzlichen Fristen der KraftNAV; der Netzanschluss richtet sich nach § 17 EnWG. Die Übertragungsnetzbetreiber führen dafür ein Reifegradverfahren ein, das Projekte nach Grundstückssicherung, Genehmigungsstand, technischer und wirtschaftlicher Machbarkeit bewertet.',
      warn:'Nach § 17 EnWG darf der Netzbetreiber den Anschluss verweigern, wenn er Versorgungsengpässe plausibel darlegt — die Bundesnetzagentur hat eine solche Ablehnung im Mai 2026 bestätigt. Netzkapazität ist damit ein echtes Projektrisiko und keine Formalie.',
      punkte:[
        'Reifegradverfahren der ÜNB: Antragspauschale 50.000 €, Kaution 1.500 € je MW (auf den Baukostenzuschuss anrechenbar).',
        'Co-Location: Ein Speicher hinter einem bestehenden Netzverknüpfungspunkt darf nicht allein mit Kapazitätsmangel abgelehnt werden, solange die maximale Netzanschlusskapazität unverändert bleibt.',
        '§ 11c EnWG: Errichtung und Betrieb von Energiespeicheranlagen liegen im überragenden öffentlichen Interesse — als Abwägungsbelang, nicht als absoluter Vorrang.',
        '§ 118 Abs. 6 EnWG: 20 Jahre Netzentgeltbefreiung für die Rückspeisung bei Inbetriebnahme bis zum 04.08.2029. Die Bundesnetzagentur arbeitet an einer Neuregelung (AgNeS).',
      ] };
  }
  if(Number.isFinite(mw) && mw >= 100){
    return {
      titel:'KraftNAV — Erzeugungsanlage ab 100 MW',
      norm:'§ 1 Abs. 1 KraftNAV',
      text:'Erzeugungsanlagen mit einer Nennleistung ab 100 MW an Netzen ab 110 kV fallen weiterhin unter die KraftNAV, mit ihrem Verfahren und ihren gesetzlichen Fristen.',
      punkte:['Voraussetzung ist der Anschluss an ein Netz mit mindestens 110 kV — bei Anschluss im Mittelspannungsnetz gilt die Verordnung nicht.'] };
  }
  return {
    titel:'§ 8 EEG in Verbindung mit § 17 EnWG',
    norm:'§ 8 EEG, § 17 EnWG',
    text:'Regelfall für PV-Freiflächenanlagen: Anschlusspflicht des Netzbetreibers am technisch und wirtschaftlich günstigsten Verknüpfungspunkt. Die KraftNAV greift erst ab 100 MW Nennleistung und einem Netz ab 110 kV.',
    punkte:['Mehrere Netzbetreiber führen inzwischen eigene stichtags- und reifegradbasierte Vergabeverfahren für größere Anschlüsse ein — beim zuständigen Betreiber erfragen.'] };
}

function renderFoerderrahmen(){
  const p = getActiveProject();
  const root = document.getElementById('gen-foerderrahmen'); if(!root) return;
  if(!p){ root.innerHTML = ''; return; }
  const v = p.genehmigung.verfahren;
  const def = eegFlaecheDef(v.eegKategorie);
  const mwp = Number(v.eegLeistungMwp);
  const regime = netzRegime(p);

  // Der 200/500-Konflikt: förderfähig, aber nicht privilegiert.
  const eegAbstand = Number(v.eegAbstandM);
  let korridorHinweis = '';
  if(def && def.korridor && Number.isFinite(eegAbstand)){
    if(eegAbstand > EEG_KORRIDOR_M)
      korridorHinweis = `<div class="pane-hint" style="border-left:3px solid #c1121f;margin-bottom:0"><b>Außerhalb der Förderkulisse.</b> ${eegAbstand.toLocaleString('de-DE')} m überschreiten die 500 m des ${escapeHtml(def.norm)}. Über diesen Tatbestand ist die Fläche nicht förderfähig.</div>`;
    else if(eegAbstand > BAUGB_KORRIDOR_M)
      korridorHinweis = `<div class="pane-hint" style="border-left:3px solid #c9861f;margin-bottom:0"><b>Förderfähig, aber nicht privilegiert.</b> ${eegAbstand.toLocaleString('de-DE')} m liegen innerhalb der 500-m-Förderkulisse des EEG, aber außerhalb des 200-m-Korridors des § 35 Abs. 1 Nr. 8 lit. b BauGB. Die Fläche ist damit ausschreibungsfähig, braucht planungsrechtlich aber einen Bebauungsplan.</div>`;
    else
      korridorHinweis = `<div class="pane-hint" style="border-left:3px solid var(--accent);margin-bottom:0"><b>Beide Kulissen erfüllt.</b> ${eegAbstand.toLocaleString('de-DE')} m liegen innerhalb des 200-m-Korridors (Privilegierung) und damit zugleich innerhalb der 500-m-Förderkulisse.</div>`;
  }

  const biodiv = Number(v.eegBiodivAnzahl);
  const biodivHinweis = (def && def.biodiv && Number.isFinite(biodiv))
    ? (biodiv >= EEG_BIODIV_MINDESTENS
        ? `<span class="pill ok">${biodiv} von 5 Kriterien — erfüllt</span>`
        : `<span class="pill warn">${biodiv} von 5 Kriterien — mindestens ${EEG_BIODIV_MINDESTENS} erforderlich</span>`)
    : '';

  root.innerHTML = `
    <div class="card-head" style="margin-top:0">
      <strong>EEG-Förderkulisse${infoBtn('Ob die Fläche gebaut werden darf, entscheidet das BauGB. Ob sie Geld verdient, entscheidet die Flächenkulisse des § 37 EEG. Beides fällt <b>nicht</b> zusammen — die häufigste Verwechslung ist der Korridor an Autobahn und Schiene: das EEG fördert bis 500 m, privilegiert ist nur der 200-m-Streifen.')}</strong>
      ${Number.isFinite(mwp) && mwp > 0
        ? (mwp > EEG_AUSSCHREIBUNG_AB_MW
            ? '<span class="pill phase">ausschreibungspflichtig</span>'
            : '<span class="pill">unter der Ausschreibungsschwelle</span>')
        : ''}
    </div>
    <div class="grid2" style="max-width:none">
      <div><label>Flächenkategorie${def ? infoBtn('<b>'+def.norm+'</b>'+(def.hinweis?' — '+def.hinweis:'')
            + (def.optout ? ' Seit dem Solarpaket I sind benachteiligte Gebiete bundesweit freigegeben (Opt-out statt Opt-in). Ein Land kann nur einschränken, wenn auf mehr als 1 % seiner landwirtschaftlich genutzten Fläche bereits Freiflächenanlagen stehen — ab 2031 1,5 %.' : '')
            + (def.biodiv ? ' Zusätzlich verlangt § 37 Abs. 1a EEG mindestens '+EEG_BIODIV_MINDESTENS+' von 5 Biodiversitätskriterien.' : '')) : ''}</label>
        <select id="eeg-kategorie">
          <option value="">— noch nicht zugeordnet —</option>
          ${EEG_FLAECHEN.map(x => `<option value="${escapeAttr(x.id)}"${v.eegKategorie===x.id?' selected':''}>${escapeHtml(x.label)}</option>`).join('')}
        </select></div>
      <div><label>Installierte Leistung (MWp)${infoBtn('Ab mehr als '+EEG_AUSSCHREIBUNG_AB_MW+' MW ist die Anlage ausschreibungspflichtig (§ 37 EEG, erstes Segment).')}</label>
        <input type="number" step="0.1" id="eeg-leistung" value="${v.eegLeistungMwp ?? ''}" placeholder="z.B. 12,5" /></div>
      ${def && def.korridor ? `<div><label>Abstand zum Fahrbahn-/Gleisrand (m)
          <span class="pill">EEG 500 m</span><span class="pill">BauGB 200 m</span></label>
        <input type="number" id="eeg-abstand" value="${v.eegAbstandM ?? ''}" /></div>` : ''}
      ${def && def.biodiv ? `<div><label>Erfüllte Biodiversitätskriterien ${biodivHinweis}</label>
        <input type="number" min="0" max="5" id="eeg-biodiv" value="${v.eegBiodivAnzahl ?? ''}" placeholder="0–5" /></div>` : ''}
      <div><label>Kommunalbeteiligung § 6 EEG vereinbart am${infoBtn(EEG_KOMMUNAL_CT.toLocaleString('de-DE')+' ct je eingespeister Kilowattstunde an die Standortgemeinde. Eine <b>Soll</b>-Vorschrift, also freiwillig — in der kommunalen Abstimmung aber regelmäßig das entscheidende Argument. Die Vereinbarung kann bereits vor der Genehmigung geschlossen werden.')}</label>
        <input type="date" id="eeg-kommunal" value="${escapeAttr(v.kommunalabgabeAm||'')}" /></div>
    </div>
    ${korridorHinweis}

    <div class="card-head" style="margin-top:16px">
      <strong>Netzanschluss${infoBtn('Wird aus Anlagenart und Leistung abgeleitet: Batteriespeicher laufen seit dem 23.12.2025 über § 17 EnWG, Erzeugungsanlagen ab 100 MW an Netzen ab 110 kV weiter über die KraftNAV, alles andere über § 8 EEG.')}</strong>
      <span class="pill phase">${escapeHtml(regime.norm)}</span>
    </div>
    <div style="font-size:12px;line-height:1.55"><b>${escapeHtml(regime.titel)}</b> — ${escapeHtml(regime.text)}</div>
    ${regime.warn ? `<div class="pane-hint" style="border-left:3px solid #c9861f">${escapeHtml(regime.warn)}</div>` : ''}
    <details class="fold" style="margin:10px 0 0;box-shadow:none">
      <summary><span class="fold-title">Was daraus folgt</span><span class="fold-status">${regime.punkte.length} Punkte</span></summary>
      <div class="fold-body"><ul style="margin:10px 0 0;padding-left:18px;font-size:12px;line-height:1.6;color:var(--muted)">
        ${regime.punkte.map(x => `<li>${escapeHtml(x)}</li>`).join('')}
      </ul></div>
    </details>`;

  const bindEeg = (id, key, num) => {
    const el = document.getElementById(id); if(!el) return;
    el.addEventListener(el.tagName==='SELECT'||el.type==='date' ? 'change' : 'input', () => {
      const p2 = getActiveProject(); if(!p2) return;
      p2.genehmigung.verfahren[key] = num ? (el.value===''?null:Number(el.value)) : (el.value || null);
      touchActiveProject(); saveProjects();
      // Kategorie und Zahlen ändern die eingeblendeten Felder bzw. die Auswertung
      if(el.tagName==='SELECT' || num) renderFoerderrahmen();
    });
  };
  bindEeg('eeg-kategorie','eegKategorie');
  bindEeg('eeg-leistung','eegLeistungMwp', true);
  bindEeg('eeg-abstand','eegAbstandM', true);
  bindEeg('eeg-biodiv','eegBiodivAnzahl', true);
  bindEeg('eeg-kommunal','kommunalabgabeAm');
}

// =============================================================================
// Info-Button und Aufklapp-Abschnitt
// -----------------------------------------------------------------------------
// Die Reiter waren mit Erklärkästen zugewachsen: allein die Genehmigungsplanung zeigte
// vierzehn davon gleichzeitig, zusammen über 800 Wörter, bevor die erste Eingabe sichtbar
// wurde. Fachlich war jeder Satz richtig — aber wer ein Datum eintragen will, liest sie beim
// zweiten Mal nicht mehr und muss trotzdem daran vorbeiscrollen.
//
// Deshalb zwei Bausteine:
//   infoBtn(text)  — der Text wandert hinter ein „i" und erscheint auf Klick als Popover.
//                    Sichtbar bleibt nur, DASS es eine Erläuterung gibt.
//   foldHtml(...)  — Abschnitte, die im geschlossenen Zustand ihren Status in der Kopfzeile
//                    tragen. Zum Nachsehen genügt der Blick, aufklappen muss man nur zum
//                    Bearbeiten.
// =============================================================================

// Baut den Auslöser. `text` darf einfaches HTML enthalten (b, code, br).
function infoBtn(text, label){
  return `<button type="button" class="info-btn" aria-expanded="false"
    aria-label="${escapeAttr(label || 'Erläuterung anzeigen')}"
    data-info="${escapeAttr(text)}">i</button>`;
}

(function initInfoPopover(){
  const pop = document.getElementById('info-pop');
  let offen = null;

  function schliessen(){
    if(!offen) return;
    offen.setAttribute('aria-expanded','false');
    offen = null;
    pop.classList.add('hidden');
  }

  function oeffnen(btn){
    // data-info kommt aus escapeAttr, enthält also &lt;b&gt; statt <b> — hier bewusst
    // wieder als Markup interpretieren, damit Hervorhebungen im Popover wirken.
    pop.innerHTML = btn.dataset.info
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
    pop.classList.remove('hidden');
    btn.setAttribute('aria-expanded','true');
    offen = btn;

    // Unter dem Button ausrichten und im Viewport halten.
    const r = btn.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    const rand = 10;
    let left = r.left + r.width/2 - box.width/2;
    left = Math.max(rand, Math.min(left, window.innerWidth - box.width - rand));
    // Bevorzugt unter dem Button, sonst darüber. Anschließend in jedem Fall in den Viewport
    // klemmen: der Auslöser kann durch Scrollen oder eine Layoutänderung auch außerhalb
    // liegen, und dann wäre die reine „oben statt unten"-Wahl immer noch daneben. Die
    // begrenzte max-height stellt sicher, dass die Klemmung nicht in sich unmöglich wird.
    let top = r.bottom + 7;
    if(top + box.height > window.innerHeight - rand) top = r.top - box.height - 7;
    top = Math.max(rand, Math.min(top, window.innerHeight - box.height - rand));
    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';
  }

  // Delegiert: die Buttons entstehen laufend neu aus innerHTML-Rendering.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.info-btn');
    if(btn){
      e.preventDefault(); e.stopPropagation();
      if(offen === btn) schliessen(); else { schliessen(); oeffnen(btn); }
      return;
    }
    if(!e.target.closest('#info-pop')) schliessen();
  });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') schliessen(); });
  // Beim Scrollen mitzuwandern wäre teuer und unruhig — schließen ist ehrlicher.
  window.addEventListener('scroll', schliessen, true);
  window.addEventListener('resize', schliessen);
})();

// Aufklapp-Abschnitt. `status` erscheint rechts in der Kopfzeile und beantwortet die Frage,
// die den Anwender zum Aufklappen verleiten würde.
function foldHtml(id, titel, status, inhalt, opts){
  const o = opts || {};
  return `<details class="fold" id="${escapeAttr(id)}"${o.open?' open':''}>
    <summary>
      <span class="fold-title">${escapeHtml(titel)}${o.info ? infoBtn(o.info) : ''}</span>
      <span class="fold-status" id="${escapeAttr(id)}-status">${status||''}</span>
    </summary>
    <div class="fold-body">${inhalt}</div>
  </details>`;
}
// Status nachträglich aktualisieren, ohne den Abschnitt neu zu bauen (sonst klappt er zu).
function setFoldStatus(id, html){
  const el = document.getElementById(id+'-status');
  if(el) el.innerHTML = html || '';
}

// Statuszeilen der Aufklapp-Abschnitte im Genehmigungs-Reiter. Sie beantworten genau die
// Frage, für die man sonst aufklappen müsste — damit bleibt der Reiter überschaubar, ohne
// Information zu verstecken.
function renderGenehmigungFoldStatus(){
  const p = getActiveProject(); if(!p) return;
  const g = p.genehmigung, v = g.verfahren;
  const grau = t => `<span style="color:var(--muted)">${escapeHtml(t)}</span>`;

  // Notizen: wie viele der vier Freitextfelder gefüllt sind
  const notizen = [p.timeline, g.behoerde, g.verfahrensstand, g.fristen].filter(x => (x||'').trim()).length;
  setFoldStatus('fold-ueberblick', notizen ? `${notizen} von 4 gefüllt` : grau('leer'));

  // Einvernehmen: Status plus Restfrist der Zwei-Monats-Fiktion
  const einvLabel = { offen:'offen', ersucht:'Ersuchen gestellt', erteilt:'erteilt',
                      fiktion:'als erteilt (Fiktion)', verweigert:'verweigert' }[v.einvernehmenStatus] || 'offen';
  let einvExtra = '';
  if(v.einvernehmenAm && !['erteilt','verweigert'].includes(v.einvernehmenStatus)){
    const d = new Date(v.einvernehmenAm + 'T12:00:00'); d.setMonth(d.getMonth() + 2);
    const iso = d.toISOString().slice(0,10), tage = daysUntil(iso);
    einvExtra = ` <span class="${fristPillClass(iso,14)}">${tage<0?'Frist abgelaufen':tage+' Tage'}</span>`;
  }
  setFoldStatus('gen-block-einvernehmen',
    (v.einvernehmenStatus==='verweigert' ? `<span class="pill warn">${einvLabel}</span>`
     : ['erteilt','fiktion'].includes(v.einvernehmenStatus) ? `<span class="pill ok">${einvLabel}</span>`
     : escapeHtml(einvLabel)) + einvExtra);

  // Vorbescheid
  const vbErg = { positiv:'positiv', 'positiv-auflagen':'positiv unter Auflagen', negativ:'negativ' }[v.vorbescheidErgebnis];
  setFoldStatus('gen-block-vorbescheid', !v.vorbescheidGenutzt ? grau('nicht genutzt')
    : vbErg ? `<span class="pill ${v.vorbescheidErgebnis==='negativ'?'warn':'ok'}">${escapeHtml(vbErg)}</span>`
    : (v.vorbescheidEingereichtAm ? 'eingereicht ' + escapeHtml(fmtDate(v.vorbescheidEingereichtAm)) : 'vorgesehen'));

  // Auflagen
  const aufl = g.auflagen || [];
  const auflDone = aufl.filter(a => a.erledigt).length;
  const auflVorBau = aufl.filter(a => a.faelligVorBaubeginn && !a.erledigt).length;
  setFoldStatus('fold-auflagen', !aufl.length ? grau('keine erfasst')
    : `${auflDone} von ${aufl.length} erledigt` + (auflVorBau ? ` <span class="pill warn">${auflVorBau} vor Baubeginn offen</span>` : ''));

  // Fristen: die nächste, die noch aussteht
  const fr = (g.fristenListe || []).filter(f => f.datum).sort((a,b) => a.datum.localeCompare(b.datum));
  const naechste = fr.find(f => daysUntil(f.datum) >= 0) || fr[fr.length-1];
  setFoldStatus('fold-fristen', !fr.length ? grau((g.fristenListe||[]).length ? 'ohne Datum' : 'keine erfasst')
    : `nächste: ${escapeHtml(fmtDate(naechste.datum))} <span class="${fristPillClass(naechste.datum,21)}">${daysUntil(naechste.datum)<0?'überfällig':daysUntil(naechste.datum)+' Tage'}</span>`);

  // Förderrahmen: Flächenkategorie und Netzanschluss-Regime in Kurzform
  const kat = eegFlaecheDef(v.eegKategorie);
  const reg = netzRegime(p);
  setFoldStatus('fold-foerderrahmen',
    (kat ? escapeHtml(kat.norm) : grau('Fläche nicht zugeordnet')) + ' · ' + escapeHtml(reg.norm.split('(')[0].trim()));

  // Gutachten
  const zeilen = gutachtenZeilen(p);
  const noetig = zeilen.filter(z => z.e.erforderlich==='ja');
  const erhalten = noetig.filter(z => z.status==='erledigt').length;
  setFoldStatus('fold-gutachten', !noetig.length ? grau('keine als erforderlich markiert')
    : `${erhalten} von ${noetig.length} erhalten` + (erhalten===noetig.length ? ' <span class="pill ok">vollständig</span>' : ''));

  setFoldStatus('fold-gutachterinfo', (p.notes||'').trim() ? 'gepflegt' : grau('leer'));
}

// =============================================================================
// Beteiligte: Behörden, Gemeinde, Netzbetreiber und externe Planer
// -----------------------------------------------------------------------------
// Bis hierher steckten Ansprechpartner verstreut in Einzelfeldern — die Behörde als
// Freitext im Genehmigungs-Reiter, der B-Planer in zwei Feldern, der Netzbetreiber
// wieder woanders — und für alles andere (Untere Naturschutzbehörde, Sachbearbeiter im
// Bauamt, Netzmeister vor Ort) gab es gar keinen Platz. Wer nach drei Monaten wissen
// wollte, mit wem er zuletzt gesprochen hat, fand es nicht.
//
// Ein Eintrag ist eine Organisation mit beliebig vielen Ansprechpartnern. Die Rollen sind
// vorgegeben, aber frei ergänzbar: die Vorgabe spart Tipparbeit und macht die Liste über
// Projekte hinweg vergleichbar, ohne den Sonderfall auszuschließen.
// =============================================================================
const BETEILIGTEN_ROLLEN = {
  genehmigung: [
    'Untere Bauaufsichtsbehörde', 'Kreisverwaltung', 'Gemeinde / Stadt', 'Bürgermeister',
    'Untere Naturschutzbehörde', 'Denkmalschutzbehörde', 'Immissionsschutzbehörde',
    'Wasserbehörde', 'Landwirtschaftsbehörde', 'Straßenbaulastträger',
    'B-Planer / Landschaftsarchitekt', 'Architekt (Bauvorlageberechtigung)',
    'Gutachterbüro', 'Rechtsanwalt', 'Sonstige',
  ],
  netz: [
    'Verteilnetzbetreiber', 'Übertragungsnetzbetreiber', 'Netzmeister (vor Ort)',
    'Umspannwerk-Betreiber', 'Tiefbauunternehmen', 'Direktvermarkter', 'Sonstige',
  ],
};
const BETEILIGTEN_BEREICHE = Object.keys(BETEILIGTEN_ROLLEN);

function beteiligteFuer(p, bereich){
  return (p.beteiligte || []).filter(b => b.bereich === bereich);
}

function renderBeteiligte(bereich){
  const p = getActiveProject();
  const list = document.getElementById('bet-'+bereich+'-list');
  const empty = document.getElementById('bet-'+bereich+'-empty');
  const sel = document.getElementById('bet-'+bereich+'-rolle');
  if(!list || !empty || !sel) return;

  if(!sel.options.length){
    sel.innerHTML = BETEILIGTEN_ROLLEN[bereich]
      .map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('');
  }

  const rows = p ? beteiligteFuer(p, bereich) : [];
  empty.style.display = rows.length ? 'none' : '';
  list.innerHTML = rows.map(b => {
    const ap = b.personen.map(x => `<tr>
        <td><input type="text" data-bid="${escapeAttr(b.id)}" data-pid="${escapeAttr(x.id)}" data-k="name" value="${escapeAttr(x.name)}" placeholder="Name" /></td>
        <td><input type="text" data-bid="${escapeAttr(b.id)}" data-pid="${escapeAttr(x.id)}" data-k="funktion" value="${escapeAttr(x.funktion)}" placeholder="Funktion / Sachgebiet" /></td>
        <td><input type="text" data-bid="${escapeAttr(b.id)}" data-pid="${escapeAttr(x.id)}" data-k="telefon" value="${escapeAttr(x.telefon)}" placeholder="Telefon" /></td>
        <td><input type="email" data-bid="${escapeAttr(b.id)}" data-pid="${escapeAttr(x.id)}" data-k="email" value="${escapeAttr(x.email)}" placeholder="E-Mail" /></td>
        <td style="white-space:nowrap">
          ${x.email ? `<a class="secondary small" style="display:inline-block;padding:3px 8px;border-radius:7px;border:1px solid var(--border-strong);text-decoration:none;color:var(--text)" href="mailto:${escapeAttr(x.email)}">Mail</a>` : ''}
          <button class="danger small" data-del-person="${escapeAttr(x.id)}" data-bid="${escapeAttr(b.id)}" title="Ansprechpartner entfernen">×</button>
        </td>
      </tr>`).join('');
    return `<details class="fold" data-bet="${escapeAttr(b.id)}">
      <summary>
        <span class="fold-title"><b>${escapeHtml(b.organisation || '(Organisation offen)')}</b>
          <span class="pill" style="margin-left:6px">${escapeHtml(b.rolle || 'ohne Rolle')}</span></span>
        <span class="fold-status">${b.personen.length
            ? escapeHtml(b.personen.map(x => x.name).filter(Boolean).join(', ') || b.personen.length+' Ansprechpartner')
            : '<span style="color:var(--muted)">kein Ansprechpartner</span>'}</span>
      </summary>
      <div class="fold-body">
        <div class="grid2" style="max-width:none">
          <div><label>Organisation</label><input type="text" data-bid="${escapeAttr(b.id)}" data-bk="organisation" value="${escapeAttr(b.organisation)}" placeholder="z.B. Kreisverwaltung Trier-Saarburg" /></div>
          <div><label>Rolle</label><input type="text" data-bid="${escapeAttr(b.id)}" data-bk="rolle" value="${escapeAttr(b.rolle)}" list="bet-rollen-${escapeAttr(bereich)}" /></div>
          <div><label>Straße</label><input type="text" data-bid="${escapeAttr(b.id)}" data-bk="strasse" value="${escapeAttr(b.strasse)}" /></div>
          <div><label>PLZ / Ort</label>
            <span style="display:flex;gap:6px">
              <input type="text" data-bid="${escapeAttr(b.id)}" data-bk="plz" value="${escapeAttr(b.plz)}" placeholder="PLZ" style="width:80px" />
              <input type="text" data-bid="${escapeAttr(b.id)}" data-bk="ort" value="${escapeAttr(b.ort)}" placeholder="Ort" />
            </span></div>
          <div><label>Aktenzeichen</label><input type="text" data-bid="${escapeAttr(b.id)}" data-bk="aktenzeichen" value="${escapeAttr(b.aktenzeichen)}" placeholder="z.B. 63-2026-0417" /></div>
          <div><label>Notiz</label><input type="text" data-bid="${escapeAttr(b.id)}" data-bk="notiz" value="${escapeAttr(b.notiz)}" /></div>
        </div>
        <div class="card-head" style="margin-top:12px">
          <strong style="font-size:12px">Ansprechpartner</strong>
          <span style="display:flex;gap:6px">
            <button class="secondary small" data-add-person="${escapeAttr(b.id)}">+ Ansprechpartner</button>
            <button class="danger small" data-del-bet="${escapeAttr(b.id)}">Eintrag löschen</button>
          </span>
        </div>
        ${b.personen.length
          ? `<table class="vergleich-table"><tr><th>Name</th><th>Funktion</th><th>Telefon</th><th>E-Mail</th><th></th></tr>${ap}</table>`
          : '<div class="empty" style="padding:10px">Noch kein Ansprechpartner hinterlegt.</div>'}
      </div>
    </details>`;
  }).join('') + `<datalist id="bet-rollen-${escapeAttr(bereich)}">${
      BETEILIGTEN_ROLLEN[bereich].map(r => `<option value="${escapeAttr(r)}"></option>`).join('')}</datalist>`;

  // --- Bindungen ---
  const finde = id => (getActiveProject().beteiligte || []).find(x => x.id === id);
  list.querySelectorAll('[data-bk]').forEach(inp => {
    inp.addEventListener('input', () => {
      const b = finde(inp.dataset.bid); if(!b) return;
      b[inp.dataset.bk] = inp.value;
      touchActiveProject(); saveProjects();
      aktualisiereBeteiligtenKopf(b);
    });
  });
  list.querySelectorAll('[data-pid]').forEach(inp => {
    inp.addEventListener('input', () => {
      const b = finde(inp.dataset.bid); if(!b) return;
      const per = b.personen.find(x => x.id === inp.dataset.pid); if(!per) return;
      per[inp.dataset.k] = inp.value;
      touchActiveProject(); saveProjects();
      aktualisiereBeteiligtenKopf(b);
    });
  });
  list.querySelectorAll('[data-add-person]').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = finde(btn.dataset.addPerson); if(!b) return;
      b.personen.push({ id:'ap'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
                        name:'', funktion:'', telefon:'', email:'' });
      touchActiveProject(); saveProjects();
      renderBeteiligte(bereich);
      // Der neu gerenderte Abschnitt ist zu — wieder öffnen und ins Namensfeld springen.
      const det = list.querySelector(`details[data-bet="${b.id}"]`);
      if(det){ det.open = true; const f = det.querySelector('input[data-k="name"][value=""]'); if(f) f.focus(); }
    });
  });
  list.querySelectorAll('[data-del-person]').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = finde(btn.dataset.bid); if(!b) return;
      b.personen = b.personen.filter(x => x.id !== btn.dataset.delPerson);
      touchActiveProject(); saveProjects();
      renderBeteiligte(bereich);
      const det = list.querySelector(`details[data-bet="${b.id}"]`); if(det) det.open = true;
    });
  });
  list.querySelectorAll('[data-del-bet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      const b = finde(btn.dataset.delBet); if(!b) return;
      if(!confirm(`„${b.organisation || b.rolle || 'Eintrag'}" mit ${b.personen.length} Ansprechpartner(n) löschen?`)) return;
      p2.beteiligte = p2.beteiligte.filter(x => x.id !== b.id);
      touchActiveProject(); saveProjects();
      renderBeteiligte(bereich); renderNavBadges(p2);
    });
  });
}

// Kopfzeile eines Eintrags aktualisieren, ohne die ganze Liste neu zu bauen — sonst
// klappt der gerade bearbeitete Abschnitt bei jedem Tastendruck zu.
function aktualisiereBeteiligtenKopf(b){
  const det = document.querySelector(`details[data-bet="${b.id}"]`); if(!det) return;
  const titel = det.querySelector('.fold-title');
  const status = det.querySelector('.fold-status');
  if(titel) titel.innerHTML = `<b>${escapeHtml(b.organisation || '(Organisation offen)')}</b>`
    + `<span class="pill" style="margin-left:6px">${escapeHtml(b.rolle || 'ohne Rolle')}</span>`;
  if(status) status.innerHTML = b.personen.length
    ? escapeHtml(b.personen.map(x => x.name).filter(Boolean).join(', ') || b.personen.length+' Ansprechpartner')
    : '<span style="color:var(--muted)">kein Ansprechpartner</span>';
}

BETEILIGTEN_BEREICHE.forEach(bereich => {
  const btn = document.getElementById('bet-'+bereich+'-add');
  if(!btn) return;
  // Rollen einmal beim Start füllen. Bisher geschah das erst in renderBeteiligte() — wer
  // den Unterreiter noch nie geöffnet hatte, legte über den Button einen Eintrag ohne
  // Rolle an, weil das Auswahlfeld leer war.
  const sel0 = document.getElementById('bet-'+bereich+'-rolle');
  if(sel0 && !sel0.options.length){
    sel0.innerHTML = BETEILIGTEN_ROLLEN[bereich]
      .map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('');
  }
  btn.addEventListener('click', () => {
    const p = getActiveProject(); if(!p) return;
    const rolle = document.getElementById('bet-'+bereich+'-rolle').value;
    const neu = normalizeBeteiligter({ bereich, rolle });
    p.beteiligte.push(neu);
    touchActiveProject(); saveProjects();
    renderBeteiligte(bereich); renderNavBadges(p);
    const det = document.querySelector(`details[data-bet="${neu.id}"]`);
    if(det){ det.open = true; const f = det.querySelector('input[data-bk="organisation"]'); if(f) f.focus(); }
    logAction(p, `Beteiligten angelegt: ${rolle}`);
  });
});
