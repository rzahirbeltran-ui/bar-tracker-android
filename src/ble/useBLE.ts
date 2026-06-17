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

export function useBLE() {
  const [status, setStatus] = useState<BLEStatus>('idle');
  const [samples, setSamples] = useState<IMUSample[]>([]);
  const [lastSample, setLastSample] = useState<IMUSample | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  const managerRef  = useRef<BleManager | null>(null);
  const deviceRef   = useRef<Device | null>(null);
  const subRef      = useRef<{remove: () => void} | null>(null);
  const batteryTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function getManager(): BleManager {
    if (!managerRef.current) {
      managerRef.current = new BleManager();
    }
    return managerRef.current;
  }

  async function readBattery(dev: Device) {
    try {
      const char = await dev.readCharacteristicForService(
        BATTERY_SERVICE_UUID,
        BATTERY_CHAR_UUID,
      );
      if (char.value) {
        // 1 byte base64 → número 0-100
        setBatteryLevel(atob(char.value).charCodeAt(0));
      }
    } catch {}
  }

  const disconnect = useCallback(async () => {
    if (batteryTimer.current) { clearInterval(batteryTimer.current); batteryTimer.current = null; }
    subRef.current?.remove();
    subRef.current = null;
    if (deviceRef.current) {
      try { await deviceRef.current.cancelConnection(); } catch {}
      deviceRef.current = null;
    }
    setBatteryLevel(null);
    setStatus('idle');
  }, []);

  const connect = useCallback(async () => {
    try {
      const granted = await requestAndroidPermissions();
      if (!granted) { setStatus('error'); return; }

      setStatus('scanning');
      setSamples([]);
      setLastSample(null);
      setBatteryLevel(null);

      const manager = getManager();

      manager.startDeviceScan(null, {allowDuplicates: false}, async (error, device) => {
        if (error) { setStatus('error'); return; }
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
          readBattery(connected);
          batteryTimer.current = setInterval(() => readBattery(connected), 60_000);

          subRef.current = connected.monitorCharacteristicForService(
            NUS_SERVICE_UUID,
            NUS_TX_CHAR_UUID,
            (err: Error | null, char: Characteristic | null) => {
              if (err) {
                if (batteryTimer.current) { clearInterval(batteryTimer.current); batteryTimer.current = null; }
                subRef.current = null;
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
  }, []);

  useEffect(() => {
    return () => {
      if (batteryTimer.current) clearInterval(batteryTimer.current);
      subRef.current?.remove();
      if (deviceRef.current) {
        deviceRef.current.cancelConnection().catch(() => {});
      }
    };
  }, []);

  return {status, samples, lastSample, batteryLevel, connect, disconnect};
}
