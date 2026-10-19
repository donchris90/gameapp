import { Global, Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { FriendsModule } from '../friends/friends.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { SocialModule } from '../social/social.module';
import { RoomsModule } from '../rooms/rooms.module';

@Global()
@Module({
  imports: [FriendsModule, RoomsModule, MatchmakingModule, SocialModule],
  providers: [PresenceService, RealtimeService, RealtimeGateway],
  exports: [PresenceService, RealtimeService],
})
export class RealtimeModule {}
