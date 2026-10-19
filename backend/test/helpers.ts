import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GameEngine } from '../src/games/engine';
import { GameRegistry } from '../src/games/game-registry';
import { GameType } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Stand-in rules for games whose real engines are not built yet (Ayo, Ludo, Water Sort), so
 * lobby, quick match and staking can be tested for every table size. Any move passes the turn;
 * { end: 'win' } wins for the mover and { end: 'draw' } draws.
 */
export function fakeEngine(game: GameType): GameEngine<{ n: number }> {
  return {
    game,
    init: (n) => ({ state: { n }, turnSeat: 0 }),
    applyMove: (state, seat, move: any) => {
      if (move?.end === 'win') return { state, turnSeat: null, outcome: { type: 'WIN', winnerSeat: seat } };
      if (move?.end === 'draw') return { state, turnSeat: null, outcome: { type: 'DRAW' } };
      return { state, turnSeat: (seat + 1) % state.n };
    },
    publicState: (s) => s,
  };
}

export async function createApp(opts: { fakeEngines?: boolean } = {}): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  if (opts.fakeEngines !== false) {
    const registry = app.get(GameRegistry);
    for (const g of ['LUDO'] as const) registry.register(fakeEngine(g));
  }
  return app;
}

let n = 0;
export const uniq = (p = 'u') => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

export function adultBirthDate(now = new Date()) {
  return `${now.getUTCFullYear() - 25}-06-15`;
}

export function registerBody(over: Record<string, unknown> = {}) {
  const u = uniq();
  return {
    email: `${u}@example.com`, username: u, password: 'correct horse battery', birthDate: adultBirthDate(),
    confirmAdult: true, acceptTerms: true, ...over,
  };
}

export async function registerUser(app: INestApplication, over: Record<string, unknown> = {}) {
  const body = registerBody(over);
  const res = await request(app.getHttpServer()).post('/auth/register').send(body).expect(201);
  return { body, user: res.body.user, tokens: res.body.tokens as { accessToken: string; refreshToken: string } };
}

export const prismaOf = (app: INestApplication) => app.get(PrismaService);

import { WalletService } from '../src/wallet/wallet.service';

export const bearer = (u: { tokens: { accessToken: string } }) => ({ Authorization: `Bearer ${u.tokens.accessToken}` });

/** Registers a player (starts with 1000 coins). */
export const newPlayer = (app: INestApplication, over: Record<string, unknown> = {}) => registerUser(app, over);

let k = 0;
export async function setCoins(app: INestApplication, userId: string, coins: number) {
  const wallet = app.get(WalletService);
  const now = Number(await wallet.getBalance(userId));
  const key = `test:${Date.now()}:${k++}:${Math.random()}`;
  if (coins > now) await wallet.credit({ userId, amount: BigInt(coins - now), type: 'ADJUSTMENT', idempotencyKey: key });
  if (coins < now) await wallet.debit({ userId, amount: BigInt(now - coins), type: 'ADJUSTMENT', idempotencyKey: key });
}

export type Player = Awaited<ReturnType<typeof registerUser>>;

export async function befriend(app: INestApplication, a: Player, b: Player) {
  const sent = await request(app.getHttpServer()).post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
  await request(app.getHttpServer()).post(`/friends/requests/${sent.body.id}/accept`).set(bearer(b)).expect(200);
}
