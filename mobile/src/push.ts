import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

// Remote notifications need a real build (not Expo Go) and the player's permission. Every step is allowed to fail quietly:
// the app works the same without them.
let current: string | null = null;

export async function registerForPush(): Promise<void> {
  try {
    const N = await import('expo-notifications');
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', { name: 'Messages and invites', importance: N.AndroidImportance.HIGH });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    current = data;
    await api('/push/token', { method: 'POST', body: { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  } catch {
    /* no push on this device */
  }
}

/** Call before signing out so the next person on this phone does not receive your notifications. */
export async function unregisterPush(): Promise<void> {
  const token = current;
  current = null;
  if (!token) return;
  try { await api('/push/token', { method: 'DELETE', body: { token } }); } catch { /* the server also drops dead tokens */ }
}

/** Runs `onOpen` with the notification's data when the player taps one. Returns a function that stops listening. */
export function listenForNotificationTaps(onOpen: (data: Record<string, unknown>) => void): () => void {
  let stop = () => {};
  import('expo-notifications').then((N) => {
    const sub = N.addNotificationResponseReceivedListener((r) => onOpen((r.notification.request.content.data ?? {}) as Record<string, unknown>));
    stop = () => sub.remove();
  }).catch(() => undefined);
  return () => stop();
}
