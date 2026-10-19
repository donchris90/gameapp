import { Module } from '@nestjs/common';
import { MatchesModule } from '../matches/matches.module';
import { BotsService } from './bots.service';

@Module({ imports: [MatchesModule], providers: [BotsService], exports: [BotsService] })
export class BotsModule {}
