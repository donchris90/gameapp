import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({ imports: [RoomsModule], controllers: [MatchesController], providers: [MatchesService], exports: [MatchesService] })
export class MatchesModule {}
