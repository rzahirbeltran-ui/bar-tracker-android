import {useState, useRef, useCallback} from 'react';
import {Lift} from './rpe';

export interface Rep {
  id: number;
  lift: Lift;
  velocity: number;
  rpe: number | null;
}

// Umbrales bajos para detectar en ~20 ms desde el inicio del concéntrico
const ENTER_V    = 0.06;  // m/s — velocidad positiva mínima para iniciar rep
const EXIT_V     = 0.03;  // m/s — por debajo de esto termina el rep
const MIN_SAMPLES = 4;    // ~20 ms @ 200 Hz

export function useReps() {
  const [reps, setReps] = useState<Rep[]>([]);
  const nextId = useRef(1);
  const st     = useRef({active: false, peak: 0, count: 0});

  // Llamado desde callback BLE (fuera del ciclo React) — seguro porque
  // setReps es un setter estable de React 18
  const feed = useCallback((signedVelocity: number, lift: Lift, rpe: number | null) => {
    const s = st.current;
    if (!s.active) {
      if (signedVelocity >= ENTER_V) {
        s.active = true;
        s.peak   = signedVelocity;
        s.count  = 1;
      }
    } else {
      if (signedVelocity > s.peak) s.peak = signedVelocity;
      s.count++;
      if (signedVelocity < EXIT_V) {
        if (s.count >= MIN_SAMPLES) {
          setReps(prev => [{id: nextId.current++, lift, velocity: s.peak, rpe}, ...prev]);
        }
        s.active = false;
        s.peak   = 0;
        s.count  = 0;
      }
    }
  }, []);

  const reset = useCallback(() => {
    st.current     = {active: false, peak: 0, count: 0};
    nextId.current = 1;
    setReps([]);
  }, []);

  return {reps, feed, reset};
}
