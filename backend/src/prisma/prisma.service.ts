import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppConfig, CONFIG } from '../config/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
