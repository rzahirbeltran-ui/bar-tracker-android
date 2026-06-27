import {Lift, estimateRPE} from './rpe';
import {CalibrationPoint} from './storage';

export const MIN_CALIB_POINTS = 15;

interface LinearModel { a: number; b: number; }

function fitLinear(pts: CalibrationPoint[]): LinearModel | null {
  const n = pts.length;
  if (n < 2) return null;
  const sx  = pts.reduce((s, p) => s + p.velocity, 0);
  const sy  = pts.reduce((s, p) => s + p.rpe,      0);
  const sxy = pts.reduce((s, p) => s + p.velocity * p.rpe, 0);
  const sx2 = pts.reduce((s, p) => s + p.velocity * p.velocity, 0);
  const d   = n * sx2 - sx * sx;
  if (Math.abs(d) < 1e-12) return null;
  return {a: (n * sxy - sx * sy) / d, b: (sy - ((n * sxy - sx * sy) / d) * sx) / n};
}

// Singleton mutable — se carga una vez al iniciar la app y se actualiza al agregar puntos.
class RPECalibrator {
  private models: Partial<Record<Lift, LinearModel>> = {};
  private counts: Partial<Record<Lift, number>>      = {};

  loadFromPoints(all: CalibrationPoint[]) {
    const lifts: Lift[] = ['SQ', 'BP', 'DL'];
    for (const lift of lifts) {
      const pts = all.filter(p => p.lift === lift);
      this.counts[lift] = pts.length;
      if (pts.length >= MIN_CALIB_POINTS) this.models[lift] = fitLinear(pts) ?? undefined;
    }
  }

  addPoint(point: CalibrationPoint, allPoints: CalibrationPoint[]) {
    const pts = allPoints.filter(p => p.lift === point.lift);
    this.counts[point.lift] = pts.length;
    if (pts.length >= MIN_CALIB_POINTS) {
      this.models[point.lift] = fitLinear(pts) ?? undefined;
    }
  }

  estimate(velocity: number, lift: Lift): number {
    const model = this.models[lift];
    if (model) {
      return Math.min(10, Math.max(5, model.a * velocity + model.b));
    }
    return estimateRPE(velocity, lift);
  }

  isCalibrated(lift: Lift): boolean { return !!this.models[lift]; }

  pointsNeeded(lift: Lift): number {
    return Math.max(0, MIN_CALIB_POINTS - (this.counts[lift] ?? 0));
  }
}

export const calibrator = new RPECalibrator();
