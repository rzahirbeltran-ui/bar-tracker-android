import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, StatusBar} from 'react-native';
import HomeScreen    from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';

type Tab = 'home' | 'history';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={s.screen}>
        {tab === 'home' ? <HomeScreen /> : <HistoryScreen />}
      </View>

      <View style={s.tabBar}>
        <TouchableOpacity style={s.tabBtn} onPress={() => setTab('home')}>
          <Text style={[s.tabIcon, tab === 'home' && s.tabIconActive]}>◉</Text>
          <Text style={[s.tabLabel, tab === 'home' && s.tabLabelActive]}>Entreno</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.tabBtn} onPress={() => setTab('history')}>
          <Text style={[s.tabIcon, tab === 'history' && s.tabIconActive]}>▤</Text>
          <Text style={[s.tabLabel, tab === 'history' && s.tabLabelActive]}>Historial</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:   {flex: 1, backgroundColor: '#0a0a0a'},
  screen: {flex: 1},

  tabBar:       {flexDirection: 'row', backgroundColor: '#111',
                 borderTopWidth: 1, borderTopColor: '#1e1e1e',
                 paddingBottom: 10, paddingTop: 8},
  tabBtn:       {flex: 1, alignItems: 'center', gap: 2},
  tabIcon:      {fontSize: 20, color: '#333'},
  tabIconActive:{color: '#6366f1'},
  tabLabel:     {fontSize: 11, color: '#444', fontWeight: '600'},
  tabLabelActive:{color: '#6366f1'},
});
