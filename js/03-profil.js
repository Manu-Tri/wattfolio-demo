// Profil-Menü mit Avatar (Supabase „profiles“/„avatars“ oder lokal)
// Teil von projektanfragen.html — alle Skripte teilen sich den globalen Scope und
// werden in Dateinamen-Reihenfolge geladen (siehe <script>-Liste dort).

// ═════════════════════════════════════════════════════════════════════════════
// Profil-Menü: Avatar oben rechts im Header, Anzeigename + Profilbild. Im
// Supabase-Modus in der Tabelle "profiles" + Storage-Bucket "avatars" (öffentlich
// lesbar — siehe supabase/schema-profiles.sql), sonst lokal in localStorage als
// einfacher Fallback ohne Geräte-Sync.
// ═════════════════════════════════════════════════════════════════════════════
const LS_PROFILE = 'pa_profile_v1';
let currentProfile = { displayName:'', avatarUrl:'' };
const profileCache = {}; // E-Mail -> {displayName, avatarUrl} — für Avatare im Aktivitätslog

function initials(text){
  const t = (text||'').trim();
  if(!t) return '?';
  const parts = t.split(/[\s@._-]+/).filter(Boolean);
  const second = parts.length > 1 ? (parts[1]||'')[0] : (parts[0]||'')[1];
  return ((parts[0]||'')[0] + (second||'')).toUpperCase();
}
function avatarHtml(profile, fallbackName){
  if(profile && profile.avatarUrl) return `<img src="${escapeAttr(profile.avatarUrl)}" alt="" />`;
  return escapeHtml(initials((profile && profile.displayName) || fallbackName));
}
function renderProfileUi(){
  const label = currentProfile.displayName || window.paCurrentUser() || '';
  document.getElementById('profile-avatar-btn').innerHTML = avatarHtml(currentProfile, label);
  document.getElementById('profile-avatar-lg').innerHTML = avatarHtml(currentProfile, label);
  document.getElementById('profile-name-display').textContent = currentProfile.displayName || window.paCurrentUser() || 'Profil';
  document.getElementById('profile-email-display').textContent = window.sb ? (window.paCurrentUser()||'') : '';
  const nameInput = document.getElementById('profile-name-input');
  if(document.activeElement !== nameInput) nameInput.value = currentProfile.displayName || '';
}

async function loadProfile(){
  if(window.sb && window.__paUserId){
    const { data, error } = await window.sb.from('profiles')
      .select('display_name,avatar_path').eq('id', window.__paUserId).maybeSingle();
    if(!error && data){
      currentProfile.displayName = data.display_name || '';
      currentProfile.avatarUrl = data.avatar_path
        ? window.sb.storage.from('avatars').getPublicUrl(data.avatar_path).data.publicUrl + '?t=' + Date.now()
        : '';
    } else if(!error && !data){
      // Noch keine Profilzeile (Name/Bild nie gespeichert): anlegen, damit das Konto in der
      // Team-Auswahl (z. B. „Zuständig" in den Aufgaben) auftaucht.
      await window.sb.from('profiles').upsert({ id: window.__paUserId, email: window.paCurrentUser(), updated_at: new Date().toISOString() });
    }
    // Team-Profile für Zuweisungen laden und offene Aufgabenliste mit den Namen neu zeichnen
    loadProfileCacheForActivity().then(() => {
      if(typeof renderProzessTasks === 'function' && typeof getActiveProject === 'function' && getActiveProject()) renderProzessTasks();
      if(typeof aktualisiereGlocke === 'function') aktualisiereGlocke(); // Namen/Bilder der Absender
    }).catch(() => {});
  } else {
    try { Object.assign(currentProfile, JSON.parse(localStorage.getItem(LS_PROFILE)) || {}); } catch{}
  }
  renderProfileUi();
}
window.__paLoadProfile = loadProfile;

async function saveProfileName(name){
  currentProfile.displayName = name;
  renderProfileUi();
  if(window.sb && window.__paUserId){
    const { error } = await window.sb.from('profiles').upsert({
      id: window.__paUserId, display_name: name, email: window.paCurrentUser(), updated_at: new Date().toISOString()
    });
    if(error) console.error('Profilname konnte nicht gespeichert werden.', error);
  } else {
    try { localStorage.setItem(LS_PROFILE, JSON.stringify(currentProfile)); } catch{}
  }
}

