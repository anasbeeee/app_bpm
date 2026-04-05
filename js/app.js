/**
 * BPM SYNC — App.js v4
 * - Covers depuis Deezer sur toutes les tracks
 * - Enchaînement automatique des morceaux
 * - Musique adaptée au BPM en session
 * - Clic sur n'importe quelle track → lecture
 */

// ═══════════════════════════════════════════════════════
//  ÉTAT GLOBAL
// ═══════════════════════════════════════════════════════
const State = {
  currentScreen:    'login',
  sessionActive:    false,
  bpm:              68,
  bpmSource:        'simulator',
  spotifyConnected: false,
  watchConnected:   false,
  watchName:        null,
  steps:            0,
  stepsGoal:        10000,
  streak:           10,
  recentTracks:     [],
  recoTracks:       [],
  playlists:        [],
  queue:            [], // file de lecture en session
  queueIndex:       0,
  isPlaying:        false,
  currentTrackInfo: null,
  map:              null,
  mapPolyline:      null,
  mapMarker:        null,
  simStopFn:        null,
};

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
const $  = id => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

function showToast(msg, duration = 2400) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function esc(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function coverPlaceholder(name, fontSize = '11px') {
  const initials = (name || '??').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.5);font-size:${fontSize};font-weight:700;letter-spacing:1px">${initials}</div>`;
}

// ═══════════════════════════════════════════════════════
//  PLAYER — enchaînement, BPM adaptatif, file de lecture
// ═══════════════════════════════════════════════════════
const Player = (() => {
  let audio     = null;
  let queueMode = false; // true = session avec enchaînement, false = lecture unique
  const cbs     = new Set();

  function emit(data) { cbs.forEach(fn => fn(data)); }

  function playAudio(url, info, onEnd) {
    // Arrête proprement l'audio précédent
    if (audio) {
      audio.pause();
      audio.onended  = null;
      audio.onerror  = null;
      audio.src = '';
      audio = null;
    }

    const a = new Audio();
    a.volume      = 0.8;
    a.preload     = 'auto';

    a.oncanplaythrough = () => {
      a.play().then(() => {
        audio = a;
        State.isPlaying       = true;
        State.currentTrackInfo = info;
        emit({ playing: true, track: info });
        updateNowPlayingBar(info);
      }).catch(err => {
        console.warn('[Player] autoplay bloqué:', err.message);
        // L'audio est prêt, on attend l'interaction utilisateur
        audio = a;
        State.currentTrackInfo = info;
        updateNowPlayingBar(info);
        showToast('Appuie sur ▶ pour lancer la musique');
      });
    };

    a.onended = () => {
      State.isPlaying = false;
      emit({ playing: false, track: null });
      if (queueMode && onEnd) onEnd();
      else updateNowPlayingBar(null);
    };

    a.onerror = () => {
      console.warn('[Player] Erreur audio, morceau suivant');
      State.isPlaying = false;
      if (queueMode && onEnd) setTimeout(onEnd, 300);
    };

    a.src = url;
    a.load();
  }

  return {
    // Joue un seul morceau (clic depuis liste) — pas d'enchaînement
    playOne(url, info) {
      if (!url) { showToast('Pas d\'extrait disponible'); return; }
      queueMode = false;
      playAudio(url, info, null);
    },

    // Lance une file avec enchaînement automatique (session)
    playQueue(tracks) {
      const withPreview = tracks.filter(t => t.previewUrl);
      if (!withPreview.length) { showToast('Aucun extrait disponible'); return; }
      queueMode        = true;
      State.queue      = withPreview;
      State.queueIndex = 0;
      this._playIndex(0);
    },

    _playIndex(idx) {
      if (!queueMode) return;
      // Boucle en fin de file
      const realIdx = idx % State.queue.length;
      State.queueIndex = realIdx;
      const t = State.queue[realIdx];
      if (!t?.previewUrl) { this._playIndex(realIdx + 1); return; }

      playAudio(t.previewUrl, { name: t.name, artist: t.artist, image: t.image }, () => {
        if (queueMode) this._playIndex(realIdx + 1);
      });
    },

    next() {
      if (!State.queue.length) return;
      this._playIndex(State.queueIndex + 1);
    },

    prev() {
      if (!State.queue.length) return;
      const idx = (State.queueIndex - 1 + State.queue.length) % State.queue.length;
      this._playIndex(idx);
    },

    pause()  {
      if (audio && !audio.paused) { audio.pause(); State.isPlaying = false; emit({ playing: false }); }
    },
    resume() {
      if (audio && audio.paused) {
        audio.play().then(() => { State.isPlaying = true; emit({ playing: true }); }).catch(() => {});
      }
    },
    toggle() { audio?.paused ? this.resume() : this.pause(); },

    stop() {
      queueMode = false;
      if (audio) { audio.pause(); audio.onended = null; audio.onerror = null; audio.src = ''; audio = null; }
      State.isPlaying        = false;
      State.currentTrackInfo = null;
      State.queue            = [];
      emit({ playing: false, track: null });
      updateNowPlayingBar(null);
    },

    isActive() { return audio && !audio.paused; },
    onChange(fn) { cbs.add(fn); return () => cbs.delete(fn); },
  };
})();

