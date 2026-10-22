import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { api } from './api';

// Agora is native code: it is in the installed app (development or store build) but not in Expo Go.
const inExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
let agora: any = null;
try { agora = inExpoGo ? null : require('react-native-agora'); } catch { agora = null; }

export const voiceSupported = !!agora;
export type CallMode = 'voice' | 'video';
export interface VoiceToken { appId: string; channel: string; uid: number; token: string; sessionId?: string; mode?: CallMode; price?: number; minutesPaid?: number; renewInSeconds?: number }
export interface VoiceState { joined: boolean; channel: string | null; callId: string | null; muted: boolean; others: number; mode: CallMode; price: number; spent: number; remotes: number[]; cameraOff: boolean; ended: string | null }
export const RtcSurfaceView: any = agora?.RtcSurfaceView ?? null;

let engine: any = null;
let initFor: string | null = null;
let state: VoiceState = { joined: false, channel: null, callId: null, muted: false, others: 0, mode: 'voice', price: 0, spent: 0, remotes: [], cameraOff: false, ended: null };
let sessionId: string | null = null;
let renewTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE = { joined: false, channel: null, callId: null, muted: false, others: 0, mode: 'voice' as CallMode, price: 0, spent: 0, remotes: [] as number[], cameraOff: false };
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
    onUserJoined: (_c: unknown, uid: number) => set({ others: state.others + 1, remotes: state.remotes.includes(uid) ? state.remotes : [...state.remotes, uid] }),
    onUserOffline: (_c: unknown, uid: number) => set({ others: Math.max(0, state.others - 1), remotes: state.remotes.filter((u) => u !== uid) }),
    onLeaveChannel: () => set({ joined: false, others: 0, remotes: [] }),
    // The paid minute is about to run out: the renewal below normally got there first, so this is only a safety net.
    onTokenPrivilegeWillExpire: () => { void renew(); },
    onConnectionStateChanged: (_c: unknown, st: number, reason: number) => { if (st === 5 && reason === 9 && sessionId) void leaveVoice('Your call ended.'); }, // failed because the token expired
  });
  engine.enableAudio();
  engine.setEnableSpeakerphone(true);
  initFor = appId;
  return engine;
}

/** Joins a voice channel with a token from the server. `callId` is set for one-to-one friend calls. */
export async function joinVoice(t: VoiceToken, callId: string | null = null) {
  const video = t.mode === 'video';
  const endBilling = () => { if (t.sessionId) void api(`/voice/sessions/${t.sessionId}/end`, { method: 'POST' }).catch(() => undefined); };
  try {
    if (!agora) throw new Error('Voice needs the installed app. It does not work in Expo Go.');
    if (Platform.OS === 'android') {
      const need = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, ...(video ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
      const r = await PermissionsAndroid.requestMultiple(need);
      if (need.some((n) => r[n] !== PermissionsAndroid.RESULTS.GRANTED)) throw new Error(video ? 'Allow the microphone and camera to use video.' : 'Allow the microphone to use voice.');
    }
    if (state.joined || state.channel) await leaveVoice();
    const e = await ensureEngine(t.appId);
    if (video) { e.enableVideo(); e.startPreview(); } else { e.disableVideo?.(); }
    sessionId = t.sessionId ?? null;
    set({ ...IDLE, channel: t.channel, callId, mode: t.mode ?? 'voice', price: t.price ?? 0, spent: t.price ?? 0, ended: null });
    e.joinChannel(t.token, t.channel, t.uid, {
      clientRoleType: agora.ClientRoleType.ClientRoleBroadcaster, publishMicrophoneTrack: true, autoSubscribeAudio: true,
      publishCameraTrack: video, autoSubscribeVideo: video,
    });
    scheduleRenew(t.renewInSeconds);
  } catch (err) { endBilling(); throw err; }
}

function scheduleRenew(inSeconds?: number) {
  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = sessionId && inSeconds ? setTimeout(() => { void renew(); }, Math.max(3, inSeconds) * 1000) : null;
}

/** Pays for the next minute and hands the new token to the call. A refusal (out of coins) ends the call. */
async function renew() {
  if (!sessionId) return;
  try {
    const r = await api<VoiceToken>(`/voice/sessions/${sessionId}/renew`, { method: 'POST' });
    engine?.renewToken(r.token);
    set({ spent: (r.minutesPaid ?? 0) * (r.price ?? 0) });
    scheduleRenew(r.renewInSeconds);
  } catch (e: any) {
    if (e?.code === 'INSUFFICIENT_COINS') await leaveVoice('You ran out of coins, so the call ended.');
    else if (e?.code === 'SESSION_ENDED') await leaveVoice('The call ended.');
    else scheduleRenew(8); // a bad connection: try again before the paid minute runs out
  }
}

export async function leaveVoice(reason: string | null = null) {
  if (renewTimer) { clearTimeout(renewTimer); renewTimer = null; }
  const id = sessionId; sessionId = null;
  if (id) void api(`/voice/sessions/${id}/end`, { method: 'POST' }).catch(() => undefined);
  try { engine?.stopPreview?.(); engine?.leaveChannel(); } catch { /* ignore */ }
  set({ ...IDLE, ended: reason });
}

export function setCameraOff(off: boolean) {
  try { engine?.muteLocalVideoStream(off); } catch { /* ignore */ }
  set({ cameraOff: off });
}
export function flipCamera() { try { engine?.switchCamera(); } catch { /* ignore */ } }

export function setMuted(muted: boolean) {
  try { engine?.muteLocalAudioStream(muted); } catch { /* ignore */ }
  set({ muted });
}
