/**
 * BPM SYNC — App.js v3
 * Fix : chargement données Spotify, previews 30s, navigation unifiée
 */

// ═══════════════════════════════════════════════════════
//  ÉTAT GLOBAL
// ═══════════════════════════════════════════════════════
const State = {
  currentScreen:    'login',
  sessionActive:    false,
  bpm:              null,
  bpmSource:        'simulator',
  spotifyConnected: false,
  watchConnected:   false,
  watchName:        null,
  steps:            1543,
  stepsGoal:        10000,
  streak:           10,
  recentTracks:     [],
  recoTracks:       [],
  playlists:        [],
  currentPreview:   null, // Audio en cours de lecture (preview 30s)
  isPlaying:        false,
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

function showToast(msg, duration = 2600) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function esc(str) {
  return (str || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
}

function coverPlaceholder(name, fontSize = '11px') {
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.45);font-size:${fontSize};font-weight:600;text-align:center;padding:4px">${(name||'').substring(0,12)}</div>`;
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION — source unique de vérité
// ═══════════════════════════════════════════════════════
const SCREENS = {
  login:    'screen-login',
  play:     'screen-play',
  session:  'screen-session',
  music:    'screen-music',
  sport:    'screen-sport',
  history:  'screen-history',
  settings: 'screen-settings',
};

const NAV_ACTIVE = {
  play: 'play', session: 'play',
  music: 'music', sport: 'sport',
  history: 'history', settings: 'settings',
};

function navigateTo(key) {
  if (!SCREENS[key]) return;
  Object.values(SCREENS).forEach(id => $(id)?.classList.remove('active'));
  $(SCREENS[key]).classList.add('active');
  State.currentScreen = key;

  // Sync nav bar
  const navActive = NAV_ACTIVE[key] || key;
  document.querySelectorAll('.nav-item[data-nav]').forEach(item =>
    item.classList.toggle('active', item.dataset.nav === navActive)
  );

  // Side-effects
  if (key === 'music')    renderMusicScreen();
  if (key === 'sport')    initSportScreen();
  if (key === 'history')  renderHistoryScreen();
  if (key === 'settings') initSettingsScreen();

  closeDrawer();
}

function resolveNav(dest) {
  if (dest === 'play') return State.sessionActive ? 'session' : 'play';
  return dest;
}

// Bind tous les nav-items
document.querySelectorAll('.nav-item[data-nav]').forEach(item =>
  on(item, 'click', () => navigateTo(resolveNav(item.dataset.nav)))
);

// Bind tous les tabs
document.querySelectorAll('.tab[data-tab]').forEach(tab =>
  on(tab, 'click', () => {
    const MAP = { play:'play', music:'music', sport:'sport' };
    if (MAP[tab.dataset.tab]) navigateTo(MAP[tab.dataset.tab]);
  })
);

// Drawer
const drawer        = $('drawer');
const drawerOverlay = $('drawer-overlay');
function openDrawer()  { drawer?.classList.add('open'); drawerOverlay?.classList.add('open'); }
function closeDrawer() { drawer?.classList.remove('open'); drawerOverlay?.classList.remove('open'); }
on(drawerOverlay, 'click', closeDrawer);
document.querySelectorAll('.hamburger').forEach(h => on(h, 'click', openDrawer));
document.querySelectorAll('.drawer-item[data-nav]').forEach(item =>
  on(item, 'click', () => navigateTo(resolveNav(item.dataset.nav)))
);

// Boutons retour
on($('btn-back-history'),  'click', () => navigateTo('music'));
on($('btn-back-settings'), 'click', () => navigateTo(State.sessionActive ? 'session' : 'play'));

// ═══════════════════════════════════════════════════════
//  LECTURE PREVIEW 30 SECONDES
//  Alternative gratuite au Web Playback SDK (pas besoin de Premium)
// ═══════════════════════════════════════════════════════
const Preview = (() => {
  let audio    = null;
  let listeners = new Set();

  function emit(data) { listeners.forEach(fn => fn(data)); }

  return {
    play(previewUrl, trackInfo) {
      // Arrête ce qui joue déjà
      if (audio) { audio.pause(); audio = null; }
      if (!previewUrl) { showToast('Pas de preview disponible pour ce morceau'); return; }

      audio = new Audio(previewUrl);
      audio.volume = 0.8;

      audio.addEventListener('ended', () => {
        State.isPlaying = false;
        emit({ playing: false, track: null });
        updateNowPlayingBar(null);
      });

      audio.addEventListener('error', () => {
        showToast('Erreur lecture — essaie un autre morceau');
        State.isPlaying = false;
      });

      audio.play().then(() => {
        State.isPlaying   = true;
        State.currentPreview = { audio, trackInfo };
        emit({ playing: true, track: trackInfo });
        updateNowPlayingBar(trackInfo);
        showToast(`▶ ${trackInfo.name} (extrait 30s)`);
      }).catch(() => {
        showToast('Lecture bloquée — interagis d\'abord avec la page');
      });
    },

    pause() {
      if (audio && !audio.paused) { audio.pause(); State.isPlaying = false; emit({ playing: false }); }
    },

    resume() {
      if (audio && audio.paused) { audio.play(); State.isPlaying = true; emit({ playing: true }); }
    },

    toggle() {
      if (!audio) return;
      audio.paused ? this.resume() : this.pause();
    },

    stop() {
      if (audio) { audio.pause(); audio = null; }
      State.isPlaying = false;
      State.currentPreview = null;
      emit({ playing: false, track: null });
      updateNowPlayingBar(null);
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

function updateNowPlayingBar(track) {
  const el = $('now-playing-title');
  if (!el) return;
  el.textContent = track
    ? `${track.name} — ${track.artist}`
    : 'Connecte Spotify pour lancer la musique';
}

// Clic sur la barre musique en cours → play/pause
on($('now-playing-bar'), 'click', () => {
  if (State.isPlaying) Preview.toggle();
  else navigateTo('music');
});

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
//  ENTER APP — point d'entrée après login
// ═══════════════════════════════════════════════════════
async function enterApp(withSpotify = false) {
  State.spotifyConnected = withSpotify;
  BpmSimulator.start();
  navigateTo('play');

  if (withSpotify) {
    showToast('Chargement de tes musiques…');
    try {
      await loadSpotifyData();
      updateSpotifySettingsUI(true);
    } catch (e) {
      console.error('[enterApp]', e);
      showToast('Erreur chargement — on utilise Deezer');
      await loadDeezerFallback();
    }
  } else {
    // Sans Spotify : charge le chart Deezer directement
    showToast('Chargement des musiques…');
    await loadDeezerFallback();
    showToast('Musiques prêtes ✓');
  }
}

async function loadDeezerFallback() {
  try {
    const chart = await DeezerManager.getChart(20);
    if (chart.length) {
      State.recentTracks = chart;
      // Genres populaires
      const GENRES = ['pop', 'rap', 'electronic', 'rnb'];
      State.playlists = await Promise.all(GENRES.map(async genre => {
        const tracks = await DeezerManager.getTracksByGenre(genre, 12);
        return { name: genre.charAt(0).toUpperCase() + genre.slice(1), count: tracks.length, image: tracks[0]?.image || null, tracks };
      }));
    }
  } catch (e) {
    console.error('[loadDeezerFallback]', e);
  }
}

// ═══════════════════════════════════════════════════════
//  CHARGEMENT DONNÉES SPOTIFY
// ═══════════════════════════════════════════════════════
async function loadSpotifyData() {
  // 1. Écoutes récentes depuis Spotify
  const recent = await SpotifyManager.getRecentlyPlayed(20);
  if (recent.length) {
    // Enrichit immédiatement avec les previews Deezer
    showToast('Chargement des extraits musicaux…');
    State.recentTracks = await DeezerManager.enrichWithPreviews(recent, 4);
    console.log('[Data] Tracks récentes :', State.recentTracks.length,
      '— avec preview :', State.recentTracks.filter(t => t.previewUrl).length);
  }

  // 2. Recommandations Spotify + enrichissement Deezer
  if (recent.length) {
    const seedIds = recent.slice(0, 5).map(t => t.id).filter(Boolean);
    if (seedIds.length) {
      const recos = await SpotifyManager.getRecommendations(seedIds);
      State.recoTracks = await DeezerManager.enrichWithPreviews(recos, 4);
    }
  }

  // 3. Genres → playlists avec tracks Deezer (previews garantis)
  const spotifyGenres = await SpotifyManager.getTopGenres();
  if (spotifyGenres.length) {
    // Enrichit les tracks de chaque genre avec Deezer
    State.playlists = await Promise.all(spotifyGenres.map(async g => ({
      ...g,
      tracks: await DeezerManager.enrichWithPreviews(g.tracks || [], 3),
    })));
  } else {
    // Fallback : genres Deezer populaires directement
    const GENRES_FALLBACK = ['pop', 'rap', 'electronic', 'rnb'];
    State.playlists = await Promise.all(GENRES_FALLBACK.map(async genre => {
      const tracks = await DeezerManager.getTracksByGenre(genre, 15);
      return {
        name:   genre.charAt(0).toUpperCase() + genre.slice(1),
        count:  tracks.length,
        image:  tracks[0]?.image || null,
        tracks,
      };
    }));
  }

  showToast('Musiques chargées ✓');
}

// ═══════════════════════════════════════════════════════
//  BLE
// ═══════════════════════════════════════════════════════
on($('ble-status-btn'), 'click', async () => {
  if (State.watchConnected) { await BluetoothManager.disconnect(); return; }
  if (!BluetoothManager.isSupported()) { showToast('WebBluetooth non dispo — utilise Chrome Android'); return; }
  setBleUI('searching');
  try {
    const name = await BluetoothManager.connect();
    State.watchConnected = true; State.watchName = name; State.bpmSource = 'watch';
    setBleUI('connected', name);
    showToast(`${name} connectée ✓`);
  } catch (err) {
    setBleUI('disconnected');
    if (err.name !== 'NotFoundError') showToast('Connexion échouée — simulation activée');
  }
});

function setBleUI(status, name = '') {
  const dot  = $('ble-dot');
  const text = $('ble-status-text');
  const chip = $('watch-chip');
  const lbl  = $('ble-settings-label');
  if (status === 'connected') {
    if (dot)  { dot.className = 'ble-dot connected'; }
    if (text) text.textContent = name || 'Montre connectée';
    if (chip) chip.textContent = (name || 'Montre') + ' connectée';
    if (lbl)  lbl.textContent  = name || 'Connectée';
  } else if (status === 'searching') {
    if (dot)  { dot.className = 'ble-dot searching'; }
    if (text) text.textContent = 'Recherche…';
  } else {
    if (dot)  { dot.className = 'ble-dot'; }
    if (text) text.textContent = 'Connecter une montre';
    if (chip) chip.textContent = 'Montre non connectée';
    if (lbl)  lbl.textContent  = 'Non connectée';
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

  // Lance automatiquement la première musique avec preview dispo
  setTimeout(() => autoPlayFirstTrack(), 800);
}

function autoPlayFirstTrack() {
  // Cherche la première track avec preview dans les écoutes récentes
  const allTracks = [
    ...State.recentTracks,
    ...(State.playlists.flatMap(p => p.tracks || [])),
    ...State.recoTracks,
  ];
  const track = allTracks.find(t => t.previewUrl);

  if (track) {
    Preview.play(track.previewUrl, { name: track.name, artist: track.artist });
  } else if (!State.spotifyConnected) {
    // Sans Spotify : charge le chart Deezer et joue le premier
    DeezerManager.getChart(10).then(chart => {
      if (chart.length) {
        const t = chart[0];
        State.recentTracks = chart;
        Preview.play(t.previewUrl, { name: t.name, artist: t.artist });
      }
    });
  }
}

function stopSession() {
  State.sessionActive = false;
  BpmSimulator.stopSession();
  SensorsManager.stopGps();
  SensorsManager.stopPedometer();
  Preview.stop();
  if (State.simStopFn) { State.simStopFn(); State.simStopFn = null; }
  navigateTo('play');
  showToast('Session terminée');
}

// ═══════════════════════════════════════════════════════
//  BPM DISPLAY
// ═══════════════════════════════════════════════════════
BpmSimulator.onChange(({ bpm, zone, color, bg, conseil }) => {
  if (State.bpmSource === 'simulator') updateBpmEverywhere(bpm, 'simulator', { zone, color, bg, conseil });
});

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
  const mVal = $('music-bpm-val'); if (mVal) mVal.textContent = bpm;
  const mSt  = $('music-bpm-state'); if (mSt) mSt.textContent = meta.zone;
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
//  ÉCRAN MUSIQUE
// ═══════════════════════════════════════════════════════
on($('btn-see-history'), 'click', () => navigateTo('history'));
on($('add-to-spotify'),  'click', async () => {
  if (!State.spotifyConnected) { showToast('Connecte Spotify d\'abord'); return; }
  if (!State.recentTracks.length) { showToast('Aucune musique à ajouter'); return; }
  showToast('Création de la playlist…');
  const uris = State.recentTracks.map(t => t.uri).filter(Boolean);
  const pl   = await SpotifyManager.createPlaylist('BPM Sync — Mes écoutes', uris);
  showToast(pl ? 'Playlist créée sur Spotify ✓' : 'Erreur lors de la création');
});

function renderMusicScreen() {
  renderSteps(State.steps);
  const hasTracks = State.recentTracks.length > 0;
  renderRecentAlbums(hasTracks ? State.recentTracks : null);
  renderPlaylists(State.playlists.length ? State.playlists : null);
}

// ─── Albums récents ───
function renderRecentAlbums(tracks) {
  const container = $('recent-albums');
  if (!container) return;
  const data = tracks || SpotifyManager.getMockRecentTracks();
  container.innerHTML = data.slice(0, 8).map(t => {
    const hasImage   = !!t.image;
    const hasPreview = !!t.previewUrl;
    return `
    <div class="album-item" onclick="${hasPreview ? `playPreview('${esc(t.previewUrl)}','${esc(t.name)}','${esc(t.artist||'')}')` : `showToast('Pas de preview pour ce morceau')`}">
      <div class="album-art" style="width:80px;height:80px;background:${t.color||'#222'};position:relative">
        ${hasImage ? `<img src="${t.image}" alt="${esc(t.name)}" style="width:100%;height:100%;object-fit:cover;display:block">` : coverPlaceholder(t.name)}
        ${hasPreview ? `<div style="position:absolute;bottom:4px;right:4px;width:18px;height:18px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" fill="white" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>` : ''}
      </div>
      <div class="album-name">${t.name}</div>
      <div class="album-artist">${t.artist||''}</div>
    </div>`;
  }).join('');
}

// ─── Playlists par genre ───
const GENRE_COLORS = [
  'linear-gradient(135deg,#ff69b4,#da70d6)',
  'linear-gradient(135deg,#333,#111)',
  'linear-gradient(135deg,#8B4513,#D2691E)',
  'linear-gradient(135deg,#003366,#0066cc)',
];

function renderPlaylists(genres) {
  const container = $('playlists-list');
  if (!container) return;

  if (genres?.length) {
    container.innerHTML = genres.slice(0, 4).map((g, i) => `
      <div class="playlist-item" onclick="playGenrePreview(${i})">
        <div class="pl-rank">${i+1}</div>
        <div class="pl-art">
          ${g.image ? `<img src="${g.image}" alt="${esc(g.name)}" style="width:100%;height:100%;object-fit:cover">` : `<div style="width:100%;height:100%;background:${GENRE_COLORS[i%GENRE_COLORS.length]}"></div>`}
        </div>
        <div class="pl-info">
          <div class="pl-name">${g.name}</div>
          <div class="pl-count">${g.count||'—'} morceaux</div>
        </div>
        <div class="pl-play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      </div>
    `).join('');
  } else {
    container.innerHTML = SpotifyManager.getMockPlaylists().map(pl => `
      <div class="playlist-item" onclick="showToast('Connecte Spotify pour écouter')">
        <div class="pl-rank">${pl.rank}</div>
        <div class="pl-art"><div style="width:100%;height:100%;background:${pl.color}"></div></div>
        <div class="pl-info">
          <div class="pl-name">${pl.name}</div>
          <div class="pl-count">${pl.count} morceaux</div>
        </div>
        <div class="pl-play"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      </div>
    `).join('');
  }
}

// Joue le premier preview dispo d'un genre
function playGenrePreview(genreIndex) {
  const genre = State.playlists[genreIndex];
  if (!genre?.tracks?.length) { showToast('Aucun extrait disponible'); return; }
  const track = genre.tracks.find(t => t.previewUrl);
  if (track) playPreview(track.previewUrl, track.name, track.artist);
  else showToast('Pas de preview pour ce genre');
}

// Fonction globale appelée depuis le HTML généré
window.playPreview = function(url, name, artist) {
  Preview.play(url, { name, artist });
};
window.playGenrePreview = playGenrePreview;
window.showToast = showToast;

// ═══════════════════════════════════════════════════════
//  ÉCRAN HISTORIQUE
// ═══════════════════════════════════════════════════════
function renderHistoryScreen() {
  const histContainer = $('history-grid');
  if (histContainer) {
    const data = State.recentTracks.length ? State.recentTracks : SpotifyManager.getMockRecentTracks();
    histContainer.innerHTML = data.map(t => `
      <div class="history-item" onclick="${t.previewUrl ? `playPreview('${esc(t.previewUrl)}','${esc(t.name)}','${esc(t.artist||'')}')` : `showToast('${esc(t.name)}')`}">
        <div style="width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;background:${t.color||'#222'};position:relative">
          ${t.image ? `<img src="${t.image}" alt="${esc(t.name)}" style="width:100%;height:100%;object-fit:cover">` : coverPlaceholder(t.name,'9px')}
          ${t.previewUrl ? `<div style="position:absolute;bottom:3px;right:3px;width:14px;height:14px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" fill="white" width="8" height="8"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>` : ''}
        </div>
        <div class="history-name">${t.name}</div>
        <div class="history-artist">${t.artist||''}</div>
      </div>
    `).join('');
  }

  const recoContainer = $('reco-grid');
  if (recoContainer) {
    const data = State.recoTracks.length ? State.recoTracks : SpotifyManager.getMockRecoTracks();
    recoContainer.innerHTML = data.map(t => `
      <div class="history-item" onclick="${t.previewUrl ? `playPreview('${esc(t.previewUrl)}','${esc(t.name)}','${esc(t.artist||'')}')` : `showToast('${esc(t.name)}')`}">
        <div style="width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;background:${t.color||'#333'};position:relative">
          ${t.image ? `<img src="${t.image}" alt="${esc(t.name)}" style="width:100%;height:100%;object-fit:cover">` : coverPlaceholder(t.name,'9px')}
          ${t.previewUrl ? `<div style="position:absolute;bottom:3px;right:3px;width:14px;height:14px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" fill="white" width="8" height="8"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>` : ''}
        </div>
        <div class="history-name">${t.name}</div>
        <div class="history-artist">${t.artist||''}</div>
      </div>
    `).join('');
  }
}

// ═══════════════════════════════════════════════════════
//  ÉCRAN SPORT
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
      iconSize:[14,14],iconAnchor:[7,7],
    });
    State.mapMarker   = L.marker([lat,lng],{icon}).addTo(State.map);
    State.mapPolyline = L.polyline([],{color:'#000',weight:3,opacity:.8}).addTo(State.map);
    navigator.geolocation?.getCurrentPosition(pos => {
      State.map.setView([pos.coords.latitude,pos.coords.longitude],15);
      State.mapMarker.setLatLng([pos.coords.latitude,pos.coords.longitude]);
    });
  }
  setTimeout(()=>State.map.invalidateSize(),100);
  renderObjectives();
}

function updateMapTrace(positions) {
  if (!State.map||!positions.length) return;
  State.mapPolyline.setLatLngs(positions.map(p=>[p.lat,p.lng]));
  const last=positions[positions.length-1];
  State.mapMarker.setLatLng([last.lat,last.lng]);
  State.map.panTo([last.lat,last.lng]);
}

function renderObjectives() {
  const c = $('objectives-list'); if(!c) return;
  const objs = [
    {icon:'👟', text:`${State.stepsGoal.toLocaleString('fr-FR')} pas par jour`, done: State.steps>=State.stepsGoal},
    {icon:'📍', text:'3 km minimum',   done: SensorsManager.getDistance()>=3000},
    {icon:'⏱️', text:'1h de course',    done: false},
    {icon:'🔥', text:'Brûler 300 kcal', done: false},
  ];
  c.innerHTML = objs.map(o=>`
    <div class="obj-item">
      <div class="obj-icon">${o.icon}</div>
      <div class="obj-text">${o.text}</div>
      <div class="obj-check ${o.done?'done':''}"></div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════
//  RÉGLAGES
// ═══════════════════════════════════════════════════════
function initSettingsScreen() {
  updateSpotifySettingsUI(State.spotifyConnected);
  setBleUI(State.watchConnected?'connected':'disconnected', State.watchName);
  const slider = $('steps-goal-slider');
  const disp   = $('steps-goal-display');
  if (slider) slider.value = State.stepsGoal;
  if (disp)   disp.textContent = State.stepsGoal.toLocaleString('fr-FR');
}

on($('spotify-connect-btn'), 'click', async () => {
  if (State.spotifyConnected) {
    SpotifyManager.logout();
    Preview.stop();
    Object.assign(State, { spotifyConnected:false, recentTracks:[], recoTracks:[], playlists:[] });
    updateSpotifySettingsUI(false);
    showToast('Déconnecté de Spotify');
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
  btn.className   = 'settings-action-btn'+(connected?' connected':'');
}

on($('toggle-gps'), 'change', e => {
  e.target.checked ? SensorsManager.startGps() : SensorsManager.stopGps();
  showToast('GPS '+(e.target.checked?'activé':'désactivé'));
});
on($('toggle-pedometer'), 'change', e => {
  e.target.checked ? SensorsManager.startPedometer() : SensorsManager.stopPedometer();
  showToast('Podomètre '+(e.target.checked?'activé':'désactivé'));
});
on($('toggle-ble'), 'change', e => {
  if (!e.target.checked && State.watchConnected) BluetoothManager.disconnect();
});
on($('steps-goal-slider'), 'input', e => {
  State.stepsGoal = parseInt(e.target.value);
  $('steps-goal-display').textContent = State.stepsGoal.toLocaleString('fr-FR');
});
on($('btn-logout'), 'click', () => {
  SpotifyManager.logout(); BpmSimulator.stop(); Preview.stop();
  Object.assign(State,{spotifyConnected:false,sessionActive:false,recentTracks:[],recoTracks:[],playlists:[]});
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
