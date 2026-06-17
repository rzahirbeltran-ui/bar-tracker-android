import {ACCEL_SCALE, GYRO_SCALE, SAMPLES_PER_PACKET, SAMPLE_BYTES} from './constants';

export interface IMUSample {
  timestamp: number;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
}

// Decode base64 → Uint8Array sin usar Buffer (Buffer es Node.js, no existe en React Native)
function decodeBase64(base64: string): DataView {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new DataView(bytes.buffer);
}

export function parsePacket(base64: string): IMUSample[] {
  const view = decodeBase64(base64);
  const samples: IMUSample[] = [];
  for (let i = 0; i < SAMPLES_PER_PACKET; i++) {
    const o = i * SAMPLE_BYTES;
    samples.push({
      timestamp: view.getUint32(o,      false),               // big-endian
      ax:        view.getInt16(o + 4,   false) * ACCEL_SCALE,
      ay:        view.getInt16(o + 6,   false) * ACCEL_SCALE,
      az:        view.getInt16(o + 8,   false) * ACCEL_SCALE,
      gx:        view.getInt16(o + 10,  false) * GYRO_SCALE,
      gy:        view.getInt16(o + 12,  false) * GYRO_SCALE,
      gz:        view.getInt16(o + 14,  false) * GYRO_SCALE,
    });
  }
  return samples;
}
