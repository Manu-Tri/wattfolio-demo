// Gutachten-Übersicht und Verfahrenswege im Baurecht
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// =============================================================================
// Gutachten-Uebersicht (Genehmigungsplanung)
// -----------------------------------------------------------------------------
// Bislang lagen die Gutachten an zwei Orten, die nichts voneinander wussten: die fuenf fest
// im Prozess verankerten (Artenschutz, Umweltbericht, Brandschutz, Blend, Baugrund) als
// Dokumentenzeilen im Prozess-Reiter, und ein globaler Katalog von Gutachten-Typen, der nur
// dem Erzeugen von Anfrage-Mails diente. Keiner der beiden beantwortete die eigentliche Frage
// des Projektentwicklers: "Welche Gutachten braucht DIESES Projekt, warum, bei wem liegen sie
// und was kosten sie?" Genau das ist diese Tabelle. Der Status wird nicht doppelt gepflegt,
// sondern aus der Dokumentenablage abgeleitet (dokuDerivedState), damit ein hochgeladenes
// Gutachten hier ohne Zutun als "erhalten" erscheint.
// =============================================================================
const GUTACHTEN_KATALOG = [
  { id:'artenschutz', name:'Artenschutzrechtlicher Fachbeitrag (saP)', doku:'artenschutz', typ:'arten', regel:'immer',
    anlass:'Pflichtbestandteil des B-Plan-Verfahrens (§ 44 BNatSchG). Ergebnis kann CEF-Maßnahmen auslösen — die vor Baubeginn umgesetzt sein müssen.' },
  { id:'umweltbericht', name:'Umweltbericht / UVP-Vorprüfung', doku:'umweltbericht', typ:'umwelt', regel:'immer',
    bplanGebunden:true,
    anlass:'Teil der Begründung des Bebauungsplans. Kann A&E-Maßnahmen bzw. einen Ökopunktevertrag nach sich ziehen.' },
  { id:'brandschutz', name:'Brandschutzkonzept', doku:'brandschutz', regel:'immer',
    anlass:'Für die Baugenehmigung. Enthält bauliche, anlagentechnische und organisatorische Maßnahmen.' },
  { id:'baugrund', name:'Baugrund- / Bodengutachten', doku:'baugrund', typ:'boden', regel:'immer',
    anlass:'Tragfähigkeit, Rammbarkeit, Erdung, Frosttiefe. Setzt die Kampfmittelauskunft und ggf. eine Sondierung voraus.' },
  { id:'altlast', name:'Altlastenrecherche', doku:'altlasten', typ:'altlast', regel:'immer',
    anlass:'Auszug aus dem Altlastenkataster. Gravierende Funde sind ein Abbruchgrund innerhalb der Rücktrittsfrist.' },
  { id:'blend', name:'Blendgutachten', doku:'blend', typ:'blend', regel:'bedingt',
    anlass:'Erforderlich bei angrenzender Wohnbebauung, Straße, Schiene oder Flughafen. Kann einen Blendschutz auslösen.' },
  { id:'schall', name:'Schallgutachten (Trafo / Wechselrichter)', typ:'schall', regel:'bedingt',
    anlass:'Nur bei nahegelegener Wohnbebauung — Immissionsrichtwerte der TA Lärm.' },
  { id:'landschaft', name:'Landschaftsbild / Eingriffsbilanz', typ:'landschaft', regel:'bedingt',
    anlass:'Wenn die Untere Naturschutzbehörde eine gesonderte Bewertung fordert; ggf. inkl. Visualisierung.' },
  { id:'archaeo', name:'Archäologische Voruntersuchung', typ:'archaeo', regel:'bedingt',
    anlass:'Bei Verdachtsflächen oder Auflage der Landesdenkmalpflege — Prospektion vor Rammarbeiten.' },
  { id:'denkmal', name:'Denkmalschutzrechtliche Stellungnahme', typ:'denkmal', regel:'bedingt',
    anlass:'Bei Sichtachsen zu Denkmälern oder Umgebungsschutz.' },
  { id:'wasser', name:'Wasserrechtliche Stellungnahme', typ:'wasser', regel:'bedingt',
    anlass:'Bei Wasserschutz- oder Überschwemmungsgebieten — wird häufig über die TÖB-Beteiligung ausgelöst.' },
  { id:'verkehr', name:'Verkehrstechnische Erschließung', typ:'verkehr', regel:'bedingt',
    anlass:'Wenn Zuwegung für Bau und Betrieb nicht offensichtlich gesichert ist (Feuerwehr, Schwerlast).' },
];
const gutachtenDef = id => GUTACHTEN_KATALOG.find(g => g.id===id) || null;
// Vorbelegung: alles, was ohnehin fuer jedes Freiflaechenprojekt anfaellt.
const GUTACHTEN_STANDARD = GUTACHTEN_KATALOG.filter(g => g.regel==='immer').map(g => g.id);

function getGutachtenEintrag(p, id){
  if(!p.gutachten) p.gutachten = {};
  p.gutachten[id] = Object.assign(
    { aufgenommen:false, erforderlich:'ja', buero:'', beauftragtAm:null, angebotEur:null,
      erwartetAm:null, notiz:'' },
    p.gutachten[id] || {});
  return p.gutachten[id];
}
// Sichtbare Zeilen: die Standardgutachten plus alles, was manuell aufgenommen wurde.
function gutachtenZeilen(p){
  return GUTACHTEN_KATALOG
    .filter(g => GUTACHTEN_STANDARD.includes(g.id) || getGutachtenEintrag(p, g.id).aufgenommen)
    .map(g => ({ def:g, e:getGutachtenEintrag(p, g.id),
                 status: g.doku ? dokuDerivedState(p, g.doku) : null }));
}
const GUTACHTEN_ERFORDERLICH = [['ja','erforderlich'],['pruefen','zu prüfen'],['nein','nicht erforderlich']];

