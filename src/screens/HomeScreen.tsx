import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Animated, Dimensions, ScrollView,
} from 'react-native';
import {useBLE, BLEStatus, lastBLEError} from '../ble/useBLE';
import {updateVelocity, resetVelocity, getCalibrationInfo} from '../utils/velocity';
import {estimateRPE, rpeColor, rpeLabel, Lift} from '../utils/rpe';
import {useReps} from '../utils/useReps';

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

export default function HomeScreen() {
  const {status, batteryLevel, connect, disconnect, onSampleRef} = useBLE();
  const {reps, feed, reset: resetReps} = useReps();

  const [lift, setLift]       = useState<Lift>('SQ');
  const [peakVel, setPeakVel] = useState(0);
  const barAnim = useRef(new Animated.Value(0)).current;

  // Refs para estado intermedio — no causan re-renders
  const liftRef    = useRef<Lift>('SQ');
  const velRef     = useRef({peak: 0, signed: 0});
  const isConnRef  = useRef(false);

  const isConnected = status === 'connected';
  const isBusy      = status === 'scanning' || status === 'connecting';

  // Sincronizar liftRef con el estado (sin romper el closure del callback)
  useEffect(() => { liftRef.current = lift; }, [lift]);
  useEffect(() => { isConnRef.current = isConnected; }, [isConnected]);

  // ── Callback BLE: corre a 200 Hz sin re-renders
  // Se asigna directo al ref — siempre usa la versión más reciente de feed/liftRef
  onSampleRef.current = (sample) => {
    const {peak, signed} = updateVelocity([sample]);
    velRef.current = {peak, signed};
    const rpe = peak > 0.05 ? estimateRPE(peak, liftRef.current) : null;
    feed(signed, liftRef.current, rpe);
  };

  // ── Timer de UI a 20 Hz — actualiza pantalla sin bloquear JS thread
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
    }, 50);   // 20 Hz
    return () => clearInterval(timer);
  }, [barAnim]);

  // Limpiar al desconectar
  useEffect(() => {
    if (!isConnected) {
      resetVelocity();
      velRef.current = {peak: 0, signed: 0};
      setPeakVel(0);
      barAnim.setValue(0);
    }
  }, [isConnected, barAnim]);

  const handleReset = useCallback(() => {
    resetVelocity();
    resetReps();
    velRef.current = {peak: 0, signed: 0};
    setPeakVel(0);
    barAnim.setValue(0);
  }, [resetReps, barAnim]);

  const rpe      = isConnected && peakVel > 0.05 ? estimateRPE(peakVel, lift) : null;
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
            onPress={() => setLift(l.key)}>
            <Text style={[s.liftTxt, lift === l.key && s.liftTxtActive]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Velocidad pico */}
      <View style={s.velBox}>
        <Text style={s.velLabel}>VELOCIDAD PICO · {getCalibrationInfo()}</Text>
        <Text style={[s.velNumber, {color: velColor}]}>
          {peakVel > 0.01 ? peakVel.toFixed(2) : '—'}
        </Text>
        <Text style={s.velUnit}>m/s</Text>
        <View style={s.barTrack}>
          <Animated.View
            style={[s.barFill, {
              width: barAnim.interpolate({inputRange:[0,1], outputRange:['0%','100%']}),
              backgroundColor: velColor,
            }]}
          />
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
            <Text style={s.rpeSmall}>RPE ESTIMADO</Text>
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

      {/* Historial de reps */}
      {reps.length > 0 && (
        <View style={s.repsBox}>
          <View style={s.repsHeader}>
            <Text style={s.repsTitle}>{reps.length} REP{reps.length !== 1 ? 'S' : ''}</Text>
            <TouchableOpacity onPress={handleReset} style={s.resetInlineBtn}>
              <Text style={s.resetInlineTxt}>Reiniciar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.repsList} showsVerticalScrollIndicator={false}>
            {reps.map(rep => (
              <View key={rep.id} style={s.repRow}>
                <Text style={s.repNum}>#{rep.id}</Text>
                <Text style={[s.repVel, {color: rep.rpe ? rpeColor(rep.rpe) : '#6366f1'}]}>
                  {rep.velocity.toFixed(2)} m/s
                </Text>
                {rep.rpe != null && (
                  <Text style={[s.repRpe, {color: rpeColor(rep.rpe)}]}>
                    RPE {rep.rpe.toFixed(1)}
                  </Text>
                )}
                <Text style={s.repLift}>{rep.lift}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Botones */}
      <View style={s.btnRow}>
        {isConnected && (
          <TouchableOpacity style={s.btnReset} onPress={handleReset}>
            <Text style={s.btnResetTxt}>Reiniciar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            s.btn,
            isBusy && s.btnBusy,
            isConnected && s.btnDisconnect,
            isConnected && {flex: 2},
          ]}
          onPress={isConnected ? disconnect : connect}
          disabled={isBusy}>
          <Text style={s.btnTxt}>
            {isConnected ? 'Desconectar' : isBusy ? 'Espera...' : 'Conectar'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const bat = StyleSheet.create({
  wrap:  {flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4},
  shell: {width: 26, height: 13, borderWidth: 1.5, borderColor: '#555',
          borderRadius: 3, overflow: 'hidden'},
  fill:  {height: '100%', borderRadius: 2},
  nub:   {width: 3, height: 6, backgroundColor: '#555', borderRadius: 1},
  txt:   {fontSize: 11, fontWeight: '600'},
});

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0a0a0a', paddingHorizontal: 20},

  header:      {flexDirection: 'row', justifyContent: 'space-between',
                alignItems: 'center', marginTop: 12, marginBottom: 16},
  appName:     {color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1},
  headerRight: {flexDirection: 'row', alignItems: 'center'},
  statusRow:   {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot:         {width: 8, height: 8, borderRadius: 4},
  statusTxt:   {color: '#888', fontSize: 13},

  liftBar:       {flexDirection: 'row', backgroundColor: '#181818',
                  borderRadius: 12, padding: 4, marginBottom: 20},
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
                   marginBottom: 10, backgroundColor: '#111'},
  rpeSmall:       {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 4},
  rpeNumber:      {fontSize: 48, fontWeight: '800'},
  rpeDesc:        {color: '#888', fontSize: 14, marginTop: 4},
  rpePlaceholder: {color: '#444', fontSize: 15, paddingVertical: 6},

  repsBox:       {backgroundColor: '#111', borderRadius: 14, padding: 12,
                  marginBottom: 10, maxHeight: 160},
  repsHeader:    {flexDirection: 'row', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 8},
  repsTitle:     {color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1},
  resetInlineBtn:{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: '#222'},
  resetInlineTxt:{color: '#888', fontSize: 12},
  repsList:      {flexGrow: 0},
  repRow:        {flexDirection: 'row', alignItems: 'center', paddingVertical: 5,
                  borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 10},
  repNum:        {color: '#555', fontSize: 12, width: 32},
  repVel:        {fontSize: 14, fontWeight: '700', width: 68},
  repRpe:        {fontSize: 13, fontWeight: '600', width: 60},
  repLift:       {color: '#555', fontSize: 11},

  btnRow:       {flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 'auto'},
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
