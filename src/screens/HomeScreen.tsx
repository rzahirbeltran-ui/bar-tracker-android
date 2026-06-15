import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView,
} from 'react-native';
import {useBLE, BLEStatus} from '../ble/useBLE';

const STATUS_COLORS: Record<BLEStatus, string> = {
  idle: '#888', scanning: '#f90', connecting: '#f90',
  connected: '#4c4', error: '#e44',
};
const STATUS_LABELS: Record<BLEStatus, string> = {
  idle: 'Idle', scanning: 'Scanning...', connecting: 'Connecting...',
  connected: 'Connected', error: 'Error',
};

function Val({label, value}: {label: string; value: number}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value.toFixed(4)}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const {status, lastSample, connect, disconnect} = useBLE();
  const isConnected = status === 'connected';
  const isBusy = status === 'scanning' || status === 'connecting';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>BarTracker</Text>
      <View style={styles.statusRow}>
        <View style={[styles.dot, {backgroundColor: STATUS_COLORS[status]}]} />
        <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
      </View>
      <TouchableOpacity
        style={[styles.btn, isBusy && styles.btnDisabled]}
        onPress={isConnected ? disconnect : connect}
        disabled={isBusy}>
        <Text style={styles.btnText}>
          {isConnected ? 'Disconnect' : isBusy ? 'Please wait...' : 'Connect'}
        </Text>
      </TouchableOpacity>
      <ScrollView style={styles.dataBox}>
        {lastSample ? (
          <>
            <Text style={styles.sectionLabel}>Accelerometer (g)</Text>
            <Val label="ax" value={lastSample.ax} />
            <Val label="ay" value={lastSample.ay} />
            <Val label="az" value={lastSample.az} />
            <Text style={[styles.sectionLabel, {marginTop: 12}]}>Gyroscope (°/s)</Text>
            <Val label="gx" value={lastSample.gx} />
            <Val label="gy" value={lastSample.gy} />
            <Val label="gz" value={lastSample.gz} />
            <Text style={styles.tsLabel}>t = {lastSample.timestamp} ms</Text>
          </>
        ) : (
          <Text style={styles.noData}>
            {isConnected ? 'Waiting for data...' : 'Connect to see IMU data'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#111', padding: 20},
  title: {color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 20},
  statusRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 16},
  dot: {width: 12, height: 12, borderRadius: 6, marginRight: 8},
  statusText: {color: '#ccc', fontSize: 16},
  btn: {backgroundColor: '#2a7', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 20},
  btnDisabled: {backgroundColor: '#555'},
  btnText: {color: '#fff', fontSize: 18, fontWeight: '600'},
  dataBox: {flex: 1, backgroundColor: '#1e1e1e', borderRadius: 10, padding: 16},
  sectionLabel: {color: '#aaa', fontSize: 13, marginBottom: 6},
  row: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#333'},
  label: {color: '#888', fontSize: 15},
  value: {color: '#fff', fontSize: 15, fontFamily: 'monospace'},
  tsLabel: {color: '#666', fontSize: 12, marginTop: 12, textAlign: 'right'},
  noData: {color: '#666', fontSize: 16, textAlign: 'center', marginTop: 40},
});
