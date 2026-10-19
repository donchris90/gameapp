import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

// Agora is native code: it is in the installed app (development or store build) but not in Expo Go.
const inExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
let agora: any = null;
try { agora = inExpoGo ? null : require('react-native-agora'); } catch { agora = null; }

export const voiceSupported = !!agora;
export interface VoiceToken { appId: string; channel: string; uid: number; token: string }
export interface VoiceState { joined: boolean; channel: string | null; callId: string | null; muted: boolean; others: number }

let engine: any = null;
let initFor: string | null = null;
let state: VoiceState = { joined: false, channel: null, callId: null, muted: false, others: 0 };
const listeners = new Set<(s: VoiceState) => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; listeners.forEach((l) => l(state)); };

export function useVoice(): VoiceState {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.add(setS); setS(state); return () => { listeners.delete(setS); }; }, []);
  return s;
}

async function ensureEngine(appId: string) {
  if (engine && initFor === appId) return engine;
  if (engine) { try { engine.release(); } catch { /* ignore */ } engine = null; }
  engine = agora.createAgoraRtcEngine();
  engine.initialize({ appId, channelProfile: agora.ChannelProfileType.ChannelProfileCommunication });
  engine.registerEventHandler({
    onJoinChannelSuccess: () => set({ joined: true }),
    onUserJoined: () => set({ others: state.others + 1 }),
    onUserOffline: () => set({ others: Math.max(0, state.others - 1) }),
    onLeaveChannel: () => set({ joined: false, others: 0 }),
  });
  engine.enableAudio();
  engine.setEnableSpeakerphone(true);
  initFor = appId;
  return engine;
}

/** Joins a voice channel with a token from the server. `callId` is set for one-to-one friend calls. */
export async function joinVoice(t: VoiceToken, callId: string | null = null) {
  if (!agora) throw new Error('Voice needs the installed app. It does not work in Expo Go.');
  if (Platform.OS === 'android') {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (r !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow the microphone to use voice.');
  }
  if (state.joined || state.channel) await leaveVoice();
  const e = await ensureEngine(t.appId);
  set({ channel: t.channel, callId, muted: false, others: 0 });
  e.joinChannel(t.token, t.channel, t.uid, {
    clientRoleType: agora.ClientRoleType.ClientRoleBroadcaster, publishMicrophoneTrack: true, autoSubscribeAudio: true,
  });
}

export async function leaveVoice() {
  try { engine?.leaveChannel(); } catch { /* ignore */ }
  set({ joined: false, channel: null, callId: null, muted: false, others: 0 });
}

export function setMuted(muted: boolean) {
  try { engine?.muteLocalAudioStream(muted); } catch { /* ignore */ }
  set({ muted });
}
