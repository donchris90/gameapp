import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppConfig, CONFIG } from '../config/config';
import { GAME_CONFIG, STAKE_OPTIONS } from '../rooms/game-config';
import { GameRegistry } from './game-registry';

/** What the app needs to draw its game picker. No login required. */
@Controller('games')
@SkipThrottle()
export class GamesController {
  constructor(private readonly registry: GameRegistry, @Inject(CONFIG) private readonly config: AppConfig) {}

  @Get()
  list() {
    return {
      games: (Object.keys(GAME_CONFIG) as Array<keyof typeof GAME_CONFIG>).map((game) => ({
        game, available: this.registry.isAvailable(game), minPlayers: GAME_CONFIG[game].min, maxPlayers: GAME_CONFIG[game].max,
      })),
      stakes: STAKE_OPTIONS,
      houseFeePercent: this.config.houseFeePercent,
      turnTimeoutSeconds: Math.round(this.config.turnTimeoutMs / 1000),
    };
  }
}
