// Allgemeine Hilfsfunktionen, die schon beim Laden der übrigen Skripte gebraucht werden
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

function loadOr(key, fallback){
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
  catch { return fallback; }
}
function save(key, value){
  try {
    localStorage.setItem(key, JSON.stringify(value));
    scheduleFileWrite(); // Datei-Sync (falls verbunden) — zentral hier, da alle Speicherungen durch save() laufen
    scheduleSupabaseWrite(key); // Supabase-Sync (falls konfiguriert) — dito, siehe weiter unten
  } catch(err){
    alert('Speichern fehlgeschlagen: ' + err.message + '\n\nDas Projekt konnte nicht gespeichert werden. Öffne die Datei über einen lokalen Server (nicht per Doppelklick/"file://") oder prüfe, ob der private/inkognito-Modus bzw. Speicherplatz-Beschränkungen im Browser lokale Speicherung blockieren.');
  }
}

function escapeHtml(s){ return (s||'').replace(/[<>&"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
// Flur-Angabe einheitlich als „Flur 12" — je nach ALKIS-Quelle kommt „12" oder schon „Flur 12".
function flurText(v){ const t = String(v ?? '').trim(); return !t ? 'Flur —' : /^flur\b/i.test(t) ? t : `Flur ${t}`; }
// Mehrzeiliges Feld, das mit dem Inhalt wächst (lange Namen/Notizen umbrechen statt abgeschnitten).
function gsGrow(el){
  el.style.height = 'auto';
  if(el.scrollHeight) el.style.height = el.scrollHeight + 2 + 'px'; // verdeckt (Höhe 0): beim Anzeigen erneut, siehe switchGrundstueckSubtab
}
