import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { UsersController } from './users.controller';

@Module({ imports: [RoomsModule], controllers: [UsersController] })
export class UsersModule {}
