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
  /** Coins for the first daily bonus; each streak day adds 10 more (up to day 7). */
  dailyBonusCoins: number;
  /** Coins paid per rewarded ad, and how many ads count per day. */
  adRewardCoins: number;
  adDailyCap: number;
  /** Local day boundary as minutes east of UTC (60 = Nigeria, so the day resets at midnight Lagos time). */
  dayOffsetMinutes: number;
  /** 'live' talks to Google/Apple and AdMob. 'fake' accepts test receipts and unsigned ad callbacks: never in production. */
  storeMode: 'live' | 'fake';
  googlePlay: { packageName: string; serviceAccountJson: string } | null;
  appleStore: { bundleId: string; issuerId: string; keyId: string; privateKey: string; sandbox: boolean } | null;
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
  const storeMode = (env.STORE_MODE ?? 'live') as string;
  if (storeMode !== 'live' && storeMode !== 'fake') throw new Error('STORE_MODE must be live or fake');
  if (storeMode === 'fake' && production) throw new Error('STORE_MODE=fake is not allowed in production');
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
    dailyBonusCoins: int('DAILY_BONUS_COINS', env.DAILY_BONUS_COINS, 50, 0),
    adRewardCoins: int('AD_REWARD_COINS', env.AD_REWARD_COINS, 25, 0),
    adDailyCap: int('AD_DAILY_CAP', env.AD_DAILY_CAP, 10, 0),
    dayOffsetMinutes: int('DAY_OFFSET_MINUTES', env.DAY_OFFSET_MINUTES, 60, 0),
    storeMode: storeMode as 'live' | 'fake',
    googlePlay: env.GOOGLE_PLAY_PACKAGE_NAME && env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
      ? { packageName: env.GOOGLE_PLAY_PACKAGE_NAME, serviceAccountJson: env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON } : null,
    appleStore: env.APPLE_BUNDLE_ID && env.APPLE_ISSUER_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY
      ? { bundleId: env.APPLE_BUNDLE_ID, issuerId: env.APPLE_ISSUER_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), sandbox: env.APPLE_SANDBOX === 'true' } : null,
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
