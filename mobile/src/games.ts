import { GameType } from './types';

export const GAME_INFO: Record<GameType, { title: string; emoji: string; blurb: string; color: string }> = {
  TICTACTOE: { title: 'Tic Tac Toe', emoji: '❌⭕', blurb: 'Three in a row. Fast duels.', color: '#2B6CFF' },
  WATER_SORT: { title: 'Water Sort', emoji: '🧪', blurb: 'Solo puzzle against the clock.', color: '#16A085' },
  AYO: { title: 'Ayo', emoji: '🫘', blurb: 'The classic seed game. Capture 25.', color: '#D35400' },
  LUDO: { title: 'Ludo', emoji: '🎲', blurb: '2 to 4 players. Race home.', color: '#C0392B' },
};
