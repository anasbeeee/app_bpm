/**
 * BPM SYNC — SensorsManager
 * GPS via navigator.geolocation
 * Podomètre via DeviceMotionEvent (accéléromètre)
 */

const SensorsManager = (() => {

  // ─── État GPS ───
  let gpsWatchId   = null;
  let gpsPositions = [];   // historique des positions pour tracer le parcours
  let totalDistance = 0;   // en mètres

  // ─── État podomètre ───
  let stepCount      = 0;
  let lastAccelMag   = 0;
  let stepThreshold  = 1.2;  // seuil de détection de pas (g)
  let stepCooldown   = false;

  const listeners = {
    gps:   new Set(),
    steps: new Set(),
  };

  // ─── Calcul distance Haversine ───
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // rayon Terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function emit(channel, data) {
    listeners[channel].forEach(fn => fn(data));
  }

  // ─── Podomètre via accéléromètre ───
  // Détecte les pics d'accélération caractéristiques d'un pas
  function handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.81; // en g
    const delta = Math.abs(mag - lastAccelMag);
    lastAccelMag = mag;

    if (delta > stepThreshold && !stepCooldown) {
      stepCount++;
      stepCooldown = true;
      setTimeout(() => { stepCooldown = false; }, 300); // anti-rebond 300ms
      emit('steps', { count: stepCount });
    }
  }

  // ─── API publique ───
  return {

    // GPS
    startGps() {
      if (!navigator.geolocation) {
        console.warn('[GPS] navigator.geolocation non disponible');
        return;
      }

      gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
          const newPoint = { lat, lng, timestamp: pos.timestamp };

          // Calcule la distance depuis le dernier point
          if (gpsPositions.length > 0) {
            const prev = gpsPositions[gpsPositions.length - 1];
            const d = haversine(prev.lat, prev.lng, lat, lng);
            if (d > 2 && d < 500) { // filtre les sauts GPS aberrants
              totalDistance += d;
            }
          }

          gpsPositions.push(newPoint);

          emit('gps', {
            lat, lng,
            accuracy,
            speed:    speed ? Math.round(speed * 3.6 * 10) / 10 : 0, // m/s → km/h
            distance: totalDistance,
            positions: gpsPositions,
          });
        },
        (err) => {
          console.error('[GPS] Erreur :', err.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 10000,
        }
      );
    },

    stopGps() {
      if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
      }
    },

    getPositions()    { return gpsPositions; },
    getDistance()     { return totalDistance; },
    getDistanceKm()   { return (totalDistance / 1000).toFixed(1); },

    resetGps() {
      this.stopGps();
      gpsPositions  = [];
      totalDistance = 0;
    },

    // Podomètre
    async startPedometer() {
      // Sur iOS 13+, il faut demander la permission explicitement
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceMotionEvent.requestPermission();
          if (perm !== 'granted') {
            console.warn('[Pédomètre] Permission refusée');
            return false;
          }
        } catch (err) {
          console.error('[Pédomètre] Erreur permission :', err);
          return false;
        }
      }

      window.addEventListener('devicemotion', handleMotion, { passive: true });
      return true;
    },

    stopPedometer() {
      window.removeEventListener('devicemotion', handleMotion);
    },

    getSteps()    { return stepCount; },
    resetSteps()  { stepCount = 0; },

    // Abonnements
    onGps(fn)   { listeners.gps.add(fn);   return () => listeners.gps.delete(fn); },
    onSteps(fn) { listeners.steps.add(fn); return () => listeners.steps.delete(fn); },

    // Simule des pas pour la démo (sans vrai mouvement)
    simulateSteps() {
      let sim = setInterval(() => {
        stepCount += Math.floor(Math.random() * 3) + 1;
        emit('steps', { count: stepCount });
      }, 2000);
      return () => clearInterval(sim);
    },
  };

})();
