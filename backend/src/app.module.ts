import { Inject, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AppConfig, CONFIG, ConfigModule } from './config/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './admin/admin.module';
import { ShopModule } from './shop/shop.module';
import { EconomyModule } from './economy/economy.module';
import { GamesModule } from './games/games.module';
import { MatchesModule } from './matches/matches.module';
import { FriendsModule } from './friends/friends.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RoomsModule } from './rooms/rooms.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (c: AppConfig) => [{ ttl: 60_000, limit: c.globalRatePerMinute }],
    }),
    PrismaModule,
    GamesModule,
    WalletModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    RoomsModule,
    MatchmakingModule,
    MatchesModule,
    EconomyModule,
    AdminModule,
    ShopModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
