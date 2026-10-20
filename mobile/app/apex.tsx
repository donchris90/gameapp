import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { adDue, preloadInterstitial, showInterstitial } from '../src/ads';
import { Race, RaceResult } from '../src/apex/Race';
import { CarPreview } from '../src/apex/CarPreview';
import { CATALOG, STAT_MAX, UPGRADE_INFO, catalogCar, lookFor, upgradeCost } from '../src/apex/cars';
import { loadCarModel } from '../src/apex/model';
import { MAX_UPGRADE, UPGRADE_KINDS, carStats, levelSpec, MAX_LEVEL, TICKS_PER_SECOND } from '../src/apex/sim';
import { ApexSettings, loadApex, saveApex } from '../src/apex/storage';
import { sfx } from '../src/sfx';
import { Body, Button, Card, Chip, Dim, H1, Screen, Coins, colors } from '../src/ui';

const PAINTS = [
  { name: 'Electric Blue', hex: 0x2788ff }, { name: 'Neon Violet', hex: 0x7548ff },
  { name: 'Crimson', hex: 0xe52b43 }, { name: 'Pearl White', hex: 0xe7edf7 },
  { name: 'Midnight', hex: 0x171b2b }, { name: 'Volt Yellow', hex: 0xf4c542 },
  { name: 'Emerald', hex: 0x12a87b },
];
type Panel = 'home' | 'garage' | 'customize' | 'career' | 'friends';
const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : String(n));
const fmt = (ticks: number) => (ticks ? `${Math.floor(ticks / TICKS_PER_SECOND / 60)}:${((ticks / TICKS_PER_SECOND) % 60).toFixed(1).padStart(4, '0')}` : 'DNF');
const rewardFor = (r: RaceResult) => (r.ticks > 0 ? 120 : 40) + ([0, 300, 200, 120, 80, 60, 40][r.rank] ?? 30);

