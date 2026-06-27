import AsyncStorage from '@react-native-async-storage/async-storage';
import {Lift} from './rpe';

export interface SavedRep {
  velocity:     number;
  rpeEstimated: number | null;
  rpeActual:    number | null;
}

export interface SavedSeries {
  id:   string;
  date: string;   // ISO
  lift: Lift;
  reps: SavedRep[];
}

export interface CalibrationPoint {
  lift:     Lift;
  velocity: number;
  rpe:      number;
}

const SERIES_KEY = 'bt_series_v1';
const CALIB_KEY  = 'bt_calib_v1';

// ── Series ────────────────────────────────────────────────────────────────
export async function saveSeries(series: SavedSeries): Promise<void> {
  try {
    const all = await loadAllSeries();
    all.push(series);
    await AsyncStorage.setItem(SERIES_KEY, JSON.stringify(all));
  } catch {}
}

export async function loadAllSeries(): Promise<SavedSeries[]> {
  try {
    const raw = await AsyncStorage.getItem(SERIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ── Calibración ───────────────────────────────────────────────────────────
export async function loadAllCalibPoints(): Promise<CalibrationPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(CALIB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addCalibPoint(point: CalibrationPoint): Promise<CalibrationPoint[]> {
  try {
    const all = await loadAllCalibPoints();
    all.push(point);
    await AsyncStorage.setItem(CALIB_KEY, JSON.stringify(all));
    return all;
  } catch { return []; }
}
