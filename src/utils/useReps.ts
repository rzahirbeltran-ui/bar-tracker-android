import {useState, useRef, useCallback} from 'react';
import {Lift} from './rpe';

export interface Rep {
  id: number;
  lift: Lift;
  velocity: number;
  rpe: number | null;
}

// Solo detecta la fase concéntrica (velocidad positiva = barra hacia arriba)
const ENTER_V    = 0.18;  // m/s — umbral para iniciar un rep
const EXIT_V     = 0.09;  // m/s — umbral para terminar (histéresis)
const MIN_SAMPLES = 8;    // mínimo ~40 ms de movimiento para contar como rep

export function useReps() {
  const [reps, setReps] = useState<Rep[]>([]);
  const nextId = useRef(1);
  const st = useRef({active: false, peak: 0, count: 0});

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
          const rep: Rep = {
            id: nextId.current++,
            lift,
            velocity: s.peak,
            rpe,
          };
          setReps(prev => [rep, ...prev]);
        }
        s.active = false;
        s.peak   = 0;
        s.count  = 0;
      }
    }
  }, []);

  const reset = useCallback(() => {
    st.current       = {active: false, peak: 0, count: 0};
    nextId.current   = 1;
    setReps([]);
  }, []);

  return {reps, feed, reset};
}
