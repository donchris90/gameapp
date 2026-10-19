import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { AppConfig, CONFIG } from '../config/config';
import { Prisma } from '../generated/prisma/client';
import { appError } from '../common/errors';
import { EngineContext, IllegalMove, Outcome } from '../games/engine';
import { GameRegistry } from '../games/game-registry';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AfterCommit, RoomFull, RoomsService, Tx } from '../rooms/rooms.service';
import { WalletService } from '../wallet/wallet.service';

const matchInclude = {
  players: { include: { user: { select: { id: true, username: true, displayName: true, equippedFrame: true, equippedTitle: true } } }, orderBy: { seat: 'asc' as const } },
} satisfies Prisma.MatchInclude;
type MatchFull = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

const ctx: EngineContext = { randomInt: (n) => randomInt(n) };
const refOf = (matchId: string) => `match:${matchId}`;

/**
 * Runs games: takes stakes when a lobby starts, applies moves through the game
 * engine, and settles (pays the winner, books the house cut, or refunds a draw)
 * inside one database transaction. A match can only be settled once because every
 * entry point locks the match row and re-checks that it is still ACTIVE.
 */
@Injectable()
export class MatchesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Matches');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeService,
    private readonly rooms: RoomsService,
    private readonly games: GameRegistry,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    this.rooms.setHooks({
      onStart: (tx, room) => this.createInTx(tx, room),
      onLeave: (tx, roomId, userId) => this.leaveInTx(tx, roomId, userId),
    });
    this.timer = setInterval(() => void this.sweep().catch((e) => this.log.warn(e)), 1_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---- views ----

  view(m: MatchFull) {
    const engine = this.games.get(m.game);
    return {
      id: m.id, roomId: m.roomId, game: m.game, stake: Number(m.stake), pot: Number(m.pot), houseFee: Number(m.houseFee),
      status: m.status, endReason: m.endReason, winnerId: m.winnerId, version: m.version,
      turnSeat: m.turnSeat, turnDeadline: m.turnDeadline,
      state: engine ? engine.publicState(m.state) : null,
      players: m.players.map((p) => ({
        userId: p.userId, username: p.user.username, displayName: p.user.displayName, frame: p.user.equippedFrame, title: p.user.equippedTitle,
        seat: p.seat, payout: Number(p.payout), result: p.result, left: !!p.leftAt,
      })),
    };
  }

  private lock(tx: Tx, matchId: string) {
    return tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId} FOR UPDATE`;
  }

  private emit(m: MatchFull, event: string) {
    const v = this.view(m);
    for (const p of m.players) this.realtime.emitToUser(p.userId, event, v);
  }

  async get(userId: string, matchId: string) {
    const m = await this.prisma.match.findUnique({ where: { id: matchId }, include: matchInclude });
    if (!m || !m.players.some((p) => p.userId === userId)) throw appError(404, 'MATCH_NOT_FOUND', 'Match not found');
    return this.view(m);
  }

  async current(userId: string) {
    const m = await this.prisma.match.findFirst({
      where: { status: 'ACTIVE', players: { some: { userId, leftAt: null } } }, include: matchInclude, orderBy: { startedAt: 'desc' },
    });
    if (!m) throw appError(404, 'NO_ACTIVE_MATCH', 'You are not in a match');
    return this.view(m);
  }

  async history(userId: string, opts: { limit: number; cursor?: string }) {
    const rows = await this.prisma.matchPlayer.findMany({
      where: { userId, match: { status: 'FINISHED' } },
      include: { match: { include: { players: { include: { user: { select: { id: true, username: true, displayName: true } } }, orderBy: { seat: 'asc' } } } } },
      orderBy: [{ match: { finishedAt: 'desc' } }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, opts.limit);
    return {
      matches: page.map((r) => ({
        cursorId: r.id, matchId: r.matchId, game: r.match.game, stake: Number(r.stake), result: r.result, endReason: r.match.endReason,
        payout: Number(r.payout), net: Number(r.payout - r.stake), finishedAt: r.match.finishedAt,
        opponents: r.match.players.filter((p) => p.userId !== userId).map((p) => ({ id: p.user.id, username: p.user.username, displayName: p.user.displayName })),
      })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
    };
  }

  // ---- starting ----

  /** Called inside the room's start transaction: create the match and take every stake. */
  private async createInTx(tx: Tx, room: RoomFull): Promise<AfterCommit> {
    const engine = this.games.get(room.game);
    if (!engine) throw appError(409, 'GAME_NOT_AVAILABLE', 'That game is not available yet');
    const members = [...room.members].sort((a, b) => a.seat - b.seat);
    const init = engine.init(members.length, ctx);
    const id = randomUUID();
    const stake = room.stake;
    const timeout = engine.turnTimeoutMs ?? this.config.turnTimeoutMs;

    await tx.match.create({
      data: {
        id, roomId: room.id, game: room.game, stake, pot: stake * BigInt(members.length),
        state: init.state as Prisma.InputJsonValue, turnSeat: init.turnSeat,
        turnDeadline: engine.simultaneous
          ? new Date(Date.now() + (engine.matchTimeoutMs ?? 5 * 60_000))
          : init.turnSeat === null ? null : new Date(Date.now() + timeout),
        players: { create: members.map((m) => ({ userId: m.userId, seat: m.seat, stake })) },
      },
    });
    if (stake > 0n) {
      // Same order for everyone so two settlements can never wait on each other.
      for (const m of [...members].sort((a, b) => (a.userId < b.userId ? -1 : 1))) {
        await this.wallet.debit({ userId: m.userId, amount: stake, type: 'GAME_STAKE', reference: refOf(id), idempotencyKey: `stake:${id}:${m.userId}` }, tx);
      }
    }
    return async () => {
      const m = await this.prisma.match.findUniqueOrThrow({ where: { id }, include: matchInclude });
      this.emit(m, 'match:started');
    };
  }

  // ---- moves ----

  async move(userId: string, matchId: string, dto: { version?: number; move: unknown }) {
    const after = await this.prisma.$transaction(async (tx) => {
      const m = await this.loadLocked(tx, matchId);
      const player = m.players.find((p) => p.userId === userId);
      if (!player) throw appError(404, 'MATCH_NOT_FOUND', 'Match not found');
      if (m.status !== 'ACTIVE') throw appError(409, 'MATCH_OVER', 'This match has ended');
      if (player.leftAt) throw appError(409, 'MATCH_OVER', 'You have left this match');
      const engine = this.games.get(m.game);
      if (!engine) throw appError(409, 'GAME_NOT_AVAILABLE', 'That game is not available yet');
      if (!engine.simultaneous) {
        if (typeof dto.version !== 'number') throw appError(400, 'VERSION_REQUIRED', 'Send the match version with every move');
        if (dto.version !== m.version) throw appError(409, 'STALE_STATE', 'The game changed, refresh and try again', { version: m.version });
        if (m.turnSeat !== player.seat) throw appError(409, 'NOT_YOUR_TURN', 'It is not your turn');
      }
      let res;
      try {
        res = engine.applyMove(m.state, player.seat, dto.move, ctx);
      } catch (e) {
        if (e instanceof IllegalMove) throw appError(400, e.code, e.message);
        throw e;
      }
      if (res.outcome) return this.settle(tx, m, res.outcome, res.outcome.type === 'DRAW' ? 'DRAW' : 'NORMAL', res.state);
      return this.advance(tx, m, res.state, res.turnSeat, engine.turnTimeoutMs, engine.simultaneous);
    });
    await this.run(after);
    return this.get(userId, matchId);
  }

  /** A player gives up. Their opponent is paid as if they had won. */
  async forfeit(userId: string, matchId: string) {
    const after = await this.prisma.$transaction(async (tx) => {
      const m = await this.loadLocked(tx, matchId);
      if (!m.players.some((p) => p.userId === userId)) throw appError(404, 'MATCH_NOT_FOUND', 'Match not found');
      if (m.status !== 'ACTIVE') throw appError(409, 'MATCH_OVER', 'This match has ended');
      return this.eliminate(tx, m, userId, 'FORFEIT');
    });
    await this.run(after);
    return this.get(userId, matchId);
  }

  // ---- timers and recovery ----

  /** Anyone whose clock has run out loses. Safe to run often and from several servers. */
  async sweepTimeouts(now = Date.now()) {
    const due = await this.prisma.match.findMany({ where: { status: 'ACTIVE', turnDeadline: { lt: new Date(now) } }, select: { id: true }, take: 50 });
    let settled = 0;
    for (const { id } of due) {
      const after = await this.prisma.$transaction(async (tx) => {
        const m = await this.loadLocked(tx, id);
        if (m.status !== 'ACTIVE' || !m.turnDeadline || m.turnDeadline.getTime() >= now) return undefined;
        const engine = this.games.get(m.game);
        if (engine?.simultaneous) {
          // Race games have one clock for everyone: decide by progress.
          const seats = m.players.filter((p) => !p.leftAt).map((p) => p.seat);
          const r = engine.onDeadline?.(m.state, seats);
          return r ? this.settle(tx, m, r.outcome, 'TIMEOUT', r.state) : undefined;
        }
        if (m.turnSeat === null) return undefined;
        const late = m.players.find((p) => p.seat === m.turnSeat);
        return late ? this.eliminate(tx, m, late.userId, 'TIMEOUT') : undefined;
      });
      if (after) { settled++; await this.run(after); }
    }
    return settled;
  }

  /** A lobby stuck "in progress" with no live match (a crash after settling) goes back to waiting. */
  async recoverStuckRooms(now = Date.now()) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT r."id" FROM "Room" r
      WHERE r."status" = 'IN_PROGRESS' AND r."startedAt" < ${new Date(now - 5_000)}
        AND NOT EXISTS (SELECT 1 FROM "Match" m WHERE m."roomId" = r."id" AND m."status" = 'ACTIVE')`);
    for (const r of rows) await this.rooms.finishGame(r.id);
    return rows.length;
  }

  async sweep(now = Date.now()) {
    await this.sweepTimeouts(now);
    await this.recoverStuckRooms(now);
  }

  // ---- internals ----

  private async loadLocked(tx: Tx, matchId: string): Promise<MatchFull> {
    await this.lock(tx, matchId);
    const m = await tx.match.findUnique({ where: { id: matchId }, include: matchInclude });
    if (!m) throw appError(404, 'MATCH_NOT_FOUND', 'Match not found');
    return m;
  }

  private async run(after: AfterCommit | void) {
    try {
      await after?.();
    } catch (e) {
      this.log.warn(`post-commit step failed: ${(e as Error).message}`); // money is already safely settled
    }
  }

  private async advance(tx: Tx, m: MatchFull, state: unknown, turnSeat: number | null, timeoutMs?: number, keepDeadline = false): Promise<AfterCommit> {
    const wait = timeoutMs ?? this.config.turnTimeoutMs;
    await tx.match.update({
      where: { id: m.id },
      data: {
        state: state as Prisma.InputJsonValue, turnSeat, version: { increment: 1 },
        ...(keepDeadline ? {} : { turnDeadline: turnSeat === null ? null : new Date(Date.now() + wait) }),
      },
    });
    return async () => this.emit(await this.prisma.match.findUniqueOrThrow({ where: { id: m.id }, include: matchInclude }), 'match:state');
  }

  /** Player leaves a lobby while a game is on: they forfeit. Runs inside the room transaction. */
  private async leaveInTx(tx: Tx, roomId: string, userId: string): Promise<AfterCommit | void> {
    const active = await tx.match.findFirst({ where: { roomId, status: 'ACTIVE' }, select: { id: true } });
    if (!active) return;
    const m = await this.loadLocked(tx, active.id);
    if (m.status !== 'ACTIVE') return;
    return this.eliminate(tx, m, userId, 'FORFEIT');
  }

  /** Takes a player out of a live match (resign, leave, or out of time). */
  private async eliminate(tx: Tx, m: MatchFull, userId: string, reason: 'FORFEIT' | 'TIMEOUT'): Promise<AfterCommit | undefined> {
    const player = m.players.find((p) => p.userId === userId && !p.leftAt);
    if (!player) return undefined;
    await tx.matchPlayer.update({ where: { id: player.id }, data: { leftAt: new Date() } });
    const remaining = m.players.filter((p) => p.id !== player.id && !p.leftAt);
    const updated = { ...m, players: m.players.map((p) => (p.id === player.id ? { ...p, leftAt: new Date() } : p)) };

    if (remaining.length === 1) return this.settle(tx, updated, { type: 'WIN', winnerSeat: remaining[0].seat }, reason, m.state);
    if (remaining.length === 0) return this.settle(tx, updated, { type: 'DRAW' }, reason, m.state);

    // Three or more still playing: the engine decides how the game continues without this seat.
    const engine = this.games.get(m.game);
    const r = engine?.onSeatLeft?.(m.state, player.seat, remaining.map((p) => p.seat));
    if (r?.outcome) return this.settle(tx, updated, r.outcome, reason, r.state);
    return this.advance(tx, updated, r?.state ?? m.state, r ? r.turnSeat : m.turnSeat, engine?.turnTimeoutMs, engine?.simultaneous);
  }

  /**
   * Ends the match inside the caller's transaction. A win pays the pot minus the house cut to
   * the winner; a draw (or nobody left) returns every stake in full. All entries carry the
   * reference `match:<id>`, so for any match the ledger entries add up to exactly zero.
   */
  private async settle(tx: Tx, m: MatchFull, outcome: Outcome, reason: 'NORMAL' | 'DRAW' | 'FORFEIT' | 'TIMEOUT', finalState: unknown): Promise<AfterCommit> {
    const reference = refOf(m.id);
    const ordered = [...m.players].sort((a, b) => (a.userId < b.userId ? -1 : 1));
    let fee = 0n;
    let winnerId: string | null = null;
    const results = new Map<string, { result: 'WON' | 'LOST' | 'DRAW'; payout: bigint }>();

    if (outcome.type === 'WIN') {
      const winner = m.players.find((p) => p.seat === outcome.winnerSeat);
      if (!winner) throw new Error(`no player in seat ${outcome.winnerSeat}`);
      winnerId = winner.userId;
      fee = (m.pot * BigInt(this.config.houseFeePercent)) / 100n;
      const payout = m.pot - fee;
      if (payout > 0n) {
        await this.wallet.credit({ userId: winner.userId, amount: payout, type: 'GAME_PAYOUT', reference, idempotencyKey: `payout:${m.id}:${winner.userId}` }, tx);
      }
      if (fee > 0n) await this.wallet.recordPlatformEntry({ type: 'HOUSE_FEE', amount: fee, reference, idempotencyKey: `fee:${m.id}` }, tx);
      for (const p of m.players) results.set(p.userId, p.userId === winner.userId ? { result: 'WON', payout } : { result: 'LOST', payout: 0n });
    } else {
      for (const p of ordered) {
        if (p.stake > 0n) {
          await this.wallet.credit({ userId: p.userId, amount: p.stake, type: 'GAME_REFUND', reference, idempotencyKey: `refund:${m.id}:${p.userId}` }, tx);
        }
        results.set(p.userId, { result: 'DRAW', payout: p.stake });
      }
    }

    for (const p of m.players) {
      const r = results.get(p.userId)!;
      await tx.matchPlayer.update({ where: { id: p.id }, data: { result: r.result, payout: r.payout } });
    }
    await tx.match.update({
      where: { id: m.id },
      data: {
        status: 'FINISHED', endReason: outcome.type === 'DRAW' && reason === 'NORMAL' ? 'DRAW' : reason, winnerId, houseFee: fee,
        state: finalState as Prisma.InputJsonValue, turnSeat: null, turnDeadline: null, version: { increment: 1 }, finishedAt: new Date(),
      },
    });

    return async () => {
      this.emit(await this.prisma.match.findUniqueOrThrow({ where: { id: m.id }, include: matchInclude }), 'match:ended');
      if (m.roomId) await this.rooms.finishGame(m.roomId); // back to the lobby for a rematch
    };
  }
}