function updateNowPlayingBar(track) {
  const titleEl = $('now-playing-title');
  if (!titleEl) return;
  titleEl.textContent = track
    ? `${track.name} — ${track.artist}`
    : 'Connecte Spotify pour lancer la musique';
}

on($('now-playing-bar'), 'click', () => {
  if (State.queue.length) Player.toggle();
  else navigateTo('music');
});

// ═══════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════
const SCREENS = {
  login:'screen-login', play:'screen-play', session:'screen-session',
  music:'screen-music', sport:'screen-sport', history:'screen-history', settings:'screen-settings',
};
const NAV_ACTIVE = {
  play:'play', session:'play', music:'music', sport:'sport', history:'history', settings:'settings',
};

function navigateTo(key) {
  if (!SCREENS[key]) return;
  Object.values(SCREENS).forEach(id => $(id)?.classList.remove('active'));
  $(SCREENS[key]).classList.add('active');
  State.currentScreen = key;

  const navActive = NAV_ACTIVE[key] || key;
  document.querySelectorAll('.nav-item[data-nav]').forEach(item =>
    item.classList.toggle('active', item.dataset.nav === navActive)
  );

  if (key === 'music')    renderMusicScreen();
  if (key === 'sport')    initSportScreen();
  if (key === 'history')  renderHistoryScreen();
  if (key === 'settings') initSettingsScreen();

  closeDrawer();
}

function resolveNav(dest) {
  return dest === 'play' ? (State.sessionActive ? 'session' : 'play') : dest;
}

document.querySelectorAll('.nav-item[data-nav]').forEach(item =>
  on(item, 'click', () => navigateTo(resolveNav(item.dataset.nav)))
);
document.querySelectorAll('.tab[data-tab]').forEach(tab =>
  on(tab, 'click', () => {
    const MAP = { play:'play', music:'music', sport:'sport' };
    if (MAP[tab.dataset.tab]) navigateTo(MAP[tab.dataset.tab]);
  })
);

const drawer = $('drawer'), drawerOverlay = $('drawer-overlay');
function openDrawer()  { drawer?.classList.add('open'); drawerOverlay?.classList.add('open'); }
function closeDrawer() { drawer?.classList.remove('open'); drawerOverlay?.classList.remove('open'); }
on(drawerOverlay, 'click', closeDrawer);
document.querySelectorAll('.hamburger').forEach(h => on(h, 'click', openDrawer));
document.querySelectorAll('.drawer-item[data-nav]').forEach(item =>
  on(item, 'click', () => navigateTo(resolveNav(item.dataset.nav)))
);
on($('btn-back-history'),  'click', () => navigateTo('music'));
on($('btn-back-settings'), 'click', () => navigateTo(State.sessionActive ? 'session' : 'play'));

