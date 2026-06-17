import {useState, useEffect, useRef, useCallback} from 'react';
import {BleManager, Device, Characteristic} from 'react-native-ble-plx';
import {PermissionsAndroid, Platform} from 'react-native';
import {
  NUS_SERVICE_UUID, NUS_TX_CHAR_UUID,
  BATTERY_SERVICE_UUID, BATTERY_CHAR_UUID,
  DEVICE_NAME,
} from './constants';
import {parsePacket, IMUSample} from './parser';

export type BLEStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
export let lastBLEError = '';

// Manager a nivel de módulo — nunca se destruye
const manager = new BleManager();

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const sdk = Platform.Version as number;
  if (sdk >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function readBatteryChar(dev: Device): Promise<number | null> {
  try {
    const char = await dev.readCharacteristicForService(
      BATTERY_SERVICE_UUID, BATTERY_CHAR_UUID,
    );
    if (char.value) return atob(char.value).charCodeAt(0);
  } catch {}
  return null;
}

export function useBLE() {
  const [status, setStatus]             = useState<BLEStatus>('idle');
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  // Callback que recibe cada muestra IMU — se llama directo sin pasar por setState
  // HomeScreen lo asigna; corre fuera del ciclo de render de React
  const onSampleRef = useRef<((s: IMUSample) => void) | null>(null);

  const deviceRef    = useRef<Device | null>(null);
  const subRef       = useRef<{remove: () => void} | null>(null);
  const battTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearBattTimer = useCallback(() => {
    if (battTimer.current) { clearInterval(battTimer.current); battTimer.current = null; }
  }, []);

  const disconnect = useCallback(async () => {
    clearBattTimer();
    subRef.current?.remove();
    subRef.current = null;
    if (deviceRef.current) {
      try { await deviceRef.current.cancelConnection(); } catch {}
      deviceRef.current = null;
    }
    setBatteryLevel(null);
    setStatus('idle');
  }, [clearBattTimer]);

  const connect = useCallback(async () => {
    try {
      const granted = await requestAndroidPermissions();
      if (!granted) {
        lastBLEError = 'permisos denegados';
        setStatus('error');
        return;
      }

      setBatteryLevel(null);
      setStatus('scanning');

      manager.startDeviceScan(null, {allowDuplicates: false}, async (err, device) => {
        if (err) {
          lastBLEError = `scan: ${err.message}`;
          setStatus('error');
          return;
        }
        if (!device) return;
        const name = device.localName ?? device.name;
        if (name !== DEVICE_NAME) return;

        manager.stopDeviceScan();
        setStatus('connecting');

        try {
          const connected = await device.connect();
          await connected.discoverAllServicesAndCharacteristics();
          deviceRef.current = connected;
          setStatus('connected');

          readBatteryChar(connected).then(p => { if (p !== null) setBatteryLevel(p); });
          battTimer.current = setInterval(async () => {
            if (!deviceRef.current) return;
            const p = await readBatteryChar(deviceRef.current);
            if (p !== null) setBatteryLevel(p);
          }, 60_000);

          subRef.current = connected.monitorCharacteristicForService(
            NUS_SERVICE_UUID,
            NUS_TX_CHAR_UUID,
            (monErr: Error | null, char: Characteristic | null) => {
              if (monErr) {
                clearBattTimer();
                subRef.current  = null;
                deviceRef.current = null;
                setBatteryLevel(null);
                setStatus('idle');
                return;
              }
              if (!char?.value) return;
              // ── Procesar muestras SIN pasar por setState → sin re-render
              const samples = parsePacket(char.value);
              samples.forEach(s => onSampleRef.current?.(s));
            },
          );
        } catch (e) {
          lastBLEError = `connect: ${String(e)}`;
          setStatus('error');
        }
      });
    } catch (e) {
      lastBLEError = `outer: ${String(e)}`;
      setStatus('error');
    }
  }, [clearBattTimer]);

  useEffect(() => {
    return () => {
      clearBattTimer();
      subRef.current?.remove();
      deviceRef.current?.cancelConnection().catch(() => {});
    };
  }, [clearBattTimer]);

  return {status, batteryLevel, connect, disconnect, onSampleRef};
}
