import Constants from 'expo-constants';

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://10.0.2.2:3000';

/** Games the app has a screen for. The server decides which are available; this decides which can be drawn. */
export const SCREEN_READY = new Set(['TICTACTOE', 'WATER_SORT', 'AYO', 'LUDO', 'APEX']);