// ═══════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════
let isSignup = true;
on($('login-toggle'), 'click', () => {
  isSignup = !isSignup;
  $('login-mode-label').textContent = isSignup ? 'Créer un compte' : 'Se connecter';
  $('login-toggle').textContent     = isSignup ? 'Se connecter'    : 'Créer un compte';
});
on($('btn-continue'), 'click', () => {
  const email = $('login-email')?.value.trim();
  if (!email?.includes('@')) { showToast('Saisis un e-mail valide'); return; }
  showToast('Connexion en cours…');
  setTimeout(() => enterApp(false), 900);
});
on($('btn-spotify'),  'click', async () => { showToast('Redirection vers Spotify…'); await SpotifyManager.login(); });
on($('btn-deezer'),   'click', () => showToast('Deezer — bientôt disponible'));
on($('btn-youtube'),  'click', () => showToast('YouTube Music — bientôt disponible'));

// ═══════════════════════════════════════════════════════
//  ENTER APP
// ═══════════════════════════════════════════════════════
async function enterApp(withSpotify = false) {
  State.spotifyConnected = withSpotify;
  BpmSimulator.start();
  navigateTo('play');

  showToast('Chargement des musiques…');
  try {
    if (withSpotify) {
      await loadSpotifyData();
      updateSpotifySettingsUI(true);
    } else {
      await loadDeezerFallback();
    }
    showToast('Musiques prêtes ✓');
  } catch (e) {
    console.error('[enterApp]', e);
    await loadDeezerFallback().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════
//  CHARGEMENT DONNÉES
// ═══════════════════════════════════════════════════════
async function loadSpotifyData() {
  // 1. Écoutes récentes Spotify → enrichies avec covers + previews Deezer
  const recent = await SpotifyManager.getRecentlyPlayed(20);
  if (recent.length) {
    State.recentTracks = await DeezerManager.enrichWithPreviews(recent, 4);
  }

  // 2. Recommandations
  const seedIds = recent.slice(0, 5).map(t => t.id).filter(Boolean);
  if (seedIds.length) {
    const recos = await SpotifyManager.getRecommendations(seedIds);
    if (recos.length) {
      State.recoTracks = await DeezerManager.enrichWithPreviews(recos, 4);
    } else {
      // Fallback : chart Deezer si Spotify reco vide
      State.recoTracks = await DeezerManager.getChart(16);
    }
  } else {
    State.recoTracks = await DeezerManager.getChart(16);
  }

  // 3. Playlists par genre
  const spotifyGenres = await SpotifyManager.getTopGenres();
  if (spotifyGenres.length) {
    State.playlists = await Promise.all(spotifyGenres.map(async g => ({
      ...g,
      tracks: await DeezerManager.enrichWithPreviews(g.tracks || [], 3),
    })));
  } else {
    await buildDeezerPlaylists();
  }
}

async function loadDeezerFallback() {
  const chart = await DeezerManager.getChart(20);
  State.recentTracks = chart;
  State.recoTracks   = await DeezerManager.getChart(16); // section recos aussi
  await buildDeezerPlaylists();
}

async function buildDeezerPlaylists() {
  const GENRES = ['pop', 'rap', 'electronic', 'rnb'];
  State.playlists = await Promise.all(GENRES.map(async genre => {
    const tracks = await DeezerManager.getTracksByGenre(genre, 15);
    return {
      name:   genre.charAt(0).toUpperCase() + genre.slice(1),
      count:  tracks.length,
      image:  tracks[0]?.image || null,
      tracks,
    };
  }));
}

// ═══════════════════════════════════════════════════════
//  BLE
// ═══════════════════════════════════════════════════════
on($('ble-status-btn'), 'click', async () => {
  if (State.watchConnected) { await BluetoothManager.disconnect(); return; }
  if (!BluetoothManager.isSupported()) { showToast('Utilise Chrome Android pour le Bluetooth'); return; }
  setBleUI('searching');
  try {
    const name = await BluetoothManager.connect();
    State.watchConnected = true; State.watchName = name; State.bpmSource = 'watch';
    setBleUI('connected', name);
    showToast(`${name} connectée ✓`);
  } catch (err) {
    setBleUI('disconnected');
    if (err.name !== 'NotFoundError') showToast('Connexion échouée');
  }
});

function setBleUI(status, name = '') {
  const dot  = $('ble-dot');
  const text = $('ble-status-text');
  const chip = $('watch-chip');
  const lbl  = $('ble-settings-label');
  if (status === 'connected') {
    if (dot)  dot.className     = 'ble-dot connected';
    if (text) text.textContent  = name || 'Montre connectée';
    if (chip) chip.textContent  = (name || 'Montre') + ' connectée';
    if (lbl)  lbl.textContent   = name || 'Connectée';
  } else if (status === 'searching') {
    if (dot)  dot.className     = 'ble-dot searching';
    if (text) text.textContent  = 'Recherche…';
  } else {
    if (dot)  dot.className     = 'ble-dot';
    if (text) text.textContent  = 'Connecter une montre';
    if (chip) chip.textContent  = 'Montre non connectée';
    if (lbl)  lbl.textContent   = 'Non connectée';
  }
}

BluetoothManager.onBpm(({ bpm }) => updateBpmEverywhere(bpm, 'watch'));
BluetoothManager.onConnection(({ connected, deviceName }) => {
  State.watchConnected = connected;
  setBleUI(connected ? 'connected' : 'disconnected', deviceName);
  if (!connected && State.bpmSource === 'watch') {
    State.bpmSource = 'simulator';
    showToast('Montre déconnectée — simulation activée');
  }
});

// ═══════════════════════════════════════════════════════
//  SESSION
// ═══════════════════════════════════════════════════════
on($('btn-start'), 'click', startSession);
on($('btn-stop-session'), 'click', stopSession);

function startSession() {
  State.sessionActive = true;
  BpmSimulator.startSession();
  if ($('toggle-gps')?.checked !== false)       SensorsManager.startGps();
  if ($('toggle-pedometer')?.checked !== false) SensorsManager.startPedometer().catch(() => {});
  State.simStopFn = SensorsManager.simulateSteps();
  navigateTo('session');
  showToast('Session démarrée ✓');
  // Lance la file de lecture adaptée au BPM après un court délai
  setTimeout(() => launchSessionQueue(), 800);
}

function stopSession() {
  State.sessionActive = false;
  BpmSimulator.stopSession();
  SensorsManager.stopGps();
  SensorsManager.stopPedometer();
  Player.stop();
  if (State.simStopFn) { State.simStopFn(); State.simStopFn = null; }
  navigateTo('play');
  showToast('Session terminée');
}

// Lance la file de lecture adaptée au BPM actuel
function launchSessionQueue() {
  const queue = buildQueueForBpm(State.bpm);
  if (queue.length) {
    Player.playQueue(queue);
  } else {
    // Fallback : toutes les tracks dispo
    const allTracks = getAllTracksWithPreview();
    if (allTracks.length) Player.playQueue(allTracks);
  }
}

// Construit une file de tracks adaptée au BPM
// BPM < 80 → musique calme (bossa nova, pop douce)
// BPM 80-120 → mix pop / rnb
// BPM > 120 → énergie (rap, électro)
function buildQueueForBpm(bpm) {
  // 1. Écoutes récentes de l'utilisateur en priorité
  const recentWithPreview = State.recentTracks.filter(t => t.previewUrl);
  // 2. Recommandations basées sur ses goûts
  const recoWithPreview   = State.recoTracks.filter(t => t.previewUrl);
  // 3. Playlists par genre selon le BPM
  let genreTracks = [];
  if (State.playlists.length) {
    let targetPlaylist = null;
    if (bpm < 80)       targetPlaylist = State.playlists.find(p => /bossa|jazz|chill|soul|slow/i.test(p.name));
    else if (bpm < 110) targetPlaylist = State.playlists.find(p => /pop|rnb|r&b/i.test(p.name));
    else                targetPlaylist = State.playlists.find(p => /rap|electro|hip|dance/i.test(p.name));
    if (!targetPlaylist) targetPlaylist = State.playlists[0];
    genreTracks = (targetPlaylist?.tracks || []).filter(t => t.previewUrl);
  }

  // Mélange en priorisant les goûts de l'utilisateur
  // Structure : 50% écoutes récentes + 30% recos + 20% genre
  const queue = [];
  const recent = shuffle(recentWithPreview);
  const recos  = shuffle(recoWithPreview);
  const genres = shuffle(genreTracks);

  // Entrelace les sources pour varier
  const maxLen = Math.max(recent.length, recos.length, genres.length, 1);
  for (let i = 0; i < maxLen; i++) {
    if (i < recent.length) queue.push(recent[i]);
    if (i < recos.length)  queue.push(recos[i]);
    if (i < genres.length && i % 3 === 0) queue.push(genres[i]); // 1 genre pour 2 perso
  }

  // Si on a rien du tout → fallback toutes tracks
  if (!queue.length) return shuffle(getAllTracksWithPreview());

  return queue;
}

// Quand le BPM change de zone en session → adapte la musique
let lastBpmZone = '';
BpmSimulator.onChange(({ bpm, zone, color, bg, conseil }) => {
  if (State.bpmSource === 'simulator') updateBpmEverywhere(bpm, 'simulator', { zone, color, bg, conseil });

  // Change la file de lecture si on change de zone cardio en session
  if (State.sessionActive && zone !== lastBpmZone) {
    lastBpmZone = zone;
    if (State.queue.length) {
      const newQueue = buildQueueForBpm(bpm);
      if (newQueue.length) {
        State.queue      = newQueue;
        State.queueIndex = 0;
        // Ne coupe pas la musique en cours, changement au prochain morceau
      }
    }
  }
});

// Idem pour la vraie montre
BluetoothManager.onBpm(({ bpm }) => {
  updateBpmEverywhere(bpm, 'watch');
  if (State.sessionActive) {
    const zone = BpmSimulator.getZone().label;
    if (zone !== lastBpmZone) {
      lastBpmZone = zone;
      const newQueue = buildQueueForBpm(bpm);
      if (newQueue.length) { State.queue = newQueue; State.queueIndex = 0; }
    }
  }
});

function getAllTracksWithPreview() {
  return [
    ...State.recentTracks,
    ...State.recoTracks,
    ...(State.playlists.flatMap(p => p.tracks || [])),
  ].filter(t => t.previewUrl);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════
//  BPM DISPLAY
// ═══════════════════════════════════════════════════════
function updateBpmEverywhere(bpm, source, meta = null) {
  State.bpm = bpm; State.bpmSource = source;
  if (!meta) {
    const z = BpmSimulator.getZone();
    meta = { zone: z.label, color: z.color, bg: z.bg, conseil: conseilForBpm(bpm) };
  }
  const numEl = $('bpm-number');
  if (numEl) {
    numEl.textContent = bpm;
    const svg = numEl.closest('.heart-section')?.querySelector('.heart-svg');
    if (svg) svg.style.animationDuration = `${Math.max(0.35, 1.1 - (bpm - 60) / 220)}s`;
  }
  const zoneEl = $('bpm-zone');
  if (zoneEl) { zoneEl.textContent = meta.zone; zoneEl.style.background = meta.bg; zoneEl.style.color = meta.color; }
  const cEl = $('conseil-text');
  if (cEl && meta.conseil) cEl.textContent = meta.conseil;
  const mVal = $('music-bpm-val');   if (mVal) mVal.textContent = bpm;
  const mSt  = $('music-bpm-state'); if (mSt)  mSt.textContent = meta.zone;
}

function conseilForBpm(bpm) {
  if (bpm < 60)  return 'Rythme très bas. Vérifiez le capteur.';
  if (bpm < 80)  return 'Vous êtes au repos. Prêt à commencer ?';
  if (bpm < 100) return 'Bonne cadence ! Corps bien échauffé.';
  if (bpm < 130) return 'Zone idéale pour brûler des graisses.';
  if (bpm < 160) return 'Effort soutenu. Pensez à bien respirer.';
  return 'Zone rouge ! Faites une pause et hydratez-vous.';
}

// ═══════════════════════════════════════════════════════
//  CAPTEURS
// ═══════════════════════════════════════════════════════
SensorsManager.onSteps(({ count }) => { State.steps = count; renderSteps(count); });
SensorsManager.onGps(({ distance, positions }) => {
  const km = (distance / 1000).toFixed(1).replace('.', ',');
  const el = $('sport-distance');
  if (el) el.textContent = `${km} km →`;
  updateMapTrace(positions);
});

function renderSteps(count) {
  const el  = $('steps-count');
  const bar = $('steps-progress-bar');
  if (el)  el.textContent  = count.toLocaleString('fr-FR');
  if (bar) bar.style.width = Math.min(100, count / State.stepsGoal * 100).toFixed(1) + '%';
}

// ═══════════════════════════════════════════════════════
//  RENDER MUSIQUE
// ═══════════════════════════════════════════════════════
on($('btn-see-history'), 'click', () => navigateTo('history'));
on($('add-to-spotify'),  'click', async () => {
  if (!State.spotifyConnected) { showToast('Connecte Spotify d\'abord'); return; }
  const uris = State.recentTracks.map(t => t.uri).filter(Boolean);
  if (!uris.length) { showToast('Aucune musique à ajouter'); return; }
  showToast('Création de la playlist…');
  const pl = await SpotifyManager.createPlaylist('BPM Sync — Mes écoutes', uris);
  showToast(pl ? 'Playlist créée sur Spotify ✓' : 'Erreur lors de la création');
});

function renderMusicScreen() {
  renderSteps(State.steps);
  renderRecentAlbums(State.recentTracks.length ? State.recentTracks : null);
  renderPlaylists(State.playlists.length ? State.playlists : null);
}

// ─── Rendu d'une track (cover + bouton play) ───
function trackHTML(t, size = 80) {
  const hasPreview = !!t.previewUrl;
  const onclick    = hasPreview
    ? `window._playTrack('${esc(t.previewUrl)}','${esc(t.name)}','${esc(t.artist||'')}','${esc(t.image||'')}')`
    : `showToast('Pas d\\'extrait pour ce morceau')`;
  return `
    <div class="album-item" onclick="${onclick}" style="cursor:pointer">
      <div class="album-art" style="width:${size}px;height:${size}px;background:#222;position:relative">
        ${t.image
          ? `<img src="${t.image}" alt="${esc(t.name)}" style="width:100%;height:100%;object-fit:cover;display:block">`
          : coverPlaceholder(t.name)}
        ${hasPreview ? `<div style="position:absolute;bottom:4px;right:4px;width:20px;height:20px;background:rgba(0,0,0,.75);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg viewBox="0 0 24 24" fill="white" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>` : ''}
      </div>
      <div class="album-name">${t.name}</div>
      <div class="album-artist">${t.artist||''}</div>
    </div>`;
}

// Même chose en format grille (historique)
function trackGridHTML(t) {
  const hasPreview = !!t.previewUrl;
  const onclick    = hasPreview
    ? `window._playTrack('${esc(t.previewUrl)}','${esc(t.name)}','${esc(t.artist||'')}','${esc(t.image||'')}')`
    : `showToast('Pas d\\'extrait pour ce morceau')`;
  return `
    <div class="history-item" onclick="${onclick}" style="cursor:pointer">
      <div style="width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;background:#222;position:relative">
        ${t.image
          ? `<img src="${t.image}" alt="${esc(t.name)}" style="width:100%;height:100%;object-fit:cover">`
          : coverPlaceholder(t.name, '10px')}
        ${hasPreview ? `<div style="position:absolute;bottom:3px;right:3px;width:16px;height:16px;background:rgba(0,0,0,.75);border-radius:50%;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" fill="white" width="8" height="8"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>` : ''}
      </div>
      <div class="history-name">${t.name}</div>
      <div class="history-artist">${t.artist||''}</div>
    </div>`;
}

// Fonction globale appelée depuis le HTML inline
window._playTrack = function(url, name, artist, image) {
  Player.playOne(url, { name, artist, image: image || null });
};
window.showToast = showToast;

function renderRecentAlbums(tracks) {
  const c = $('recent-albums'); if (!c) return;
  const data = tracks || SpotifyManager.getMockRecentTracks();
  c.innerHTML = data.slice(0, 8).map(t => trackHTML(t, 80)).join('');
}

const GENRE_COLORS = [
  'linear-gradient(135deg,#ff69b4,#da70d6)',
  'linear-gradient(135deg,#333,#111)',
  'linear-gradient(135deg,#8B4513,#D2691E)',
  'linear-gradient(135deg,#003366,#0066cc)',
];

function renderPlaylists(genres) {
  const c = $('playlists-list'); if (!c) return;
  if (genres?.length) {
    c.innerHTML = genres.slice(0, 4).map((g, i) => {
      const firstPreview = g.tracks?.find(t => t.previewUrl);
      const onclick = firstPreview
        ? `window._playGenre(${i})`
        : `showToast('Chargement en cours…')`;
      return `
        <div class="playlist-item" onclick="${onclick}" style="cursor:pointer">
          <div class="pl-rank">${i+1}</div>
          <div class="pl-art">
            ${g.image
              ? `<img src="${g.image}" alt="${esc(g.name)}" style="width:100%;height:100%;object-fit:cover">`
              : `<div style="width:100%;height:100%;background:${GENRE_COLORS[i%GENRE_COLORS.length]}"></div>`}
          </div>
          <div class="pl-info">
            <div class="pl-name">${g.name}</div>
            <div class="pl-count">${g.count||g.tracks?.length||'—'} morceaux</div>
          </div>
          <div class="pl-play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
        </div>`;
    }).join('');
  } else {
    c.innerHTML = SpotifyManager.getMockPlaylists().map(pl => `
      <div class="playlist-item" onclick="showToast('Connecte Spotify ou attends le chargement')" style="cursor:pointer">
        <div class="pl-rank">${pl.rank}</div>
        <div class="pl-art"><div style="width:100%;height:100%;background:${pl.color}"></div></div>
        <div class="pl-info"><div class="pl-name">${pl.name}</div><div class="pl-count">${pl.count} morceaux</div></div>
        <div class="pl-play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      </div>`).join('');
  }
}

window._playGenre = function(idx) {
  const genre = State.playlists[idx];
  if (!genre?.tracks?.length) { showToast('Chargement en cours…'); return; }
  const withPreview = genre.tracks.filter(t => t.previewUrl);
  if (!withPreview.length) { showToast('Pas d\'extraits disponibles'); return; }
  Player.playQueue(withPreview);
  showToast(`▶ ${genre.name}`);
};

// ═══════════════════════════════════════════════════════
//  RENDER HISTORIQUE
// ═══════════════════════════════════════════════════════
function renderHistoryScreen() {
  const hist = $('history-grid');
  if (hist) {
    const data = State.recentTracks.length ? State.recentTracks : SpotifyManager.getMockRecentTracks();
    hist.innerHTML = data.map(t => trackGridHTML(t)).join('');
  }
  const reco = $('reco-grid');
  if (reco) {
    const data = State.recoTracks.length ? State.recoTracks : SpotifyManager.getMockRecoTracks();
    reco.innerHTML = data.map(t => trackGridHTML(t)).join('');
  }
}

// ═══════════════════════════════════════════════════════
//  SPORT
// ═══════════════════════════════════════════════════════
function initSportScreen() {
  renderSteps(State.steps);
  if (!State.map) {
    const lat = 43.8072, lng = 4.6450;
    State.map = L.map('sport-map', { zoomControl:false, attributionControl:false }).setView([lat,lng],15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(State.map);
    const icon = L.divIcon({
      className:'',
      html:'<div style="width:14px;height:14px;background:#000;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
      iconSize:[14,14], iconAnchor:[7,7],
    });
    State.mapMarker   = L.marker([lat,lng],{icon}).addTo(State.map);
    State.mapPolyline = L.polyline([],{color:'#000',weight:3,opacity:.8}).addTo(State.map);
    navigator.geolocation?.getCurrentPosition(pos => {
      State.map.setView([pos.coords.latitude,pos.coords.longitude],15);
      State.mapMarker.setLatLng([pos.coords.latitude,pos.coords.longitude]);
    });
  }
  setTimeout(() => State.map.invalidateSize(), 100);
  renderObjectives();
}

function updateMapTrace(positions) {
  if (!State.map || !positions.length) return;
  State.mapPolyline.setLatLngs(positions.map(p => [p.lat,p.lng]));
  const last = positions[positions.length-1];
  State.mapMarker.setLatLng([last.lat,last.lng]);
  State.map.panTo([last.lat,last.lng]);
}

function renderObjectives() {
  const c = $('objectives-list'); if (!c) return;
  const objs = [
    {icon:'👟', text:`${State.stepsGoal.toLocaleString('fr-FR')} pas par jour`, done: State.steps>=State.stepsGoal},
    {icon:'📍', text:'3 km minimum',    done: SensorsManager.getDistance()>=3000},
    {icon:'⏱️', text:'1h de course',     done: false},
    {icon:'🔥', text:'Brûler 300 kcal',  done: false},
  ];
  c.innerHTML = objs.map(o => `
    <div class="obj-item">
      <div class="obj-icon">${o.icon}</div>
      <div class="obj-text">${o.text}</div>
      <div class="obj-check ${o.done?'done':''}"></div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════
//  RÉGLAGES
// ═══════════════════════════════════════════════════════
function initSettingsScreen() {
  updateSpotifySettingsUI(State.spotifyConnected);
  setBleUI(State.watchConnected ? 'connected' : 'disconnected', State.watchName);
  const slider = $('steps-goal-slider');
  const disp   = $('steps-goal-display');
  if (slider) slider.value = State.stepsGoal;
  if (disp)   disp.textContent = State.stepsGoal.toLocaleString('fr-FR');
}

on($('spotify-connect-btn'), 'click', async () => {
  if (State.spotifyConnected) {
    SpotifyManager.logout();
    Player.stop();
    Object.assign(State, { spotifyConnected:false, recentTracks:[], recoTracks:[], playlists:[] });
    updateSpotifySettingsUI(false);
    showToast('Déconnecté de Spotify');
    await loadDeezerFallback();
  } else {
    await SpotifyManager.login();
  }
});

function updateSpotifySettingsUI(connected) {
  const lbl = $('spotify-status-label');
  const btn = $('spotify-connect-btn');
  if (!lbl||!btn) return;
  lbl.textContent = connected ? 'Connecté' : 'Non connecté';
  btn.textContent = connected ? 'Déconnecter' : 'Connecter';
  btn.className   = 'settings-action-btn' + (connected ? ' connected' : '');
}

on($('toggle-gps'), 'change', e => {
  e.target.checked ? SensorsManager.startGps() : SensorsManager.stopGps();
  showToast('GPS ' + (e.target.checked ? 'activé' : 'désactivé'));
});
on($('toggle-pedometer'), 'change', e => {
  e.target.checked ? SensorsManager.startPedometer() : SensorsManager.stopPedometer();
  showToast('Podomètre ' + (e.target.checked ? 'activé' : 'désactivé'));
});
on($('toggle-ble'), 'change', e => {
  if (!e.target.checked && State.watchConnected) BluetoothManager.disconnect();
});
on($('steps-goal-slider'), 'input', e => {
  State.stepsGoal = parseInt(e.target.value);
  $('steps-goal-display').textContent = State.stepsGoal.toLocaleString('fr-FR');
});
on($('btn-logout'), 'click', () => {
  SpotifyManager.logout(); Player.stop(); BpmSimulator.stop();
  Object.assign(State, {spotifyConnected:false, sessionActive:false, recentTracks:[], recoTracks:[], playlists:[]});
  navigateTo('login');
  showToast('Déconnecté');
});

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
(function init() {
  if (SpotifyManager.isLoggedIn()) {
    enterApp(true);
  } else {
    navigateTo('login');
  }
})();
