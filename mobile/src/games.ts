import { GameType } from './types';

export const GAME_INFO: Record<GameType, { title: string; emoji: string; blurb: string; color: string }> = {
  TICTACTOE: { title: 'Tic Tac Toe', emoji: '❌⭕', blurb: 'Three in a row. Fast duels.', color: '#2B6CFF' },
  WATER_SORT: { title: 'Water Sort', emoji: '🧪', blurb: 'Solo puzzle with levels that get harder.', color: '#16A085' },
  AYO: { title: 'Ayo', emoji: '🫘', blurb: 'The classic seed game. Keep sowing, pack the 4s.', color: '#D35400' },
  APEX: { title: 'Apex Race', emoji: '🏎️', blurb: 'Race friends on the same track at the same time. Fastest lap time takes the pot.', color: '#E8501A' },
  WHOT: { title: 'Whot', emoji: '🃏', blurb: 'Match the shape or number. Empty your hand first.', color: '#8E44AD' },
  LUDO: { title: 'Ludo', emoji: '🎲', blurb: '2 to 4 players. Race home.', color: '#C0392B' },
};
