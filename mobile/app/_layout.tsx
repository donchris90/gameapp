import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, api, explain } from '../src/api';
import { SessionProvider, useSession, useSocketEvent } from '../src/session';
import { colors } from '../src/ui';
import { Match } from '../src/types';

function Gate() {
  const { ready, user, refreshCoins } = useSession();
  const segments = useSegments();
  const router = useRouter();

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

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider><Gate /></SessionProvider>
    </SafeAreaProvider>
  );
}
