import { Injectable } from '@nestjs/common';
import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { appError } from '../common/errors';

const TTL_SECONDS = 3600;

/** Hands out short-lived Agora tokens. The app certificate never leaves the server. */
@Injectable()
export class VoiceService {
  get configured() {
    return !!process.env.AGORA_APP_ID && !!process.env.AGORA_APP_CERTIFICATE;
  }

  /** `uid` is a number Agora needs; it is derived from the player id so the same player always gets the same uid. */
  tokenFor(channel: string, userId: string) {
    if (!this.configured) throw appError(503, 'VOICE_NOT_CONFIGURED', 'Voice calls are not switched on yet');
    const uid = uidOf(userId);
    const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const token = RtcTokenBuilder.buildTokenWithUid(process.env.AGORA_APP_ID!, process.env.AGORA_APP_CERTIFICATE!, channel, uid, RtcRole.PUBLISHER, expires, expires);
    return { appId: process.env.AGORA_APP_ID!, channel, uid, token, expiresIn: TTL_SECONDS };
  }
}

export function uidOf(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (Math.imul(h, 31) + userId.charCodeAt(i)) >>> 0;
  return (h % 2_000_000_000) + 1;
}

export const dmChannel = (a: string, b: string) => `dm-${a < b ? a : b}-${a < b ? b : a}`.slice(0, 64);
