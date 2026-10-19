import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { randomCode } from '../common/codes';
import { EngineContext } from '../games/engine';
import { GameRegistry } from '../games/game-registry';
import { MatchesService } from '../matches/matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { randomPlayerName } from './bot-names';
import { chooseMove } from './bot-policy';

const ctx: EngineContext = { randomInt: (n) => randomInt(n) };

/** Timing knobs, read each time so tests and hosts can change them with environment variables. */
export const botSettings = () => ({
  enabled: process.env.BOTS_ENABLED !== 'false',
  fillMin: Number(process.env.BOT_FILL_MS_MIN ?? 6_000),
  fillMax: Number(process.env.BOT_FILL_MS_MAX ?? 12_000),
  moveMin: Number(process.env.BOT_MOVE_MS_MIN ?? 1_200),
  moveMax: Number(process.env.BOT_MOVE_MS_MAX ?? 3_500),
});
const between = (min: number, max: number) => min + Math.floor(Math.random() * Math.max(1, max - min + 1));

type LiveMatch = {
  id: string; version: number; status: string; turnSeat: number | null; game: any; state: unknown;
  players: Array<{ userId: string; seat: number; leftAt: Date | null; user: { isBot: boolean } }>;
};

/**
 * Computer opponents for free (no stake) games when no other player turns up.
 * They are ordinary accounts with an ordinary-looking name, flagged `isBot` so they never log in, never show up in
 * search, and never play for coins. This service creates them, hands out idle ones, and plays their turns.
 */
@Injectable()
export class BotsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Bots');
  private readonly reserved = new Set<string>();
  private readonly scheduled = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly matches: MatchesService,
    private readonly games: GameRegistry,
  ) {}

  onModuleInit() {
    this.matches.setBotDriver((m) => this.consider(m as unknown as LiveMatch));
    // Safety net after a restart or a missed event: any live match waiting on a computer player gets scheduled again.
    this.timer = setInterval(() => void this.recover().catch((e) => this.log.warn(e)), 10_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---- accounts ----

  /** Gives back `n` computer accounts that are free right now, creating new ones when the idle ones run out. */
  async acquire(n: number): Promise<string[]> {
    const busy = await this.prisma.user.findMany({
      where: { isBot: true, OR: [{ roomMembership: { isNot: null } }, { matchPlayers: { some: { leftAt: null, match: { status: 'ACTIVE' } } } }] },
      select: { id: true },
    });
    const skip = new Set([...busy.map((b) => b.id), ...this.reserved]);
    const idle = await this.prisma.user.findMany({ where: { isBot: true, id: { notIn: [...skip] } }, select: { id: true }, take: 50 });
    const ids = idle.map((u) => u.id).sort(() => Math.random() - 0.5).slice(0, n);
    while (ids.length < n) ids.push(await this.create());
    for (const id of ids) this.reserved.add(id);
    return ids;
  }

  release(ids: string[]) {
    for (const id of ids) this.reserved.delete(id);
  }

  private async create(): Promise<string> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const { username, displayName } = randomPlayerName();
      if (/bot/i.test(username) || /bot/i.test(displayName)) continue;
      const taken = await this.prisma.user.findUnique({ where: { usernameLower: username.toLowerCase() }, select: { id: true } });
      if (taken) continue;
      const now = new Date();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email: `${randomBytes(8).toString('hex')}@players.invalid`, username, usernameLower: username.toLowerCase(), displayName,
              friendCode: randomCode(8), passwordHash: `!${randomBytes(24).toString('hex')}`, // never matches any password
              birthDate: new Date('1995-06-15'), ageConfirmedAt: now, termsAcceptedAt: now, isBot: true,
            },
          });
          await this.wallet.ensureWallet(tx, u.id);
          return u.id;
        });
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e; // name or code collided: try another
      }
    }
    throw new Error('could not create a computer player');
  }

  // ---- playing ----

  /** Called with every live match update. Schedules the computer's turn if it is its move. */
  consider(m: LiveMatch) {
    if (m.status !== 'ACTIVE' || m.turnSeat === null) return;
    const player = m.players.find((p) => p.seat === m.turnSeat && !p.leftAt);
    if (!player?.user.isBot) return;
    const key = `${m.id}:${m.version}`;
    if (this.scheduled.has(key)) return;
    this.scheduled.add(key);
    const s = botSettings();
    // Rolling the dice is quicker than thinking about a move.
    const wait = m.game === 'LUDO' && (m.state as { phase?: string }).phase === 'ROLL' ? between(s.moveMin / 2, s.moveMax / 2) : between(s.moveMin, s.moveMax);
    const t = setTimeout(() => void this.play(m.id, m.version, player.userId, key), wait);
    t.unref();
  }

  private async play(matchId: string, version: number, botId: string, key: string) {
    try {
      const m = await this.prisma.match.findUnique({ where: { id: matchId }, include: { players: { include: { user: { select: { isBot: true } } } } } });
      if (!m || m.status !== 'ACTIVE' || m.version !== version) return;
      const seat = m.players.find((p) => p.userId === botId)?.seat;
      const engine = this.games.get(m.game);
      if (seat === undefined || !engine || m.turnSeat !== seat) return;
      const move = chooseMove(m.game, engine, m.state, seat, ctx);
      if (!move) return;
      await this.matches.move(botId, matchId, { version, move });
    } catch (e) {
      this.log.debug(`computer move skipped: ${(e as Error).message}`); // e.g. the human resigned in the same instant
    } finally {
      this.scheduled.delete(key);
    }
  }

  private async recover() {
    const live = await this.prisma.match.findMany({
      where: { status: 'ACTIVE', players: { some: { user: { isBot: true }, leftAt: null } } },
      include: { players: { include: { user: { select: { isBot: true } } } } }, take: 100,
    });
    for (const m of live) this.consider(m as unknown as LiveMatch);
  }
}
