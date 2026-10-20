import { Injectable } from '@nestjs/common';
import { appError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export const AD_GAMES = ['TICTACTOE', 'WATER_SORT', 'AYO', 'LUDO', 'APEX_RUN'] as const;
export type AdGame = (typeof AD_GAMES)[number];
/** Show a full-screen ad after every Nth finished game of that kind. 0 = never, 1 = after every game. */
export type AdPolicy = Record<AdGame, number>;
export const AD_EVERY_MAX = 20;
export const DEFAULT_AD_POLICY: AdPolicy = { TICTACTOE: 1, WATER_SORT: 1, AYO: 1, LUDO: 1, APEX_RUN: 1 };
const KEY = 'adPolicy';
const CACHE_MS = 15_000;

@Injectable()
export class SettingsService {
  private cache?: { at: number; value: AdPolicy };
  constructor(private readonly prisma: PrismaService) {}

  async adPolicy(): Promise<AdPolicy> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    const stored = (row?.value ?? {}) as Partial<Record<AdGame, unknown>>;
    const value = { ...DEFAULT_AD_POLICY };
    for (const g of AD_GAMES) { const v = stored[g]; if (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= AD_EVERY_MAX) value[g] = v as number; }
    this.cache = { at: Date.now(), value };
    return value;
  }

  async setAdPolicy(adminId: string, input: Partial<Record<AdGame, unknown>>): Promise<AdPolicy> {
    const next = { ...(await this.adPolicy()) };
    for (const [g, v] of Object.entries(input).filter(([, x]) => x !== undefined)) {
      if (!(AD_GAMES as readonly string[]).includes(g)) throw appError(400, 'BAD_GAME', `Unknown game ${g}`);
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > AD_EVERY_MAX) throw appError(400, 'BAD_VALUE', `Use a whole number from 0 to ${AD_EVERY_MAX}`);
      next[g as AdGame] = v as number;
    }
    const before = await this.adPolicy();
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value: next }, create: { key: KEY, value: next } }),
      this.prisma.auditLog.create({ data: { adminId, action: 'SET_AD_POLICY', data: { from: before, to: next } } }),
    ]);
    this.cache = { at: Date.now(), value: next };
    return next;
  }
}
