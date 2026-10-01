// Login: echter Supabase-Login (E-Mail/Passwort), sobald supabase-config.js gültige
// Zugangsdaten enthält (window.sb gesetzt) — sonst Fallback auf den bisherigen
// Testzugang, rein im Browser, ohne echten Schutz. #boot-loading verdeckt beides,
// bis feststeht, ob direkt eingestiegen werden kann oder das Formular nötig ist.
(function(){
  const AUTH_KEY = 'pa_auth_v1';
  const LEGACY_USERS = { 'test': 'test123' };
  const boot = document.getElementById('boot-loading');
  const view = document.getElementById('view-login');
  const err = document.getElementById('login-error');
  const form = document.getElementById('login-form');
  const userInput = document.getElementById('login-user');
  const passInput = document.getElementById('login-pass');
  const submitBtn = form.querySelector('button[type="submit"]');

  window.paCurrentUser = function(){ return window.__paUser || ''; };

  function hideBoot(){ boot.classList.add('hidden'); }
  function showLogin(message){
    hideBoot();
    view.classList.remove('hidden');
    if(message){ err.textContent = message; err.classList.add('show'); }
    userInput.focus();
  }
  function setBusy(busy){
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Anmelden …' : 'Anmelden';
  }

  if(window.PA_DEV_MODE){
    // ---- Entwicklungsmodus: direkt rein, ohne Formular ----
    window.__paUser = window.PA_DEMO ? 'demo' : 'dev';
    window.paLogout = function(){ location.reload(); };
    if(window.__paLoadProfile) window.__paLoadProfile();
    hideBoot();

  } else if(window.sb){
    // ---- Echter Supabase-Login ----
    document.getElementById('login-user-label').textContent = 'E-Mail';
    userInput.type = 'email'; userInput.autocomplete = 'email';
    document.getElementById('login-remember-row').style.display = 'none'; // Supabase merkt die Sitzung selbst
    document.getElementById('login-hint').style.display = 'none';

    window.paLogout = function(){ window.sb.auth.signOut().then(() => location.reload()); };

    async function onAuthed(session){
      window.__paUser = session.user.email;
      window.__paUserId = session.user.id;
      view.classList.add('hidden'); // Formular weg, Boot-Anzeige bleibt bis nach der Hydration sichtbar
      try { await window.__paHydrateFromSupabase(); }
      catch(e){ console.error('Supabase-Hydration fehlgeschlagen, zeige zwischengespeicherten Stand.', e); }
      if(window.__paLoadProfile) window.__paLoadProfile();
      hideBoot();
      if(window.__paMigriereDateien) window.__paMigriereDateien();
    }

    window.sb.auth.getSession().then(({ data }) => {
      if(data.session) onAuthed(data.session); else showLogin();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setBusy(true);
      const { data, error } = await window.sb.auth.signInWithPassword({
        email: userInput.value.trim(), password: passInput.value
      });
      setBusy(false);
      if(error){
        err.textContent = 'Anmeldung fehlgeschlagen: ' + (error.message || 'unbekannter Fehler');
        err.classList.add('show');
        passInput.value = ''; passInput.focus();
        return;
      }
      err.classList.remove('show');
      onAuthed(data.session);
    });

  } else {
    // ---- Alter Testzugang, solange keine Supabase-Zugangsdaten hinterlegt sind ----
    window.paLogout = function(){
      sessionStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_KEY);
      location.reload();
    };
    // Gespeichert wird der Benutzername (für das Aktivitätslog: „wer").
    // Altbestand: früher wurde nur '1' gespeichert → als Benutzer „test" deuten.
    function storedAuth(){
      return sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY) || '';
    }
    const stored = storedAuth();
    if(stored){
      window.__paUser = stored === '1' ? 'test' : stored;
      if(window.__paLoadProfile) window.__paLoadProfile();
      hideBoot();
    } else { showLogin(); }

    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const user = userInput.value.trim();
      const pass = passInput.value;
      if(LEGACY_USERS[user] !== undefined && LEGACY_USERS[user] === pass){
        (document.getElementById('login-remember').checked ? localStorage : sessionStorage).setItem(AUTH_KEY, user);
        window.__paUser = user;
        if(window.__paLoadProfile) window.__paLoadProfile();
        view.classList.add('hidden');
      } else {
        err.classList.add('show');
        passInput.value = '';
        passInput.focus();
      }
    });
  }
})();
