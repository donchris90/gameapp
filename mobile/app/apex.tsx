import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { adDue, preloadInterstitial, showInterstitial } from '../src/ads';
import { Race, RaceResult } from '../src/apex/Race';
import { CarPreview } from '../src/apex/CarPreview';
import { CARS, levelSpec, MAX_LEVEL, TICKS_PER_SECOND } from '../src/apex/sim';
import { ApexSettings, loadApex, saveApex } from '../src/apex/storage';
import { sfx } from '../src/sfx';
import { Body, Button, Card, Chip, Dim, H1, Screen, Coins, colors } from '../src/ui';

const PAINTS = [
  { name: 'Electric Blue', hex: 0x2788ff }, { name: 'Neon Violet', hex: 0x7548ff },
  { name: 'Crimson', hex: 0xe52b43 }, { name: 'Pearl White', hex: 0xe7edf7 },
  { name: 'Midnight', hex: 0x171b2b }, { name: 'Volt Yellow', hex: 0xf4c542 },
  { name: 'Emerald', hex: 0x12a87b },
];
const CAR_LIST = [
  { id: 'starter', name: 'Apex S1', category: 'Street', price: 0, level: 0, tier: 0, subtitle: 'Your first ride', emoji: '🚘' },
  { id: 'sport', name: 'Apex R', category: 'Sport', price: 2500, level: 1, tier: 1, subtitle: 'Sharper response', emoji: '🏎️' },
  { id: 'luxury', name: 'Apex GT', category: 'Grand tourer', price: 8000, level: 5, tier: 2, subtitle: 'Luxury and speed', emoji: '🚘' },
  { id: 'flagship', name: 'Apex X', category: 'Hypercar', price: 20000, level: 12, tier: 3, subtitle: 'The flagship build', emoji: '🏁' },
] as const;
type Panel = 'home' | 'garage' | 'customize' | 'career' | 'friends';
const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : String(n));
const fmt = (ticks: number) => (ticks ? `${Math.floor(ticks / TICKS_PER_SECOND / 60)}:${((ticks / TICKS_PER_SECOND) % 60).toFixed(1).padStart(4, '0')}` : 'DNF');
const rewardFor = (r: RaceResult) => (r.ticks > 0 ? 120 : 40) + ([0, 300, 200, 120, 80, 60, 40][r.rank] ?? 30);

