import {IMUSample} from '../ble/parser';

const G = 9.81;
const DT = 0.005; // 200 Hz → 5 ms por muestra

let v = 0;
let peakV = 0;
let idleCount = 0;

export function resetVelocity() {
  v = 0; peakV = 0; idleCount = 0;
}

export function updateVelocity(samples: IMUSample[]): {instant: number; peak: number} {
  for (const s of samples) {
    const netAccel = (s.az - 1.0) * G;
    v = v * 0.97 + netAccel * DT;
    const absV = Math.abs(v);
    if (absV > peakV) {
      peakV = absV;
      idleCount = 0;
    } else {
      idleCount++;
      if (idleCount > 600) { peakV = 0; idleCount = 0; }
    }
  }
  return {instant: Math.abs(v), peak: peakV};
}
