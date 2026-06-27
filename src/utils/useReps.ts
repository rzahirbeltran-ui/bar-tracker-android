import {useState, useRef, useCallback} from 'react';
import {Lift, rpeColor} from './rpe';
import {createRepDetector, RepDetector} from './repDetector';
import {calibrator} from './rpeCalibration';

export interface Rep {
  id:           number;
  lift:         Lift;
  velocity:     number;
  rpeEstimated: number | null;
  rpeActual:    number | null;
}

export function useReps() {
  const [reps, setReps] = useState<Rep[]>([]);
  const detectorRef = useRef<RepDetector>(createRepDetector('SQ'));
  const liftRef     = useRef<Lift>('SQ');
  const nextId      = useRef(1);

  // Llamado cuando cambia el ejercicio
  const initDetector = useCallback((lift: Lift) => {
    liftRef.current = lift;
    detectorRef.current = createRepDetector(lift);
  }, []);

  // Llamado desde el callback BLE (200 Hz, sin re-render)
  const feed = useCallback((signedVel: number) => {
    const completed = detectorRef.current.feed(signedVel);
    if (completed) {
      const lift = liftRef.current;
      const rpe  = calibrator.estimate(completed.peakVelocity, lift);
      setReps(prev => [
        {id: nextId.current++, lift, velocity: completed.peakVelocity,
         rpeEstimated: rpe, rpeActual: null},
        ...prev,
      ]);
    }
  }, []);

  // Corregir el RPE de una rep ya guardada
  const correctRPE = useCallback((repId: number, rpeActual: number) => {
    setReps(prev => prev.map(r => r.id === repId ? {...r, rpeActual} : r));
  }, []);

  const reset = useCallback(() => {
    detectorRef.current.reset();
    nextId.current = 1;
    setReps([]);
  }, []);

  return {reps, feed, initDetector, correctRPE, reset};
}