export default function Apex() {
  const router = useRouter();
  const [phase, setPhase] = useState<'menu' | 'race' | 'result'>('menu');
  const [panel, setPanel] = useState<Panel>('home');
  const [settings, setSettings] = useState<ApexSettings>({ tilt: true, invert: false, unlocked: 1, coins: 0, activeCar: 'starter', unlockedCars: ['starter'], paint: 0x2788ff, bodyTier: 0, completedRaces: 0 });
  const [level, setLevel] = useState(1);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { loadApex().then((s) => { setSettings(s); setLevel(Math.min(s.unlocked, MAX_LEVEL)); }); preloadInterstitial(); }, []);
  useEffect(() => {
    void ScreenOrientation.lockAsync(phase === 'race' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, [phase]);
  useEffect(() => () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); }, []);

  const update = (p: Partial<ApexSettings>) => {
    const s = { ...settings, ...p };
    setSettings(s);
    void saveApex(s);
  };
  const selectedCar = useMemo(() => CAR_LIST.find((c) => c.id === settings.activeCar) ?? CAR_LIST[0], [settings.activeCar]);
  const spec = levelSpec(level);
  const traffic = ['cars', spec.bikes ? 'motorbikes' : '', spec.peds ? 'people crossing' : '', spec.trucks ? 'trucks' : '', spec.buses ? 'buses' : ''].filter(Boolean).join(', ');
  const time = ['Day', 'Day', 'Sunset', 'Night'][(level - 1) % 4 === 0 ? 0 : (level - 1) % 4];

  const done = (r: RaceResult) => {
    setResult(r);
    const reward = rewardFor(r);
    const nextUnlocked = r.rank <= 3 && level >= settings.unlocked && level < MAX_LEVEL ? level + 1 : settings.unlocked;
    update({ coins: settings.coins + reward, completedRaces: settings.completedRaces + 1, unlocked: nextUnlocked });
    if (nextUnlocked > settings.unlocked) setNotice(`Level ${nextUnlocked} unlocked!`);
    setPhase('result');
    sfx(r.rank === 1 ? 'win' : r.rank <= 3 ? 'complete' : 'lose');
    void adDue('APEX_RUN').then((due) => { if (due) setTimeout(() => { void showInterstitial(); }, 1800); });
  };

  const startRace = (nextLevel = level) => { setLevel(nextLevel); setRun((n) => n + 1); setPhase('race'); };
  const unlockOrSelectCar = (car: typeof CAR_LIST[number]) => {
    if (settings.unlockedCars.includes(car.id)) {
      update({ activeCar: car.id, bodyTier: car.tier });
      setNotice(`${car.name} selected`);
      return;
    }
    if (settings.unlocked < car.level) { setNotice(`Reach career level ${car.level} to unlock ${car.name}.`); return; }
    if (settings.coins < car.price) { setNotice(`You need ${(car.price - settings.coins).toLocaleString()} more coins.`); return; }
    update({ coins: settings.coins - car.price, unlockedCars: [...settings.unlockedCars, car.id], activeCar: car.id, bodyTier: car.tier });
    setNotice(`${car.name} unlocked and selected!`);
  };

  if (phase === 'race') return <Race key={run} level={level} tilt={settings.tilt} invert={settings.invert} carId={settings.activeCar} paint={settings.paint} bodyTier={selectedCar.tier} onDone={done} onFlip={() => update({ invert: !settings.invert })} />;

  if (phase === 'result' && result) {
    const next = level < MAX_LEVEL && level + 1 <= Math.max(settings.unlocked, result.rank <= 3 ? level + 1 : 0);
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={{ color: colors.x, fontWeight: '900', letterSpacing: 3, marginTop: 8 }}>APEX RUN / RACE REPORT</Text>
          <H1>{result.rank === 1 ? 'VICTORY // 🏆' : result.rank <= 3 ? `PODIUM // ${medal(result.rank)}` : `FINISH // #${result.rank}`}</H1>
          <Dim>Level {result.level} · {fmt(result.ticks)} · {result.hits} collision{result.hits === 1 ? '' : 's'}</Dim>
          <Card style={{ marginTop: 16, borderColor: '#28578b', backgroundColor: '#101b34', gap: 10 }}>
            <Dim>RACE REWARD</Dim>
            <Text style={{ color: colors.gold, fontWeight: '900', fontSize: 34 }}>+{rewardFor(result)} COINS</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Dim>Wallet balance</Dim><Coins amount={settings.coins} /></View>
            <Dim>{result.rank <= 3 ? 'Top-three finish: career progression advanced.' : 'Keep racing to earn more coins and unlock the next level.'}</Dim>
          </Card>
          <Card style={{ marginTop: 12, gap: 10 }}>
            <Body style={{ fontWeight: '900' }}>FINAL STANDINGS</Body>
            {result.standings.map((s, i) => <View key={`${s.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ width: 30, color: colors.text, fontWeight: '900', fontSize: 18 }}>{medal(i + 1)}</Text><Body style={{ flex: 1, fontWeight: s.you ? '900' : '500', color: s.you ? colors.x : colors.text }}>{s.name}{s.you ? '  YOU' : ''}</Body><Dim>{fmt(s.ticks)}</Dim></View>)}
          </Card>
          {notice ? <Text style={{ color: colors.good, marginTop: 12, fontWeight: '800' }}>{notice}</Text> : null}
          <View style={{ gap: 10, marginTop: 18 }}>
            {next ? <Button title={`NEXT LEVEL  ${level + 1}  →`} onPress={() => startRace(level + 1)} /> : null}
            <Button title="RACE AGAIN" kind={next ? 'ghost' : 'primary'} onPress={() => startRace(level)} />
            <Button title="RETURN TO GARAGE" kind="ghost" onPress={() => { setPhase('menu'); setPanel('garage'); }} />
            <Button title="HOME" kind="ghost" onPress={() => { setPhase('menu'); setPanel('home'); }} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const nav = (id: Panel, label: string, icon: string) => <Pressable key={id} onPress={() => { setPanel(id); setNotice(''); }} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: panel === id ? '#243c78' : 'transparent', borderWidth: panel === id ? 1 : 0, borderColor: '#4b83ff' }}><Text style={{ color: panel === id ? '#83c5ff' : colors.dim, fontSize: 19 }}>{icon}</Text><Text style={{ color: panel === id ? '#fff' : colors.dim, fontSize: 10, fontWeight: '800' }}>{label}</Text></Pressable>;

  return (
    <Screen style={{ paddingHorizontal: 14 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 16 }}>
          <Pressable onPress={() => router.back()}><Text style={{ color: colors.dim, fontWeight: '800' }}>‹ BACK</Text></Pressable>
          <View style={{ alignItems: 'center' }}><Text style={{ color: '#f4f7ff', fontSize: 24, fontWeight: '900', letterSpacing: 3 }}>APEX<Text style={{ color: colors.x }}> RUN</Text></Text><Text style={{ color: colors.dim, fontSize: 9, letterSpacing: 3 }}>DRIVE · CUSTOMIZE · CONQUER</Text></View>
          <Coins amount={settings.coins} size={13} />
        </View>

        {panel === 'home' ? <>
          <Card style={{ padding: 0, overflow: 'hidden', borderColor: '#28578b', backgroundColor: '#0e1830' }}>
            <View style={{ padding: 18, gap: 8, backgroundColor: '#111f40' }}>
              <Text style={{ color: colors.x, fontSize: 11, letterSpacing: 2, fontWeight: '900' }}>YOUR NEXT DRIVE STARTS HERE</Text>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{selectedCar.name}</Text>
              <Text style={{ color: colors.dim }}>{selectedCar.category} class · Career level {level}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <View style={{ flex: 1 }}><Text style={{ color: '#8fcaff', fontSize: 12, fontWeight: '800' }}>ACTIVE BUILD</Text><Text style={{ color: '#fff', fontSize: 44 }}>{selectedCar.emoji}</Text></View>
                <View style={{ alignItems: 'flex-end', gap: 5 }}><Dim>TOP SPEED</Dim><Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>{Math.round((CARS[settings.activeCar] ?? CARS.starter).vmax * 3.6)} KM/H</Text><Text style={{ color: colors.good, fontSize: 11, fontWeight: '800' }}>● READY TO RACE</Text></View>
              </View>
              <Button title="START CAREER RACE  →" onPress={() => startRace(level)} style={{ marginTop: 4, backgroundColor: '#245fff', borderColor: '#5eaaff' }} />
            </View>
          </Card>
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
            {[{ n: `${settings.unlocked}/${MAX_LEVEL}`, l: 'LEVELS OPEN' }, { n: String(settings.completedRaces), l: 'RACES DONE' }, { n: String(settings.unlockedCars.length), l: 'CARS OWNED' }].map((x) => <Card key={x.l} style={{ flex: 1, padding: 12, gap: 5 }}><Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{x.n}</Text><Text style={{ color: colors.dim, fontSize: 9, fontWeight: '800' }}>{x.l}</Text></Card>)}
          </View>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 20, marginBottom: 10 }}>QUICK ACCESS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[{ p: 'garage' as Panel, i: '🚘', t: 'My Garage', d: 'Choose your car' }, { p: 'customize' as Panel, i: '🔧', t: 'Customize', d: 'Make it yours' }, { p: 'career' as Panel, i: '🏆', t: 'Career', d: '60 race levels' }, { p: 'friends' as Panel, i: '👥', t: 'Play with Friends', d: 'Private rooms' }].map((x) => <Pressable key={x.p} onPress={() => { setPanel(x.p); setNotice(''); }} style={{ width: '48%', flexGrow: 1 }}><Card style={{ gap: 6, minHeight: 105, borderColor: x.p === 'friends' ? '#4e45a8' : colors.line }}><Text style={{ fontSize: 23 }}>{x.i}</Text><Text style={{ color: '#fff', fontWeight: '900' }}>{x.t}</Text><Dim style={{ fontSize: 11 }}>{x.d}</Dim></Card></Pressable>)}
          </View>
          <Card style={{ marginTop: 12, gap: 7 }}><Text style={{ color: '#fff', fontWeight: '900' }}>DAILY DRIVER BRIEFING</Text><Dim>Earn coins by finishing races. Place in the top three to unlock the next career level. Use your winnings to expand your garage.</Dim><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Dim>Next race</Dim><Text style={{ color: colors.x, fontWeight: '900' }}>LEVEL {level} · {time.toUpperCase()}</Text></View></Card>
        </> : null}

        {panel === 'garage' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>YOUR COLLECTION</Text><H1>Garage</H1><Dim>Select a car to make it active. Cars unlock with earned coins and career progress.</Dim>
          <View style={{ marginTop: 14, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#28578b' }}><CarPreview key={`garage-${settings.activeCar}-${settings.paint}`} color={settings.paint} tier={selectedCar.tier} height={210} /></View>
          <Card style={{ marginTop: 10, gap: 6, borderColor: '#28578b', backgroundColor: '#101b34' }}><Text style={{ fontSize: 44, textAlign: 'center' }}>{selectedCar.emoji}</Text><Text style={{ color: '#fff', fontSize: 23, fontWeight: '900', textAlign: 'center' }}>{selectedCar.name}</Text><Text style={{ color: colors.x, textAlign: 'center', fontWeight: '800' }}>ACTIVE VEHICLE</Text><View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}><View><Dim>Speed</Dim><Body style={{ fontWeight: '900' }}>{Math.round((CARS[settings.activeCar] ?? CARS.starter).vmax * 3.6)} km/h</Body></View><View><Dim>Acceleration</Dim><Body style={{ fontWeight: '900' }}>{(CARS[settings.activeCar] ?? CARS.starter).accel}</Body></View><View><Dim>Handling</Dim><Body style={{ fontWeight: '900' }}>{(CARS[settings.activeCar] ?? CARS.starter).handling.toFixed(1)}</Body></View></View></Card>
          {CAR_LIST.map((car) => { const owned = settings.unlockedCars.includes(car.id); const available = settings.unlocked >= car.level; return <Card key={car.id} style={{ marginTop: 10, gap: 8, borderColor: settings.activeCar === car.id ? '#428dff' : colors.line }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ fontSize: 30 }}>{car.emoji}</Text><View style={{ flex: 1, gap: 2 }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{car.name}</Text><Dim>{car.category} · {car.subtitle}</Dim></View>{owned ? <Text style={{ color: colors.good, fontWeight: '900', fontSize: 10 }}>OWNED</Text> : <Coins amount={car.price} size={12} />}</View><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Dim>{available ? `Speed ${Math.round(CARS[car.id].vmax * 3.6)} km/h` : `Unlock at career level ${car.level}`}</Dim><Button title={settings.activeCar === car.id ? 'SELECTED' : owned ? 'SELECT CAR' : available ? 'UNLOCK' : 'LOCKED'} kind={settings.activeCar === car.id ? 'ghost' : 'primary'} disabled={settings.activeCar === car.id || (!owned && !available)} onPress={() => unlockOrSelectCar(car)} style={{ minHeight: 38, paddingHorizontal: 14 }} /></View></Card>; })}
        </> : null}

        {panel === 'customize' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>WORKSHOP</Text><H1>Customize</H1><Dim>Choose paint and body style. Changes are saved and used in the race scene.</Dim>
          <View style={{ marginTop: 14, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#28578b' }}><CarPreview key={`custom-${settings.activeCar}-${settings.paint}`} color={settings.paint} tier={selectedCar.tier} height={220} /></View>
          <Card style={{ marginTop: 10, alignItems: 'center', gap: 8, paddingVertical: 14, borderColor: '#28578b', backgroundColor: '#101b34' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{selectedCar.name}</Text><View style={{ width: 88, height: 8, borderRadius: 4, backgroundColor: `#${settings.paint.toString(16).padStart(6, '0')}`, borderWidth: 1, borderColor: '#fff' }} /><Text style={{ color: colors.dim, fontSize: 11 }}>ACTIVE PAINT PREVIEW</Text></Card>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, marginTop: 18, marginBottom: 8 }}>PAINT FINISH</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{PAINTS.map((p) => <Pressable key={p.name} onPress={() => update({ paint: p.hex })} style={{ width: '30%', flexGrow: 1, padding: 10, alignItems: 'center', borderRadius: 14, backgroundColor: settings.paint === p.hex ? '#1b3766' : colors.card, borderWidth: 1, borderColor: settings.paint === p.hex ? '#5eaaff' : colors.line }}><View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: `#${p.hex.toString(16).padStart(6, '0')}`, borderWidth: 1, borderColor: '#aab5cf' }} /><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 7 }}>{p.name}</Text>{settings.paint === p.hex ? <Text style={{ color: colors.x, fontSize: 9, marginTop: 3 }}>SELECTED</Text> : null}</Pressable>)}</View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, marginTop: 20, marginBottom: 8 }}>BODY STYLE</Text><Dim>Body kits are tied to your car class in this first build. Choose a car in the Garage to change the available silhouette.</Dim><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{CAR_LIST.map((car) => <Chip key={car.id} label={car.name} selected={settings.activeCar === car.id} onPress={() => { if (settings.unlockedCars.includes(car.id)) update({ activeCar: car.id, bodyTier: car.tier }); else setNotice(`Unlock ${car.name} in the Garage first.`); }} />)}</View>
          <Button title="BACK TO GARAGE" kind="ghost" onPress={() => setPanel('garage')} style={{ marginTop: 18 }} />
        </> : null}

        {panel === 'career' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>CAREER MODE</Text><H1>Race progression</H1><Dim>Complete a level in the top three to unlock the next event. Each completed race earns coins.</Dim>
          <Card style={{ marginTop: 14, gap: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: '#fff', fontWeight: '900' }}>LEVEL {level}</Text><Text style={{ color: colors.x, fontWeight: '900' }}>{settings.unlocked}/{MAX_LEVEL} OPEN</Text></View><Text style={{ color: '#fff', fontSize: 25, fontWeight: '900' }}>{time} CIRCUIT</Text><Dim>{Math.round(spec.length)} m · Traffic: {traffic}</Dim><Button title={`RACE LEVEL ${level}`} onPress={() => startRace(level)} style={{ marginTop: 8 }} /></Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>{Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((n) => <Chip key={n} label={`${n}`} selected={n === level} disabled={n > settings.unlocked} onPress={() => setLevel(n)} />)}</View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}><Button title="PREVIOUS" kind="ghost" disabled={level <= 1} onPress={() => setLevel((l) => Math.max(1, l - 1))} style={{ flex: 1 }} /><Button title="NEXT OPEN" disabled={level >= settings.unlocked} onPress={() => setLevel((l) => Math.min(settings.unlocked, l + 1))} style={{ flex: 1 }} /></View>
        </> : null}

        {panel === 'friends' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>MULTIPLAYER / PHASE 2</Text><H1>Play with friends</H1><Dim>Friends-first private rooms are part of the agreed scope. The uploaded mobile package contains the client app, but no multiplayer server implementation was supplied with it.</Dim>
          <Card style={{ marginTop: 14, gap: 10, borderColor: '#4e45a8', backgroundColor: '#111833' }}><Text style={{ fontSize: 38 }}>👥</Text><Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>Private race rooms</Text><Dim>Planned: create a room, share a code, invite friends, ready up, race together, and view synchronized results.</Dim><Text style={{ color: colors.gold, fontWeight: '900' }}>SERVER REQUIRED</Text><Dim>We need the backend repository or its API/socket contracts before this screen can honestly create real online rooms. I have not added fake matchmaking or simulated online players.</Dim></Card>
          <Card style={{ marginTop: 10, gap: 8 }}><Text style={{ color: '#fff', fontWeight: '900' }}>READY FOR THE NEXT BUILD STAGE</Text><Dim>The client already includes socket.io-client. The next dependency is confirming the server's authentication, room events, race synchronization and result validation.</Dim></Card>
          <Button title="BACK HOME" kind="ghost" onPress={() => setPanel('home')} style={{ marginTop: 14 }} />
        </> : null}

        {notice ? <Pressable onPress={() => setNotice('')} style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#102a2a', borderWidth: 1, borderColor: '#236b63' }}><Text style={{ color: '#b7ffea', fontWeight: '800' }}>{notice}  ×</Text></Pressable> : null}
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 18, padding: 5, borderRadius: 16, backgroundColor: '#0e1529', borderWidth: 1, borderColor: colors.line }}>{nav('home', 'HOME', '⌂')}{nav('garage', 'GARAGE', '🚘')}{nav('customize', 'TUNE', '⚙')}{nav('career', 'CAREER', '🏆')}{nav('friends', 'FRIENDS', '♧')}</View>
        <Text style={{ color: '#56668d', textAlign: 'center', fontSize: 9, letterSpacing: 2, marginTop: 14 }}>APEX RUN · DRIVE YOUR VISION</Text>
      </ScrollView>
    </Screen>
  );
}
