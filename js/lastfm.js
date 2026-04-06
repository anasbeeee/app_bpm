/**
 * BPM SYNC — LastFmManager v2
 * API Last.fm — écoutes récentes + recommandations personnalisées
 * Images enrichies via Deezer (Last.fm images souvent vides)
 */

const LastFmManager = (() => {

  const API_KEY    = '91ef066ae7f7f1aa0c16805cf5aeb921';
  const API_SECRET = '5930fe56dc4da077215fbbc260d3d02f';
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

  // ─── Extrait le nom d'artiste proprement ───
  function artistName(artist) {
    if (!artist) return '';
    if (typeof artist === 'string') return artist;
    if (typeof artist === 'object') return artist.name || artist['#text'] || '';
    return String(artist);
  }

  // ─── Extrait la meilleure image Last.fm ───
  function bestImage(images) {
    if (!Array.isArray(images)) return null;
    // Priorité : extralarge > large > medium
    const order = ['extralarge', 'large', 'medium', 'small'];
    for (const size of order) {
      const img = images.find(i => i.size === size);
      if (img && img['#text'] && img['#text'] !== '') return img['#text'];
    }
    return null;
  }

  // ─── Mapping track Last.fm ───
  function mapTrack(t, forceArtist = null) {
    return {
      id:         null,
      name:       String(t.name || 'Inconnu'),
      artist:     forceArtist || artistName(t.artist),
      album:      String(t.album?.['#text'] || ''),
      image:      bestImage(t.image),
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
      const params = new URLSearchParams({
        api_key: API_KEY,
        cb:      REDIRECT + '?service=lastfm',
      });
      window.location.href = AUTH_URL + '?' + params;
    },

    logout() {
      localStorage.removeItem('lastfm_session');
      localStorage.removeItem('lastfm_username');
      sessionKey = null; username = null;
    },

    getUsername() { return username; },

    // ─── Écoutes récentes ───
    async getRecentTracks(limit = 20) {
      if (!username) return [];
      try {
        const data = await api({ method: 'user.getrecenttracks', user: username, limit });
        const tracks = data.recenttracks?.track || [];
        return tracks
          .filter(t => t.name) // filtre les entrées vides
          .slice(0, limit)
          .map(t => mapTrack(t));
      } catch (e) {
        console.error('[LastFM] getRecentTracks:', e.message);
        return [];
      }
    },

    // ─── Top tracks ───
    async getTopTracks(limit = 20, period = '1month') {
      if (!username) return [];
      try {
        const data = await api({ method: 'user.gettoptracks', user: username, limit, period });
        return (data.toptracks?.track || []).map(t => mapTrack(t));
      } catch (e) {
        console.error('[LastFM] getTopTracks:', e.message);
        return [];
      }
    },

    // ─── Recommandations via artistes similaires ───
    async getRecommendations(limit = 16) {
      if (!username) return [];
      try {
        // Top artistes de l'utilisateur
        const topArtistsData = await api({
          method: 'user.gettopartists',
          user:   username,
          limit:  3,
          period: '1month',
        });
        const topArtists = topArtistsData.topartists?.artist || [];
        if (!topArtists.length) return [];

        const seedArtist = artistName(topArtists[0]);

        // Artistes similaires
        const similarData = await api({
          method: 'artist.getsimilar',
          artist: seedArtist,
          limit:  6,
        });
        const simArtists = (similarData.similarartists?.artist || [])
          .map(a => artistName(a))
          .filter(Boolean)
          .slice(0, 5);

        if (!simArtists.length) return [];

        // Top tracks par artiste similaire
        const trackPromises = simArtists.map(async artist => {
          try {
            const res = await api({ method: 'artist.gettoptracks', artist, limit: 4 });
            return (res.toptracks?.track || []).map(t => mapTrack(t, artist));
          } catch { return []; }
        });

        const results = await Promise.all(trackPromises);
        return results.flat().slice(0, limit);

      } catch (e) {
        console.error('[LastFM] getRecommendations:', e.message);
        return [];
      }
    },

    // ─── Top tags (genres) ───
    async getTopTags() {
      if (!username) return [];
      try {
        const data = await api({ method: 'user.gettoptags', user: username, limit: 4 });
        return (data.toptags?.tag || []).map(t => String(t.name));
      } catch { return []; }
    },
  };

})();
