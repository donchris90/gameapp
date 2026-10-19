import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
export const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/.test(t);

/**
 * Sends notifications to a player's phones through Expo's free push service. Never throws: a failed
 * notification must not break the action that caused it. PUSH_MODE=memory keeps them in `outbox` (used by tests),
 * PUSH_MODE=off sends nothing.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger('Push');
  /** Only filled in PUSH_MODE=memory. */
  readonly outbox: Array<{ userId: string; to: string; message: PushMessage }> = [];

  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, message: PushMessage): Promise<void> {
    try {
      const mode = process.env.PUSH_MODE ?? 'live';
      if (mode === 'off') return;
      const tokens = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
      if (tokens.length === 0) return;
      if (mode === 'memory') {
        for (const t of tokens) this.outbox.push({ userId, to: t.token, message });
        return;
      }
      const res = await fetch(process.env.EXPO_PUSH_URL ?? EXPO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: message.title, body: message.body, data: message.data ?? {}, sound: 'default', channelId: 'default' }))),
        signal: AbortSignal.timeout(8_000),
      });
      const json = (await res.json().catch(() => null)) as { data?: Array<{ status: string; details?: { error?: string } }> } | null;
      // A phone that uninstalled the app is reported once; forget its token so we stop trying.
      const dead = (json?.data ?? []).flatMap((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? [tokens[i].token] : []));
      if (dead.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    } catch (e) {
      this.log.warn(`notification not sent: ${(e as Error).message}`);
    }
  }
}
