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

// Manager a nivel de módulo — nunca se destruye, se reutiliza entre conexiones
const manager = new BleManager();
const MAX_SAMPLES = 500;

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
      BATTERY_SERVICE_UUID,
      BATTERY_CHAR_UUID,
    );
    if (char.value) return atob(char.value).charCodeAt(0);
  } catch {}
  return null;
}

export function useBLE() {
  const [status, setStatus]           = useState<BLEStatus>('idle');
  const [samples, setSamples]         = useState<IMUSample[]>([]);
  const [lastSample, setLastSample]   = useState<IMUSample | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  const deviceRef     = useRef<Device | null>(null);
  const subRef        = useRef<{remove: () => void} | null>(null);
  const batteryTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearBatteryTimer = useCallback(() => {
    if (batteryTimer.current) {
      clearInterval(batteryTimer.current);
      batteryTimer.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    clearBatteryTimer();
    subRef.current?.remove();
    subRef.current = null;
    if (deviceRef.current) {
      try { await deviceRef.current.cancelConnection(); } catch {}
      deviceRef.current = null;
    }
    setBatteryLevel(null);
    setStatus('idle');
  }, [clearBatteryTimer]);

  const connect = useCallback(async () => {
    try {
      const granted = await requestAndroidPermissions();
      if (!granted) { setStatus('error'); return; }

      setStatus('scanning');
      setSamples([]);
      setLastSample(null);
      setBatteryLevel(null);

      manager.startDeviceScan(null, {allowDuplicates: false}, async (err, device) => {
        if (err) { setStatus('error'); return; }
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

          // Leer batería al conectar y cada 60 s
          readBatteryChar(connected).then(pct => { if (pct !== null) setBatteryLevel(pct); });
          batteryTimer.current = setInterval(async () => {
            if (!deviceRef.current) return;
            const pct = await readBatteryChar(deviceRef.current);
            if (pct !== null) setBatteryLevel(pct);
          }, 60_000);

          subRef.current = connected.monitorCharacteristicForService(
            NUS_SERVICE_UUID,
            NUS_TX_CHAR_UUID,
            (monErr: Error | null, char: Characteristic | null) => {
              if (monErr) {
                clearBatteryTimer();
                subRef.current  = null;
                deviceRef.current = null;
                setBatteryLevel(null);
                setStatus('idle');
                return;
              }
              if (!char?.value) return;
              const newSamples = parsePacket(char.value);
              setLastSample(newSamples[newSamples.length - 1]);
              setSamples(prev => {
                const next = [...prev, ...newSamples];
                return next.length > MAX_SAMPLES
                  ? next.slice(next.length - MAX_SAMPLES)
                  : next;
              });
            },
          );
        } catch {
          setStatus('error');
        }
      });
    } catch {
      setStatus('error');
    }
  }, [clearBatteryTimer]);

  // Limpiar al desmontar el componente (sin destruir el manager)
  useEffect(() => {
    return () => {
      clearBatteryTimer();
      subRef.current?.remove();
      deviceRef.current?.cancelConnection().catch(() => {});
    };
  }, [clearBatteryTimer]);

  return {status, samples, lastSample, batteryLevel, connect, disconnect};
}
