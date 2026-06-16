import {IMUSample} from '../ble/parser';

const G = 9.81;
const DT = 0.005;          // 200 Hz
const ALPHA = 0.98;        // peso del giroscopio vs acelerómetro
const DEG2RAD = Math.PI / 180;

type Vec3 = {x: number; y: number; z: number};

// Dirección estimada de la gravedad en el frame del sensor
let gEst: Vec3 = {x: 0, y: 0, z: 1};
let initialized = false;

// Integración de velocidad
let v = 0;
let peakV = 0;
let idleCount = 0;

export function resetVelocity() {
  gEst = {x: 0, y: 0, z: 1};
  initialized = false;
  v = 0; peakV = 0; idleCount = 0;
}

function norm(a: Vec3): Vec3 {
  const m = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2);
  if (m < 1e-6) return a;
  return {x: a.x / m, y: a.y / m, z: a.z / m};
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// Rota el vector g usando la velocidad angular w (rad/s) durante dt
function rotateByGyro(g: Vec3, w: Vec3): Vec3 {
  return {
    x: g.x + (g.y * w.z - g.z * w.y) * DT,
    y: g.y + (g.z * w.x - g.x * w.z) * DT,
    z: g.z + (g.x * w.y - g.y * w.x) * DT,
  };
}

export function getCalibrationInfo() {
  if (!initialized) return 'calibrando...';
  const g = gEst;
  const axis = [
    {label: 'X', v: Math.abs(g.x)},
    {label: 'Y', v: Math.abs(g.y)},
    {label: 'Z', v: Math.abs(g.z)},
  ].sort((a, b) => b.v - a.v)[0].label;
  return `eje ${axis} vertical`;
}

export function updateVelocity(samples: IMUSample[]): {instant: number; peak: number} {
  for (const s of samples) {
    const accel: Vec3 = {x: s.ax, y: s.ay, z: s.az};
    const accelMag = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);

    // Inicializar con el primer acelerómetro en reposo
    if (!initialized) {
      if (Math.abs(accelMag - 1.0) < 0.05) {
        gEst = norm(accel);
        initialized = true;
      }
      continue;
    }

    // Giroscopio en rad/s
    const w: Vec3 = {x: s.gx * DEG2RAD, y: s.gy * DEG2RAD, z: s.gz * DEG2RAD};

    // 1) Rotar estimación con giroscopio
    const gGyro = norm(rotateByGyro(gEst, w));

    // 2) Corrección con acelerómetro (solo si accelMag ≈ 1g — sin movimiento brusco)
    if (accelMag > 0.7 && accelMag < 1.3) {
      const accelNorm = norm(accel);
      gEst = norm({
        x: ALPHA * gGyro.x + (1 - ALPHA) * accelNorm.x,
        y: ALPHA * gGyro.y + (1 - ALPHA) * accelNorm.y,
        z: ALPHA * gGyro.z + (1 - ALPHA) * accelNorm.z,
      });
    } else {
      gEst = gGyro; // durante movimiento fuerte, confiar solo en giroscopio
    }

    // Aceleración vertical = proyección de accel sobre dirección de gravedad - 1g
    const vertAccel = (dot(accel, gEst) - 1.0) * G;

    // Integración con leak para evitar drift
    v = v * 0.97 + vertAccel * DT;

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
