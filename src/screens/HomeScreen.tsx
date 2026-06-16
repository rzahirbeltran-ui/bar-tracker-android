import React, {useState, useEffect, useRef} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Animated, Dimensions,
} from 'react-native';
import {useBLE, BLEStatus} from '../ble/useBLE';
import {updateVelocity, resetVelocity} from '../utils/velocity';
import {estimateRPE, rpeColor, rpeLabel, Lift} from '../utils/rpe';

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

export default function HomeScreen() {
  const {status, samples, connect, disconnect} = useBLE();
  const [lift, setLift] = useState<Lift>('SQ');
  const [peakVel, setPeakVel] = useState(0);
  const [instVel, setInstVel] = useState(0);
  const barAnim = useRef(new Animated.Value(0)).current;

  const isConnected = status === 'connected';
  const isBusy = status === 'scanning' || status === 'connecting';

  useEffect(() => {
    if (samples.length === 0) return;
    const latest = samples.slice(-5);
    const {instant, peak} = updateVelocity(latest);
    setInstVel(instant);
    setPeakVel(peak);
    Animated.timing(barAnim, {
      toValue: Math.min(peak / 1.2, 1),
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [samples]);

  useEffect(() => {
    if (!isConnected) { resetVelocity(); setPeakVel(0); setInstVel(0); }
  }, [isConnected]);

  const rpe = isConnected && peakVel > 0.05 ? estimateRPE(peakVel, lift) : null;
  const velColor = rpe ? rpeColor(rpe) : '#6366f1';

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.appName}>BarTracker</Text>
        <View style={s.statusRow}>
          <View style={[s.dot, {backgroundColor: STATUS_DOT[status]}]} />
          <Text style={s.statusTxt}>{STATUS_TEXT[status]}</Text>
        </View>
      </View>

      {/* Lift selector */}
      <View style={s.liftBar}>
        {LIFTS.map(l => (
          <TouchableOpacity
            key={l.key}
            style={[s.liftBtn, lift === l.key && s.liftBtnActive]}
            onPress={() => setLift(l.key)}>
            <Text style={[s.liftTxt, lift === l.key && s.liftTxtActive]}>
              {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main velocity display */}
      <View style={s.velBox}>
        <Text style={s.velLabel}>VELOCIDAD PICO</Text>
        <Text style={[s.velNumber, {color: velColor}]}>
          {peakVel > 0 ? peakVel.toFixed(2) : '—'}
        </Text>
        <Text style={s.velUnit}>m/s</Text>

        {/* Velocity bar */}
        <View style={s.barTrack}>
          <Animated.View
            style={[s.barFill, {
              width: barAnim.interpolate({inputRange: [0, 1], outputRange: ['0%', '100%']}),
              backgroundColor: velColor,
            }]}
          />
        </View>

        {/* Speed zones */}
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
            <Text style={[s.rpeNumber, {color: rpeColor(rpe)}]}>
              {rpe.toFixed(1)}
            </Text>
            <Text style={s.rpeDesc}>{rpeLabel(rpe)}</Text>
          </>
        ) : (
          <Text style={s.rpePlaceholder}>
            {isConnected ? 'Inicia un levantamiento...' : 'Conecta el sensor'}
          </Text>
        )}
      </View>

      {/* Raw data */}
      {isConnected && samples.length > 0 && (() => {
        const last = samples[samples.length - 1];
        return (
          <View style={s.rawBox}>
            <Text style={s.rawRow}>
              ax {last.ax.toFixed(3)}  ay {last.ay.toFixed(3)}  az {last.az.toFixed(3)} g
            </Text>
            <Text style={s.rawRow}>
              gx {last.gx.toFixed(1)}  gy {last.gy.toFixed(1)}  gz {last.gz.toFixed(1)} °/s
            </Text>
          </View>
        );
      })()}

      {/* Connect button */}
      <TouchableOpacity
        style={[s.btn, isBusy && s.btnBusy, isConnected && s.btnDisconnect]}
        onPress={isConnected ? disconnect : connect}
        disabled={isBusy}>
        <Text style={s.btnTxt}>
          {isConnected ? 'Desconectar' : isBusy ? 'Espera...' : 'Conectar'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0a0a0a', paddingHorizontal: 20},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 16},
  appName: {color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 8, height: 8, borderRadius: 4},
  statusTxt: {color: '#888', fontSize: 13},

  liftBar: {flexDirection: 'row', backgroundColor: '#181818', borderRadius: 12, padding: 4, marginBottom: 24},
  liftBtn: {flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center'},
  liftBtnActive: {backgroundColor: '#6366f1'},
  liftTxt: {color: '#555', fontWeight: '600', fontSize: 14},
  liftTxtActive: {color: '#fff'},

  velBox: {alignItems: 'center', marginBottom: 20},
  velLabel: {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 4},
  velNumber: {fontSize: 80, fontWeight: '800', lineHeight: 90},
  velUnit: {color: '#555', fontSize: 16, marginTop: -4, marginBottom: 20},
  barTrack: {width: width - 40, height: 8, backgroundColor: '#1e1e1e', borderRadius: 4, overflow: 'hidden'},
  barFill: {height: '100%', borderRadius: 4},
  zonesRow: {flexDirection: 'row', justifyContent: 'space-between', width: width - 40, marginTop: 6},
  zone: {color: '#444', fontSize: 11},

  rpeCard: {
    borderWidth: 1, borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 16, backgroundColor: '#111',
  },
  rpeSmall: {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 4},
  rpeNumber: {fontSize: 52, fontWeight: '800'},
  rpeDesc: {color: '#888', fontSize: 14, marginTop: 4},
  rpePlaceholder: {color: '#444', fontSize: 15, paddingVertical: 8},

  rawBox: {backgroundColor: '#111', borderRadius: 10, padding: 12, marginBottom: 16},
  rawRow: {color: '#444', fontSize: 12, fontFamily: 'monospace', lineHeight: 20},

  btn: {
    backgroundColor: '#6366f1', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 20,
  },
  btnBusy: {backgroundColor: '#333'},
  btnDisconnect: {backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333'},
  btnTxt: {color: '#fff', fontSize: 17, fontWeight: '700'},
});
