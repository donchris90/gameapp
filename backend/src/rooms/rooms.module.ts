import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({ imports: [FriendsModule], controllers: [RoomsController], providers: [RoomsService], exports: [RoomsService] })
export class RoomsModule {}
