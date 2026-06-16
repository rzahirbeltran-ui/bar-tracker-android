export type Lift = 'SQ' | 'BP' | 'DL';

// Velocidad (m/s) → RPE por levantamiento
// Basado en González-Badillo & Sánchez-Medina (2010) y Pérez-Castilla et al. (2019)
const TABLE: Record<Lift, [number, number][]> = {
  SQ: [[1.00, 6], [0.75, 7], [0.55, 8], [0.35, 9], [0.20, 10]],
  BP: [[0.80, 6], [0.60, 7], [0.40, 8], [0.25, 9], [0.15, 10]],
  DL: [[0.80, 6], [0.55, 7], [0.35, 8], [0.20, 9], [0.10, 10]],
};

export function estimateRPE(velocity: number, lift: Lift): number {
  const t = TABLE[lift];
  if (velocity >= t[0][0]) return t[0][1];
  if (velocity <= t[t.length - 1][0]) return 10;
  for (let i = 0; i < t.length - 1; i++) {
    const [v1, r1] = t[i];
    const [v2, r2] = t[i + 1];
    if (velocity <= v1 && velocity >= v2) {
      return r1 + ((v1 - velocity) / (v1 - v2)) * (r2 - r1);
    }
  }
  return 10;
}

export function rpeColor(rpe: number): string {
  if (rpe < 7) return '#4ade80';
  if (rpe < 8) return '#facc15';
  if (rpe < 9) return '#fb923c';
  return '#f87171';
}

export function rpeLabel(rpe: number): string {
  if (rpe <= 6) return 'Muy fácil';
  if (rpe <= 7) return 'Fácil — 3 reps en reserva';
  if (rpe <= 8) return 'Moderado — 2 reps en reserva';
  if (rpe <= 9) return 'Difícil — 1 rep en reserva';
  return 'Máximo esfuerzo';
}
