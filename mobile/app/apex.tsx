import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { adDue, preloadInterstitial, showInterstitial } from '../src/ads';
import { Race, RaceResult } from '../src/apex/Race';
import { levelSpec, MAX_LEVEL, TICKS_PER_SECOND } from '../src/apex/sim';
import { ApexSettings, loadApex, saveApex } from '../src/apex/storage';
import { sfx } from '../src/sfx';
import { Body, Button, Card, Dim, H1, Screen, colors } from '../src/ui';

const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : String(n));
const fmt = (ticks: number) => (ticks ? `${Math.floor(ticks / TICKS_PER_SECOND / 60)}:${((ticks / TICKS_PER_SECOND) % 60).toFixed(1).padStart(4, '0')}` : 'DNF');

export default function Apex() {
  const router = useRouter();
  const [phase, setPhase] = useState<'menu' | 'race' | 'result'>('menu');
  const [settings, setSettings] = useState<ApexSettings>({ tilt: true, invert: false, unlocked: 1 });
  const [level, setLevel] = useState(1);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<RaceResult | null>(null);
  
  useEffect(() => { loadApex().then((s) => { setSettings(s); setLevel(Math.min(s.unlocked, MAX_LEVEL)); }); preloadInterstitial(); }, []);

  // the menu is upright; the race itself is sideways so the road is wide and the buttons have room
  useEffect(() => {
    void ScreenOrientation.lockAsync(phase === 'race' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, [phase]);
  useEffect(() => () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); }, []);

  const update = (p: Partial<ApexSettings>) => { const s = { ...settings, ...p }; setSettings(s); void saveApex(s); };
  const spec = levelSpec(level);
  const traffic = ['cars', spec.bikes ? 'motorbikes' : '', spec.peds ? 'people crossing' : '', spec.trucks ? 'trucks' : '', spec.buses ? 'buses' : ''].filter(Boolean).join(', ');
  const time = ['Day', 'Day', 'Sunset', 'Night'][(level - 1) % 4 === 0 ? 0 : (level - 1) % 4];

  const done = (r: RaceResult) => {
    setResult(r);
    if (r.rank <= 3 && level >= settings.unlocked && level < MAX_LEVEL) update({ unlocked: level + 1 });
    setPhase('result');
    sfx(r.rank === 1 ? 'win' : r.rank <= 3 ? 'complete' : 'lose');
    void adDue('APEX_RUN').then((due) => { if (due) setTimeout(() => { void showInterstitial(); }, 1800); });
  };

  if (phase === 'race') return <Race key={run} level={level} tilt={settings.tilt} invert={settings.invert} onDone={done} onFlip={() => update({ invert: !settings.invert })} />;

  if (phase === 'result' && result) {
    const next = level < MAX_LEVEL && level + 1 <= Math.max(settings.unlocked, result.rank <= 3 ? level + 1 : 0);
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <H1>{result.rank === 1 ? 'You won! 🏆' : result.rank <= 3 ? `Podium! ${medal(result.rank)}` : `You finished ${result.rank}${['st', 'nd', 'rd'][result.rank - 1] ?? 'th'}`}</H1>
          <Dim>Level {result.level} · {fmt(result.ticks)} · {result.hits} hit{result.hits === 1 ? '' : 's'}{result.pedHits ? ` (${result.pedHits} on foot)` : ''}</Dim>
          <Card style={{ marginTop: 16, gap: 8 }}>
            {result.standings.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ width: 32, color: colors.text, fontWeight: '900', fontSize: 18 }}>{medal(i + 1)}</Text>
                <Body style={{ flex: 1, fontWeight: s.you ? '900' : '500', color: s.you ? colors.accent : colors.text }}>{s.name}</Body>
                <Dim>{fmt(s.ticks)}</Dim>
              </View>
            ))}
          </Card>
          {result.rank > 3 ? <Dim style={{ marginTop: 10 }}>Finish in the top 3 to unlock the next level.</Dim> : null}
          <View style={{ gap: 10, marginTop: 18 }}>
            {next ? <Button title={`Next level (${level + 1})`} onPress={() => { setLevel(level + 1); setRun((n) => n + 1); setPhase('race'); }} /> : null}
            <Button title="Race again" kind={next ? 'ghost' : 'primary'} onPress={() => { setRun((n) => n + 1); setPhase('race'); }} />
            <Button title="Menu" kind="ghost" onPress={() => setPhase('menu')} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <Text onPress={() => router.back()} style={{ color: colors.accent, fontWeight: '800', paddingVertical: 12 }}>‹ Back</Text>
        <H1>🏎️ Apex Run</H1>
        <Dim>Race 5 rivals through traffic. First to the finish line wins. Crashes slow you down but never end the race.</Dim>

        <Card style={{ marginTop: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => setLevel((l) => Math.max(1, l - 1))} style={{ padding: 12 }}><Text style={{ color: colors.text, fontSize: 28 }}>‹</Text></Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 30, fontWeight: '900' }}>Level {level}</Text>
              <Dim>{time} · {Math.round(spec.length)} m</Dim>
            </View>
            <Pressable onPress={() => setLevel((l) => Math.min(settings.unlocked, l + 1))} style={{ padding: 12, opacity: level >= settings.unlocked ? 0.3 : 1 }}><Text style={{ color: colors.text, fontSize: 28 }}>›</Text></Pressable>
          </View>
          <Dim style={{ textAlign: 'center' }}>Traffic: {traffic}</Dim>
          <Dim style={{ textAlign: 'center', fontSize: 12 }}>{settings.unlocked > level ? 'Cleared. Race it again any time.' : `Finish in the top 3 to unlock level ${level + 1}.`}</Dim>
        </Card>

        <Card style={{ marginTop: 12, gap: 10 }}>
          <Body style={{ fontWeight: '800' }}>Steering</Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={settings.tilt ? 'Tilt: on' : 'Tilt: off'} kind={settings.tilt ? 'primary' : 'ghost'} onPress={() => update({ tilt: !settings.tilt })} style={{ flex: 1, minHeight: 42 }} />
            <Button title="Flip tilt" kind="ghost" onPress={() => update({ invert: !settings.invert })} style={{ flex: 1, minHeight: 42 }} disabled={!settings.tilt} />
          </View>
          <Dim style={{ fontSize: 12 }}>{settings.tilt ? 'The race is played sideways. Hold the phone like a steering wheel and turn it. If it steers the wrong way, press Flip tilt (here, or during the race).' : 'Use the ◀ ▶ buttons on screen.'}</Dim>
          <Dim style={{ fontSize: 12 }}>The ◀ ▶ buttons always work too. ⚡ Nitro gives a short burst. ■ Brake slows you.</Dim>
        </Card>

        <Button title="Start race" onPress={() => { setRun((n) => n + 1); setPhase('race'); }} style={{ marginTop: 18 }} />
      </ScrollView>
    </Screen>
  );
}