function renderGutachtenTabelle(){
  const p = getActiveProject();
  const wrap = document.getElementById('gutachten-table-wrap'); if(!wrap) return;
  const sel = document.getElementById('gutachten-add');
  if(!p){ wrap.innerHTML = ''; return; }

  // Auswahlliste: nur noch nicht aufgenommene Gutachten
  const offen = GUTACHTEN_KATALOG.filter(g => !GUTACHTEN_STANDARD.includes(g.id) && !getGutachtenEintrag(p, g.id).aufgenommen);
  sel.innerHTML = offen.length
    ? offen.map(g => `<option value="${escapeAttr(g.id)}">${escapeHtml(g.name)}</option>`).join('')
    : '<option value="">— alle aufgenommen —</option>';
  sel.disabled = document.getElementById('btn-gutachten-add').disabled = !offen.length;

  const zeilen = gutachtenZeilen(p);
  const wegAkt = verfahrensweg(p);
  const ohneBplan = !!wegAkt && !wegAkt.bplan;
  const noetig = zeilen.filter(z => z.e.erforderlich==='ja');
  const beauftragt = noetig.filter(z => z.e.beauftragtAm || z.status==='laufend' || z.status==='erledigt');
  const erhalten = noetig.filter(z => z.status==='erledigt');
  const honorar = zeilen.reduce((s,z) => s + (Number(z.e.angebotEur)||0), 0);
  document.getElementById('gut-stat-erforderlich').textContent = noetig.length || '—';
  document.getElementById('gut-stat-beauftragt').textContent  = noetig.length ? `${beauftragt.length} / ${noetig.length}` : '—';
  document.getElementById('gut-stat-erhalten').textContent    = noetig.length ? `${erhalten.length} / ${noetig.length}` : '—';
  document.getElementById('gut-stat-honorar').textContent     = honorar ? honorar.toLocaleString('de-DE',{maximumFractionDigits:0}) + ' €' : '—';

  wrap.innerHTML = `<table class="vergleich-table">
    <tr><th>Gutachten</th><th>Erforderlich</th><th>Büro / Gutachter</th><th>Beauftragt am</th><th>Honorar</th><th>Erwartet</th><th>Dokument</th><th>Notiz</th><th></th></tr>
    ${zeilen.map(z => {
      const g = z.def, e = z.e;
      const dim = e.erforderlich==='nein' ? ' style="opacity:.55"' : '';
      const fristPill = e.erwartetAm && z.status!=='erledigt'
        ? `<div style="margin-top:3px"><span class="${fristPillClass(e.erwartetAm,21)}">${daysUntil(e.erwartetAm)<0?'überfällig':daysUntil(e.erwartetAm)+' Tage'}</span></div>` : '';
      return `<tr${dim}>
        <td><strong>${escapeHtml(g.name)}</strong>
            <div class="step-sub" style="color:var(--muted);font-size:11px;max-width:330px">${escapeHtml(g.anlass)}${
              g.bplanGebunden && ohneBplan ? ' <b>Beim gewählten Verfahrensweg ohne Bebauungsplan ist er nicht zwingend — die naturschutzfachliche Prüfung erfolgt dann über die Eingriffsregelung im Baugenehmigungsverfahren.</b>' : ''}</div>
            ${g.regel==='immer' ? '<span class="pill phase">Standard</span>' : '<span class="pill">situationsabhängig</span>'}</td>
        <td><select data-gid="${escapeAttr(g.id)}" data-k="erforderlich" style="width:130px">
            ${GUTACHTEN_ERFORDERLICH.map(([v,l]) => `<option value="${v}"${e.erforderlich===v?' selected':''}>${l}</option>`).join('')}</select></td>
        <td><input type="text" data-gid="${escapeAttr(g.id)}" data-k="buero" value="${escapeAttr(e.buero)}" placeholder="Büro / Ansprechpartner" style="width:145px" /></td>
        <td><input type="date" data-gid="${escapeAttr(g.id)}" data-k="beauftragtAm" value="${escapeAttr(e.beauftragtAm||'')}" style="width:135px" /></td>
        <td><input type="number" step="100" data-gid="${escapeAttr(g.id)}" data-k="angebotEur" value="${e.angebotEur ?? ''}" placeholder="€" style="width:90px" /></td>
        <td><input type="date" data-gid="${escapeAttr(g.id)}" data-k="erwartetAm" value="${escapeAttr(e.erwartetAm||'')}" style="width:135px" />${fristPill}</td>
        <td>${g.doku
              ? `${dokuPill(p.dokumente[g.doku] ? p.dokumente[g.doku].status : 'offen')}<div class="step-sub" style="color:var(--muted);font-size:11px">im Prozess-Reiter</div>`
              : '<span style="color:var(--muted);font-size:11px">keine Dokumentzeile</span>'}</td>
        <td><input type="text" data-gid="${escapeAttr(g.id)}" data-k="notiz" value="${escapeAttr(e.notiz)}" placeholder="Notiz" style="width:120px" /></td>
        <td style="white-space:nowrap">
          ${g.typ ? `<button class="secondary small" data-act="anfrage" data-typ="${escapeAttr(g.typ)}" title="Zu den Anfrage-Mails für diese Gutachtenkategorie">Anfrage</button>` : ''}
          ${GUTACHTEN_STANDARD.includes(g.id) ? '' : `<button class="danger small" data-act="entfernen" data-gid="${escapeAttr(g.id)}" title="Aus der Projektliste entfernen">×</button>`}
        </td>
      </tr>`;
    }).join('')}
  </table>`;

  wrap.querySelectorAll('[data-gid][data-k]').forEach(inp => {
    const ev = (inp.tagName==='SELECT' || inp.type==='date') ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const p2 = getActiveProject(); if(!p2) return;
      const e = getGutachtenEintrag(p2, inp.dataset.gid);
      e[inp.dataset.k] = inp.dataset.k==='angebotEur'
        ? (inp.value===''?null:Number(inp.value))
        : (inp.value || (inp.dataset.k==='buero'||inp.dataset.k==='notiz' ? '' : null));
      touchActiveProject(); saveProjects();
      if(ev==='change') renderGutachtenTabelle(); // KPIs/Fristen-Pillen neu aufbauen
    });
  });
  wrap.querySelectorAll('[data-act=entfernen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p2 = getActiveProject(); if(!p2) return;
      getGutachtenEintrag(p2, btn.dataset.gid).aufgenommen = false;
      touchActiveProject(); saveProjects(); renderGutachtenTabelle();
    });
  });
  // Fuehrt zum bestehenden Anfrage-Modul, statt dessen Logik ein zweites Mal zu bauen.
  wrap.querySelectorAll('[data-act=anfrage]').forEach(btn => {
    btn.addEventListener('click', () => {
      const det = [...document.querySelectorAll('details')].find(d => (d.querySelector('summary')||{}).textContent==='Gutachten-Anfragen');
      if(!det) return;
      det.open = true;
      const typName = (types.find(t => t.id===btn.dataset.typ)||{}).name || '';
      const karte = typName ? [...det.querySelectorAll('#contacts-list > *')].find(el => el.textContent.includes(typName)) : null;
      (karte || det).scrollIntoView({ behavior:'smooth', block:'center' });
    });
  });
}

