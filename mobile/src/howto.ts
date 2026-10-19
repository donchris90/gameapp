import { GameType } from './types';

export const HOW_TO_PLAY: Record<GameType, string[]> = {
  TICTACTOE: [
    'Take turns placing your mark. X and O are given by seat.',
    'Get three of your marks in a row, across, down or diagonal, to win.',
    'A full board with no line is a draw and everyone gets their stake back.',
  ],
  WATER_SORT: [
    'Tap a tube, then tap another to pour. You can only pour onto the same colour or onto an empty tube, and only if there is room.',
    'Fill every tube with a single colour to finish the level. Levels start easy and get harder, with more colours.',
    'Stuck? Undo your last pour, add an extra tube (twice per level) or restart the level. If there are no moves left, you can retry.',
  ],
  AYO: [
    'Tap one of your bowls to pick up its seeds and sow them one by one, counter-clockwise, up your column and down your opponent\'s.',
    'If your last seed lands in a bowl that already has seeds, pick them all up and keep sowing. Your turn ends when the last seed lands in an empty bowl.',
    'A bowl that reaches exactly 4 is packed by its owner. When you pack the 4 with your last seed, it is yours. Each round, you get a bowl for every 4 seeds you packed.',
    'Down to one bowl and you have lost. With two bowls you can quit or keep playing. The computer plays for you if you run out of time, and you can take back control any time.',
  ],
  LUDO: [
    'Roll the dice on your turn. A 6 brings a token out of the yard and gives you another roll.',
    'Move a token the number rolled around the board and into your home column. Landing on an opponent token (outside a safe square) sends it back to the yard.',
    'First to bring all four tokens home wins. You have 30 seconds per action, so do not walk away.',
  ],
};
