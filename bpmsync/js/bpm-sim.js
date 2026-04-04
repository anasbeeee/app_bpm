/**
 * BPM SYNC — BpmSimulator
 * Simule des données biométriques réalistes en attendant la montre BLE.
 * Reproduit les variations naturelles d'un vrai capteur cardiaque.
 */

const BpmSimulator = (() => {

  // ─── État interne ───
  let currentBpm   = 68;
  let targetBpm    = 68;
  let intervalId   = null;
  let sessionActive = false;
  const listeners  = new Set();

  // Zones cardiaques selon l'OMS
  const ZONES = [
    { min: 0,   max: 60,  label: 'Très bas',        color: '#AEB6BF', bg: '#F2F3F4' },
    { min: 60,  max: 80,  label: 'Repos',           color: '#2980B9', bg: '#EBF5FB' },
    { min: 80,  max: 100, label: 'Activité légère',  color: '#27AE60', bg: '#EAFAF1' },
    { min: 100, max: 130, label: 'Cardio modéré',    color: '#F39C12', bg: '#FEF9E7' },
    { min: 130, max: 160, label: 'Cardio intense',   color: '#E67E22', bg: '#FDF2E9' },
    { min: 160, max: 999, label: 'Effort maximal',   color: '#C0392B', bg: '#FDECEA' },
  ];

  // Conseils selon la zone
  const CONSEILS = {
    'Très bas':        'Votre rythme cardiaque est très bas. Vérifiez le capteur.',
    'Repos':           'Vous êtes au repos. Prêt à commencer une session ?',
    'Activité légère': 'Bonne cadence ! Votre corps est bien échauffé.',
    'Cardio modéré':   'Zone idéale pour brûler des graisses. Maintenez ce rythme.',
    'Cardio intense':  'Effort soutenu. Pensez à bien respirer.',
    'Effort maximal':  'Zone rouge ! Pensez à faire des pauses régulières lors de vos efforts.',
  };

  function getZone(bpm) {
    return ZONES.find(z => bpm >= z.min && bpm < z.max) || ZONES[1];
  }

  // Variation naturelle : le BPM ne saute pas, il glisse doucement
  function tick() {
    // Rapprocher progressivement currentBpm de targetBpm
    const diff = targetBpm - currentBpm;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 2);
    currentBpm = Math.round(currentBpm + step + (Math.random() - 0.5));
    currentBpm = Math.max(45, Math.min(200, currentBpm));

    // Changer de cible de temps en temps
    if (Math.random() < 0.05) {
      if (sessionActive) {
        // En session : simuler une vraie activité sportive
        targetBpm = 90 + Math.floor(Math.random() * 60);
      } else {
        // Au repos
        targetBpm = 60 + Math.floor(Math.random() * 20);
      }
    }

    const zone = getZone(currentBpm);
    listeners.forEach(fn => fn({
      bpm:     currentBpm,
      zone:    zone.label,
      color:   zone.color,
      bg:      zone.bg,
      conseil: CONSEILS[zone.label],
    }));
  }

  // ─── API publique ───
  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(tick, 1000);
    },

    stop() {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    },

    startSession() {
      sessionActive = true;
      targetBpm = 95 + Math.floor(Math.random() * 40);
    },

    stopSession() {
      sessionActive = false;
      targetBpm = 65 + Math.floor(Math.random() * 15);
    },

    getValue()   { return currentBpm; },
    getZone()    { return getZone(currentBpm); },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn); // retourne un unsub
    },
  };

})();
