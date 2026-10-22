import { useEffect, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { api, explain } from './api';
import { CallMode, RtcSurfaceView, VoiceToken, flipCamera, joinVoice, leaveVoice, setCameraOff, setMuted, useVoice, voiceSupported } from './voice';
import { colors } from './ui';

interface Pricing { voice: number; video: number }
const cost = (n: number) => (n > 0 ? `${n} coin${n === 1 ? '' : 's'} a minute` : 'free');

/** Asks which kind of call, showing what each costs (the admin sets the prices). */
function chooseMode(title: string): Promise<CallMode | null> {
  return new Promise((resolve) => {
    api<Pricing>('/voice/pricing').catch(() => ({ voice: 0, video: 0 } as Pricing)).then((p) => {
      Alert.alert(title, 'Each person pays for their own minutes.', [
        { text: `Voice · ${cost(p.voice)}`, onPress: () => resolve('voice') },
        { text: `Video · ${cost(p.video)}`, onPress: () => resolve('video') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ], { cancelable: true, onDismiss: () => resolve(null) });
    });
  });
}

/** A small voice control for a room or a game: start a voice or video call with everyone in the room, mute, leave. */
export function VoiceButton() {
  const v = useVoice();
  const [busy, setBusy] = useState(false);
  const inRoomVoice = v.joined && !v.callId;
  const join = async () => {
    if (!voiceSupported) { Alert.alert('Voice', 'Voice and video work in the installed app, not in Expo Go.'); return; }
    const mode = await chooseMode('Talk with the room');
    if (!mode) return;
    setBusy(true);
    try { await joinVoice(await api<VoiceToken>('/voice/room', { method: 'POST', body: { mode } })); }
    catch (e) { Alert.alert('Call', explain(e)); }
    finally { setBusy(false); }
  };
  if (!inRoomVoice) {
    return <Pressable onPress={join} disabled={busy} hitSlop={8} style={{ opacity: busy ? 0.5 : 1 }}><Text style={{ fontSize: 20 }}>🎙️</Text></Pressable>;
  }
  return <Text style={{ color: colors.good, fontWeight: '900', fontSize: 12 }}>On call</Text>;
}

/** Shown across the whole app while any call (friend or room) is going: who is on, what it costs, mute, camera, hang up. */
export function CallBar() {
  const v = useVoice();
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => { if (v.ended) { setShown(v.ended); const t = setTimeout(() => setShown(null), 5000); return () => clearTimeout(t); } }, [v.ended]);
  if (!v.channel) {
    return shown ? <View style={{ paddingHorizontal: 16, paddingVertical: 8, paddingTop: 40, backgroundColor: colors.bad }}><Text style={{ color: '#fff', fontWeight: '900' }}>{shown}</Text></View> : null;
  }
  const video = v.mode === 'video';
  const hang = () => {
    if (v.callId) void api(`/voice/calls/${v.callId}/end`, { method: 'POST' }).catch(() => undefined);
    void leaveVoice();
  };
  const btn = { backgroundColor: 'rgba(4,33,15,.16)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, paddingTop: 40, backgroundColor: colors.good }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#04210F', fontWeight: '900' }} numberOfLines={1}>{video ? '📹' : '📞'} {v.others > 0 ? 'On a call' : v.callId ? 'Calling…' : 'In the call'}</Text>
        <Text style={{ color: '#04210F', fontSize: 11, fontWeight: '700' }}>{v.price > 0 ? `${v.price}/min · ${v.spent} coins so far` : 'Free call'}</Text>
      </View>
      <Pressable onPress={() => setMuted(!v.muted)} style={btn}><Text style={{ color: '#04210F', fontWeight: '900' }}>{v.muted ? 'Unmute' : 'Mute'}</Text></Pressable>
      {video ? <Pressable onPress={() => setCameraOff(!v.cameraOff)} style={btn}><Text style={{ color: '#04210F', fontWeight: '900' }}>{v.cameraOff ? 'Cam on' : 'Cam off'}</Text></Pressable> : null}
      {video ? <Pressable onPress={flipCamera} style={btn}><Text style={{ color: '#04210F', fontWeight: '900' }}>Flip</Text></Pressable> : null}
      <Pressable onPress={hang} style={{ backgroundColor: colors.bad, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}><Text style={{ color: '#fff', fontWeight: '900' }}>End</Text></Pressable>
    </View>
  );
}

const BUBBLE = { w: 84, h: 112 };

/** Small draggable video windows that float over any screen, so you can keep playing while you see each other. */
export function VideoBubbles() {
  const v = useVoice();
  const { width, height } = useWindowDimensions();
  const pos = useRef({ x: width - BUBBLE.w - 10, y: 120 });
  const [, tick] = useState(0);
  const start = useRef({ x: 0, y: 0 });
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = { ...pos.current }; },
    onPanResponderMove: (_e, g) => { pos.current = { x: start.current.x + g.dx, y: start.current.y + g.dy }; tick((n) => n + 1); },
    onPanResponderRelease: () => {
      pos.current = { x: Math.max(4, Math.min(width - BUBBLE.w - 4, pos.current.x)), y: Math.max(60, Math.min(height - BUBBLE.h - 90, pos.current.y)) };
      tick((n) => n + 1);
    },
  })).current;
  if (v.mode !== 'video' || !v.joined || !RtcSurfaceView) return null;
  const tiles: Array<{ key: string; uid: number; label: string }> = [{ key: 'me', uid: 0, label: 'You' }, ...v.remotes.slice(0, 3).map((u) => ({ key: String(u), uid: u, label: '' }))];
  return (
    <View {...pan.panHandlers} style={{ position: 'absolute', left: pos.current.x, top: pos.current.y, gap: 6, zIndex: 999 }}>
      {tiles.map((t) => (
        <View key={t.key} style={{ width: BUBBLE.w, height: BUBBLE.h, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', borderWidth: 2, borderColor: t.uid === 0 ? colors.accent : colors.good }}>
          {t.uid === 0 && v.cameraOff ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.dim, fontSize: 11 }}>Camera off</Text></View>
            : <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: t.uid }} zOrderMediaOverlay />}
        </View>
      ))}
    </View>
  );
}

/** Starts a call to a friend after asking voice or video. Returns once the ringing has started. */
export async function callFriend(userId: string) {
  if (!voiceSupported) { Alert.alert('Call', 'Calls work in the installed app, not in Expo Go.'); return; }
  const mode = await chooseMode('Call your friend');
  if (!mode) return;
  try {
    const r = await api<VoiceToken & { callId: string }>('/voice/calls', { method: 'POST', body: { userId, mode } });
    await joinVoice(r, r.callId);
  } catch (e) { Alert.alert('Call', explain(e)); }
}

export async function answerCall(callId: string, accept: boolean) {
  try {
    const r = await api<any>(`/voice/calls/${callId}/answer`, { method: 'POST', body: { accept } });
    if (accept) await joinVoice(r, callId);
  } catch (e) { Alert.alert('Call', explain(e)); }
}