// Verkleinert ein hochgeladenes Bild clientseitig auf max. maxSize px (längste Kante)
// und komprimiert als JPEG — hält Profilbilder klein genug für flottes Laden im
// Aktivitätslog, ganz ohne Server-Bildverarbeitung.
function resizeImageToBlob(file, maxSize){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Kein gültiges Bild.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden.')), 'image/jpeg', 0.88);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadAvatar(file){
  if(!file.type.startsWith('image/')){ alert('Bitte ein Bild auswählen.'); return; }
  let blob;
  try { blob = await resizeImageToBlob(file, 256); }
  catch(e){ alert('Bild konnte nicht verarbeitet werden: ' + e.message); return; }

  if(window.sb && window.__paUserId){
    const path = window.__paUserId + '/avatar.jpg';
    const { error: upErr } = await window.sb.storage.from('avatars')
      .upload(path, blob, { upsert:true, contentType:'image/jpeg' });
    if(upErr){
      console.error('Avatar-Upload fehlgeschlagen', { path, status: upErr.statusCode || upErr.status, upErr });
      alert('Hochladen fehlgeschlagen: ' + upErr.message + (upErr.statusCode ? ' (Status ' + upErr.statusCode + ')' : ''));
      return;
    }
    const { error } = await window.sb.from('profiles').upsert({
      id: window.__paUserId, avatar_path: path, email: window.paCurrentUser(), updated_at: new Date().toISOString()
    });
    if(error){
      console.error('Profil-Upsert fehlgeschlagen', { userId: window.__paUserId, error });
      alert('Profil konnte nicht aktualisiert werden: ' + error.message);
      return;
    }
    currentProfile.avatarUrl = window.sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?t=' + Date.now();
  } else {
    const reader = new FileReader();
    currentProfile.avatarUrl = await new Promise(res => { reader.onload = () => res(reader.result); reader.readAsDataURL(blob); });
    try { localStorage.setItem(LS_PROFILE, JSON.stringify(currentProfile)); } catch{}
  }
  renderProfileUi();
}

