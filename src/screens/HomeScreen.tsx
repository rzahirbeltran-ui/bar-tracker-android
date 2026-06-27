import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Animated, Dimensions, ScrollView, Modal,
} from 'react-native';
import {useBLE, BLEStatus, lastBLEError} from '../ble/useBLE';
import {updateVelocity, resetVelocity, getCalibrationInfo} from '../utils/velocity';
import {rpeColor, rpeLabel, Lift} from '../utils/rpe';
import {useReps, Rep} from '../utils/useReps';
import {saveSeries, addCalibPoint, loadAllCalibPoints} from '../utils/storage';
import {calibrator, MIN_CALIB_POINTS} from '../utils/rpeCalibration';

const {width} = Dimensions.get('window');

const LIFTS: {key: Lift; label: string}[] = [
  {key: 'SQ', label: 'Squat'},
  {key: 'BP', label: 'Bench'},
  {key: 'DL', label: 'Deadlift'},
];

const STATUS_DOT: Record<BLEStatus, string> = {
  idle: '#555', scanning: '#f59e0b', connecting: '#f59e0b',
  connected: '#4ade80', error: '#f87171',
};
const STATUS_TEXT: Record<BLEStatus, string> = {
  idle: 'Sin conectar', scanning: 'Buscando...', connecting: 'Conectando...',
  connected: 'Conectado', error: 'Error',
};
const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

// ── Carga calibración al iniciar ──────────────────────────────────────────
loadAllCalibPoints().then(pts => calibrator.loadFromPoints(pts));

function BatteryIcon({level}: {level: number | null}) {
  if (level === null) return null;
  const color = level > 50 ? '#4ade80' : level > 20 ? '#facc15' : '#f87171';
  return (
    <View style={bat.wrap}>
      <View style={bat.shell}>
        <View style={[bat.fill, {width: `${level}%` as any, backgroundColor: color}]} />
      </View>
      <View style={bat.nub} />
      <Text style={[bat.txt, {color}]}>{level}%</Text>
    </View>
  );
}

