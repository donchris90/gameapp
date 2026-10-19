import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, api, explain } from '../src/api';
import { SessionProvider, useSession, useSocketEvent } from '../src/session';
import { listenForNotificationTaps } from '../src/push';
import { loadSoundSetting } from '../src/sfx';
import { colors } from '../src/ui';
import { CallBar, answerCall } from '../src/Voice';
import { leaveVoice } from '../src/voice';
import { Match } from '../src/types';

function Gate() {
  useEffect(() => { void loadSoundSetting(); }, []);
  const { ready, user, refreshCoins } = useSession();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => listenForNotificationTaps((d) => {
    if (d.type === 'chat' && typeof d.from === 'string') router.push({ pathname: '/chat/[userId]', params: { userId: d.from } });
  }), [router]);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) router.replace('/(auth)/login');
    else if (user && inAuth) router.replace('/(tabs)');
  }, [ready, user, segments, router]);

  // Coming back into the app mid-game: pick the game up where it was.
  useEffect(() => {
    if (!user) return;
    api<Match>('/matches/current').then((m) => router.push(`/match/${m.id}`)).catch((e) => { if (!(e instanceof ApiError)) return; });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent<Match>('match:started', (m) => { void refreshCoins(); router.replace(`/match/${m.id}`); });
  useSocketEvent<any>('room:invite', (inv) => {
    Alert.alert('Game invite', `${inv.from.displayName} invited you to play ${inv.room.game.replace('_', ' ').toLowerCase()}${inv.room.stake ? ` for ${inv.room.stake} coins` : ''}.`, [
      { text: 'Not now', style: 'cancel', onPress: () => api(`/rooms/invites/${inv.id}`, { method: 'DELETE' }).catch(() => undefined) },
      { text: 'Join', onPress: () => api('/rooms/invites/' + inv.id + '/accept', { method: 'POST' }).then(() => router.push('/room')).catch((e) => Alert.alert('Could not join', explain(e))) },
    ]);
  });

  useSocketEvent<{ callId: string; from: { displayName: string }; ringMs: number }>('call:incoming', (c) => {
    Alert.alert('📞 Incoming call', `${c.from.displayName} is calling you.`, [
      { text: 'Decline', style: 'cancel', onPress: () => void answerCall(c.callId, false) },
      { text: 'Answer', onPress: () => void answerCall(c.callId, true) },
    ], { cancelable: false });
  });
  useSocketEvent('call:ended', () => { void leaveVoice(); });
  useSocketEvent('call:declined', () => { void leaveVoice(); Alert.alert('Call', 'They declined the call.'); });
  useSocketEvent<{ matchId: string; from: { displayName: string } }>('match:rematch', (e) => {
    if (segments[0] === 'match') return; // the match screen shows its own banner
    Alert.alert('Rematch?', `${e.from.displayName} wants to play again.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Go to room', onPress: () => router.push('/room') },
    ]);
  });

  return (
    <View style={{ flex: 1 }}>
      <CallBar />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </View>
  );
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider><Gate /></SessionProvider>
    </SafeAreaProvider>
  );
}
