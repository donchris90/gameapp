import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Race, RaceResult } from '../apex/Race';
import { ApexSettings, loadApex } from '../apex/storage';
import { cleanStyle } from '../apex/style';
import { useSession, useSocketEvent } from '../session';
import { Match } from '../types';
import { Body, Button, Card, Dim, colors } from '../ui';

interface RaceState { seed: number; track: string; laps: number; level: number; car: string; ticks: Array<number | null>; finished: boolean[]; left: number[] }

const TICKS_PER_SECOND = 30;
export const fmtTime = (ticks: number) => {
  const s = ticks / TICKS_PER_SECOND;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};

/** True while this player still has a race to drive: the match screen then gives the whole screen to it. */
export const isRacing = (match: Match, mySeat: number) => match.status === 'ACTIVE' && !(match.state as RaceState).finished?.[mySeat];

/**
 * An Apex race with friends. Everyone drives the same seeded road at once and sees the others as ghost cars.
 * When you cross the line your controls go to the server, which drives them again to get your time.
 */
export function ApexRace({ match, mySeat, onMove, onQuit, full }: { full?: boolean; match: Match<RaceState>; mySeat: number; onMove: (m: object) => Promise<void> | void; onQuit: () => void }) {
  const { socket } = useSession();
  const insets = useSafeAreaInsets();
  const state = match.state;
  const over = match.status === 'FINISHED';
  const iFinished = !!state.finished?.[mySeat];
  const [settings, setSettings] = useState<ApexSettings | null>(null);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const ghosts = useRef<Record<number, { z: number; x: number; v: number; fin: number; at: number }>>({});
  const socketRef = useRef(socket); socketRef.current = socket;
  const matchId = match.id;

  useEffect(() => { void loadApex().then(setSettings); }, []);
  const racing = !over && !iFinished && !result;
  useEffect(() => {
    if (racing) void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    else void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    return () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); };
  }, [racing]);

  useSocketEvent<{ matchId: string; seat: number; z: number; x: number; v: number; fin: number }>('apex:pos', (p) => {
    if (p.matchId === matchId) ghosts.current[p.seat] = { z: p.z, x: p.x, v: p.v, fin: p.fin, at: Date.now() };
  });

  const others = useMemo(
    () => match.players.filter((p) => p.seat !== mySeat).sort((a, b) => a.seat - b.seat).map((p) => ({ seat: p.seat, name: p.displayName })),
    // the set of drivers is fixed for the race
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, mySeat],
  );
  const online = useMemo(() => ({
    seed: state.seed, others, ghosts,
    onTick: (p: { z: number; x: number; v: number; tick: number; fin: number }) => { socketRef.current?.emit('apex:pos', { matchId, ...p }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [matchId, state.seed, others]);

  const upload = async (r: RaceResult) => {
    setUploading(true);
    try { await onMove({ inputs: r.inputs }); } finally { setUploading(false); }
  };
  const onDone = (r: RaceResult) => { setResult(r); if (r.ticks > 0) void upload(r); };

  if (racing) {
    if (!settings) return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Race
          online={online} level={state.level} track={state.track} laps={state.laps} carId={state.car} upgrades={[]}
          tilt={settings.tilt} invert={settings.invert} autoGas={settings.autoGas} quality={settings.quality}
          paint={cleanStyle(settings.styles?.[state.car], settings.paint).paint} style={cleanStyle(settings.styles?.[state.car], settings.paint)}
          onDone={onDone}
        />
      </View>
    );
  }

  const dnf = !!result && result.ticks === 0 && !iFinished;
  const rows = match.players.map((p) => ({ p, t: state.ticks?.[p.seat] ?? null })).sort((a, b) => (a.t !== null && b.t !== null ? a.t - b.t : a.t !== null ? -1 : b.t !== null ? 1 : a.p.seat - b.p.seat));
  const waiting = !over && match.players.filter((p) => !p.left && state.ticks?.[p.seat] === null).length;
  return (
    <View style={{ flex: 1, gap: 10, paddingTop: full ? insets.top + 12 : 6, paddingHorizontal: full ? 16 : 0, backgroundColor: full ? '#0A0D16' : undefined }}>
      <Card style={{ gap: 8 }}>
        <Body style={{ fontWeight: '900', fontSize: 16 }}>{over ? 'Race results' : dnf ? 'You did not finish' : iFinished ? 'You finished' : 'Finishing…'}</Body>
        {rows.map(({ p, t }, i) => (
          <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 22, color: colors.dim, fontWeight: '900' }}>{t !== null ? i + 1 : '–'}</Text>
            <Text style={{ flex: 1, color: p.seat === mySeat ? colors.accent : colors.text, fontWeight: '800' }} numberOfLines={1}>{p.displayName}{p.seat === mySeat ? ' (you)' : ''}</Text>
            <Text style={{ color: t !== null ? colors.text : colors.dim, fontWeight: '800' }}>{t !== null ? fmtTime(t) : p.left ? 'left' : over ? 'no time' : 'racing…'}</Text>
          </View>
        ))}
      </Card>
      {uploading ? <Dim>Checking your time with the server…</Dim> : null}
      {!over && iFinished && waiting ? <Dim>Waiting for {waiting} {waiting === 1 ? 'driver' : 'drivers'} to finish. The fastest verified time wins.</Dim> : null}
      {!over && result && result.ticks > 0 && !iFinished && !uploading ? <Button title="Send my time again" onPress={() => void upload(result)} /> : null}
      {!over && !iFinished ? <Button title="Leave race" kind="ghost" onPress={onQuit} /> : null}
    </View>
  );
}