function VelocityChart({reps}: {reps: Rep[]}) {
  if (reps.length === 0) return null;
  const ordered = [...reps].reverse();
  const maxV = Math.max(...ordered.map(r => r.velocity), 0.5);

  return (
    <View style={chart.wrapper}>
      <Text style={chart.title}>GRÁFICA DE SERIE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={chart.row}>
          {ordered.map((rep, i) => {
            const rpe   = rep.rpeActual ?? rep.rpeEstimated;
            const color = rpe ? rpeColor(rpe) : '#6366f1';
            const barH  = Math.max(6, (rep.velocity / maxV) * 80);
            return (
              <View key={rep.id} style={chart.col}>
                <Text style={[chart.val, {color}]}>{rep.velocity.toFixed(2)}</Text>
                <View style={[chart.bar, {height: barH, backgroundColor: color}]} />
                <Text style={chart.num}>R{i + 1}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const {status, batteryLevel, connect, disconnect, onSampleRef} = useBLE();
  const {reps, feed, initDetector, correctRPE, reset: resetReps} = useReps();

  const [lift, setLift]         = useState<Lift>('SQ');
  const [peakVel, setPeakVel]   = useState(0);
  const [editingRep, setEditingRep] = useState<Rep | null>(null);
  const barAnim = useRef(new Animated.Value(0)).current;

  const liftRef   = useRef<Lift>('SQ');
  const velRef    = useRef({peak: 0, signed: 0});
  const isConnRef = useRef(false);
  const repsRef   = useRef<Rep[]>([]);

  const isConnected = status === 'connected';
  const isBusy      = status === 'scanning' || status === 'connecting';

  // Mantener refs sincronizados
  useEffect(() => { liftRef.current = lift; }, [lift]);
  useEffect(() => { isConnRef.current = isConnected; }, [isConnected]);
  useEffect(() => { repsRef.current = reps; }, [reps]);

  // Callback BLE: 200 Hz, sin re-renders
  onSampleRef.current = (sample) => {
    const {peak, signed} = updateVelocity([sample]);
    velRef.current = {peak, signed};
    feed(signed);
  };

  // Timer de UI a 20 Hz
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isConnRef.current) return;
      const {peak} = velRef.current;
      setPeakVel(peak);
      Animated.timing(barAnim, {
        toValue: Math.min(peak / 1.2, 1),
        duration: 80,
        useNativeDriver: false,
      }).start();
    }, 50);
    return () => clearInterval(timer);
  }, [barAnim]);

  useEffect(() => {
    if (!isConnected) {
      resetVelocity();
      velRef.current = {peak: 0, signed: 0};
      setPeakVel(0);
      barAnim.setValue(0);
    }
  }, [isConnected, barAnim]);

  // Guardar serie y limpiar
  const saveAndReset = useCallback(async (currentLift: Lift, currentReps: Rep[]) => {
    if (currentReps.length > 0) {
      await saveSeries({
        id:   Date.now().toString(),
        date: new Date().toISOString(),
        lift: currentLift,
        reps: currentReps.map(r => ({
          velocity:     r.velocity,
          rpeEstimated: r.rpeEstimated,
          rpeActual:    r.rpeActual,
        })),
      });
    }
    resetVelocity();
    resetReps();
    velRef.current = {peak: 0, signed: 0};
    setPeakVel(0);
    barAnim.setValue(0);
  }, [resetReps, barAnim]);

  const handleReset = useCallback(() => {
    saveAndReset(liftRef.current, repsRef.current);
  }, [saveAndReset]);

  // Cambiar lift → auto-reset y nuevo detector
  const handleLiftChange = useCallback((newLift: Lift) => {
    saveAndReset(liftRef.current, repsRef.current).then(() => {
      setLift(newLift);
      liftRef.current = newLift;
      initDetector(newLift);
    });
  }, [saveAndReset, initDetector]);

  // Corregir RPE: guarda punto de calibración + actualiza rep
  const handleRPECorrection = useCallback(async (rep: Rep, rpeActual: number) => {
    correctRPE(rep.id, rpeActual);
    setEditingRep(null);
    const allPts = await addCalibPoint({lift: rep.lift, velocity: rep.velocity, rpe: rpeActual});
    calibrator.addPoint({lift: rep.lift, velocity: rep.velocity, rpe: rpeActual}, allPts);
  }, [correctRPE]);

  const rpe      = isConnected && peakVel > 0.05 ? calibrator.estimate(peakVel, lift) : null;
  const velColor = rpe ? rpeColor(rpe) : '#6366f1';

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.appName}>BarTracker</Text>
        <View style={s.headerRight}>
          <BatteryIcon level={batteryLevel} />
          <View style={s.statusRow}>
            <View style={[s.dot, {backgroundColor: STATUS_DOT[status]}]} />
            <Text style={s.statusTxt}>{STATUS_TEXT[status]}</Text>
          </View>
        </View>
      </View>

      {/* Lift selector */}
      <View style={s.liftBar}>
        {LIFTS.map(l => (
          <TouchableOpacity
            key={l.key}
            style={[s.liftBtn, lift === l.key && s.liftBtnActive]}
            onPress={() => handleLiftChange(l.key)}>
            <Text style={[s.liftTxt, lift === l.key && s.liftTxtActive]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Velocidad */}
        <View style={s.velBox}>
          <Text style={s.velLabel}>VELOCIDAD PICO · {getCalibrationInfo()}</Text>
          <Text style={[s.velNumber, {color: velColor}]}>
            {peakVel > 0.01 ? peakVel.toFixed(2) : '—'}
          </Text>
          <Text style={s.velUnit}>m/s</Text>
          <View style={s.barTrack}>
            <Animated.View style={[s.barFill, {
              width: barAnim.interpolate({inputRange:[0,1], outputRange:['0%','100%']}),
              backgroundColor: velColor,
            }]} />
          </View>
          <View style={s.zonesRow}>
            <Text style={s.zone}>Lento</Text>
            <Text style={s.zone}>Moderado</Text>
            <Text style={s.zone}>Rápido</Text>
          </View>
        </View>

        {/* RPE card */}
        <View style={[s.rpeCard, {borderColor: rpe ? rpeColor(rpe) : '#222'}]}>
          {rpe ? (
            <>
              <Text style={s.rpeSmall}>
                RPE ESTIMADO{calibrator.isCalibrated(lift) ? ' · CALIBRADO' : ''}
              </Text>
              <Text style={[s.rpeNumber, {color: rpeColor(rpe)}]}>{rpe.toFixed(1)}</Text>
              <Text style={s.rpeDesc}>{rpeLabel(rpe)}</Text>
            </>
          ) : (
            <Text style={s.rpePlaceholder}>
              {status === 'error' && lastBLEError
                ? lastBLEError
                : isConnected ? 'Inicia un levantamiento...' : 'Conecta el sensor'}
            </Text>
          )}
        </View>

        {/* Calibración hint */}
        {calibrator.pointsNeeded(lift) > 0 && isConnected && (
          <Text style={s.calibHint}>
            Toca el RPE de una rep para corregirlo —{' '}
            {calibrator.pointsNeeded(lift)} datos más y se calibra para ti
          </Text>
        )}

        {/* Gráfica de la serie */}
        <VelocityChart reps={reps} />

        {/* Historial de reps */}
        {reps.length > 0 && (
          <View style={s.repsBox}>
            <View style={s.repsHeader}>
              <Text style={s.repsTitle}>{reps.length} REP{reps.length !== 1 ? 'S' : ''}</Text>
              <TouchableOpacity onPress={handleReset} style={s.resetInlineBtn}>
                <Text style={s.resetInlineTxt}>Guardar y reiniciar</Text>
              </TouchableOpacity>
            </View>
            {reps.map(rep => {
              const displayRPE = rep.rpeActual ?? rep.rpeEstimated;
              return (
                <View key={rep.id} style={s.repRow}>
                  <Text style={s.repNum}>#{rep.id}</Text>
                  <Text style={[s.repVel, {color: displayRPE ? rpeColor(displayRPE) : '#6366f1'}]}>
                    {rep.velocity.toFixed(2)} m/s
                  </Text>
                  <TouchableOpacity onPress={() => setEditingRep(rep)} style={s.rpeEditBtn}>
                    <Text style={[s.rpeEditTxt, {color: displayRPE ? rpeColor(displayRPE) : '#555'}]}>
                      {displayRPE ? `@${displayRPE.toFixed(1)}` : 'asignar'}
                      <Text style={s.rpeEditIcon}> (ed.)</Text>
                    </Text>
                  </TouchableOpacity>
                  <Text style={s.repLift}>{rep.lift}</Text>
                  {rep.rpeActual !== null && <Text style={s.calibTag}>✓</Text>}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Botones */}
      <View style={s.btnRow}>
        {isConnected && reps.length > 0 && (
          <TouchableOpacity style={s.btnReset} onPress={handleReset}>
            <Text style={s.btnResetTxt}>Reiniciar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.btn, isBusy && s.btnBusy, isConnected && s.btnDisconnect]}
          onPress={isConnected ? disconnect : connect}
          disabled={isBusy}>
          <Text style={s.btnTxt}>
            {isConnected ? 'Desconectar' : isBusy ? 'Espera...' : 'Conectar'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal de corrección de RPE */}
      <Modal visible={editingRep !== null} transparent animationType="slide">
        <View style={m.backdrop}>
          <View style={m.container}>
            <Text style={m.title}>Corregir RPE — Rep #{editingRep?.id}</Text>
            <Text style={m.subtitle}>
              Velocidad: {editingRep?.velocity.toFixed(2)} m/s
              {editingRep?.rpeEstimated
                ? `  ·  Estimado: @${editingRep.rpeEstimated.toFixed(1)}`
                : ''}
            </Text>
            <Text style={m.hint}>¿Cuánto sintió esa rep?</Text>
            <View style={m.grid}>
              {RPE_OPTIONS.map(rpe => (
                <TouchableOpacity
                  key={rpe}
                  style={[m.rpeBtn, {borderColor: rpeColor(rpe)}]}
                  onPress={() => editingRep && handleRPECorrection(editingRep, rpe)}>
                  <Text style={[m.rpeTxt, {color: rpeColor(rpe)}]}>@{rpe}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setEditingRep(null)} style={m.cancel}>
              <Text style={m.cancelTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const bat = StyleSheet.create({
  wrap:  {flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6},
  shell: {width: 26, height: 13, borderWidth: 1.5, borderColor: '#555',
          borderRadius: 3, overflow: 'hidden'},
  fill:  {height: '100%', borderRadius: 2},
  nub:   {width: 3, height: 6, backgroundColor: '#555', borderRadius: 1},
  txt:   {fontSize: 11, fontWeight: '600'},
});

const chart = StyleSheet.create({
  wrapper: {backgroundColor: '#111', borderRadius: 14, padding: 12, marginBottom: 10},
  title:   {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 10},
  row:     {flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingBottom: 4},
  col:     {alignItems: 'center', width: 44},
  val:     {fontSize: 10, fontWeight: '700', marginBottom: 3},
  bar:     {width: 28, borderRadius: 4},
  num:     {color: '#555', fontSize: 11, marginTop: 4},
});

const m = StyleSheet.create({
  backdrop:   {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'},
  container:  {backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
               padding: 24, paddingBottom: 36},
  title:      {color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4},
  subtitle:   {color: '#888', fontSize: 13, marginBottom: 2},
  hint:       {color: '#555', fontSize: 12, marginBottom: 18, marginTop: 8},
  grid:       {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20},
  rpeBtn:     {borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10},
  rpeTxt:     {fontSize: 15, fontWeight: '700'},
  cancel:     {alignItems: 'center', paddingVertical: 12, backgroundColor: '#222',
               borderRadius: 12},
  cancelTxt:  {color: '#888', fontSize: 15},
});

const s = StyleSheet.create({
  root:   {flex: 1, backgroundColor: '#0a0a0a'},
  scroll: {paddingHorizontal: 20, paddingBottom: 20},

  header:      {flexDirection: 'row', justifyContent: 'space-between',
                alignItems: 'center', marginTop: 12, marginBottom: 16,
                paddingHorizontal: 20},
  appName:     {color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1},
  headerRight: {flexDirection: 'row', alignItems: 'center'},
  statusRow:   {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot:         {width: 8, height: 8, borderRadius: 4},
  statusTxt:   {color: '#888', fontSize: 13},

  liftBar:       {flexDirection: 'row', backgroundColor: '#181818', borderRadius: 12,
                  padding: 4, marginBottom: 16, marginHorizontal: 20},
  liftBtn:       {flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center'},
  liftBtnActive: {backgroundColor: '#6366f1'},
  liftTxt:       {color: '#555', fontWeight: '600', fontSize: 14},
  liftTxtActive: {color: '#fff'},

  velBox:   {alignItems: 'center', marginBottom: 14},
  velLabel: {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 4},
  velNumber:{fontSize: 80, fontWeight: '800', lineHeight: 90},
  velUnit:  {color: '#555', fontSize: 16, marginTop: -4, marginBottom: 14},
  barTrack: {width: width - 40, height: 8, backgroundColor: '#1e1e1e',
             borderRadius: 4, overflow: 'hidden'},
  barFill:  {height: '100%', borderRadius: 4},
  zonesRow: {flexDirection: 'row', justifyContent: 'space-between',
             width: width - 40, marginTop: 6},
  zone:     {color: '#444', fontSize: 11},

  rpeCard:        {borderWidth: 1, borderRadius: 16, padding: 18, alignItems: 'center',
                   marginBottom: 8, backgroundColor: '#111'},
  rpeSmall:       {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 4},
  rpeNumber:      {fontSize: 48, fontWeight: '800'},
  rpeDesc:        {color: '#888', fontSize: 14, marginTop: 4},
  rpePlaceholder: {color: '#444', fontSize: 15, paddingVertical: 6},

  calibHint: {color: '#555', fontSize: 12, textAlign: 'center', marginBottom: 8,
              paddingHorizontal: 10},

  repsBox:       {backgroundColor: '#111', borderRadius: 14, padding: 12, marginBottom: 10},
  repsHeader:    {flexDirection: 'row', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 10},
  repsTitle:     {color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1},
  resetInlineBtn:{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: '#222'},
  resetInlineTxt:{color: '#888', fontSize: 11},
  repRow:        {flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
                  borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 8},
  repNum:        {color: '#555', fontSize: 12, width: 30},
  repVel:        {fontSize: 14, fontWeight: '700', width: 72},
  rpeEditBtn:    {flex: 1},
  rpeEditTxt:    {fontSize: 13, fontWeight: '600'},
  rpeEditIcon:   {fontSize: 12, opacity: 0.5},
  repLift:       {color: '#555', fontSize: 11},
  calibTag:      {color: '#4ade80', fontSize: 11},

  btnRow:       {flexDirection: 'row', gap: 10, paddingHorizontal: 20,
                 paddingBottom: 20, paddingTop: 10},
  btn:          {flex: 1, backgroundColor: '#6366f1', borderRadius: 14,
                 paddingVertical: 16, alignItems: 'center'},
  btnBusy:      {backgroundColor: '#333'},
  btnDisconnect:{backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333'},
  btnTxt:       {color: '#fff', fontSize: 17, fontWeight: '700'},
  btnReset:     {flex: 1, backgroundColor: '#1e1e1e', borderRadius: 14,
                 paddingVertical: 16, alignItems: 'center', borderWidth: 1,
                 borderColor: '#333'},
  btnResetTxt:  {color: '#888', fontSize: 15, fontWeight: '600'},
});
