import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { appError } from '../common/errors';
import { CallMode, SettingsService } from '../settings/settings.service';
import { WalletService } from '../wallet/wallet.service';
import { VoiceService } from './voice.service';

const MINUTE = 60_000;
const RENEW_WINDOW_MS = 25_000; // a renewal this close to the end of the paid minute buys the next one
const TOKEN_GRACE_S = 8;
const FREE_TTL_S = 3600;

interface Session { id: string; userId: string; channel: string; mode: CallMode; price: number; startedAt: number; paid: number }

/**
 * Charges the person on a call, one minute at a time, at the price an admin has set.
 * The call token only lasts as long as the minutes paid for, so a phone that stops renewing is dropped by the voice service itself.
 */
@Injectable()
export class CallBillingService {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly settings: SettingsService, private readonly wallet: WalletService, private readonly voice: VoiceService) {}

  pricing() { return this.settings.callPricing(); }

  /** Takes the first minute and returns the session with a token that lasts that minute. */
  async begin(userId: string, channel: string, mode: CallMode) {
    if (!this.voice.configured) throw appError(503, 'VOICE_NOT_CONFIGURED', 'Calls are not switched on yet');
    for (const [id, s] of this.sessions) if (s.userId === userId) this.sessions.delete(id);
    this.sweep();
    const price = (await this.settings.callPricing())[mode];
    const s: Session = { id: randomUUID(), userId, channel, mode, price, startedAt: Date.now(), paid: price > 0 ? 1 : 0 };
    if (price > 0) await this.charge(s, 0);
    this.sessions.set(s.id, s);
    return this.view(s);
  }

  /** Called by the phone shortly before its paid minute runs out. Early calls just get the current token back. */
  async renew(userId: string, sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId) throw appError(404, 'SESSION_ENDED', 'This call has ended');
    if (s.price > 0 && Date.now() >= s.startedAt + s.paid * MINUTE - RENEW_WINDOW_MS) {
      await this.charge(s, s.paid);
      s.paid += 1;
    }
    return this.view(s);
  }

  end(sessionId: string, userId?: string) {
    const s = this.sessions.get(sessionId);
    if (s && (!userId || s.userId === userId)) this.sessions.delete(sessionId);
    return { ok: true };
  }

  /** A call nobody picked up: give the caller's first minute back. */
  async refundFirstMinute(sessionId: string | undefined) {
    const s = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!s) return;
    this.sessions.delete(s.id);
    if (s.price > 0 && s.paid === 1) {
      await this.wallet.credit({ userId: s.userId, amount: BigInt(s.price), type: 'GAME_REFUND', reference: `call:${s.mode}`, idempotencyKey: `call:${s.id}:refund` }).catch(() => undefined);
    }
  }

  private charge(s: Session, minute: number) {
    return this.wallet.debit({ userId: s.userId, amount: BigInt(s.price), type: 'SHOP_PURCHASE', reference: `call:${s.mode}`, idempotencyKey: `call:${s.id}:${minute}` });
  }

  private view(s: Session) {
    const ttl = s.price > 0 ? Math.max(15, Math.ceil((s.startedAt + s.paid * MINUTE - Date.now()) / 1000) + TOKEN_GRACE_S) : FREE_TTL_S;
    const renewInSeconds = s.price > 0 ? Math.max(5, ttl - TOKEN_GRACE_S - 20) : FREE_TTL_S - 120;
    return { sessionId: s.id, mode: s.mode, price: s.price, minutesPaid: s.paid, renewInSeconds, ...this.voice.tokenFor(s.channel, s.userId, ttl) };
  }

  private sweep() {
    const cutoff = Date.now() - 4 * 3600_000;
    for (const [id, s] of this.sessions) if (s.startedAt < cutoff) this.sessions.delete(id);
  }
}
