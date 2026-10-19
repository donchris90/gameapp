import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { api, explain } from './api';
import { VoiceToken, joinVoice, leaveVoice, setMuted, useVoice, voiceSupported } from './voice';
import { colors } from './ui';

/** A small voice control for a room or a game: join, mute, leave. Everyone in the room is in one channel. */
export function VoiceButton() {
  const v = useVoice();
  const [busy, setBusy] = useState(false);
  const inRoomVoice = v.joined && !v.callId;
  const join = async () => {
    if (!voiceSupported) { Alert.alert('Voice', 'Voice chat works in the installed app, not in Expo Go.'); return; }
    setBusy(true);
    try { await joinVoice(await api<VoiceToken>('/voice/room', { method: 'POST' })); }
    catch (e) { Alert.alert('Voice', explain(e)); }
    finally { setBusy(false); }
  };
  if (!inRoomVoice) {
    return <Pressable onPress={join} disabled={busy} hitSlop={8} style={{ opacity: busy ? 0.5 : 1 }}><Text style={{ fontSize: 20 }}>🎙️</Text></Pressable>;
  }
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Pressable onPress={() => setMuted(!v.muted)} hitSlop={8}><Text style={{ fontSize: 20 }}>{v.muted ? '🔇' : '🎙️'}</Text></Pressable>
      <Pressable onPress={() => void leaveVoice()} hitSlop={8}><Text style={{ fontSize: 15, color: colors.bad, fontWeight: '900' }}>Leave</Text></Pressable>
    </View>
  );
}

/** Shown across the whole app while a friend call is going. */
export function CallBar() {
  const v = useVoice();
  if (!v.callId) return null;
  const hang = () => { void api(`/voice/calls/${v.callId}/end`, { method: 'POST' }).catch(() => undefined); void leaveVoice(); };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, paddingTop: 40, backgroundColor: colors.good }}>
      <Text style={{ flex: 1, color: '#04210F', fontWeight: '900' }}>{v.others > 0 ? '📞 On a call' : '📞 Calling…'}</Text>
      <Pressable onPress={() => setMuted(!v.muted)}><Text style={{ color: '#04210F', fontWeight: '900' }}>{v.muted ? 'Unmute' : 'Mute'}</Text></Pressable>
      <Pressable onPress={hang} style={{ backgroundColor: colors.bad, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}><Text style={{ color: '#fff', fontWeight: '900' }}>Hang up</Text></Pressable>
    </View>
  );
}

/** Starts a call to a friend. Returns once the ringing has started. */
export async function callFriend(userId: string) {
  if (!voiceSupported) { Alert.alert('Voice call', 'Calls work in the installed app, not in Expo Go.'); return; }
  try {
    const r = await api<VoiceToken & { callId: string }>('/voice/calls', { method: 'POST', body: { userId } });
    await joinVoice(r, r.callId);
  } catch (e) { Alert.alert('Voice call', explain(e)); }
}

export async function answerCall(callId: string, accept: boolean) {
  try {
    const r = await api<any>(`/voice/calls/${callId}/answer`, { method: 'POST', body: { accept } });
    if (accept) await joinVoice(r, callId);
  } catch (e) { Alert.alert('Voice call', explain(e)); }
}
