import { Module } from '@nestjs/common';
import { BotsModule } from '../bots/bots.module';
import { RoomsModule } from '../rooms/rooms.module';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';

@Module({ imports: [RoomsModule, BotsModule], controllers: [MatchmakingController], providers: [MatchmakingService], exports: [MatchmakingService] })
export class MatchmakingModule {}
