import { Global, Module } from '@nestjs/common';
import { GameRegistry } from './game-registry';
import { GamesController } from './games.controller';

@Global()
@Module({ controllers: [GamesController], providers: [GameRegistry], exports: [GameRegistry] })
export class GamesModule {}