document.getElementById('btn-gutachten-add').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  const id = document.getElementById('gutachten-add').value; if(!id) return;
  const e = getGutachtenEintrag(p, id);
  e.aufgenommen = true; e.erforderlich = 'ja';
  touchActiveProject(); saveProjects(); renderGutachtenTabelle();
  logAction(p, `Gutachten "${(gutachtenDef(id)||{}).name || id}" in die Projektliste aufgenommen`);
});
document.getElementById('btn-gutachten-export').addEventListener('click', () => {
  const p = getActiveProject(); if(!p) return;
  const zeilen = gutachtenZeilen(p);
  const rows = [['Gutachten','Erforderlich','Anlass','Buero','Beauftragt am','Honorar (EUR)','Erwartet am','Dokumentstatus','Notiz']];
  zeilen.forEach(z => rows.push([
    z.def.name,
    (GUTACHTEN_ERFORDERLICH.find(x => x[0]===z.e.erforderlich)||['','?'])[1],
    z.def.anlass, z.e.buero, z.e.beauftragtAm || '', z.e.angebotEur ?? '', z.e.erwartetAm || '',
    z.def.doku ? (p.dokumente[z.def.doku] ? p.dokumente[z.def.doku].status : 'offen') : '—',
    z.e.notiz,
  ]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:38},{wch:18},{wch:60},{wch:24},{wch:14},{wch:13},{wch:13},{wch:14},{wch:26}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gutachten');
  XLSX.writeFile(wb, `Gutachten_${fsSafeName(p.name||'Projekt')}_${fsStamp().slice(0,10)}.xlsx`);
});

// =============================================================================
// Verfahrenswege im Bauplanungs- und Bauordnungsrecht
// -----------------------------------------------------------------------------
// Der Genehmigungs-Reiter zeigte bisher jedem Projekt dasselbe: elf B-Plan-Meilensteine,
// egal ob ueberhaupt ein Bebauungsplan aufgestellt wird. Fuer ein privilegiertes Vorhaben
// nach § 35 Abs. 1 BauGB ist das schlicht falsch — dort gibt es kein B-Plan-Verfahren, dafuer
// einen Privilegierungsnachweis und das gemeindliche Einvernehmen nach § 36 BauGB.
//
// Deshalb zwei getrennte Ebenen, die im Baurecht auch getrennt sind:
//   Ebene 1  Bauplanungsrecht (BauGB): Wie wird die Flaeche zulaessig? -> VERFAHRENSWEGE
//   Ebene 2  Bauordnungsrecht (LBO):   Wie wird geprueft?              -> bauverfahren.art
// Der gewaehlte Weg der Ebene 1 blendet die Felder ein, die er braucht, und laesst den Rest
// weg — inklusive der Prozess-Schritte (siehe stepEntfaelltDurchVerfahren).
// =============================================================================
const ANLAGENARTEN = [
  { id:'pv',      name:'PV-Freiflächenanlage' },
  { id:'bess',    name:'Batteriespeicher (Stand-alone)' },
  { id:'pv-bess', name:'PV-Anlage mit Batteriespeicher' },
];

const VERFAHRENSWEGE = [
  { id:'bplan', name:'Bebauungsplan (Angebots-B-Plan)', norm:'§§ 2–10 i. V. m. § 30 BauGB',
    bplan:true, dauer:'ca. 12–24 Monate',
    kurz:'Regelfall im Außenbereich ohne Privilegierung: die Gemeinde stellt einen Bebauungsplan auf, meist parallel zur Änderung des Flächennutzungsplans. Volles Verfahren mit Umweltbericht, Behörden- und Öffentlichkeitsbeteiligung und Satzungsbeschluss.' },
  { id:'vbplan', name:'Vorhabenbezogener Bebauungsplan', norm:'§ 12 BauGB',
    bplan:true, vorhabenbezogen:true, dauer:'ca. 10–20 Monate',
    kurz:'Wie der Angebots-B-Plan, aber vom Vorhabenträger getragen: Vorhaben- und Erschließungsplan plus Durchführungsvertrag mit der Gemeinde. In der Praxis besser steuerbar, weil das Projekt selbst Gegenstand des Plans ist.' },
  { id:'privilegiert', name:'Privilegiertes Außenbereichsvorhaben', norm:'§ 35 Abs. 1 BauGB',
    bplan:false, einvernehmen:true, privileg:true, dauer:'ca. 3–8 Monate',
    kurz:'Die Zulässigkeit folgt unmittelbar aus dem Gesetz — ein Bebauungsplanverfahren entfällt. Die Baugenehmigung ist trotzdem erforderlich, und die Voraussetzungen des Privilegierungstatbestands müssen belegt werden.' },
  { id:'aussen-sonstig', name:'Sonstiges Außenbereichsvorhaben', norm:'§ 35 Abs. 2 BauGB',
    bplan:false, einvernehmen:true, risiko:true, dauer:'schwer planbar',
    kurz:'Ohne Privilegierung nur zulässig, wenn keine öffentlichen Belange beeinträchtigt werden und die Erschließung gesichert ist. Für Solarparks und Speicher in der Praxis selten tragfähig — der Weg führt meist doch über den Bebauungsplan.' },
  { id:'innenbereich', name:'Innenbereich', norm:'§ 34 BauGB',
    bplan:false, einvernehmen:true, innen:true, dauer:'ca. 3–6 Monate',
    kurz:'Die Fläche liegt innerhalb eines im Zusammenhang bebauten Ortsteils. Maßstab ist das Einfügen in die nähere Umgebung — typisch für Speicher auf Gewerbegrundstücken und für Konversionsflächen.' },
  { id:'bestand', name:'Bestehender Bebauungsplan', norm:'§ 30 BauGB',
    bplan:false, bestand:true, dauer:'ca. 2–5 Monate',
    kurz:'Es gibt bereits einen Bebauungsplan, etwa ein Gewerbe- oder Sondergebiet. Geprüft wird nur, ob das Vorhaben seinen Festsetzungen entspricht; andernfalls ist eine Befreiung nach § 31 Abs. 2 BauGB nötig.' },
];
const verfahrenswegDef = id => VERFAHRENSWEGE.find(w => w.id===id) || null;
function verfahrensweg(p){
  return (p && p.genehmigung && p.genehmigung.verfahren) ? verfahrenswegDef(p.genehmigung.verfahren.weg) : null;
}

// Privilegierungstatbestände des § 35 Abs. 1 BauGB, soweit sie PV und Speicher betreffen.
// Rechtsstand: Speicher-Novelle (Bundestag 13.11.2025, geändert 04.12.2025) — sie hat die
// Nummern 11 und 12 eingefügt. Wichtig für die Praxis:
//   Nr. 11 = Speicher MIT räumlich-funktionalem Bezug zu einer vorhandenen EE-Anlage
//   Nr. 12 = Stand-alone-Speicher am Umspannwerk, aber nur innerhalb eines GEMEINDE-Deckels
// Der Deckel in Nr. 12 begrenzt nicht die einzelne Anlage, sondern die Summe aller
// privilegierten Speicher in der Gemeinde — wer zuerst baut, verbraucht das Kontingent.
const PRIVILEGIERUNGEN = [
  { id:'pv-gebaeude', arten:['pv','pv-bess'], norm:'§ 35 Abs. 1 Nr. 8 lit. a BauGB',
    name:'PV auf oder an einem bestehenden Gebäude',
    hinweis:'Dach- oder Außenwandfläche eines Gebäudes, das zu einem anderen Zweck als der Stromerzeugung errichtet wurde. Einziger Tatbestand dieser Liste ohne Rückbauverpflichtung nach § 35 Abs. 5 BauGB.',
    felder:[
      { k:'gebaeudeNutzung', label:'Gebäude und seine Hauptnutzung', typ:'text' },
    ] },
  { id:'pv-korridor', arten:['pv','pv-bess'], norm:'§ 35 Abs. 1 Nr. 8 lit. b BauGB',
    name:'PV längs Autobahn oder Schienenweg (200-m-Korridor)',
    hinweis:'Längs von Autobahnen oder Schienenwegen des übergeordneten Netzes, gemessen vom äußeren Rand der Fahrbahn. Achtung, häufigste Verwechslung: das EEG fördert Flächen bis 500 m — baurechtlich privilegiert ist nur der 200-m-Streifen. Zwischen 200 und 500 m ist die Anlage förderfähig, aber nicht privilegiert.',
    rueckbau:true,
    felder:[
      { k:'verkehrsweg', label:'Verkehrsweg', typ:'select', optionen:['Bundesautobahn','Schienenweg des übergeordneten Netzes'] },
      { k:'abstandKorridorM', label:'Abstand Anlagenrand zum äußeren Fahrbahn-/Gleisrand', typ:'number', einheit:'m', grenze:200, richtung:'max' },
    ] },
  { id:'pv-besonders', arten:['pv','pv-bess'], norm:'§ 35 Abs. 1 Nr. 9 BauGB',
    name:'Besondere Solaranlage im Betriebszusammenhang (hofnahe Agri-PV)',
    hinweis:'Erfasst besondere Solaranlagen im Sinne des EEG — Agri-PV, Moor-PV, Parkplatz-PV, Floating-PV. Die drei Voraussetzungen gelten kumulativ und begrenzen den Tatbestand faktisch auf hofnahe Anlagen: eine Agri-PV-Freifläche von 20 ha fällt NICHT darunter und braucht einen Bebauungsplan.',
    rueckbau:true,
    felder:[
      { k:'betriebNr9', label:'Landwirtschaftlicher / gartenbaulicher Betrieb (Hofstelle)', typ:'text' },
      { k:'grundflaecheNr9', label:'Grundfläche der besonderen Solaranlage', typ:'number', einheit:'m²', grenze:25000, richtung:'max' },
      { k:'anlagenJeHofstelle', label:'Anlagen an dieser Hofstelle einschließlich dieser', typ:'number', einheit:'Stück', grenze:1, richtung:'max' },
    ] },
  { id:'bess-ee', arten:['bess','pv-bess'], norm:'§ 35 Abs. 1 Nr. 11 BauGB',
    name:'Speicher im räumlich-funktionalen Zusammenhang mit vorhandener EE-Anlage',
    hinweis:'Setzt eine bereits vorhandene Anlage zur Nutzung erneuerbarer Energien voraus, mit der der Speicher räumlich und funktional zusammenhängt. Der Begriff ist gesetzlich nicht definiert und wird von den Behörden uneinheitlich ausgelegt — im Zweifel über eine Bauvoranfrage klären. Kein Gemeinde-Deckel.',
    rueckbau:true,
    felder:[
      { k:'eeAnlageArt', label:'Vorhandene EE-Anlage (Art, Leistung, Inbetriebnahme)', typ:'text' },
      { k:'eeAnlageAbstandM', label:'Entfernung zur EE-Anlage', typ:'number', einheit:'m' },
      { k:'eeAnlageBezug', label:'Funktionaler Bezug (z. B. gemeinsamer Netzverknüpfungspunkt)', typ:'text' },
    ] },
  { id:'bess-uw', arten:['bess','pv-bess'], norm:'§ 35 Abs. 1 Nr. 12 BauGB',
    name:'Stand-alone-Speicher nahe Umspannanlage oder Kraftwerk',
    hinweis:'Für Speicher ohne Bezug zu einer EE-Anlage. Drei Voraussetzungen kumulativ — und der Gemeinde-Deckel: alle privilegierten Speicher in derselben Gemeinde zusammen dürfen weder 0,5 % der Gemeindefläche noch 50.000 m² überschreiten, maßgeblich ist die zuerst erreichte Grenze. Das ist ein Windhundrennen: ein früheres Vorhaben kann das Kontingent aufbrauchen.',
    rueckbau:true, sonderpruefung:'gemeindedeckel',
    felder:[
      { k:'abstandUwM', label:'Entfernung zur Grundstücksgrenze der Umspannanlage / des Kraftwerks', typ:'number', einheit:'m', grenze:200, richtung:'max' },
      { k:'leistungMw', label:'Nennleistung', typ:'number', einheit:'MW', grenze:4, richtung:'min' },
      { k:'flaecheM2', label:'Grundfläche dieser Anlage', typ:'number', einheit:'m²' },
      { k:'gemeindeVorbelastungM2', label:'Bereits privilegierte Speicherfläche in der Gemeinde (ohne diese)', typ:'number', einheit:'m²' },
      { k:'gemeindeflaecheHa', label:'Fläche der Gemeinde', typ:'number', einheit:'ha' },
    ] },
];
// Nicht in der Auswahl, weil für PV und Batteriespeicher ohne Bedeutung, aber der
// Vollständigkeit halber: § 35 Abs. 1 Nr. 10 BauGB privilegiert die untertägige
// Wärmespeicherung im räumlich-funktionalen Zusammenhang mit Wärmequellen oder -senken.
const PRIVILEGIERUNG_WEITERE_HINWEIS =
  '§ 35 Abs. 1 Nr. 10 BauGB privilegiert zusätzlich die untertägige Wärmespeicherung — für PV und Batteriespeicher ohne Bedeutung.';

const privilegierungDef = id => PRIVILEGIERUNGEN.find(x => x.id===id) || null;
function privilegierungenFuer(art){
  return PRIVILEGIERUNGEN.filter(x => !art || x.arten.includes(art));
}

// Der Deckel des § 35 Abs. 1 Nr. 12 lit. c BauGB: alle privilegierten Speicher der Gemeinde
// zusammen dürfen weder 0,5 % der Gemeindefläche noch 50.000 m² überschreiten. Maßgeblich ist
// die zuerst erreichte Grenze, deshalb das Minimum aus beiden.
const NR12_DECKEL_ABSOLUT_M2 = 50000;
const NR12_DECKEL_ANTEIL = 0.005;
function pruefeGemeindeDeckel(v){
  const eigen = Number(v.nachweise.flaecheM2);
  const vor   = Number(v.nachweise.gemeindeVorbelastungM2 || 0);
  const gemHa = Number(v.nachweise.gemeindeflaecheHa);
  if(!Number.isFinite(eigen) || !Number.isFinite(gemHa) || !gemHa) return null;
  const anteilGrenze = gemHa * 10000 * NR12_DECKEL_ANTEIL;
  const grenze = Math.min(NR12_DECKEL_ABSOLUT_M2, anteilGrenze);
  const summe = eigen + (Number.isFinite(vor) ? vor : 0);
  return { summe, grenze, anteilGrenze, massgeblich: grenze===anteilGrenze ? '0,5 % der Gemeindefläche' : '50.000 m²',
           ok: summe <= grenze, rest: Math.max(0, grenze - summe) };
}

// Prueft die erfassten Nachweise gegen die gesetzlichen Grenzwerte.
// -> { erfuellt, offen:[label], verletzt:[{…}], deckel }
function pruefePrivilegierung(p){
  const v = p.genehmigung.verfahren;
  const def = privilegierungDef(v.privilegierung);
  if(!def) return null;
  const offen = [], verletzt = [];
  def.felder.forEach(f => {
    const wert = v.nachweise[f.k];
    if(wert === '' || wert == null){ offen.push(f.label); return; }
    if(f.grenze == null) return;
    const n = Number(wert);
    if(!Number.isFinite(n)){ offen.push(f.label); return; }
    const ok = f.richtung==='max' ? n <= f.grenze : n >= f.grenze;
    if(!ok) verletzt.push({ label:f.label, wert:n, grenze:f.grenze, richtung:f.richtung, einheit:f.einheit||'' });
  });
  let deckel = null;
  if(def.sonderpruefung==='gemeindedeckel'){
    deckel = pruefeGemeindeDeckel(v);
    if(deckel && !deckel.ok)
      verletzt.push({ label:'Gemeinde-Deckel (§ 35 Abs. 1 Nr. 12 lit. c)', wert:deckel.summe,
                      grenze:deckel.grenze, richtung:'max', einheit:'m²' });
  }
  return { def, erfuellt: !offen.length && !verletzt.length, offen, verletzt, deckel };
}

// ---- Karte oben im Genehmigungs-Reiter ----
function renderVerfahrenKarte(){
  const p = getActiveProject();
  const root = document.getElementById('gen-verfahren-karte'); if(!root) return;
  if(!p){ root.innerHTML = ''; return; }
  const v = p.genehmigung.verfahren;
  const weg = verfahrensweg(p);
  const art = ANLAGENARTEN.find(a => a.id===v.anlagenart);

  if(!weg){
    root.innerHTML = `
      <div class="card-head" style="margin-top:0"><strong>Verfahrensweg noch nicht festgelegt${infoBtn(
        'Der Assistent fragt drei Dinge ab — Anlagenart, Lage der Fläche und mögliche Privilegierung — und blendet danach genau die Felder ein, die dieser Weg braucht. Solange nichts gewählt ist, zeigt der Reiter den Regelfall: das Bebauungsplanverfahren.')}</strong>
        <button id="btn-verfahren-waehlen" class="small">Verfahren wählen …</button></div>`;
  } else {
    const pr = weg.privileg ? pruefePrivilegierung(p) : null;
    const status = !pr ? ''
      : pr.erfuellt ? '<span class="pill ok">Voraussetzungen erfüllt</span>'
      : pr.verletzt.length ? '<span class="pill warn">Voraussetzung verfehlt</span>'
      : '<span class="pill">Nachweise unvollständig</span>';
    // Die Erläuterung des Wegs steht hinter dem Info-Button — sie wird einmal gelesen und
    // danach übersprungen, kostet als Dauertext aber jedes Mal Platz und Aufmerksamkeit.
    const erklaerung = weg.kurz
      + (pr ? ' <b>Tatbestand:</b> ' + pr.def.name + ' (' + pr.def.norm + ').' : '')
      + (weg.bplan ? '' : ' Die B-Plan-Meilensteine und die zugehörigen Prozess-Schritte sind bei diesem Weg ausgeblendet und zählen als „entfällt".');
    root.innerHTML = `
      <div class="card-head" style="margin-top:0">
        <strong>${escapeHtml(weg.name)}${infoBtn(erklaerung)}</strong>
        <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${status}
          <button id="btn-verfahren-waehlen" class="secondary small">Ändern …</button>
        </span>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;font-size:11.5px;color:var(--muted)">
        <span class="pill">${escapeHtml(weg.norm)}</span>
        <span class="pill">${escapeHtml(art ? art.name : 'Anlagenart offen')}</span>
        <span class="pill${weg.bplan?' phase':''}">B-Plan ${weg.bplan ? 'erforderlich' : 'entfällt'}</span>
        <span class="pill">${escapeHtml(weg.dauer)}</span>
      </div>`;
  }
  document.getElementById('btn-verfahren-waehlen').onclick = openVerfahrenModal;
}

// ---- Overlay: Assistent ----
let vwEntwurf = null;   // Arbeitskopie, damit Abbrechen nichts veraendert

function openVerfahrenModal(){
  const p = getActiveProject(); if(!p) return;
  const v = p.genehmigung.verfahren;
  vwEntwurf = { anlagenart:v.anlagenart||'', weg:v.weg||'', privilegierung:v.privilegierung||'' };
  document.getElementById('view-verfahren').classList.remove('hidden');
  renderVerfahrenModal();
}
function closeVerfahrenModal(){
  document.getElementById('view-verfahren').classList.add('hidden');
  vwEntwurf = null;
}

// Empfehlung aus den bisherigen Antworten — bewusst als Vorschlag, nicht als Zwang.
function verfahrenEmpfehlung(e){
  if(!e.weg) return null;
  if(e.weg==='privilegiert' && !e.privilegierung)
    return { art:'warn', text:'Für den privilegierten Weg muss ein Tatbestand des § 35 Abs. 1 BauGB zutreffen. Trifft keiner zu, führt der Weg über einen Bebauungsplan.' };
  if(e.weg==='aussen-sonstig')
    return { art:'warn', text:'§ 35 Abs. 2 BauGB trägt Solarparks und Speicher nur in Ausnahmefällen. Vor der Flächensicherung dringend eine Bauvoranfrage stellen — oder gleich das Bebauungsplanverfahren einplanen.' };
  if(e.weg==='privilegiert')
    return { art:'ok', text:'Privilegierung befreit vom Bauplanungsverbot, nicht von der Baugenehmigung. Das gemeindliche Einvernehmen nach § 36 BauGB bleibt erforderlich.' };
  if(e.weg==='bestand')
    return { art:'ok', text:'Prüfe zuerst die Festsetzungen: Passt die Art der baulichen Nutzung nicht, ist eine Befreiung nach § 31 Abs. 2 BauGB nötig — die im Ermessen der Behörde steht.' };
  if(e.weg==='vbplan')
    return { art:'ok', text:'Der vorhabenbezogene B-Plan setzt einen Durchführungsvertrag voraus, in dem sich der Vorhabenträger zur Umsetzung binnen Frist verpflichtet.' };
  return { art:'ok', text:'Regelfall. Rechne mit Umweltbericht, artenschutzrechtlichem Fachbeitrag, TÖB-Beteiligung und öffentlicher Auslegung.' };
}

function renderVerfahrenModal(){
  const body = document.getElementById('vw-body'); if(!body || !vwEntwurf) return;
  const e = vwEntwurf;
  const privOptionen = privilegierungenFuer(e.anlagenart);
  const emp = verfahrenEmpfehlung(e);

  const optionHtml = (gruppe, x, gewaehlt, extraPill) => `
    <label class="vw-opt${gewaehlt?' sel':''}">
      <input type="radio" name="${gruppe}" value="${escapeAttr(x.id)}"${gewaehlt?' checked':''} />
      <span style="flex:1">
        <b>${escapeHtml(x.name)}</b>
        <span class="pill" style="margin-left:6px">${escapeHtml(x.norm)}</span>
        ${extraPill || ''}
        <div class="vw-desc">${escapeHtml(x.kurz || x.hinweis)}</div>
      </span>
    </label>`;

  body.innerHTML = `
    <div style="padding:16px 18px;display:flex;flex-direction:column;gap:20px">
      <div class="vw-step">
        <label><b>1 · Was wird gebaut?</b></label>
        <div class="vw-desc" style="margin:0">Bestimmt, welche Privilegierungstatbestände überhaupt in Frage kommen.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${ANLAGENARTEN.map(a => `<button type="button" class="${e.anlagenart===a.id?'':'secondary '}small" data-vw-art="${escapeAttr(a.id)}">${escapeHtml(a.name)}</button>`).join('')}
        </div>
      </div>

      <div class="vw-step">
        <label><b>2 · Wie wird die Fläche baurechtlich zulässig?</b></label>
        <div class="vw-desc" style="margin:0">Ebene des Bauplanungsrechts (BauGB). Das Baugenehmigungsverfahren nach Landesbauordnung wählst du danach separat im Reiter.</div>
        ${VERFAHRENSWEGE.map(w => optionHtml('vw-weg', w, e.weg===w.id,
            `<span class="pill phase" style="margin-left:4px">${escapeHtml(w.dauer)}</span>`)).join('')}
      </div>

      <div class="vw-step${e.weg==='privilegiert' ? '' : ' hidden'}">
        <label><b>3 · Welcher Privilegierungstatbestand greift?</b></label>
        <div class="vw-desc" style="margin:0">${e.anlagenart
            ? 'Gefiltert nach der gewählten Anlagenart. Die Zahlenwerte weist du anschließend im Reiter nach.'
            : 'Bitte zuerst oben die Anlagenart wählen.'}</div>
        ${privOptionen.map(x => optionHtml('vw-priv', x, e.privilegierung===x.id, '')).join('')
          || '<div class="empty">Für diese Anlagenart ist kein Privilegierungstatbestand hinterlegt.</div>'}
        <div class="vw-desc" style="margin-top:2px">${escapeHtml(PRIVILEGIERUNG_WEITERE_HINWEIS)}</div>
      </div>

      ${emp ? `<div class="vw-note${emp.art==='warn'?' warn':''}"><b>${emp.art==='warn'?'Achtung':'Hinweis'}:</b> ${escapeHtml(emp.text)}</div>` : ''}
    </div>`;

  body.querySelectorAll('[data-vw-art]').forEach(b => b.addEventListener('click', () => {
    vwEntwurf.anlagenart = b.dataset.vwArt;
    // Tatbestand verwerfen, wenn er zur neuen Anlagenart nicht mehr passt
    if(vwEntwurf.privilegierung && !privilegierungenFuer(vwEntwurf.anlagenart).some(x => x.id===vwEntwurf.privilegierung))
      vwEntwurf.privilegierung = '';
    renderVerfahrenModal();
  }));
  body.querySelectorAll('input[name=vw-weg]').forEach(r => r.addEventListener('change', () => {
    vwEntwurf.weg = r.value;
    if(vwEntwurf.weg !== 'privilegiert') vwEntwurf.privilegierung = '';
    renderVerfahrenModal();
  }));
  body.querySelectorAll('input[name=vw-priv]').forEach(r => r.addEventListener('change', () => {
    vwEntwurf.privilegierung = r.value; renderVerfahrenModal();
  }));
}

function verfahrenUebernehmen(){
  const p = getActiveProject(); if(!p || !vwEntwurf) return;
  if(!vwEntwurf.weg){ alert('Bitte einen Verfahrensweg wählen.'); return; }
  if(vwEntwurf.weg==='privilegiert' && !vwEntwurf.privilegierung){
    alert('Bitte den Privilegierungstatbestand wählen — er entscheidet, welche Nachweise zu führen sind.');
    return;
  }
  const v = p.genehmigung.verfahren;
  const vorher = v.weg;
  v.anlagenart = vwEntwurf.anlagenart;
  v.weg = vwEntwurf.weg;
  v.privilegierung = vwEntwurf.weg==='privilegiert' ? vwEntwurf.privilegierung : null;
  touchActiveProject(); saveProjects();
  logAction(p, `Verfahrensweg festgelegt: ${(verfahrenswegDef(v.weg)||{}).name || v.weg}`
                + (vorher && vorher!==v.weg ? ` (vorher: ${(verfahrenswegDef(vorher)||{}).name || vorher})` : ''));
  closeVerfahrenModal();
  renderGenehmigungProzess();
  renderProzessTab();
  document.getElementById('detail-phase-badge').innerHTML = phaseBadgeHtml(p);
  toast('Verfahrensweg übernommen');
}

document.getElementById('vw-close').addEventListener('click', closeVerfahrenModal);
document.getElementById('vw-uebernehmen').addEventListener('click', verfahrenUebernehmen);
document.getElementById('view-verfahren').addEventListener('click', e => {
  if(e.target.id === 'view-verfahren') closeVerfahrenModal();
});

// ---- Sichtbarkeit der Bloecke + wegabhaengige Felder ----
function applyVerfahrenSichtbarkeit(){
  const p = getActiveProject(); if(!p) return;
  const weg = verfahrensweg(p);
  const zeige = (id, an) => { const el = document.getElementById(id); if(el) el.classList.toggle('hidden', !an); };
  // Ohne Wahl bleibt der Regelfall sichtbar, damit der Reiter nie leer wirkt.
  zeige('gen-block-bplan',        !weg || !!weg.bplan);
  zeige('gen-vbplan-extra',       !!(weg && weg.vorhabenbezogen));
  zeige('gen-block-privileg',     !!(weg && weg.privileg));
  zeige('gen-block-bestand',      !!(weg && weg.bestand));
  zeige('gen-block-innen',        !!(weg && weg.innen));
  zeige('gen-block-einvernehmen', !!(weg && weg.einvernehmen));
}

function renderPrivilegierung(){
  const p = getActiveProject(); if(!p) return;
  const v = p.genehmigung.verfahren;
  const sel = document.getElementById('privileg-art'); if(!sel) return;
  const optionen = privilegierungenFuer(v.anlagenart);
  sel.innerHTML = '<option value="">— bitte wählen —</option>' + optionen.map(x =>
    `<option value="${escapeAttr(x.id)}"${v.privilegierung===x.id?' selected':''}>${escapeHtml(x.name)}</option>`).join('');
  const def = privilegierungDef(v.privilegierung);
  document.getElementById('privileg-hinweis').innerHTML = def
    ? `<b>${escapeHtml(def.norm)}</b> — ${escapeHtml(def.hinweis)}` : '';

  const felderRoot = document.getElementById('privileg-felder');
  felderRoot.innerHTML = !def ? '' : def.felder.map(f => {
    const wert = v.nachweise[f.k] ?? '';
    const grenze = f.grenze != null
      ? `<span class="pill">${f.richtung==='max'?'höchstens':'mindestens'} ${f.grenze.toLocaleString('de-DE')} ${escapeHtml(f.einheit||'')}</span>` : '';
    const eingabe = f.typ==='select'
      ? `<select data-pv="${escapeAttr(f.k)}"><option value="">—</option>${f.optionen.map(o =>
           `<option value="${escapeAttr(o)}"${wert===o?' selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`
      : `<input type="${f.typ==='number'?'number':'text'}" data-pv="${escapeAttr(f.k)}" value="${escapeAttr(String(wert))}"${f.typ==='number'?' step="any"':''} />`;
    return `<div><label>${escapeHtml(f.label)}${f.einheit?` (${escapeHtml(f.einheit)})`:''} ${grenze}</label>${eingabe}</div>`;
  }).join('');
  felderRoot.querySelectorAll('[data-pv]').forEach(inp => {
    inp.addEventListener(inp.tagName==='SELECT' ? 'change' : 'input', () => {
      const p2 = getActiveProject(); if(!p2) return;
      p2.genehmigung.verfahren.nachweise[inp.dataset.pv] = inp.value;
      touchActiveProject(); saveProjects();
      renderPrivilegierungPruefung();
      renderVerfahrenKarte();
    });
  });
  renderPrivilegierungPruefung();
}

// Der eigentliche Mehrwert: die erfassten Zahlen gegen die Grenzwerte des Tatbestands
// halten, statt sie nur zu speichern.
function renderPrivilegierungPruefung(){
  const p = getActiveProject();
  const root = document.getElementById('privileg-pruefung'); if(!root || !p) return;
  const pr = pruefePrivilegierung(p);
  if(!pr){ root.innerHTML = ''; return; }
  if(pr.verletzt.length){
    root.innerHTML = `<div class="pane-hint" style="border-left:3px solid #c1121f"><b>Voraussetzung nicht erfüllt.</b> ${
      pr.verletzt.map(x => `${escapeHtml(x.label)}: ${x.wert.toLocaleString('de-DE')} ${escapeHtml(x.einheit)} — zulässig ${x.richtung==='max'?'höchstens':'mindestens'} ${x.grenze.toLocaleString('de-DE')} ${escapeHtml(x.einheit)}`).join('; ')
      }. Ohne erfüllten Tatbestand greift die Privilegierung nicht — das Vorhaben braucht dann einen Bebauungsplan.</div>`;
  } else if(pr.offen.length){
    root.innerHTML = `<div class="pane-hint"><b>Nachweise unvollständig:</b> ${pr.offen.map(escapeHtml).join(', ')}.</div>`;
  } else {
    const deckelText = pr.deckel
      ? ` Vom Gemeinde-Kontingent (maßgeblich: ${escapeHtml(pr.deckel.massgeblich)}) bleiben nach diesem Vorhaben noch ${Math.round(pr.deckel.rest).toLocaleString('de-DE')} m² frei.`
      : '';
    root.innerHTML = `<div class="pane-hint" style="border-left:3px solid var(--accent)"><b>Voraussetzungen erfüllt.</b> Die Werte liegen innerhalb der Grenzen des ${escapeHtml(pr.def.norm)}.${deckelText} Das gemeindliche Einvernehmen nach § 36 BauGB ist gesondert einzuholen.</div>`;
  }
  // Rückbauverpflichtung nach § 35 Abs. 5 BauGB ist eigene Zulässigkeitsvoraussetzung —
  // sie gilt für die Nummern 2 bis 6, 8 lit. b und 9 bis 12, also für alle hier relevanten
  // Tatbestände außer der Gebäude-PV nach Nr. 8 lit. a.
  const rb = document.getElementById('privileg-rueckbau');
  if(rb){
    rb.classList.toggle('hidden', !pr.def.rueckbau);
    const inp = document.getElementById('rueckbau-am');
    if(pr.def.rueckbau && inp) inp.value = p.genehmigung.verfahren.rueckbauErklaerungAm || '';
  }
}

// § 36 Abs. 2 Satz 2 BauGB: Einvernehmen gilt nach zwei Monaten als erteilt.
function renderEinvernehmenFrist(){
  const p = getActiveProject();
  const root = document.getElementById('einvernehmen-frist'); if(!root || !p) return;
  const v = p.genehmigung.verfahren;
  if(!v.einvernehmenAm || ['erteilt','verweigert'].includes(v.einvernehmenStatus)){ root.innerHTML = ''; return; }
  const d = new Date(v.einvernehmenAm + 'T12:00:00');
  d.setMonth(d.getMonth() + 2);
  const fiktion = d.toISOString().slice(0,10);
  const tage = daysUntil(fiktion);
  root.innerHTML = `<b>Zwei-Monats-Frist:</b> ohne Widerspruch der Gemeinde gilt das Einvernehmen am `
    + `${escapeHtml(fmtDate(fiktion))} als erteilt <span class="${fristPillClass(fiktion,14)}">${tage<0?'abgelaufen':tage+' Tage'}</span>.`;
}

// Genehmigungsfreistellung setzt einen qualifizierten B-Plan voraus — bei einem
// Aussenbereichsvorhaben ist sie schlicht nicht waehlbar. Statt das zu verbieten, wird
// der Widerspruch benannt: die Laender regeln Details unterschiedlich.
function renderBauArtWarnung(){
  const p = getActiveProject();
  const root = document.getElementById('bau-art-warnung'); if(!root || !p) return;
  const weg = verfahrensweg(p);
  const art = p.genehmigung.bauverfahren.art;
  let txt = '';
  if(art==='freistellung' && weg && !['bestand','bplan','vbplan'].includes(weg.id))
    txt = 'Die Genehmigungsfreistellung setzt einen qualifizierten Bebauungsplan voraus. Beim gewählten Weg (' + weg.norm + ') ist sie in der Regel ausgeschlossen — bitte prüfen.';
  else if(art==='freistellung')
    txt = 'Bei Freistellung prüft niemand: die Verantwortung für Bauplanungs-, Störfall- und Wasserrecht liegt vollständig beim Bauherrn. Regelungen und Fristen sind je Bundesland verschieden.';
  else if(art==='vereinfacht' && weg && weg.privileg)
    txt = 'Im vereinfachten Verfahren prüft die Behörde nur einen Teil der Vorschriften. Die Einhaltung der übrigen — etwa Brandschutz und Standsicherheit — verantwortet der Entwurfsverfasser.';
  root.innerHTML = txt ? `<div class="pane-hint" style="border-left:3px solid #c9861f">${escapeHtml(txt)}</div>` : '';
}

// ---- Feldbindungen der wegabhaengigen Bloecke ----
(function initVerfahrenFelder(){
  const bind = (id, key, typ) => {
    const el = document.getElementById(id); if(!el) return;
    const ev = (el.type==='date' || el.tagName==='SELECT' || el.type==='checkbox') ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const p = getActiveProject(); if(!p) return;
      p.genehmigung.verfahren[key] = typ==='bool' ? el.checked : (el.value || (typ==='text' ? '' : null));
      touchActiveProject(); saveProjects();
      if(key==='einvernehmenAm' || key==='einvernehmenStatus') renderEinvernehmenFrist();
      renderGenehmigungFoldStatus();
      if(key==='bestandBefreiung')
        document.getElementById('bestand-befreiung-felder').classList.toggle('hidden', !el.checked);
      if(key==='vorbescheidGenutzt')
        document.getElementById('vorbescheid-felder').classList.toggle('hidden', !el.checked);
    });
  };
  bind('rueckbau-am','rueckbauErklaerungAm');
  bind('einvernehmen-status','einvernehmenStatus','text');
  bind('einvernehmen-am','einvernehmenAm');
  bind('bestand-name','bestandName','text');
  bind('bestand-nutzung','bestandNutzung','text');
  bind('bestand-befreiung','bestandBefreiung','bool');
  bind('bestand-befreiung-am','bestandBefreiungAm');
  bind('bestand-befreiung-erteilt','bestandBefreiungErteiltAm');
  bind('innen-umgebung','innenUmgebung','text');
  bind('innen-erschliessung','innenErschliessung','text');
  bind('vbplan-dv','vbplanDurchfuehrungsvertragAm');
  bind('vbplan-vep','vbplanVepAm');
  bind('vorbescheid-genutzt','vorbescheidGenutzt','bool');
  bind('vorbescheid-frage','vorbescheidFrage','text');
  bind('vorbescheid-eingereicht','vorbescheidEingereichtAm');
  bind('vorbescheid-erhalten','vorbescheidErhaltenAm');
  bind('vorbescheid-ergebnis','vorbescheidErgebnis','text');
  bind('vorbescheid-gueltig','vorbescheidGueltigBis');
  document.getElementById('privileg-art').addEventListener('change', e => {
    const p = getActiveProject(); if(!p) return;
    p.genehmigung.verfahren.privilegierung = e.target.value || null;
    touchActiveProject(); saveProjects();
    renderPrivilegierung(); renderVerfahrenKarte();
  });
})();

