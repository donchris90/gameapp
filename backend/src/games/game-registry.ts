import { Injectable } from '@nestjs/common';
import { GameType } from '../generated/prisma/client';
import { GameEngine } from './engine';
import { TicTacToeEngine } from './tictactoe.engine';

/** The games that can actually be played right now. Others are added as their engines land. */
@Injectable()
export class GameRegistry {
  private readonly engines = new Map<GameType, GameEngine<any>>();

  constructor() {
    this.register(new TicTacToeEngine());
  }

  register(engine: GameEngine<any>) {
    this.engines.set(engine.game, engine);
  }

  get(game: GameType): GameEngine<any> | undefined {
    return this.engines.get(game);
  }

  isAvailable(game: GameType) {
    return this.engines.has(game);
  }

  available(): GameType[] {
    return [...this.engines.keys()];
  }
}
