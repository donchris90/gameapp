import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine, IllegalMove, MoveResult } from './engine';

export interface TicTacToeState {
  /** Seat number (0 or 1) that owns each of the 9 cells, or null when empty. */
  board: Array<number | null>;
  turn: number;
  moves: number;
  winLine: number[] | null;
}

export const WIN_LINES: ReadonlyArray<readonly number[]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** Seat 0 plays X, seat 1 plays O. The player who moves first is chosen at random. */
export class TicTacToeEngine implements GameEngine<TicTacToeState> {
  readonly game: GameType = 'TICTACTOE';

  init(playerCount: number, ctx: EngineContext): { state: TicTacToeState; turnSeat: number | null } {
    if (playerCount !== 2) throw new Error('Tic Tac Toe is a two player game');
    const first = ctx.randomInt(2);
    return { state: { board: Array(9).fill(null), turn: first, moves: 0, winLine: null }, turnSeat: first };
  }

  applyMove(state: TicTacToeState, seat: number, move: unknown, _ctx?: EngineContext): MoveResult<TicTacToeState> {
    const cell = (move as { cell?: unknown } | null)?.cell;
    if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 8) {
      throw new IllegalMove('BAD_MOVE', 'Pick a square from 0 to 8');
    }
    if (seat !== state.turn) throw new IllegalMove('NOT_YOUR_TURN', 'It is not your turn');
    if (state.board[cell] !== null) throw new IllegalMove('CELL_TAKEN', 'That square is already taken');

    const board = state.board.slice();
    board[cell] = seat;
    const moves = state.moves + 1;
    const winLine = WIN_LINES.find((line) => line.every((i) => board[i] === seat)) ?? null;

    if (winLine) return { state: { board, turn: seat, moves, winLine: [...winLine] }, turnSeat: null, outcome: { type: 'WIN', winnerSeat: seat } };
    if (moves === 9) return { state: { board, turn: seat, moves, winLine: null }, turnSeat: null, outcome: { type: 'DRAW' } };
    const turn = 1 - seat;
    return { state: { board, turn, moves, winLine: null }, turnSeat: turn };
  }

  publicState(state: TicTacToeState) {
    return { board: state.board, marks: { 0: 'X', 1: 'O' }, turn: state.turn, moves: state.moves, winLine: state.winLine };
  }
}
