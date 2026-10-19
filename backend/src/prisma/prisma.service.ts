import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppConfig, CONFIG } from '../config/config';

/**
 * Hosted databases such as Supabase use a certificate chain that Node does not trust by default.
 * DATABASE_SSL=no-verify keeps the connection encrypted but skips checking who signed the certificate.
 * DATABASE_POOL_MAX limits connections (hosted plans cap how many you may open).
 */
export function poolOptions(url: string) {
  const max = Number(process.env.DATABASE_POOL_MAX) || 10;
  if (process.env.DATABASE_SSL !== 'no-verify') return { connectionString: url, max };
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  return { connectionString: u.toString(), max, ssl: { rejectUnauthorized: false } };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg(poolOptions(config.databaseUrl)) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
