import {ACCEL_SCALE, GYRO_SCALE, SAMPLES_PER_PACKET, SAMPLE_BYTES} from './constants';

export interface IMUSample {
  timestamp: number;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
}

export function parsePacket(base64: string): IMUSample[] {
  const buf = Buffer.from(base64, 'base64');
  const samples: IMUSample[] = [];
  for (let i = 0; i < SAMPLES_PER_PACKET; i++) {
    const offset = i * SAMPLE_BYTES;
    samples.push({
      timestamp: buf.readUInt32BE(offset),
      ax: buf.readInt16BE(offset + 4) * ACCEL_SCALE,
      ay: buf.readInt16BE(offset + 6) * ACCEL_SCALE,
      az: buf.readInt16BE(offset + 8) * ACCEL_SCALE,
      gx: buf.readInt16BE(offset + 10) * GYRO_SCALE,
      gy: buf.readInt16BE(offset + 12) * GYRO_SCALE,
      gz: buf.readInt16BE(offset + 14) * GYRO_SCALE,
    });
  }
  return samples;
}
