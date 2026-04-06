/**
 * BPM SYNC — DeezerManager
 * API publique Deezer (pas besoin de compte dev)
 * Previews MP3 30s gratuits sur quasi tous les morceaux
 */

const DeezerManager = (() => {

  const BASE = 'https://api.deezer.com';
  let callbackId = 0;

  // ─── JSONP — contourne CORS de l'API Deezer ───
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cbName = `_dz_${++callbackId}`;
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, 8000);

      function cleanup() {
        delete window[cbName];
        script.remove();
        clearTimeout(timeout);
      }

      window[cbName] = (data) => { cleanup(); resolve(data); };
      script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cbName}`;
      script.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
      document.head.appendChild(script);
    });
  }

  // ─── Mapping track Deezer ───
  function mapTrack(t) {
    return {
      id:         t.id || null,
      name:       String(t.title || t.name || 'Inconnu'),
      artist:     String(t.artist?.name || t.artist || ''),
      album:      String(t.album?.title || ''),
      image:      (t.album?.cover_medium || t.album?.cover || null),
      previewUrl: t.preview || null,
      uri:        null,
      color:      null,
    };
  }

  return {

    // Cherche un morceau par nom + artiste → retourne le premier résultat
    async search(query, limit = 1) {
      try {
        const res = await jsonp(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        return (res.data || []).map(mapTrack);
      } catch { return []; }
    },

    // Cherche le preview d'un morceau Spotify (par nom + artiste)
    async getPreviewForTrack(name, artist) {
      try {
        const q   = `${name} ${artist}`.trim();
        const res = await jsonp(`${BASE}/search?q=${encodeURIComponent(q)}&limit=3`);
        const tracks = (res.data || []).map(mapTrack);
        // Prend le premier avec un preview
        const match = tracks.find(t => t.previewUrl) || tracks[0];
        return match || null;
      } catch { return null; }
    },

    // Enrichit une liste de tracks Spotify avec les previews Deezer
    async enrichWithPreviews(tracks, maxConcurrent = 4) {
      const results = [...tracks];

      // Traite par batch pour pas spam l'API
      for (let i = 0; i < results.length; i += maxConcurrent) {
        const batch = results.slice(i, i + maxConcurrent);
        await Promise.all(batch.map(async (track, idx) => {
          if (track.previewUrl) return; // déjà une preview Spotify
          try {
            const dz = await this.getPreviewForTrack(track.name, track.artist);
            if (dz?.previewUrl) {
              results[i + idx].previewUrl = dz.previewUrl;
              // Remplace l'image si elle est nulle ou vide
              const currentImage = results[i + idx].image;
              if (!currentImage || currentImage === '' || currentImage.includes('2a96cbd8b46e442fc41')) {
                results[i + idx].image = dz.image;
              }
            }
          } catch {}
        }));
        // Petite pause entre les batches
        if (i + maxConcurrent < results.length) await sleep(300);
      }

      return results;
    },

    // Récupère des tracks populaires par genre (sans auth)
    async getTracksByGenre(genreName, limit = 15) {
      try {
        const res = await jsonp(`${BASE}/search?q=${encodeURIComponent(genreName)}&limit=${limit}`);
        return (res.data || []).map(mapTrack).filter(t => t.previewUrl);
      } catch { return []; }
    },

    // Chart mondial — utile pour la démo sans compte connecté
    async getChart(limit = 20) {
      try {
        const res = await jsonp(`${BASE}/chart/0/tracks?limit=${limit}`);
        return (res.data || []).map(mapTrack).filter(t => t.previewUrl);
      } catch { return []; }
    },
  };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

})();
