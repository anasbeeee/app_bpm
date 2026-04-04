/**
 * BPM SYNC — BluetoothManager
 * WebBluetooth BLE — profil GATT Heart Rate standard (UUID 0x180D)
 * Compatible avec les montres génériques BLE du marché.
 * Fallback automatique sur le simulateur si pas de montre disponible.
 */

const BluetoothManager = (() => {

  // UUIDs GATT standards (universels, toutes montres BLE)
  const HR_SERVICE         = 0x180D;
  const HR_MEASUREMENT     = 0x2A37;
  const BATTERY_SERVICE    = 0x180F;
  const BATTERY_LEVEL      = 0x2A19;
  const STEPS_SERVICE      = '00030001-78fc-48fe-8e23-433b3a1942d0'; // Mi Band / génériques

  let device       = null;
  let server       = null;
  let hrChar       = null;
  let battChar     = null;
  let isConnected  = false;
  let usingReal    = false;

  const listeners = {
    bpm:        new Set(),
    battery:    new Set(),
    connection: new Set(),
  };

  // ─── Parsing trame BLE Heart Rate ───
  // Spec Bluetooth : premier byte = flags, BPM sur 1 ou 2 octets selon bit 0
  function parseHeartRate(dataView) {
    const flags = dataView.getUint8(0);
    const is16bit = flags & 0x01;
    return is16bit
      ? dataView.getUint16(1, true)
      : dataView.getUint8(1);
  }

  function emit(channel, data) {
    listeners[channel].forEach(fn => fn(data));
  }

  function onHrNotify(event) {
    const bpm = parseHeartRate(event.target.value);
    emit('bpm', { bpm, source: 'watch' });
  }

  function onDisconnected() {
    isConnected = false;
    usingReal   = false;
    device = server = hrChar = null;
    emit('connection', { connected: false, deviceName: null });
    console.warn('[BLE] Montre déconnectée');
  }

  // ─── API publique ───
  return {

    isSupported() {
      return 'bluetooth' in navigator;
    },

    isConnected() {
      return isConnected;
    },

    // Lance le scan BLE et tente la connexion
    async connect() {
      if (!this.isSupported()) {
        throw new Error('WebBluetooth non supporté sur ce navigateur. Utilise Chrome Android.');
      }

      try {
        // Demande au système de scanner les appareils BLE compatibles
        device = await navigator.bluetooth.requestDevice({
          filters: [
            { services: [HR_SERVICE] },
          ],
          optionalServices: [BATTERY_SERVICE],
        });

        device.addEventListener('gattserverdisconnected', onDisconnected);

        server   = await device.gatt.connect();
        const hrService = await server.getPrimaryService(HR_SERVICE);
        hrChar   = await hrService.getCharacteristic(HR_MEASUREMENT);

        // Écoute les notifications BPM en temps réel
        await hrChar.startNotifications();
        hrChar.addEventListener('characteristicvaluechanged', onHrNotify);

        // Batterie (optionnel, pas toutes les montres)
        try {
          const battService = await server.getPrimaryService(BATTERY_SERVICE);
          battChar = await battService.getCharacteristic(BATTERY_LEVEL);
          const val = await battChar.readValue();
          emit('battery', { level: val.getUint8(0) });
        } catch (_) { /* La montre ne supporte pas — on ignore */ }

        isConnected = true;
        usingReal   = true;
        emit('connection', { connected: true, deviceName: device.name || 'Montre BLE' });

        return device.name || 'Montre BLE';

      } catch (err) {
        isConnected = false;
        throw err;
      }
    },

    async disconnect() {
      if (device && device.gatt.connected) {
        if (hrChar) {
          try { await hrChar.stopNotifications(); } catch (_) {}
        }
        device.gatt.disconnect();
      }
      isConnected = false;
      usingReal   = false;
      emit('connection', { connected: false, deviceName: null });
    },

    // Abonnements
    onBpm(fn)        { listeners.bpm.add(fn);        return () => listeners.bpm.delete(fn); },
    onBattery(fn)    { listeners.battery.add(fn);    return () => listeners.battery.delete(fn); },
    onConnection(fn) { listeners.connection.add(fn); return () => listeners.connection.delete(fn); },

    isUsingRealDevice() { return usingReal; },
  };

})();
