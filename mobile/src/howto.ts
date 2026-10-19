import { GameType } from './types';

export const HOW_TO_PLAY: Record<GameType, string[]> = {
  TICTACTOE: [
    'Take turns placing your mark. X and O are given by seat.',
    'Get three of your marks in a row, across, down or diagonal, to win.',
    'A full board with no line is a draw and everyone gets their stake back.',
  ],
  WATER_SORT: [
    'Every puzzle is new and can always be solved.',
    'Tap a tube, then tap another to pour. You can only pour onto the same colour or an empty tube, and only if there is room.',
    'Sort every tube into a single colour before the 5 minutes run out. It is free and no coins are involved.',
  ],
  AYO: [
    'Each side has six pits. Tap one of your pits to pick up its seeds and sow them one by one, counter-clockwise.',
    'If your last seed lands in an opponent pit that then holds 2 or 3 seeds, you capture them, and the pits before it that also hold 2 or 3.',
    'If the opponent has no seeds, you must make a move that gives them some. First to capture 25 seeds wins.',
  ],
  LUDO: [
    'Roll the dice on your turn. A 6 brings a token out of the yard and gives you another roll.',
    'Move a token the number rolled around the board and into your home column. Landing on an opponent token (outside a safe square) sends it back to the yard.',
    'First to bring all four tokens home wins. You have 30 seconds per action, so do not walk away.',
  ],
};
