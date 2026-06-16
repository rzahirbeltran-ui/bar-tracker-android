import {IMUSample} from '../ble/parser';

const G = 9.81;
const DT = 0.005;

let v = 0;
let peakV = 0;
let idleCount = 0;

// Calibración automática del eje vertical
let calibrated = false;
let gravityAxis: 'ax' | 'ay' | 'az' = 'ax';
let gravitySign = 1;
let calibSamples: IMUSample[] = [];

export function resetVelocity() {
  v = 0; peakV = 0; idleCount = 0;
  calibrated = false; calibSamples = [];
}

function calibrate(samples: IMUSample[]) {
  const avg = {ax: 0, ay: 0, az: 0};
  for (const s of samples) { avg.ax += s.ax; avg.ay += s.ay; avg.az += s.az; }
  avg.ax /= samples.length; avg.ay /= samples.length; avg.az /= samples.length;

  // El eje vertical es el que tiene valor absoluto más cercano a 1g en reposo
  const axes: ['ax', 'ay', 'az'] = ['ax', 'ay', 'az'];
  let best: 'ax' | 'ay' | 'az' = 'ax';
  let bestDiff = Infinity;
  for (const axis of axes) {
    const diff = Math.abs(Math.abs(avg[axis]) - 1.0);
    if (diff < bestDiff) { bestDiff = diff; best = axis; }
  }
  gravityAxis = best;
  gravitySign = avg[best] > 0 ? 1 : -1;
  calibrated = true;
}

export function getCalibrationInfo() {
  return calibrated ? `eje ${gravityAxis} (${gravitySign > 0 ? '+' : '-'})` : 'calibrando...';
}

export function updateVelocity(samples: IMUSample[]): {instant: number; peak: number} {
  if (!calibrated) {
    calibSamples.push(...samples);
    if (calibSamples.length >= 80) calibrate(calibSamples);
    return {instant: 0, peak: 0};
  }

  for (const s of samples) {
    const raw = s[gravityAxis];
    const netAccel = (raw * gravitySign - 1.0) * G;
    v = v * 0.97 + netAccel * DT;

    const absV = Math.abs(v);
    if (absV > peakV) {
      peakV = absV; idleCount = 0;
    } else {
      idleCount++;
      if (idleCount > 600) { peakV = 0; idleCount = 0; }
    }
  }
  return {instant: Math.abs(v), peak: peakV};
}
