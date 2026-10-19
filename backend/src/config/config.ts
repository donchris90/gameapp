import { Global, Module } from '@nestjs/common';

export const CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  signupBonusCoins: bigint;
  minAgeYears: number;
  /** Share of the pot the platform keeps when a match has a winner (0 to 50). */
  houseFeePercent: number;
  /** Time a player has for one move before forfeiting. */
  turnTimeoutMs: number;
  /** Max requests per minute per IP on register / login / refresh. */
  authRatePerMinute: number;
  /** Max requests per minute per IP on everything else. */
  globalRatePerMinute: number;
}

function int(name: string, raw: string | undefined, fallback: number, min = 0): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer >= ${min}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const databaseUrl = env.DATABASE_URL;
  const fee = Number(env.HOUSE_FEE_PERCENT ?? 10);
  if (fee > 50) throw new Error('HOUSE_FEE_PERCENT must be between 0 and 50');
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const secret = env.JWT_ACCESS_SECRET ?? (production ? '' : 'dev-only-secret-not-for-production-use');
  if (secret.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  return {
    port: int('PORT', env.PORT, 3000, 1),
    databaseUrl,
    jwtAccessSecret: secret,
    accessTokenTtlSeconds: int('ACCESS_TOKEN_TTL_SECONDS', env.ACCESS_TOKEN_TTL_SECONDS, 900, 60),
    refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', env.REFRESH_TOKEN_TTL_DAYS, 30, 1),
    signupBonusCoins: BigInt(int('SIGNUP_BONUS_COINS', env.SIGNUP_BONUS_COINS, 1000, 0)),
    minAgeYears: int('MIN_AGE_YEARS', env.MIN_AGE_YEARS, 18, 13),
    houseFeePercent: int('HOUSE_FEE_PERCENT', env.HOUSE_FEE_PERCENT, 10, 0),
    turnTimeoutMs: int('TURN_TIMEOUT_MS', env.TURN_TIMEOUT_MS, 30_000, 1_000),
    authRatePerMinute: int('AUTH_RATE_PER_MINUTE', env.AUTH_RATE_PER_MINUTE, 10, 1),
    globalRatePerMinute: int('GLOBAL_RATE_PER_MINUTE', env.GLOBAL_RATE_PER_MINUTE, 120, 1),
  };
}

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => loadConfig() }],
  exports: [CONFIG],
})
export class ConfigModule {}
