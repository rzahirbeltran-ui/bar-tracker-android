import {useState, useEffect, useRef, useCallback} from 'react';
import {BleManager, Device, Characteristic} from 'react-native-ble-plx';
import {PermissionsAndroid, Platform} from 'react-native';
import {NUS_SERVICE_UUID, NUS_TX_CHAR_UUID, DEVICE_NAME} from './constants';
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
  } else {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
}

export function useBLE() {
  const [status, setStatus] = useState<BLEStatus>('idle');
  const [samples, setSamples] = useState<IMUSample[]>([]);
  const [lastSample, setLastSample] = useState<IMUSample | null>(null);

  // Manager vive en un ref para evitar que destroy() lo mate entre renders
  const managerRef = useRef<BleManager | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const subRef = useRef<{remove: () => void} | null>(null);

  function getManager(): BleManager {
    if (!managerRef.current) {
      managerRef.current = new BleManager();
    }
    return managerRef.current;
  }

  const disconnect = useCallback(async () => {
    subRef.current?.remove();
    subRef.current = null;
    if (deviceRef.current) {
      try { await deviceRef.current.cancelConnection(); } catch {}
      deviceRef.current = null;
    }
    setStatus('idle');
  }, []);

  const connect = useCallback(async () => {
    try {
      const granted = await requestAndroidPermissions();
      if (!granted) { setStatus('error'); return; }

      setStatus('scanning');
      setSamples([]);
      setLastSample(null);

      const manager = getManager();

      manager.startDeviceScan(
        null,
        {allowDuplicates: false},
        async (error, device) => {
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

            subRef.current = connected.monitorCharacteristicForService(
              NUS_SERVICE_UUID,
              NUS_TX_CHAR_UUID,
              (err: Error | null, char: Characteristic | null) => {
                if (err) {
                  subRef.current = null;
                  deviceRef.current = null;
                  setStatus('idle');
                  return;
                }
                if (!char?.value) return;
                try {
                  const newSamples = parsePacket(char.value);
                  setLastSample(newSamples[newSamples.length - 1]);
                  setSamples(prev => {
                    const next = [...prev, ...newSamples];
                    return next.length > MAX_SAMPLES
                      ? next.slice(next.length - MAX_SAMPLES)
                      : next;
                  });
                } catch {}
              },
            );
          } catch (e) {
            setStatus('error');
          }
        },
      );
    } catch (e) {
      setStatus('error');
    }
  }, []);

  // Solo limpia conexión al desmontar, NO destruye el manager
  useEffect(() => {
    return () => {
      subRef.current?.remove();
      subRef.current = null;
      if (deviceRef.current) {
        deviceRef.current.cancelConnection().catch(() => {});
        deviceRef.current = null;
      }
    };
  }, []);

  return {status, samples, lastSample, connect, disconnect};
}
