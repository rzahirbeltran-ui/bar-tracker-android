import {IMUSample} from '../ble/parser';

const G = 9.81;
const DT = 0.005;
const ALPHA = 0.98;
const DEG2RAD = Math.PI / 180;

type Vec3 = {x: number; y: number; z: number};

let gEst: Vec3 = {x: 0, y: 0, z: 1};
let initialized = false;
let v = 0;
let peakV = 0;
let idleCount = 0;
let lastVertAccelG = 0;

export function resetVelocity() {
  gEst = {x: 0, y: 0, z: 1};
  initialized = false;
  v = 0; peakV = 0; idleCount = 0; lastVertAccelG = 0;
}

function norm(a: Vec3): Vec3 {
  const m = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2);
  if (m < 1e-6) return a;
  return {x: a.x / m, y: a.y / m, z: a.z / m};
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rotateByGyro(g: Vec3, w: Vec3): Vec3 {
  return {
    x: g.x + (g.y * w.z - g.z * w.y) * DT,
    y: g.y + (g.z * w.x - g.x * w.z) * DT,
    z: g.z + (g.x * w.y - g.y * w.x) * DT,
  };
}

export function getCalibrationInfo() {
  if (!initialized) return 'calibrando...';
  const axis = [
    {label: 'X', v: Math.abs(gEst.x)},
    {label: 'Y', v: Math.abs(gEst.y)},
    {label: 'Z', v: Math.abs(gEst.z)},
  ].sort((a, b) => b.v - a.v)[0].label;
  return `eje ${axis} vertical`;
}

export function updateVelocity(
  samples: IMUSample[],
): {instant: number; peak: number; signed: number; vertAccelG: number; isCalibrated: boolean} {
  for (const s of samples) {
    const accel: Vec3 = {x: s.ax, y: s.ay, z: s.az};
    const accelMag = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);

    if (!initialized) {
      // Umbral amplio (±20%) para inicializar incluso con vibración leve
      if (Math.abs(accelMag - 1.0) < 0.20) {
        gEst = norm(accel);
        initialized = true;
      }
      continue;
    }

    const w: Vec3 = {x: s.gx * DEG2RAD, y: s.gy * DEG2RAD, z: s.gz * DEG2RAD};
    const gGyro = norm(rotateByGyro(gEst, w));

    if (accelMag > 0.5 && accelMag < 2.0) {
      const accelNorm = norm(accel);
      gEst = norm({
        x: ALPHA * gGyro.x + (1 - ALPHA) * accelNorm.x,
        y: ALPHA * gGyro.y + (1 - ALPHA) * accelNorm.y,
        z: ALPHA * gGyro.z + (1 - ALPHA) * accelNorm.z,
      });
    } else {
      gEst = gGyro;
    }

    // Aceleración vertical neta en g (positivo = hacia arriba)
    lastVertAccelG = dot(accel, gEst) - 1.0;
    const vertAccelMs2 = lastVertAccelG * G;

    v = v * 0.97 + vertAccelMs2 * DT;

    const absV = Math.abs(v);
    if (absV > peakV) {
      peakV = absV; idleCount = 0;
    } else {
      idleCount++;
      if (idleCount > 600) { peakV = 0; idleCount = 0; }
    }
  }

  return {
    instant: Math.abs(v),
    peak: peakV,
    signed: v,
    vertAccelG: lastVertAccelG,
    isCalibrated: initialized,
  };
}