export default function Apex() {
  const router = useRouter();
  const [phase, setPhase] = useState<'menu' | 'race' | 'result'>('menu');
  const [panel, setPanel] = useState<Panel>('home');
  const [settings, setSettings] = useState<ApexSettings>({ tilt: true, invert: false, unlocked: 1, coins: 0, activeCar: 'cts', unlockedCars: ['cts'], paint: 0x2788ff, bodyTier: 0, completedRaces: 0, upgrades: {} });
  const [browse, setBrowse] = useState('cts'); // the car being looked at in the garage
  const [level, setLevel] = useState(1);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { loadApex().then((s) => { setSettings(s); setBrowse(s.activeCar); setLevel(Math.min(s.unlocked, MAX_LEVEL)); }); preloadInterstitial(); }, []);
  useEffect(() => {
    void ScreenOrientation.lockAsync(phase === 'race' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, [phase]);
  useEffect(() => () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); }, []);

  const update = (p: Partial<ApexSettings>) => {
    const s = { ...settings, ...p };
    setSettings(s);
    void saveApex(s);
  };
  const selectedCar = useMemo(() => catalogCar(settings.activeCar), [settings.activeCar]);
  const levelsOf = (id: string) => settings.upgrades[id] ?? [0, 0, 0, 0];
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
  const unlockCar = (id: string) => {
    const car = catalogCar(id);
    if (!car.ready) { setNotice(`${car.name}: the 3D model is still on its way.`); return; }
    if (settings.unlocked < car.level) { setNotice(`Reach career level ${car.level} to unlock ${car.name}.`); return; }
    if (settings.coins < car.price) { setNotice(`You need ${(car.price - settings.coins).toLocaleString()} more coins.`); return; }
    update({ coins: settings.coins - car.price, unlockedCars: [...settings.unlockedCars, car.id], activeCar: car.id });
    setNotice(`${car.name} unlocked and selected!`); sfx('complete');
  };
  const selectCar = (id: string) => { update({ activeCar: id }); setNotice(`${catalogCar(id).name} selected`); };
  const buyUpgrade = (id: string, kind: number) => {
    const lv = levelsOf(id); const next = lv[kind] + 1;
    if (next > MAX_UPGRADE) return;
    const cost = upgradeCost(id, next);
    if (settings.coins < cost) { setNotice(`You need ${(cost - settings.coins).toLocaleString()} more coins.`); return; }
    const nl = [...lv]; nl[kind] = next;
    update({ coins: settings.coins - cost, upgrades: { ...settings.upgrades, [id]: nl } });
    setNotice(`${UPGRADE_INFO[UPGRADE_KINDS[kind]].label} upgraded to level ${next}!`); sfx('complete');
  };

  if (phase === 'race') return <Race key={run} level={level} tilt={settings.tilt} invert={settings.invert} carId={settings.activeCar} paint={settings.paint} upgrades={levelsOf(settings.activeCar)} onDone={done} onFlip={() => update({ invert: !settings.invert })} />;

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

  // The garage: the chosen car in 3D, its stats, its upgrades and the place to unlock it. (A function, not a component, so the 3D view is not rebuilt on every change.)
  const renderGarage = () => {
    const car = catalogCar(browse), idx = CATALOG.findIndex((c) => c.id === browse);
    const owned = settings.unlockedCars.includes(car.id), active = settings.activeCar === car.id;
    const lv = levelsOf(car.id), base = carStats(car.id, [0, 0, 0, 0]), cur = carStats(car.id, lv);
    const levelOk = settings.unlocked >= car.level, canAfford = settings.coins >= car.price;
    const bars = [
      { label: 'TOP SPEED', cur: cur.vmax, base: base.vmax, max: STAT_MAX.vmax, text: `${Math.round(cur.vmax * 3.6)} km/h` },
      { label: 'ACCELERATION', cur: cur.accel, base: base.accel, max: STAT_MAX.accel, text: cur.accel.toFixed(1) },
      { label: 'HANDLING', cur: cur.handling, base: base.handling, max: STAT_MAX.handling, text: cur.handling.toFixed(1) },
      { label: 'NITRO', cur: cur.nitroSeconds, base: base.nitroSeconds, max: STAT_MAX.nitro, text: `${cur.nitroSeconds.toFixed(1)} s` },
    ];
    const step = (d: number) => setBrowse(CATALOG[(idx + d + CATALOG.length) % CATALOG.length].id);
    return <>
      <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>YOUR COLLECTION</Text>
      <H1>Garage</H1>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
        {CATALOG.map((c) => {
          const own = settings.unlockedCars.includes(c.id);
          return <Pressable key={c.id} onPress={() => setBrowse(c.id)} style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14, backgroundColor: browse === c.id ? '#1b3766' : colors.card, borderWidth: 1, borderColor: browse === c.id ? '#5eaaff' : colors.line }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{own ? (settings.activeCar === c.id ? '● ' : '✓ ') : '🔒 '}{c.name}</Text>
          </Pressable>;
        })}
      </ScrollView>

      <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#28578b' }}>
        {car.ready
          ? <CarPreview key={`g-${car.id}-${settings.paint}-${lv.join('')}`} color={settings.paint} carId={car.id} upgrades={lv} height={230} />
          : <View style={{ height: 230, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101a31' }}><Text style={{ fontSize: 46 }}>🛠️</Text><Dim>3D model arriving soon</Dim></View>}
        <Pressable onPress={() => step(-1)} style={{ position: 'absolute', left: 6, top: 90, padding: 10, borderRadius: 20, backgroundColor: 'rgba(10,14,30,.6)' }}><Text style={{ color: '#fff', fontSize: 22 }}>‹</Text></Pressable>
        <Pressable onPress={() => step(1)} style={{ position: 'absolute', right: 6, top: 90, padding: 10, borderRadius: 20, backgroundColor: 'rgba(10,14,30,.6)' }}><Text style={{ color: '#fff', fontSize: 22 }}>›</Text></Pressable>
        {!owned ? <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(10,14,30,.75)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: colors.gold, fontWeight: '900', fontSize: 12 }}>🔒 LOCKED</Text></View> : active ? <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(36,95,255,.85)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>● DRIVING</Text></View> : null}
      </View>

      <Card style={{ marginTop: 10, gap: 4, borderColor: '#28578b', backgroundColor: '#101b34' }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{car.name}</Text>
        <Text style={{ color: colors.x, fontWeight: '800' }}>{car.tag.toUpperCase()}</Text>
        <Dim>{car.blurb}</Dim>
      </Card>

      <Card style={{ marginTop: 10, gap: 11 }}>
        <Body style={{ fontWeight: '900' }}>PERFORMANCE</Body>
        {bars.map((b) => (
          <View key={b.label} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Dim style={{ fontSize: 11, fontWeight: '800' }}>{b.label}</Dim><Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{b.text}{b.cur > b.base + 0.001 ? <Text style={{ color: colors.good }}>  +{(((b.cur - b.base) / b.base) * 100).toFixed(0)}%</Text> : null}</Text></View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, flexDirection: 'row', overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (b.base / b.max) * 100)}%`, backgroundColor: '#4b83ff' }} />
              <View style={{ width: `${Math.max(0, Math.min(100, ((b.cur - b.base) / b.max) * 100))}%`, backgroundColor: '#3ddc97' }} />
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: 10, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Body style={{ fontWeight: '900' }}>UPGRADES</Body><Coins amount={settings.coins} size={12} /></View>
        {UPGRADE_KINDS.map((kind, k) => {
          const info = UPGRADE_INFO[kind], level = lv[k] ?? 0, maxed = level >= MAX_UPGRADE, cost = upgradeCost(car.id, level + 1);
          return (
            <View key={kind} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 22 }}>{info.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '900' }}>{info.label}  <Text style={{ color: colors.dim, fontWeight: '600', fontSize: 11 }}>{info.per}</Text></Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 5 }}>{Array.from({ length: MAX_UPGRADE }, (_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < level ? '#3ddc97' : colors.cardAlt }} />)}</View>
                  <Dim style={{ fontSize: 10, marginTop: 3 }}>Look: {info.look}{level >= 1 ? '' : ' (unlocks at level 1)'}</Dim>
                </View>
                <Button title={maxed ? 'MAX' : `${cost.toLocaleString()} 🪙`} kind={maxed ? 'ghost' : 'primary'} disabled={maxed || !owned || settings.coins < cost} onPress={() => buyUpgrade(car.id, k)} style={{ minHeight: 38, paddingHorizontal: 12 }} />
              </View>
            </View>
          );
        })}
        {!owned ? <Dim style={{ fontSize: 11 }}>Unlock this car to upgrade it. Upgrades stay with the car.</Dim> : <Dim style={{ fontSize: 11 }}>Every upgrade changes how the car drives and how it looks: flame colour, and an underglow once your total upgrades pass 4.</Dim>}
      </Card>

      <Card style={{ marginTop: 10, gap: 8, borderColor: owned ? colors.line : '#4e45a8' }}>
        {owned ? (
          <Button title={active ? 'CURRENTLY DRIVING' : 'DRIVE THIS CAR'} kind={active ? 'ghost' : 'primary'} disabled={active} onPress={() => selectCar(car.id)} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Body style={{ fontWeight: '900' }}>UNLOCK</Body><Coins amount={car.price} size={14} /></View>
            <Dim>{levelOk ? 'Career level reached.' : `Reach career level ${car.level} first (you are on ${settings.unlocked}).`}{levelOk && !canAfford ? `  You need ${(car.price - settings.coins).toLocaleString()} more coins.` : ''}</Dim>
            <Button title={!car.ready ? 'MODEL COMING SOON' : !levelOk ? `LOCKED · LEVEL ${car.level}` : !canAfford ? 'NOT ENOUGH COINS' : `UNLOCK FOR ${car.price.toLocaleString()} COINS`} disabled={!car.ready || !levelOk || !canAfford} onPress={() => unlockCar(car.id)} />
          </>
        )}
      </Card>
    </>;
  };

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
              <Text style={{ color: colors.dim }}>{selectedCar.tag} · Career level {level}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <View style={{ flex: 1 }}><Text style={{ color: '#8fcaff', fontSize: 12, fontWeight: '800' }}>ACTIVE BUILD</Text><Text style={{ color: '#fff', fontSize: 44 }}>🏎️</Text></View>
                <View style={{ alignItems: 'flex-end', gap: 5 }}><Dim>TOP SPEED</Dim><Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>{Math.round(carStats(settings.activeCar, levelsOf(settings.activeCar)).vmax * 3.6)} KM/H</Text><Text style={{ color: colors.good, fontSize: 11, fontWeight: '800' }}>● READY TO RACE</Text></View>
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

        {panel === 'garage' ? renderGarage() : null}

        {panel === 'customize' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>WORKSHOP</Text><H1>Customize</H1><Dim>Choose a paint colour. It is saved and used in the race.</Dim>
          <View style={{ marginTop: 14, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#28578b' }}><CarPreview key={`custom-${settings.activeCar}-${settings.paint}`} color={settings.paint} carId={settings.activeCar} upgrades={levelsOf(settings.activeCar)} height={220} /></View>
          <Card style={{ marginTop: 10, alignItems: 'center', gap: 8, paddingVertical: 14, borderColor: '#28578b', backgroundColor: '#101b34' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{selectedCar.name}</Text><View style={{ width: 88, height: 8, borderRadius: 4, backgroundColor: `#${settings.paint.toString(16).padStart(6, '0')}`, borderWidth: 1, borderColor: '#fff' }} /><Text style={{ color: colors.dim, fontSize: 11 }}>ACTIVE PAINT PREVIEW</Text></Card>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, marginTop: 18, marginBottom: 8 }}>PAINT FINISH</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{PAINTS.map((p) => <Pressable key={p.name} onPress={() => update({ paint: p.hex })} style={{ width: '30%', flexGrow: 1, padding: 10, alignItems: 'center', borderRadius: 14, backgroundColor: settings.paint === p.hex ? '#1b3766' : colors.card, borderWidth: 1, borderColor: settings.paint === p.hex ? '#5eaaff' : colors.line }}><View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: `#${p.hex.toString(16).padStart(6, '0')}`, borderWidth: 1, borderColor: '#aab5cf' }} /><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 7 }}>{p.name}</Text>{settings.paint === p.hex ? <Text style={{ color: colors.x, fontSize: 9, marginTop: 3 }}>SELECTED</Text> : null}</Pressable>)}</View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, marginTop: 20, marginBottom: 8 }}>BODY STYLE</Text><Dim>The paint applies to the body panels of the car you drive. Pick which car to drive in the Garage.</Dim>
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
