import React, {useState, useEffect, useCallback} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, ScrollView, Share, ActivityIndicator,
} from 'react-native';
import {loadAllSeries, SavedSeries} from '../utils/storage';
import {rpeColor} from '../utils/rpe';
import {calibrator, MIN_CALIB_POINTS} from '../utils/rpeCalibration';

const LIFT_NAMES = {SQ: 'Sentadilla', BP: 'Press banca', DL: 'Peso muerto'} as const;

function formatDay(iso: string): string {
  const d = new Date(iso);
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function dayKey(iso: string): string {
  return iso.split('T')[0];
}

function MiniChart({reps}: {reps: SavedSeries['reps']}) {
  if (reps.length === 0) return null;
  const maxV = Math.max(...reps.map(r => r.velocity), 0.5);
  return (
    <View style={mc.row}>
      {reps.map((r, i) => {
        const rpe   = r.rpeActual ?? r.rpeEstimated;
        const color = rpe ? rpeColor(rpe) : '#6366f1';
        const barH  = Math.max(4, (r.velocity / maxV) * 40);
        return (
          <View key={i} style={mc.col}>
            <View style={[mc.bar, {height: barH, backgroundColor: color}]} />
          </View>
        );
      })}
    </View>
  );
}

function SeriesCard({series}: {series: SavedSeries}) {
  const bestV    = Math.max(...series.reps.map(r => r.velocity));
  const avgV     = series.reps.reduce((s, r) => s + r.velocity, 0) / series.reps.length;
  const liftName = LIFT_NAMES[series.lift];

  const handleShare = useCallback(async () => {
    const lines = [
      `BarTracker — ${formatDay(series.date)}  ${formatTime(series.date)}`,
      `${liftName} · ${series.reps.length} rep${series.reps.length !== 1 ? 's' : ''}`,
      '',
      ...series.reps.map((r, i) => {
        const rpe = r.rpeActual ?? r.rpeEstimated;
        return `Rep ${i + 1}: ${r.velocity.toFixed(2)} m/s${rpe ? ` @${rpe.toFixed(1)}` : ''}`;
      }),
      '',
      `Mejor: ${bestV.toFixed(2)} m/s   Promedio: ${avgV.toFixed(2)} m/s`,
    ];
    await Share.share({message: lines.join('\n')});
  }, [series, liftName, bestV, avgV]);

  return (
    <View style={sc.card}>
      <View style={sc.cardHeader}>
        <View>
          <Text style={sc.liftName}>{liftName}</Text>
          <Text style={sc.time}>{formatTime(series.date)}</Text>
        </View>
        <View style={sc.statsRight}>
          <Text style={sc.stat}>{series.reps.length} reps</Text>
          <Text style={sc.stat}>Mejor {bestV.toFixed(2)} m/s</Text>
          <TouchableOpacity onPress={handleShare} style={sc.shareBtn}>
            <Text style={sc.shareTxt}>Compartir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <MiniChart reps={series.reps} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sc.repScroll}>
        {series.reps.map((r, i) => {
          const rpe   = r.rpeActual ?? r.rpeEstimated;
          const color = rpe ? rpeColor(rpe) : '#6366f1';
          return (
            <View key={i} style={sc.repChip}>
              <Text style={[sc.repV, {color}]}>{r.velocity.toFixed(2)}</Text>
              {rpe && <Text style={[sc.repRpe, {color}]}>@{rpe.toFixed(1)}</Text>}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function HistoryScreen() {
  const [allSeries, setAllSeries] = useState<SavedSeries[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    loadAllSeries().then(data => {
      setAllSeries([...data].reverse()); // más reciente primero
      setLoading(false);
    });
  }, []);

  // Agrupar por día
  const grouped: Record<string, SavedSeries[]> = {};
  for (const s of allSeries) {
    const k = dayKey(s.date);
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(s);
  }
  const days = Object.keys(grouped).sort().reverse();

  // Estado de calibración por ejercicio
  const calibStatus = (['SQ', 'BP', 'DL'] as const).map(lift => ({
    lift,
    needed: calibrator.pointsNeeded(lift),
    ok:     calibrator.isCalibrated(lift),
  }));

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={s.header}>
        <Text style={s.title}>Historial</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Estado de calibración */}
        <View style={s.calibBox}>
          <Text style={s.calibTitle}>CALIBRACIÓN PERSONAL</Text>
          <Text style={s.calibSub}>Corrige el RPE en tus reps para que la app aprenda</Text>
          <View style={s.calibRow}>
            {calibStatus.map(({lift, needed, ok}) => (
              <View key={lift} style={[s.calibChip, ok && s.calibChipOk]}>
                <Text style={[s.calibLift, ok && s.calibLiftOk]}>{lift}</Text>
                <Text style={[s.calibPts, ok && s.calibPtsOk]}>
                  {ok ? 'Calibrado' : `${MIN_CALIB_POINTS - needed}/${MIN_CALIB_POINTS}`}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {loading && (
          <ActivityIndicator color="#6366f1" style={{marginTop: 40}} />
        )}

        {!loading && allSeries.length === 0 && (
          <Text style={s.empty}>
            Aún no hay series guardadas.{'\n'}Haz una serie y presiona Reiniciar.
          </Text>
        )}

        {days.map(day => (
          <View key={day} style={s.daySection}>
            <Text style={s.dayLabel}>{formatDay(day + 'T00:00:00')}</Text>
            {grouped[day].map(series => (
              <SeriesCard key={series.id} series={series} />
            ))}
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const mc = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginBottom: 8, height: 44},
  col: {alignItems: 'center', justifyContent: 'flex-end'},
  bar: {width: 12, borderRadius: 3},
});

const sc = StyleSheet.create({
  card:       {backgroundColor: '#111', borderRadius: 14, padding: 14, marginBottom: 10},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between',
               alignItems: 'flex-start', marginBottom: 12},
  liftName:   {color: '#fff', fontSize: 16, fontWeight: '700'},
  time:       {color: '#555', fontSize: 12, marginTop: 2},
  statsRight: {alignItems: 'flex-end', gap: 2},
  stat:       {color: '#888', fontSize: 12},
  shareBtn:   {marginTop: 6, backgroundColor: '#1e1e1e', borderRadius: 8,
               paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#333'},
  shareTxt:   {color: '#6366f1', fontSize: 12, fontWeight: '600'},
  repScroll:  {marginTop: 4},
  repChip:    {alignItems: 'center', marginRight: 10, backgroundColor: '#1a1a1a',
               borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6},
  repV:       {fontSize: 13, fontWeight: '700'},
  repRpe:     {fontSize: 11, marginTop: 1},
});

const s = StyleSheet.create({
  root:   {flex: 1, backgroundColor: '#0a0a0a'},
  header: {paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16},
  title:  {color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1},
  scroll: {paddingHorizontal: 20, paddingBottom: 20},

  calibBox:    {backgroundColor: '#111', borderRadius: 14, padding: 14, marginBottom: 20},
  calibTitle:  {color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 4},
  calibSub:    {color: '#444', fontSize: 12, marginBottom: 12},
  calibRow:    {flexDirection: 'row', gap: 10},
  calibChip:   {flex: 1, backgroundColor: '#1a1a1a', borderRadius: 10, padding: 10,
                alignItems: 'center', borderWidth: 1, borderColor: '#222'},
  calibChipOk: {borderColor: '#4ade80'},
  calibLift:   {color: '#888', fontSize: 13, fontWeight: '700'},
  calibLiftOk: {color: '#4ade80'},
  calibPts:    {color: '#555', fontSize: 11, marginTop: 2},
  calibPtsOk:  {color: '#4ade80'},

  daySection: {marginBottom: 16},
  dayLabel:   {color: '#555', fontSize: 12, letterSpacing: 2, marginBottom: 8,
               textTransform: 'uppercase'},
  empty:      {color: '#444', fontSize: 15, textAlign: 'center',
               marginTop: 60, lineHeight: 24},
});
