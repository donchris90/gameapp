import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { RoomsModule } from '../rooms/rooms.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { VoiceService } from './voice.service';

@Module({ imports: [FriendsModule, RoomsModule], controllers: [SocialController], providers: [SocialService, VoiceService], exports: [SocialService, VoiceService] })
export class SocialModule {}