// Laedt die wegabhaengigen Felder aus dem Projekt in die Maske.
function loadVerfahrenFelder(p){
  const v = p.genehmigung.verfahren;
  const set = (id, val, bool) => { const el = document.getElementById(id); if(!el) return;
    if(bool) el.checked = !!val; else el.value = val || ''; };
  set('einvernehmen-status', v.einvernehmenStatus);
  set('einvernehmen-am', v.einvernehmenAm);
  set('bestand-name', v.bestandName);
  set('bestand-nutzung', v.bestandNutzung);
  set('bestand-befreiung', v.bestandBefreiung, true);
  set('bestand-befreiung-am', v.bestandBefreiungAm);
  set('bestand-befreiung-erteilt', v.bestandBefreiungErteiltAm);
  set('innen-umgebung', v.innenUmgebung);
  set('innen-erschliessung', v.innenErschliessung);
  set('vbplan-dv', v.vbplanDurchfuehrungsvertragAm);
  set('vbplan-vep', v.vbplanVepAm);
  set('vorbescheid-genutzt', v.vorbescheidGenutzt, true);
  set('vorbescheid-frage', v.vorbescheidFrage);
  set('vorbescheid-eingereicht', v.vorbescheidEingereichtAm);
  set('vorbescheid-erhalten', v.vorbescheidErhaltenAm);
  set('vorbescheid-ergebnis', v.vorbescheidErgebnis);
  set('vorbescheid-gueltig', v.vorbescheidGueltigBis);
  document.getElementById('bestand-befreiung-felder').classList.toggle('hidden', !v.bestandBefreiung);
  document.getElementById('vorbescheid-felder').classList.toggle('hidden', !v.vorbescheidGenutzt);
}
