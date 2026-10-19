import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GameType } from '../generated/prisma/client';
import { appError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { GameRegistry } from '../games/game-registry';
import { GAME_CONFIG, STAKE_OPTIONS } from '../rooms/game-config';
import { RoomsService } from '../rooms/rooms.service';
import { InsufficientCoinsException } from '../wallet/wallet.service';

export const QUEUE_TIMEOUT_MS = 90_000;

interface Ticket {
  userId: string;
  at: number;
}

/**
 * Quick match: players who want the same game, stake and table size are paired
 * first come, first served, skipping pairs where one blocked the other.
 * The queue lives in memory, so it is per server instance (move to Redis to scale out).
 */
@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly queues = new Map<string, Ticket[]>();
  private readonly keyOf = new Map<string, string>();
  private readonly running = new Set<string>();
  private readonly dirty = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeService,
    private readonly games: GameRegistry,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.sweepTimeouts(), 5_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  static key(game: GameType, stake: number, size: number) {
    return `${game}:${stake}:${size}`;
  }

  queuedKey(userId: string) {
    return this.keyOf.get(userId) ?? null;
  }

  async join(userId: string, dto: { game: GameType; stake: number; size?: number }) {
    const cfg = GAME_CONFIG[dto.game];
    if (!this.games.isAvailable(dto.game)) throw appError(400, 'GAME_NOT_AVAILABLE', 'That game is not available yet');
    const size = dto.size ?? cfg.max;
    if (!STAKE_OPTIONS.includes(dto.stake)) throw appError(400, 'BAD_STAKE', `Stake must be one of ${STAKE_OPTIONS.join(', ')}`);
    if (size < cfg.min || size > cfg.max) throw appError(400, 'BAD_PLAYER_COUNT', `${dto.game} supports ${cfg.min} to ${cfg.max} players`);
    if (this.keyOf.has(userId)) throw appError(409, 'ALREADY_QUEUED', 'You are already searching for a match');
    if (await this.rooms.currentRoomId(userId)) throw appError(409, 'ALREADY_IN_ROOM', 'Leave your current room first');
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if ((wallet?.balance ?? 0n) < BigInt(dto.stake)) throw new InsufficientCoinsException();

    const key = MatchmakingService.key(dto.game, dto.stake, size);
    if (this.keyOf.has(userId)) throw appError(409, 'ALREADY_QUEUED', 'You are already searching for a match');
    this.keyOf.set(userId, key);
    const q = this.queues.get(key) ?? [];
    q.push({ userId, at: Date.now() });
    this.queues.set(key, q);
    void this.tryMatch(key);
    return { queued: true, key, size, timeoutMs: QUEUE_TIMEOUT_MS };
  }

  leave(userId: string) {
    const key = this.keyOf.get(userId);
    if (!key) return { ok: true, wasQueued: false };
    this.remove(userId, key);
    return { ok: true, wasQueued: true };
  }

  private remove(userId: string, key: string) {
    this.keyOf.delete(userId);
    const q = this.queues.get(key);
    if (!q) return;
    const rest = q.filter((t) => t.userId !== userId);
    if (rest.length) this.queues.set(key, rest);
    else this.queues.delete(key);
  }

  sweepTimeouts(now = Date.now()) {
    for (const [key, q] of [...this.queues]) {
      for (const t of q.filter((x) => now - x.at >= QUEUE_TIMEOUT_MS)) {
        this.remove(t.userId, key);
        this.realtime.emitToUser(t.userId, 'match:timeout', { key });
      }
    }
  }

  /** Pairs as many groups as the queue allows. Re-runs if someone joined while it was working. */
  async tryMatch(key: string) {
    if (this.running.has(key)) {
      this.dirty.add(key);
      return;
    }
    this.running.add(key);
    try {
      do {
        this.dirty.delete(key);
        while (await this.matchOnce(key)) { /* keep forming groups */ }
      } while (this.dirty.has(key));
    } finally {
      this.running.delete(key);
    }
  }

  private async matchOnce(key: string): Promise<boolean> {
    const [game, stakeStr, sizeStr] = key.split(':');
    const size = Number(sizeStr);
    const queue = this.queues.get(key) ?? [];
    if (queue.length < size) return false;

    const ids = queue.map((t) => t.userId);
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: { in: ids }, blockedId: { in: ids } },
      select: { blockerId: true, blockedId: true },
    });
    const blockedPair = (a: string, b: string) => blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));

    const group: string[] = [];
    for (const t of queue) {
      if (group.every((g) => !blockedPair(g, t.userId))) group.push(t.userId);
      if (group.length === size) break;
    }
    if (group.length < size) return false;

    // Take them out of the queue before the slow part so nobody is matched twice.
    for (const id of group) this.remove(id, key);
    const { room, dropped } = await this.rooms.createQuickRoom(game as GameType, BigInt(stakeStr), group, size);
    for (const d of dropped) this.realtime.emitToUser(d.userId, 'match:failed', { reason: d.reason });
    if (room) {
      for (const m of room.members) this.realtime.emitToUser(m.userId, 'match:found', room);
      this.realtime.emitToRoom(room.id, 'room:started', room);
    } else {
      // Not enough valid players left: put the ones who are still fine back in line.
      const droppedIds = new Set(dropped.map((d) => d.userId));
      for (const id of group.filter((g) => !droppedIds.has(g))) {
        this.keyOf.set(id, key);
        this.queues.set(key, [...(this.queues.get(key) ?? []), { userId: id, at: Date.now() }]);
      }
    }
    return true;
  }
}