function closeProfileDropdown(){
  document.getElementById('profile-dropdown').classList.add('hidden');
  document.getElementById('btn-profile').setAttribute('aria-expanded', 'false');
}
document.getElementById('btn-profile').addEventListener('click', (e) => {
  e.stopPropagation();
  const dd = document.getElementById('profile-dropdown');
  const willOpen = dd.classList.contains('hidden');
  dd.classList.toggle('hidden');
  document.getElementById('btn-profile').setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('click', (e) => {
  if(!document.getElementById('profile-menu').contains(e.target)) closeProfileDropdown();
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeProfileDropdown(); });

document.getElementById('profile-avatar-wrap').addEventListener('click', () => document.getElementById('profile-avatar-input').click());
document.getElementById('profile-avatar-input').addEventListener('change', (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if(file) uploadAvatar(file);
});
const profileNameInput = document.getElementById('profile-name-input');
profileNameInput.addEventListener('keydown', e => { if(e.key === 'Enter') profileNameInput.blur(); });
profileNameInput.addEventListener('blur', () => {
  const v = profileNameInput.value.trim();
  if(v !== (currentProfile.displayName||'')) saveProfileName(v);
});

// Für Avatare im Aktivitätslog: alle Profile einmal im Voraus laden (nur Supabase-Modus —
// im Fallback gibt es ohnehin nur das eine lokale Profil, siehe renderActivityList).
async function loadProfileCacheForActivity(){
  if(!window.sb) return;
  const { data, error } = await window.sb.from('profiles').select('email,display_name,avatar_path');
  if(error) return;
  (data||[]).forEach(row => {
    if(!row.email) return;
    profileCache[row.email] = {
      displayName: row.display_name || '',
      avatarUrl: row.avatar_path ? window.sb.storage.from('avatars').getPublicUrl(row.avatar_path).data.publicUrl : ''
    };
  });
}
// Team-Profile als Auswahlliste (Aufgaben → „Zuständig"). Schlüssel ist die E-Mail — sie
// steht auch im Aktivitätslog als „wer" und ist über Namensänderungen hinweg stabil.
// Ohne Supabase gibt es nur das eigene lokale Profil.
function teamProfile(){
  const liste = Object.entries(profileCache).map(([email, pr]) => ({ email, displayName: pr.displayName, avatarUrl: pr.avatarUrl }));
  const ich = window.paCurrentUser ? window.paCurrentUser() : '';
  if(ich && !profileCache[ich]) liste.push({ email: ich, displayName: currentProfile.displayName, avatarUrl: currentProfile.avatarUrl });
  return liste.map(t => Object.assign(t, { name: t.displayName || nameAusEmail(t.email) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
// Ohne gepflegten Anzeigenamen: Name aus dem Teil vor dem @ bilden („anna.schmidt" → „Anna Schmidt"),
// damit in der Oberfläche keine E-Mail-Adresse erscheint.
function nameAusEmail(email){
  const lokal = String(email || '').split('@')[0];
  return lokal.split(/[._-]+/).filter(Boolean).map(t => t[0].toUpperCase() + t.slice(1)).join(' ') || 'Unbekannt';
}
function teamProfil(email){ return email ? teamProfile().find(t => t.email === email) || null : null; }

// Dezentes „gespeichert"-Feedback unten rechts; bei schnellen Folge-Speicherungen
// bleibt der Toast einfach länger stehen statt zu flackern.
let saveToastTimer = null;
function showSaveToast(){
  const el = document.getElementById('save-toast'); if(!el) return;
  el.classList.add('show');
  clearTimeout(saveToastTimer);
  saveToastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}
function touchActiveProject(){ const p = getActiveProject(); if(p) p.updatedAt = new Date().toISOString(); }

function combinedFeatureCollection(project){ return { type:'FeatureCollection', features: project.features }; }
// Projektfläche in m². Überlappen sich zwei Teilflächen, darf die Schnittmenge nur EINMAL
// zählen — ein simples Aufsummieren überschätzt die Größe (gemessen: 33 % bei zwei je zur
// Hälfte überlappenden Flächen) und verfälscht damit ha-Angabe, Sortierung und alles, was
// daran hängt. Deshalb dieselbe Vereinigung wie bei der Flurstücks-Verschneidung.
function combinedArea(project){
  const feats = (project && project.features) || [];
  if(!feats.length) return 0;
  if(feats.length === 1) return turf.area(feats[0]);
  const vereint = projektGeometrieVereint(feats);
  // Union gescheitert: Summe als Näherung. Überschätzt bei Überlappung, ist aber deutlich
  // näher an der Wahrheit als nur eine einzelne Teilfläche zu zählen.
  return vereint ? turf.area(vereint) : feats.reduce((sum,f) => sum + turf.area(f), 0);
}
function combinedBounds(project){ return L.geoJSON(combinedFeatureCollection(project)).getBounds(); }

// Verschmilzt die Teilflächen des Projekts zu EINER Geometrie. Ohne diesen Schritt würde die
// Schnittfläche je Flurstück doppelt gezählt, sobald sich zwei Teilflächen auf demselben
// Flurstück überlappen — beim Nachzeichnen von Hand passiert genau das regelmäßig.
// Liefert bei Misserfolg null (nicht etwa die erste Teilfläche): eine stillschweigend zu
// kleine Geometrie würde sonst zu falschen Pachtflächen führen, und falsche Zahlen sind
// hier schlimmer als gar keine.
function projektGeometrieVereint(features){
  if(!features || !features.length) return null;
  try {
    return features.reduce((acc, f) => acc ? (turf.union(acc, f) || acc) : f, null);
  } catch {
    return null;
  }
}

// Wie viele m² des Projektpolygons fallen auf dieses Flurstück?
// Das ist die planungsrelevante Größe: gepachtet wird nur der Teil des Flurstücks, der
// tatsächlich im Projektgebiet liegt — nicht das ganze Flurstück (f.flaeche = amtliche Fläche).
// Rückgabe in m², auf ganze Zahlen gerundet; null, wenn die Berechnung nicht möglich war.
function schnittflaecheM2(projektGeom, flurstueckFeature){
  if(!projektGeom || !flurstueckFeature) return null;
  try {
    const s = turf.intersect(projektGeom, flurstueckFeature);
    return s ? Math.round(turf.area(s)) : 0;
  } catch {
    return null;
  }
}
