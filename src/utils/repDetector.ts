import {Lift} from './rpe';

export interface CompletedRep { peakVelocity: number; }

export interface RepDetector {
  feed(signedVel: number): CompletedRep | null;
  reset(): void;
}

const ENTER = 0.06;  // m/s — umbral de inicio de movimiento
const EXIT  = 0.04;  // m/s — umbral de fin de movimiento

// ── SQ / BP ──────────────────────────────────────────────────────────────
// Require ver el excéntrico (bajada) antes de contar el concéntrico (subida).
// Esto ignora automáticamente el unrack (movimiento de salida del rack).
//
// Estados:
//   IDLE      → espera cualquier movimiento significativo
//   SETUP     → movimiento detectado pero aún no está estable (puede ser unrack)
//   READY     → barra estable después del unrack, lista para primera rep
//   ECCENTRIC → bajando
//   CONCENTRIC→ subiendo (aquí se cierra la rep)
//   REST      → en la cima, entre reps o al re-rack
function createSQBPDetector(): RepDetector {
  type S = 'IDLE' | 'SETUP' | 'READY' | 'ECCENTRIC' | 'CONCENTRIC' | 'REST';
  let state: S = 'IDLE';
  let peakV      = 0;
  let stillCount = 0;

  return {
    feed(vel): CompletedRep | null {
      const abs = Math.abs(vel);
      switch (state) {

        case 'IDLE':
          if (abs > ENTER) { state = 'SETUP'; stillCount = 0; }
          break;

        case 'SETUP':
          // Si el primer movimiento es directamente hacia abajo, ya empieza el excéntrico
          if (vel < -ENTER) { state = 'ECCENTRIC'; peakV = 0; break; }
          // Esperar 125 ms de quietud para pasar a READY
          if (abs < EXIT) { if (++stillCount >= 25) { state = 'READY'; stillCount = 0; } }
          else            { stillCount = 0; }
          break;

        case 'READY':
          if (vel < -ENTER)  { state = 'ECCENTRIC'; peakV = 0; }
          else if (abs > ENTER) { state = 'SETUP'; stillCount = 0; }  // más movimiento de setup
          break;

        case 'ECCENTRIC':
          if (vel > ENTER) { state = 'CONCENTRIC'; peakV = vel; }
          break;

        case 'CONCENTRIC':
          if (vel > peakV) peakV = vel;
          if (vel < EXIT) {
            const rep = {peakVelocity: peakV};
            state = 'REST'; peakV = 0; stillCount = 0;
            return rep;
          }
          break;

        case 'REST':
          if (vel < -ENTER) { state = 'ECCENTRIC'; peakV = 0; }
          else if (++stillCount >= 600) { state = 'IDLE'; stillCount = 0; }  // 3 s sin movimiento → rerack
          break;
      }
      return null;
    },
    reset() { state = 'IDLE'; peakV = 0; stillCount = 0; },
  };
}

// ── DL ───────────────────────────────────────────────────────────────────
// En cuanto hay velocidad positiva sostenida → rep iniciada.
// Rep completa cuando la velocidad vuelve a cerca de cero (al bajar la barra).
function createDLDetector(): RepDetector {
  let active = false;
  let peakV  = 0;

  return {
    feed(vel): CompletedRep | null {
      if (!active) {
        if (vel > ENTER) { active = true; peakV = vel; }
      } else {
        if (vel > peakV) peakV = vel;
        if (vel < EXIT) {
          const rep = {peakVelocity: peakV};
          active = false; peakV = 0;
          return rep;
        }
      }
      return null;
    },
    reset() { active = false; peakV = 0; },
  };
}

export function createRepDetector(lift: Lift): RepDetector {
  return lift === 'DL' ? createDLDetector() : createSQBPDetector();
}
