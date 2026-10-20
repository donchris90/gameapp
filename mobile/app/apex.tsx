import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { adDue, preloadInterstitial, showInterstitial } from '../src/ads';
import { Race, RaceResult } from '../src/apex/Race';
import { CarPreview } from '../src/apex/CarPreview';
import { Studio } from '../src/apex/Studio';
import { CarStyle, cleanStyle } from '../src/apex/style';
import { CATALOG, STAT_MAX, UPGRADE_INFO, catalogCar, lookFor, upgradeCost } from '../src/apex/cars';
import { loadCarModel } from '../src/apex/model';
import { MAX_UPGRADE, UPGRADE_KINDS, carStats, levelSpec, MAX_LEVEL, TICKS_PER_SECOND, TRACKS, CIRCUIT_TRACK, LAP_CHOICES, ROAD_LAP_CHOICES, trackInfo } from '../src/apex/sim';
import { TrackMap } from '../src/apex/TrackMap';
import { ApexSettings, loadApex, saveApex } from '../src/apex/storage';
import { calculateCareerRewards, driverRankForXP, xpIntoRank } from '../src/apex/career';
import { AFRICA_STORY, africaCampaignDone, chapterProgress, currentStoryMission, LAGOS_STORY, STORY_MISSIONS, STORY_SKINS, STORY_TALK, storyMissionComplete } from '../src/apex/story';
import { EuropeInvitation, StoryScene } from '../src/apex/StoryScene';
import { STORY_ART } from '../src/apex/storyArt';
import { LagosDrive } from '../src/apex/LagosDrive';
import { AfricaScene } from '../src/apex/AfricaScene';
import { sfx } from '../src/sfx';
import { Body, Button, Card, Chip, Dim, H1, Screen, Coins, colors } from '../src/ui';

type Panel = 'home' | 'tracks' | 'garage' | 'customize' | 'career' | 'friends' | 'story';
const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : String(n));
const fmt = (ticks: number) => (ticks ? `${Math.floor(ticks / TICKS_PER_SECOND / 60)}:${((ticks / TICKS_PER_SECOND) % 60).toFixed(1).padStart(4, '0')}` : 'DNF');
const careerRankForXP = driverRankForXP;

