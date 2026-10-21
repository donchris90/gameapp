import { GameType } from '../generated/prisma/client';

/** Player counts per game. Water Sort is a solo puzzle: one player, no room, no stake. */
export const GAME_CONFIG: Record<GameType, { min: number; max: number }> = {
  TICTACTOE: { min: 2, max: 2 },
  AYO: { min: 2, max: 2 },
  LUDO: { min: 2, max: 4 },
  WATER_SORT: { min: 1, max: 1 },
  APEX: { min: 2, max: 4 },
};

/** Games played alone. They have no rooms, no quick match and no stakes. */
export const isSolo = (game: GameType) => GAME_CONFIG[game].max === 1;

/** Allowed stakes per player. 0 is a friendly game with no coins at risk. */
export const STAKE_OPTIONS: readonly number[] = [0, 50, 100, 250, 500, 1000, 5000];

export const ROOM_CODE_LENGTH = 6;
export const INVITE_TTL_MS = 5 * 60_000;
/** A player who has been offline this long is removed from a lobby that is not mid-game. */
export const ROOM_IDLE_MS = 10 * 60_000;
