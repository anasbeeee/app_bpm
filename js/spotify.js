/**
 * BPM SYNC — SpotifyManager v3
 * OAuth PKCE, pas de Web Playback SDK (pas besoin de Premium)
 * Lecture via previews 30s (Audio HTML5)
 */

const SpotifyManager = (() => {

  const CLIENT_ID    = 'bef3899241db4e618883042e808327a2';
  const REDIRECT_URI = 'http://127.0.0.1:5500/callback.html';
  const SCOPES = [
    'user-read-email',
    'user-read-private',
    'user-read-recently-played',
    'user-top-read',
    'playlist-modify-public',
    'playlist-modify-private',
  ].join(' ');

  let accessToken = null;

  // ─── PKCE ───
  function randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const arr   = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => chars[b % chars.length]).join('');
  }

  async function codeChallenge(verifier) {
    const data   = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  // ─── API REST ───
  async function api(endpoint, options = {}) {
    const res = await fetch('https://api.spotify.com/v1' + endpoint, {
      ...options,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type':  'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Spotify ${res.status}: ${err.error?.message || 'unknown'}`);
    }
    return res.json();
  }

  // ─── Mapping track ───
  function mapTrack(t) {
    return {
      id:         t.id,
      name:       t.name,
      artist:     t.artists?.[0]?.name || '',
      album:      t.album?.name || '',
      image:      t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
      uri:        t.uri,
      previewUrl: t.preview_url || null,
      color:      null,
    };
  }

  return {

    // ─── Auth ───
    isLoggedIn() {
      const token  = localStorage.getItem('spotify_token');
      const expiry = parseInt(localStorage.getItem('spotify_token_expiry') || '0');
      if (token && Date.now() < expiry) { accessToken = token; return true; }
      return false;
    },

    async login() {
      const verifier  = randomString(64);
      const challenge = await codeChallenge(verifier);
      sessionStorage.setItem('pkce_verifier', verifier);
      const params = new URLSearchParams({
        client_id:             CLIENT_ID,
        response_type:         'code',
        redirect_uri:          REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge:        challenge,
        scope:                 SCOPES,
      });
      window.location.href = 'https://accounts.spotify.com/authorize?' + params;
    },

    logout() {
      ['spotify_token', 'spotify_token_expiry', 'spotify_refresh_token']
        .forEach(k => localStorage.removeItem(k));
      accessToken = null;
    },

    // init() vide — plus besoin du Web Playback SDK
    async init() { return true; },

    // ─── Données ───

    async getRecentlyPlayed(limit = 20) {
      try {
        const res  = await api(`/me/player/recently-played?limit=${limit}`);
        const seen = new Set();
        return (res?.items || [])
          .filter(i => {
            if (seen.has(i.track.uri)) return false;
            seen.add(i.track.uri);
            return true;
          })
          .map(i => mapTrack(i.track));
      } catch (e) {
        console.error('[Spotify] getRecentlyPlayed:', e.message);
        return [];
      }
    },

    async getRecommendations(seedTrackIds) {
      try {
        const seeds = seedTrackIds.slice(0, 5).join(',');
        const res   = await api(`/recommendations?seed_tracks=${seeds}&limit=16`);
        return (res?.tracks || []).map(mapTrack);
      } catch (e) {
        console.error('[Spotify] getRecommendations:', e.message);
        return [];
      }
    },

    async getTopGenres() {
      try {
        const artists = await api('/me/top/artists?limit=10&time_range=short_term');
        if (!artists?.items?.length) return [];

        // Compte les genres
        const genreCount = {};
        artists.items.forEach(a =>
          (a.genres || []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; })
        );

        // Top 4 genres
        const topGenres = Object.entries(genreCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([g]) => g);

        // Pour chaque genre, charge des recommandations
        const results = await Promise.all(topGenres.map(async genre => {
          try {
            const reco   = await api(`/recommendations?seed_genres=${encodeURIComponent(genre)}&limit=15`);
            const tracks = (reco?.tracks || []).map(mapTrack);
            return {
              name:   genre.charAt(0).toUpperCase() + genre.slice(1),
              count:  tracks.length,
              image:  tracks[0]?.image || null,
              tracks,
            };
          } catch { return null; }
        }));

        return results.filter(Boolean);
      } catch (e) {
        console.error('[Spotify] getTopGenres:', e.message);
        return [];
      }
    },

    async createPlaylist(name, trackUris) {
      try {
        const me       = await api('/me');
        const playlist = await api(`/users/${me.id}/playlists`, {
          method: 'POST',
          body: JSON.stringify({ name, description: 'Créée par BPM Sync', public: false }),
        });
        if (playlist && trackUris.length) {
          await api(`/playlists/${playlist.id}/tracks`, {
            method: 'POST',
            body: JSON.stringify({ uris: trackUris }),
          });
        }
        return playlist;
      } catch (e) {
        console.error('[Spotify] createPlaylist:', e.message);
        return null;
      }
    },

    // ─── Mock fallback (sans Spotify) ───
    getMockRecentTracks() {
      return [
        { name: 'Whims of Fate',    artist: 'Lyn',            color: '#1a0a0a', image: null, previewUrl: null },
        { name: 'Heaven',           artist: 'Shihoko Hirata', color: '#2d1b4e', image: null, previewUrl: null },
        { name: 'Color Your Night', artist: 'Lotus Juice',    color: '#003366', image: null, previewUrl: null },
        { name: 'Billie Jean',      artist: 'Michael Jackson',color: '#111',    image: null, previewUrl: null },
        { name: 'Olive & Tom',      artist: 'Alpha Wann',     color: '#3d0000', image: null, previewUrl: null },
        { name: 'HUMBLE.',          artist: 'Kendrick Lamar', color: '#8B7536', image: null, previewUrl: null },
        { name: 'Sky',              artist: 'Playboi Carti',  color: '#e0e0e0', image: null, previewUrl: null },
        { name: 'Mari Froes',       artist: 'Gabriela',       color: '#C19A6B', image: null, previewUrl: null },
        { name: 'MEGATRON',         artist: 'Laylow',         color: '#001a33', image: null, previewUrl: null },
        { name: 'Long Time',        artist: 'Playboi Carti',  color: '#222',    image: null, previewUrl: null },
        { name: 'Figa De Guiné',    artist: 'Gabriela',       color: '#1a3300', image: null, previewUrl: null },
        { name: 'Sans peine',       artist: 'Ninho',          color: '#888',    image: null, previewUrl: null },
      ];
    },

    getMockPlaylists() {
      return [
        { rank: 1, name: 'J-pop',      count: 54, color: 'linear-gradient(135deg,#ff69b4,#da70d6)' },
        { rank: 2, name: 'Rap',        count: 26, color: 'linear-gradient(135deg,#333,#111)'       },
        { rank: 3, name: 'Bossa Nova', count: 11, color: 'linear-gradient(135deg,#8B4513,#D2691E)' },
      ];
    },

    getMockRecoTracks() {
      return [
        { name: '27',           artist: 'ElGrandeToto', color: '#8B0000', image: null, previewUrl: null },
        { name: 'Planet Her',   artist: 'Doja Cat',     color: '#9400D3', image: null, previewUrl: null },
        { name: 'Arcane',       artist: 'Alex Seaver',  color: '#00008B', image: null, previewUrl: null },
        { name: 'Romance',      artist: 'Enhypen',      color: '#FF69B4', image: null, previewUrl: null },
        { name: 'The Show',     artist: 'Eminem',       color: '#222',    image: null, previewUrl: null },
        { name: 'Akimbo',       artist: 'Ziak',         color: '#111',    image: null, previewUrl: null },
        { name: 'Mario Galaxy', artist: 'Nintendo',     color: '#003399', image: null, previewUrl: null },
        { name: 'Splatune 2',   artist: 'Nintendo',     color: '#1a8c1a', image: null, previewUrl: null },
      ];
    },
  };

})();
