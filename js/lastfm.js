/**
 * BPM SYNC — LastFmManager
 * API Last.fm gratuite — écoutes récentes + artistes similaires
 * Auth via token web (redirect) ou mobile (pas besoin de secret)
 */

const LastFmManager = (() => {

  const API_KEY    = '83b3288bc8fa87c39dd8d40fcba8bc64';
  const BASE       = 'https://ws.audioscrobbler.com/2.0/';
  const AUTH_URL   = 'https://www.last.fm/api/auth/';
  const REDIRECT   = 'https://anasbeeee.github.io/app_bpm/callback.html';

  let sessionKey = null;
  let username   = null;

  // ─── API helper ───
  async function api(params) {
    const url = new URL(BASE);
    url.search = new URLSearchParams({
      ...params,
      api_key: API_KEY,
      format:  'json',
    }).toString();
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('LastFM ' + res.status);
    return res.json();
  }

  // ─── Mapping track Last.fm → format BPM Sync ───
  function mapTrack(t) {
    const image = t.image?.find(i => i.size === 'large')?.['#text']
               || t.image?.find(i => i.size === 'medium')?.['#text']
               || null;
    return {
      id:         null,
      name:       t.name,
      artist:     t.artist?.name || t.artist || '',
      album:      t.album?.['#text'] || '',
      image:      image && image !== '' ? image : null,
      uri:        null,
      previewUrl: null,
      color:      null,
    };
  }

  return {

    isLoggedIn() {
      const sk   = localStorage.getItem('lastfm_session');
      const user = localStorage.getItem('lastfm_username');
      if (sk && user) { sessionKey = sk; username = user; return true; }
      return false;
    },

    async login() {
      // Redirige vers Last.fm pour l'auth
      const params = new URLSearchParams({
        api_key:  API_KEY,
        cb:       REDIRECT + '?service=lastfm',
      });
      window.location.href = AUTH_URL + '?' + params;
    },

    // Appelé depuis callback.html avec le token
    async handleCallback(token) {
      try {
        // Génère la signature MD5 pour getSession
        const sig = await md5(`api_key${API_KEY}methodauth.getSessiontoken${token}${API_KEY}`);
        const res = await fetch(`${BASE}?method=auth.getSession&api_key=${API_KEY}&token=${token}&api_sig=${sig}&format=json`);
        const data = await res.json();
        if (data.session) {
          sessionKey = data.session.key;
          username   = data.session.name;
          localStorage.setItem('lastfm_session',  sessionKey);
          localStorage.setItem('lastfm_username', username);
          return true;
        }
        return false;
      } catch (e) {
        console.error('[LastFM] handleCallback:', e);
        return false;
      }
    },

    logout() {
      localStorage.removeItem('lastfm_session');
      localStorage.removeItem('lastfm_username');
      sessionKey = null; username = null;
    },

    getUsername() { return username; },

    // Écoutes récentes
    async getRecentTracks(limit = 20) {
      if (!username) return [];
      try {
        const data = await api({ method: 'user.getrecenttracks', user: username, limit });
        const tracks = (data.recenttracks?.track || [])
          .filter(t => !t['@attr']?.nowplaying === false || true) // inclut "now playing"
          .slice(0, limit);
        return tracks.map(mapTrack);
      } catch (e) {
        console.error('[LastFM] getRecentTracks:', e.message);
        return [];
      }
    },

    // Top tracks de l'utilisateur
    async getTopTracks(limit = 20, period = '1month') {
      if (!username) return [];
      try {
        const data = await api({ method: 'user.gettoptracks', user: username, limit, period });
        return (data.toptracks?.track || []).map(mapTrack);
      } catch (e) {
        console.error('[LastFM] getTopTracks:', e.message);
        return [];
      }
    },

    // Artistes similaires → recommandations
    async getRecommendations(limit = 16) {
      if (!username) return [];
      try {
        // Prend les top artistes
        const topArtists = await api({ method: 'user.gettopartists', user: username, limit: 3, period: '1month' });
        const artists = topArtists.topartists?.artist || [];
        if (!artists.length) return [];

        // Artistes similaires au top 1
        const seed = artists[0].name;
        const similar = await api({ method: 'artist.getsimilar', artist: seed, limit: 5 });
        const simArtists = (similar.similarartists?.artist || []).map(a => a.name);

        // Top tracks de chaque artiste similaire
        const trackPromises = simArtists.slice(0, 4).map(async artist => {
          const res = await api({ method: 'artist.gettoptracks', artist, limit: 4 });
          return (res.toptracks?.track || []).map(t => ({
            ...mapTrack(t),
            artist,
          }));
        });

        const results = await Promise.all(trackPromises);
        return results.flat().slice(0, limit);
      } catch (e) {
        console.error('[LastFM] getRecommendations:', e.message);
        return [];
      }
    },

    // Top tags → playlists par genre
    async getTopTags() {
      if (!username) return [];
      try {
        const data = await api({ method: 'user.gettoptags', user: username, limit: 4 });
        return (data.toptags?.tag || []).map(t => t.name);
      } catch (e) { return []; }
    },
  };

  // MD5 simple pour la signature Last.fm
  async function md5(str) {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

})();