export default function Apex() {
  const router = useRouter();
  const [phase, setPhase] = useState<'menu' | 'race' | 'result' | 'drive' | 'africa'>('menu');
  const [panel, setPanel] = useState<Panel>('home');
  const [settings, setSettings] = useState<ApexSettings>({ tilt: true, invert: false, unlocked: 1, coins: 0, activeCar: 'cts', unlockedCars: ['cts'], paint: 0x2788ff, bodyTier: 0, completedRaces: 0, careerXP: 0, podiums: 0, cleanRaces: 0, bestLaps: {}, processedRaceKeys: [], upgrades: {}, track: 'circuit', laps: 3, roadLaps: 1, autoGas: true, quality: 2, styles: {}, europeInvitationSeen: false, storyCompleted: [], lagosDriveRewardClaimed: false, africaRegionsCompleted: [], africaBestTimes: {}, africaChampionshipPoints: {} });
  const [browse, setBrowse] = useState('cts'); // the car being looked at in the garage
  const [level, setLevel] = useState(1);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [notice, setNotice] = useState('');
  const [activeStoryMissionId, setActiveStoryMissionId] = useState<string | null>(null);
  const [storyScene, setStoryScene] = useState<{ kind: 'mission'; id: string } | { kind: 'europe' } | null>(null);
  const [lastReward, setLastReward] = useState({ base: 0, placement: 0, clean: 0, record: 0, xp: 0, isRecord: false });
  const processedRaceKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => { loadApex().then((s) => { setSettings(s); setBrowse(s.activeCar); setLevel(Math.min(s.unlocked, MAX_LEVEL)); }); preloadInterstitial(); }, []);
  useEffect(() => {
    void ScreenOrientation.lockAsync((phase === 'race' || phase === 'drive' || phase === 'africa') ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, [phase]);
  useEffect(() => () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); }, []);

  const update = (p: Partial<ApexSettings>) => {
    const s = { ...settings, ...p };
    setSettings(s);
    void saveApex(s);
  };
  const selectedCar = useMemo(() => catalogCar(settings.activeCar), [settings.activeCar]);
  const levelsOf = (id: string) => settings.upgrades[id] ?? [0, 0, 0, 0];
  /** How a car looks. Cars that were never styled use the old single paint colour. */
  const styleOf = (id: string): CarStyle => cleanStyle(settings.styles?.[id], settings.paint);
  const setStyle = (patch: Partial<CarStyle>) => update({ styles: { ...(settings.styles ?? {}), [settings.activeCar]: { ...styleOf(settings.activeCar), ...patch } } });
  const spec = levelSpec(level);
  const traffic = ['cars', spec.bikes ? 'motorbikes' : '', spec.peds ? 'people crossing' : '', spec.trucks ? 'trucks' : '', spec.buses ? 'buses' : ''].filter(Boolean).join(', ');
  const time = ['Day', 'Day', 'Sunset', 'Night'][(level - 1) % 4 === 0 ? 0 : (level - 1) % 4];

  const done = (r: RaceResult) => {
    const raceKey = `${r.track}:${r.seed}`;
    // Race completion can arrive after a GL context reset; never grant the same result twice.
    if (processedRaceKeysRef.current.has(raceKey) || (settings.processedRaceKeys ?? []).includes(raceKey)) return;
    processedRaceKeysRef.current.add(raceKey);
    setResult(r);
    const recordKey = `${r.track}:${r.laps}`;
    const rewards = calculateCareerRewards(r, Number(settings.bestLaps?.[recordKey] ?? 0));
    const reward = rewards.base + rewards.placement + rewards.clean + rewards.record;
    const activeMission = STORY_MISSIONS.find((mission) => mission.id === activeStoryMissionId);
    const storyWon = Boolean(activeMission && !settings.storyCompleted.includes(activeMission.id) && storyMissionComplete(activeMission, r, settings.completedRaces + 1));
    const storyCompleted = storyWon ? [...settings.storyCompleted, activeMission!.id] : settings.storyCompleted;
    const nextUnlocked = r.rank <= 3 && level >= settings.unlocked && level < MAX_LEVEL ? level + 1 : settings.unlocked;
    const bestLaps = { ...(settings.bestLaps ?? {}) };
    if (rewards.isRecord) bestLaps[rewards.recordKey] = rewards.bestLap;
    setLastReward({ base: rewards.base, placement: rewards.placement, clean: rewards.clean, record: rewards.record, xp: rewards.xp, isRecord: rewards.isRecord });
    update({
      coins: settings.coins + reward,
      careerXP: (settings.careerXP ?? 0) + rewards.xp,
      completedRaces: settings.completedRaces + 1,
      podiums: (settings.podiums ?? 0) + (r.rank <= 3 ? 1 : 0),
      cleanRaces: (settings.cleanRaces ?? 0) + (rewards.clean ? 1 : 0),
      bestLaps,
      processedRaceKeys: [...(settings.processedRaceKeys ?? []), raceKey].slice(-250),
      unlocked: nextUnlocked,
      storyCompleted,
    });
    if (storyWon) { const talk = STORY_TALK[activeMission!.id]; setNotice(`STORY MISSION COMPLETE: ${activeMission!.title}${talk ? ` · ${talk.after.who}: “${talk.after.line}”` : ''}`); setActiveStoryMissionId(null); }
    else if (activeMission && !settings.storyCompleted.includes(activeMission.id)) setNotice(`Mission not complete yet: ${activeMission.objective}`);
    else if (nextUnlocked > settings.unlocked) setNotice(`Level ${nextUnlocked} unlocked!`);
    setPhase('result');
    sfx(r.rank === 1 ? 'win' : r.rank <= 3 ? 'complete' : 'lose');
    void adDue('APEX_RUN').then((due) => { if (due) setTimeout(() => { void showInterstitial(); }, 1800); });
  };

  useEffect(() => {
    if (phase === 'menu' && !storyScene && settings.storyCompleted && !settings.europeInvitationSeen && africaCampaignDone(settings.storyCompleted, settings.africaRegionsCompleted ?? [])) setStoryScene({ kind: 'europe' });
  }, [phase, storyScene, settings.storyCompleted, settings.africaRegionsCompleted, settings.europeInvitationSeen]);

  const adAfterDrive = () => { void adDue('APEX_RUN').then((due) => { if (due) setTimeout(() => { void showInterstitial(); }, 1800); }); };

  const startRace = (nextLevel = level) => { setLevel(nextLevel); setRun((n) => n + 1); setPhase('race'); };
  const startStoryMission = (missionId: string) => {
    const mission = STORY_MISSIONS.find((item) => item.id === missionId);
    if (!mission || settings.storyCompleted.includes(mission.id)) return;
    if (mission.level > settings.unlocked) { setNotice(mission.lockedHint ?? `Reach career level ${mission.level} first.`); return; }
    setActiveStoryMissionId(mission.id);
    update({ track: mission.track, laps: mission.track === 'circuit' ? 2 : settings.laps, roadLaps: 1 });
    setNotice('');
    startRace(mission.level);
  };
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

  const onCircuit = settings.track === 'circuit';
  const roundChoices = onCircuit ? LAP_CHOICES : ROAD_LAP_CHOICES;
  const roundsNow = onCircuit ? settings.laps : (settings.roadLaps ?? 1);
  /** The rounds picker: shown for every track, on the home screen and in the tracks list. */
  const renderRounds = () => <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
    <Dim style={{ fontSize: 11 }}>{onCircuit ? 'LAPS' : 'ROUNDS'}</Dim>
    {roundChoices.map((n) => <Pressable key={n} onPress={() => update(onCircuit ? { laps: n } : { roadLaps: n })} style={{ paddingVertical: 5, paddingHorizontal: 14, borderRadius: 10, backgroundColor: roundsNow === n ? '#245fff' : colors.cardAlt, borderWidth: 1, borderColor: roundsNow === n ? '#5eaaff' : colors.line }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{n}</Text></Pressable>)}
  </View>;
  if (phase === 'menu' && storyScene) {
    if (storyScene.kind === 'europe') return <EuropeInvitation coins={settings.coins} onClose={() => { setStoryScene(null); if (!settings.europeInvitationSeen) update({ europeInvitationSeen: true }); }} />;
    const m = STORY_MISSIONS.find((x) => x.id === storyScene.id); const talk = m ? STORY_TALK[m.id] : undefined;
    if (m && talk) return <StoryScene kicker={m.chapter === 'lagos' ? 'CHAPTER 1 · BORN IN LAGOS' : 'CHAPTER 2 · THE ROAD ACROSS AFRICA'} title={m.title} place={m.subtitle} art={STORY_ART[m.id]} lines={talk.before} goLabel="TO THE GRID  →" onDone={() => { setStoryScene(null); startStoryMission(m.id); }} onSkip={() => setStoryScene(null)} />;
  }
  if (phase === 'drive') return <LagosDrive quality={settings.quality} carId={settings.activeCar} paint={styleOf(settings.activeCar).paint} style={styleOf(settings.activeCar)} rewardClaimed={settings.lagosDriveRewardClaimed} onExit={() => { setPhase('menu'); setPanel('story'); }} onWorkshop={() => { setPhase('menu'); setPanel('garage'); setNotice('TOMI’S WORKSHOP · Choose, upgrade, and customize your car.'); }} onComplete={(driveResult) => { const reward = settings.lagosDriveRewardClaimed ? 0 : driveResult.coins; update({ coins: settings.coins + reward, lagosDriveRewardClaimed: true }); setNotice(`LAGOS DISTRICT RUN COMPLETE · ${reward ? `+${reward} coins` : 'reward already claimed'} · ${driveResult.distance} m driven`); setPhase('menu'); setPanel('story'); sfx('complete'); adAfterDrive(); }} />;
  if (phase === 'africa') return <AfricaScene quality={settings.quality} carId={settings.activeCar} paint={styleOf(settings.activeCar).paint} style={styleOf(settings.activeCar)} completedRegions={settings.africaRegionsCompleted ?? []} bestTimes={settings.africaBestTimes ?? {}} championshipPoints={settings.africaChampionshipPoints ?? {}} onExit={() => { setPhase('menu'); setPanel('story'); }} onWorkshop={() => { setPhase('menu'); setPanel('garage'); setNotice('REGIONAL GARAGE · Choose, upgrade, and customize your car.'); }} onRegionComplete={(regionId, reward, elapsedSeconds, points) => { const current = settings.africaRegionsCompleted ?? []; const alreadyCompleted = current.includes(regionId); const previousBest = settings.africaBestTimes?.[regionId] ?? Infinity; const isNewBest = elapsedSeconds > 0 && elapsedSeconds < previousBest; const oldPoints = settings.africaChampionshipPoints?.[regionId] ?? 0; const isBetterCupResult = points > oldPoints; const nextRegions = alreadyCompleted ? current : [...current, regionId]; if (!alreadyCompleted || isNewBest || isBetterCupResult) update({ africaRegionsCompleted: nextRegions, africaBestTimes: isNewBest ? { ...(settings.africaBestTimes ?? {}), [regionId]: elapsedSeconds } : (settings.africaBestTimes ?? {}), africaChampionshipPoints: isBetterCupResult ? { ...(settings.africaChampionshipPoints ?? {}), [regionId]: points } : (settings.africaChampionshipPoints ?? {}), coins: settings.coins + (alreadyCompleted ? 0 : reward) }); setNotice(`AFRICA TOUR · ${regionId.toUpperCase()} COMPLETE · ${alreadyCompleted ? (isNewBest ? `NEW BEST ${elapsedSeconds.toFixed(1)}s` : 'PERSONAL BEST SAVED') : `+${reward} COINS`} · ${points} CUP POINTS`); sfx('complete'); adAfterDrive(); }} />;

  if (phase === 'race') return <Race key={run} skin={activeStoryMissionId ? STORY_SKINS[activeStoryMissionId] : undefined} level={level} track={settings.track} laps={roundsNow} tilt={settings.tilt} invert={settings.invert} carId={settings.activeCar} paint={styleOf(settings.activeCar).paint} style={styleOf(settings.activeCar)} autoGas={settings.autoGas} quality={settings.quality} upgrades={levelsOf(settings.activeCar)} bodyTier={settings.bodyTier} onDone={done} onFlip={() => update({ invert: !settings.invert })} />;

  if (phase === 'result' && result) {
    const next = level < MAX_LEVEL && level + 1 <= Math.max(settings.unlocked, result.rank <= 3 ? level + 1 : 0);
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={{ color: colors.x, fontWeight: '900', letterSpacing: 3, marginTop: 8 }}>APEX RUN / RACE REPORT</Text>
          <H1>{result.rank === 1 ? 'VICTORY // 🏆' : result.rank <= 3 ? `PODIUM // ${medal(result.rank)}` : `FINISH // #${result.rank}`}</H1>
          <Dim>{trackInfo(result.track)?.name ?? 'Road'}{result.track === 'circuit' ? ` · ${result.laps} laps` : ''} · Level {result.level} · {fmt(result.ticks)}{result.bestLap > 0 ? ` · best lap ${fmt(Math.round(result.bestLap * 30))}` : ''} · {result.hits} collision{result.hits === 1 ? '' : 's'}</Dim>
          <Card style={{ marginTop: 16, borderColor: '#28578b', backgroundColor: '#101b34', gap: 10 }}>
            <Dim>RACE REWARD</Dim>
            <Text style={{ color: colors.gold, fontWeight: '900', fontSize: 34 }}>+{lastReward.base + lastReward.placement + lastReward.clean + lastReward.record} COINS</Text>
            {[['Finish reward', lastReward.base], ['Position bonus', lastReward.placement], ['Clean race bonus', lastReward.clean], ['Track record bonus', lastReward.record]].map(([label, amount]) => <View key={String(label)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Dim>{String(label)}</Dim><Text style={{ color: Number(amount) > 0 ? colors.good : colors.dim, fontWeight: '800' }}>{Number(amount) > 0 ? `+${amount}` : '—'}</Text></View>)}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}><Dim>Career XP earned</Dim><Text style={{ color: colors.x, fontWeight: '900' }}>+{lastReward.xp} XP</Text></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Dim>Wallet balance</Dim><Coins amount={settings.coins} /></View>
            <Dim>{lastReward.isRecord ? 'NEW TRACK RECORD! Your best lap has been saved.' : result.rank <= 3 ? 'Podium finish: career progression advanced.' : 'Keep racing to earn more coins and unlock the next level.'}</Dim>
          </Card>
          <Card style={{ marginTop: 12, gap: 10 }}>
            <Body style={{ fontWeight: '900' }}>FINAL STANDINGS</Body>
            {result.standings.map((s, i) => <View key={`${s.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ width: 30, color: colors.text, fontWeight: '900', fontSize: 18 }}>{medal(i + 1)}</Text><Body style={{ flex: 1, fontWeight: s.you ? '900' : '500', color: s.you ? colors.x : colors.text }}>{s.name}{s.you ? '  YOU' : ''}</Body><Dim>{fmt(s.ticks)}</Dim></View>)}
          </Card>
          {notice ? <Text style={{ color: colors.good, marginTop: 12, fontWeight: '800' }}>{notice}</Text> : null}
          <View style={{ gap: 10, marginTop: 18 }}>
            {next ? <Button title={`NEXT LEVEL  ${level + 1}  →`} onPress={() => { setActiveStoryMissionId(null); startRace(level + 1); }} /> : null}
            <Button title="RACE AGAIN" kind={next ? 'ghost' : 'primary'} onPress={() => startRace(level)} />
            <Button title="RETURN TO GARAGE" kind="ghost" onPress={() => { setActiveStoryMissionId(null); setPhase('menu'); setPanel('garage'); }} />
            <Button title="HOME" kind="ghost" onPress={() => { setActiveStoryMissionId(null); setPhase('menu'); setPanel('home'); }} />
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
          ? <CarPreview color={styleOf(car.id).paint} style={styleOf(car.id)} carId={car.id} upgrades={lv} tier={settings.bodyTier} height={230} />
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

        {panel === 'tracks' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>CHOOSE YOUR ROAD</Text><H1>Tracks</H1>
          <Dim>Every track bends. In a corner the car is pushed to the outside: steer against it, or brake. Reach the career level shown to open the harder roads.</Dim>
          <View style={{ gap: 10, marginTop: 14 }}>
            {[CIRCUIT_TRACK, ...TRACKS].map((tr) => {
              const open = settings.unlocked >= tr.level, on = settings.track === tr.id;
              return <Pressable key={tr.id} disabled={!open} onPress={() => { update({ track: tr.id }); setNotice(`${tr.name} selected.`); }}>
                <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center', borderColor: on ? '#5eaaff' : colors.line, backgroundColor: on ? '#12254a' : colors.card, opacity: open ? 1 : 0.65 }}>
                  <TrackMap track={tr.id} height={92} locked={!open} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>{tr.name}</Text>
                    <Text style={{ color: open ? colors.x : colors.gold, fontWeight: '800', fontSize: 11 }}>{open ? tr.feel.toUpperCase() : `🔒 LEVEL ${tr.level} NEEDED`}{['  ·  DAY', '  ·  SUNSET', '  ·  NIGHT'][tr.theme]}</Text>
                    <Dim style={{ fontSize: 11 }}>{tr.blurb}</Dim>
                    {on ? renderRounds() : null}
                    {on ? <Text style={{ color: colors.good, fontWeight: '900', fontSize: 11 }}>● SELECTED</Text> : null}
                  </View>
                </Card>
              </Pressable>;
            })}
          </View>
          <Button title="RACE ON THIS TRACK  →" onPress={() => startRace(level)} style={{ marginTop: 16 }} />
        </> : null}

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
              <Pressable onPress={() => { setPanel('tracks'); setNotice(''); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: '#0c1531', borderWidth: 1, borderColor: '#28578b' }}>
                <TrackMap track={settings.track} height={54} />
                <View style={{ flex: 1 }}><Text style={{ color: colors.dim, fontSize: 10, fontWeight: '800' }}>TRACK</Text><Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{trackInfo(settings.track)?.name}</Text></View>
                <Text style={{ color: colors.x, fontWeight: '900', fontSize: 12 }}>CHANGE ›</Text>
              </Pressable>
              <View style={{ paddingHorizontal: 4 }}>{renderRounds()}</View>
              <View style={{ paddingHorizontal: 4, gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Dim style={{ fontSize: 11 }}>THROTTLE</Dim>
                  {[{ v: true, l: 'AUTO GAS' }, { v: false, l: 'GAS PEDAL' }].map((o) => <Pressable key={o.l} onPress={() => update({ autoGas: o.v })} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, backgroundColor: settings.autoGas === o.v ? '#245fff' : colors.cardAlt, borderWidth: 1, borderColor: settings.autoGas === o.v ? '#5eaaff' : colors.line }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{o.l}</Text></Pressable>)}
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Dim style={{ fontSize: 11 }}>GRAPHICS</Dim>
                  {['LOW', 'MEDIUM', 'HIGH'].map((l, q) => <Pressable key={l} onPress={() => update({ quality: q })} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, backgroundColor: settings.quality === q ? '#245fff' : colors.cardAlt, borderWidth: 1, borderColor: settings.quality === q ? '#5eaaff' : colors.line }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{l}</Text></Pressable>)}
                </View>
              </View>
              <Button title="START CAREER RACE  →" onPress={() => startRace(level)} style={{ marginTop: 4, backgroundColor: '#245fff', borderColor: '#5eaaff' }} />
            </View>
          </Card>
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
            {[{ n: `${settings.unlocked}/${MAX_LEVEL}`, l: 'LEVELS OPEN' }, { n: String(settings.completedRaces), l: 'RACES DONE' }, { n: String(settings.unlockedCars.length), l: 'CARS OWNED' }].map((x) => <Card key={x.l} style={{ flex: 1, padding: 12, gap: 5 }}><Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{x.n}</Text><Text style={{ color: colors.dim, fontSize: 9, fontWeight: '800' }}>{x.l}</Text></Card>)}
          </View>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 20, marginBottom: 10 }}>QUICK ACCESS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[{ p: 'tracks' as Panel, i: '🛣️', t: 'Tracks', d: 'Pick where you race' }, { p: 'garage' as Panel, i: '🚘', t: 'My Garage', d: 'Choose your car' }, { p: 'customize' as Panel, i: '🔧', t: 'Customize', d: 'Make it yours' }, { p: 'career' as Panel, i: '🏆', t: 'Career', d: '60 race levels' }, { p: 'story' as Panel, i: '📖', t: 'Story Mode', d: 'The Lagos origin chapter' }, { p: 'friends' as Panel, i: '👥', t: 'Play with Friends', d: 'Private rooms' }].map((x) => <Pressable key={x.p} onPress={() => { setPanel(x.p); setNotice(''); }} style={{ width: '48%', flexGrow: 1 }}><Card style={{ gap: 6, minHeight: 105, borderColor: x.p === 'friends' ? '#4e45a8' : colors.line }}><Text style={{ fontSize: 23 }}>{x.i}</Text><Text style={{ color: '#fff', fontWeight: '900' }}>{x.t}</Text><Dim style={{ fontSize: 11 }}>{x.d}</Dim></Card></Pressable>)}
          </View>
          <Card style={{ marginTop: 12, gap: 7 }}><Text style={{ color: '#fff', fontWeight: '900' }}>DAILY DRIVER BRIEFING</Text><Dim>Earn coins by finishing races. Place in the top three to unlock the next career level. Use your winnings to expand your garage.</Dim><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Dim>Next race</Dim><Text style={{ color: colors.x, fontWeight: '900' }}>LEVEL {level} · {time.toUpperCase()}</Text></View></Card>
        </> : null}

        {panel === 'garage' ? renderGarage() : null}

        {panel === 'customize' ? <Studio carName={selectedCar.name} carId={settings.activeCar} style={styleOf(settings.activeCar)} setStyle={setStyle} upgrades={levelsOf(settings.activeCar)} bodyTier={settings.bodyTier} setBodyTier={(n) => update({ bodyTier: n })} onBack={() => setPanel('garage')} /> : null}

        {panel === 'career' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>CAREER MODE</Text><H1>Race progression</H1><Dim>Complete a level in the top three to unlock the next event. Clean driving and new lap records now earn extra coins and career XP.</Dim>
          <Card style={{ marginTop: 14, gap: 8, borderColor: '#28578b', backgroundColor: '#101b34' }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: '#fff', fontWeight: '900' }}>DRIVER RANK {careerRankForXP(settings.careerXP ?? 0)}</Text><Text style={{ color: colors.x, fontWeight: '900' }}>{(settings.careerXP ?? 0).toLocaleString()} XP</Text></View><View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}><View style={{ height: 8, width: `${xpIntoRank(settings.careerXP ?? 0) / 5}%`, backgroundColor: '#3ddc97' }} /></View><Dim>{500 - xpIntoRank(settings.careerXP ?? 0)} XP to Driver Rank {careerRankForXP(settings.careerXP ?? 0) + 1}</Dim><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}><Dim>Podiums</Dim><Body>{settings.podiums ?? 0}</Body><Dim>Clean races</Dim><Body>{settings.cleanRaces ?? 0}</Body></View></Card>
          <Card style={{ marginTop: 10, gap: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: '#fff', fontWeight: '900' }}>LEVEL {level}</Text><Text style={{ color: colors.x, fontWeight: '900' }}>{settings.unlocked}/{MAX_LEVEL} OPEN</Text></View><Text style={{ color: '#fff', fontSize: 25, fontWeight: '900' }}>{time} CIRCUIT</Text><Dim>{Math.round(spec.length)} m · Traffic: {traffic}</Dim><Button title={`RACE LEVEL ${level}`} onPress={() => startRace(level)} style={{ marginTop: 8 }} /></Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>{Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((n) => <Chip key={n} label={`${n}`} selected={n === level} disabled={n > settings.unlocked} onPress={() => setLevel(n)} />)}</View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}><Button title="PREVIOUS" kind="ghost" disabled={level <= 1} onPress={() => setLevel((l) => Math.max(1, l - 1))} style={{ flex: 1 }} /><Button title="NEXT OPEN" disabled={level >= settings.unlocked} onPress={() => setLevel((l) => Math.min(settings.unlocked, l + 1))} style={{ flex: 1 }} /></View>
        </> : null}

        {panel === 'story' ? (() => {
          const completed = settings.storyCompleted ?? [];
          const current = currentStoryMission(completed);
          const lagosProgress = chapterProgress(completed, 'lagos');
          const africaProgress = chapterProgress(completed, 'africa');
          const africaDriveCompleted = (settings.africaRegionsCompleted ?? []).length;
          const africaCampaignComplete = africaProgress.complete && africaDriveCompleted === 10;
          const renderMission = (mission: (typeof STORY_MISSIONS)[number], index: number, chapterUnlocked: boolean) => {
            const complete = completed.includes(mission.id);
            const isCurrent = current?.id === mission.id;
            const lockedByProgress = !complete && !isCurrent;
            const lockedByChapter = !chapterUnlocked;
            const lockedByLevel = isCurrent && mission.level > settings.unlocked;
            const locked = lockedByChapter || lockedByLevel;
            return <Card key={mission.id} style={{ gap: 8, borderColor: isCurrent ? '#5eaaff' : complete ? '#236b63' : colors.line, backgroundColor: isCurrent ? '#12254a' : colors.card, opacity: lockedByProgress || lockedByChapter ? 0.62 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? '#145044' : '#1b2a4a' }}><Text style={{ color: '#fff', fontWeight: '900' }}>{complete ? '✓' : String(index + 1).padStart(2, '0')}</Text></View>
                <View style={{ flex: 1, gap: 7 }}>
                  <Image source={STORY_ART[mission.id]} resizeMode="cover" style={{ width: '100%', height: 118, borderRadius: 10, backgroundColor: '#152746' }} />
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{mission.title}</Text><Text style={{ color: colors.x, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>{mission.subtitle}</Text><Dim>{mission.briefing}</Dim><Text style={{ color: complete ? colors.good : colors.gold, fontSize: 11, fontWeight: '800' }}>{complete ? 'MISSION COMPLETE' : lockedByChapter ? 'COMPLETE THE LAGOS CHAPTER FIRST' : lockedByProgress ? 'COMPLETE THE PREVIOUS MISSION FIRST' : lockedByLevel ? (mission.lockedHint ?? `Reach career level ${mission.level}`) : mission.objective}</Text>
                </View>
              </View>
              {isCurrent ? <Button title={locked ? `LOCKED · ${lockedByChapter ? 'LAGOS CHAPTER' : `LEVEL ${mission.level}`}` : `START MISSION  →`} disabled={locked} onPress={() => (STORY_TALK[mission.id] && mission.level <= settings.unlocked ? setStoryScene({ kind: 'mission', id: mission.id }) : startStoryMission(mission.id))} /> : null}
            </Card>;
          };
          return <>
            <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>APEX RUN / CAREER STORY</Text>
            <H1>From Lagos to Africa</H1>
            <Dim>Build your name from local street races to the continent’s biggest championship. Story races use the existing race engine, career rewards, car upgrades and saved mission progress. The Africa Tour contains ten regional driving environments with sequential destination unlocks, distinct waypoint routes, regional bonus objectives, a Cup standings table, one-time first-clear rewards, and saved best times and points. Story missions now include bundled cinematic artwork, mission thumbnails, and illustrated dialogue scenes. The driving environments remain compact procedural representations, not full-scale city reconstructions.</Dim>
            <Card style={{ marginTop: 14, gap: 9, borderColor: '#28578b', backgroundColor: '#101b34' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>NEW · LAGOS FREE DRIVE</Text>
              <Dim>Explore the playable Lagos district prototype with connected roads, landmarks, touch driving controls and waypoint objectives.</Dim>
              <Button title="ENTER LAGOS DISTRICT  →" onPress={() => { setNotice(''); setPhase('drive'); }} />
            </Card>
            <Card style={{ marginTop: 10, gap: 9, borderColor: lagosProgress.complete ? '#2e8a7d' : colors.line, backgroundColor: '#101b34' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>AFRICA TOUR · 10 DESTINATIONS</Text>
              <Dim>Drive through ten regional environments, earn one-time completion rewards, improve personal bests, and collect Africa Cup points: gold 3, silver 2, bronze 1. Each region has a bonus driving objective worth up to 100 extra coins on its first clear. Cup points and regional results are saved with your career; open the Cup Table in the scene to compare standings.</Dim>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Dim>Regional drive challenges</Dim><Text style={{ color: colors.good, fontWeight: '900', fontSize: 11 }}>{(settings.africaRegionsCompleted ?? []).length}/10 COMPLETE · {Object.values(settings.africaChampionshipPoints ?? {}).reduce((sum, n) => sum + n, 0)} CUP PTS</Text></View>
              <View style={{ height: 5, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.cardAlt }}><View style={{ height: 5, width: `${((settings.africaRegionsCompleted ?? []).length / 10) * 100}%`, backgroundColor: '#3ddc97' }} /></View>
              {lagosProgress.complete ? <Button title="ENTER AFRICA TOUR  →" onPress={() => { setNotice(''); setPhase('africa'); }} /> : <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '900' }}>LOCKED · COMPLETE ALL FIVE LAGOS MISSIONS</Text>}
            </Card>
            <Card style={{ marginTop: 14, gap: 9, borderColor: africaProgress.complete ? '#236b63' : '#28578b', backgroundColor: '#101b34' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>CAMPAIGN STATUS</Text><Text style={{ color: colors.x, fontWeight: '900' }}>{lagosProgress.completed + africaProgress.completed}/{lagosProgress.total + africaProgress.total}</Text></View>
              <View style={{ height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.cardAlt }}><View style={{ height: 7, width: `${(lagosProgress.completed + africaProgress.completed) / (lagosProgress.total + africaProgress.total) * 100}%`, backgroundColor: '#3ddc97' }} /></View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>{current ? current.title : africaCampaignComplete ? 'Africa Campaign Complete' : 'Africa Story Complete · Regional Tour Remaining'}</Text>
              <Dim>{current ? current.briefing : africaCampaignComplete ? 'You have won the African Championship and completed all ten regional driving challenges. Your next story destination is Europe.' : `You have won the African Championship. Complete the remaining regional drive challenges (${africaDriveCompleted}/10) to finish the Africa milestone.`}</Dim>
            </Card>
            <View style={{ gap: 10, marginTop: 12 }}>
              <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>CHAPTER 1 · NIGERIA</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>Born in Lagos</Text><Text style={{ color: lagosProgress.complete ? colors.good : colors.dim, fontWeight: '900', fontSize: 12 }}>{lagosProgress.completed}/{lagosProgress.total}</Text></View>
              <View style={{ height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.cardAlt }}><View style={{ height: 5, width: `${lagosProgress.completed / lagosProgress.total * 100}%`, backgroundColor: '#3ddc97' }} /></View>
              {LAGOS_STORY.map((mission, index) => renderMission(mission, index, true))}
            </View>
            <View style={{ gap: 10, marginTop: 18 }}>
              <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>CHAPTER 2 · THE CONTINENTAL TOUR</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>The Road Across Africa</Text><Text style={{ color: africaProgress.complete ? colors.good : colors.dim, fontWeight: '900', fontSize: 12 }}>{africaProgress.completed}/{africaProgress.total}</Text></View>
              <Dim>Ghana · Côte d’Ivoire · Senegal · Kenya · Egypt · Morocco · Namibia · South Africa · Zambia / Zimbabwe</Dim>
              <View style={{ height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.cardAlt }}><View style={{ height: 5, width: `${africaProgress.completed / africaProgress.total * 100}%`, backgroundColor: '#3ddc97' }} /></View>
              {!lagosProgress.complete ? <Card style={{ gap: 6, borderColor: colors.line }}><Text style={{ color: '#fff', fontWeight: '900' }}>AFRICA TOUR LOCKED</Text><Dim>Finish all five Lagos missions to earn your invitation to the continental tour.</Dim></Card> : null}
              {AFRICA_STORY.map((mission, index) => renderMission(mission, index, lagosProgress.complete))}
              {africaProgress.complete && !africaCampaignComplete ? <Card style={{ gap: 7, borderColor: '#b98237', backgroundColor: '#2b2115' }}><Text style={{ color: colors.gold, fontWeight: '900', fontSize: 16 }}>AFRICAN CHAMPIONSHIP WON</Text><Dim>All eleven story races are complete. Finish all ten regional driving challenges above to complete the full Africa milestone.</Dim></Card> : null}
              {africaCampaignComplete ? <Card style={{ gap: 7, borderColor: '#236b63', backgroundColor: '#102a28' }}><Button title="VIEW EUROPE INVITATION  →" onPress={() => setStoryScene({ kind: 'europe' })} /><Text style={{ color: colors.good, fontWeight: '900', fontSize: 16 }}>AFRICA CAMPAIGN COMPLETE</Text><Dim>You are the African Champion. All eleven African story events and all ten regional driving challenges are complete. The Europe invitation is earned, but the Europe campaign itself is not included in this milestone.</Dim></Card> : null}
            </View>
            <Button title="BACK HOME" kind="ghost" onPress={() => setPanel('home')} style={{ marginTop: 14 }} />
          </>;
        })() : null}

        {panel === 'friends' ? <>
          <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>MULTIPLAYER / INTEGRATION PENDING</Text><H1>Play with friends</H1><Dim>The project backend has general-purpose private game rooms, but Apex racing is not registered as a supported online game yet. The lobby and driving-state protocol must be added together before online races can be enabled.</Dim>
          <Card style={{ marginTop: 14, gap: 10, borderColor: '#4e45a8', backgroundColor: '#111833' }}><Text style={{ fontSize: 38 }}>👥</Text><Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>Private race rooms</Text><Dim>Planned: create a room, share a code, invite friends, ready up, race together, and view synchronized results.</Dim><Text style={{ color: colors.gold, fontWeight: '900' }}>SERVER REQUIRED</Text><Dim>The existing room endpoints currently support board/puzzle games only. This screen intentionally does not pretend local AI cars are online players.</Dim></Card>
          <Card style={{ marginTop: 10, gap: 8 }}><Text style={{ color: '#fff', fontWeight: '900' }}>READY FOR THE NEXT BUILD STAGE</Text><Dim>The client already includes socket.io-client. Next required backend work: add an Apex room type, synchronize fixed-tick race inputs/state, validate finishes server-side, and recover safely after disconnects.</Dim></Card>
          <Button title="BACK HOME" kind="ghost" onPress={() => setPanel('home')} style={{ marginTop: 14 }} />
        </> : null}

        {notice ? <Pressable onPress={() => setNotice('')} style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#102a2a', borderWidth: 1, borderColor: '#236b63' }}><Text style={{ color: '#b7ffea', fontWeight: '800' }}>{notice}  ×</Text></Pressable> : null}
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 18, padding: 5, borderRadius: 16, backgroundColor: '#0e1529', borderWidth: 1, borderColor: colors.line }}>{nav('home', 'HOME', '⌂')}{nav('garage', 'GARAGE', '🚘')}{nav('customize', 'TUNE', '⚙')}{nav('career', 'CAREER', '🏆')}{nav('story', 'STORY', '📖')}{nav('friends', 'FRIENDS', '♧')}</View>
        <Text style={{ color: '#56668d', textAlign: 'center', fontSize: 9, letterSpacing: 2, marginTop: 14 }}>APEX RUN · DRIVE YOUR VISION</Text>
      </ScrollView>
    </Screen>
  );
}
