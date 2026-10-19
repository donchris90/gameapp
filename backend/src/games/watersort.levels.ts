/**
 * Water Sort levels. Every level is a puzzle that is proven winnable, and they get harder as the player goes on:
 *  - level 1 has 4 tubes (2 colours + 2 empty); a new colour joins every 3 levels, up to 10 colours
 *  - from level 60 there is only 1 empty tube to start with
 *  - the same level is always the same puzzle, so a retry is fair
 * Colours are numbers 0..9. A tube holds 4 layers, listed bottom to top.
 */
export const CAPACITY = 4;
export const MAX_COLORS = 10;
export const MAX_TUBES = 14; // including tubes the player adds
export const MAX_ADDED_TUBES = 2;

type Tube = number[];
type State = Tube[];
export interface LevelSpec { colors: number; spare: number; tubes: number; scramble: number }

export function levelSpec(level: number): LevelSpec {
  const L = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  const colors = Math.min(MAX_COLORS, 2 + Math.floor((L - 1) / 3));
  const spare = L >= 60 ? 1 : 2;
  return { colors, spare, tubes: colors + spare, scramble: Math.min(300, 16 + colors * 8 + L * 3) };
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const canPour = (from: Tube, to: Tube) => from.length > 0 && to.length < CAPACITY && (to.length === 0 || to[to.length - 1] === from[from.length - 1]);
export const isComplete = (t: Tube) => t.length === CAPACITY && t.every((c) => c === t[0]);
const topRun = (t: Tube) => { let n = 0; for (let i = t.length - 1; i >= 0 && t[i] === t[t.length - 1]; i--) n++; return n; };

/** Pours the whole top run as far as it fits. Mutates `state`. Returns how many layers moved. */
export function pour(state: State, f: number, t: number): number {
  const from = state[f], to = state[t];
  if (!canPour(from, to)) return 0;
  const colour = from[from.length - 1];
  let n = 0;
  while (from.length && from[from.length - 1] === colour && to.length < CAPACITY) { to.push(from.pop()!); n++; }
  return n;
}

export const isSolvedBoard = (state: State) => {
  const seen = new Set<number>();
  for (const t of state) {
    if (!t.length) continue;
    if (!isComplete(t) || seen.has(t[0])) return false;
    seen.add(t[0]);
  }
  return true;
};

/** Real moves only: a finished tube is locked, and tipping a one-colour tube into an empty one changes nothing. */
export const hasMoves = (state: State) =>
  state.some((f, i) => !isComplete(f) && state.some((t, j) => i !== j && canPour(f, t) && !(t.length === 0 && f.every((c) => c === f[0]))));

const tooSorted = (s: State) => s.some(isComplete);
const stateKey = (s: State) => s.map((t) => t.join(',')).sort().join('|');

/** Depth-first search with the game's own rules. True only if it really reaches a solved board. */
export function isSolvable(start: State, limit = 20000): boolean {
  const seen = new Set<string>([stateKey(start)]);
  const stack: State[] = [start.map((t) => [...t])];
  let nodes = 0;
  while (stack.length) {
    const st = stack.pop()!;
    if (isSolvedBoard(st)) return true;
    if (++nodes > limit) return false;
    const cand: Array<[number, number, number]> = [];
    for (let f = 0; f < st.length; f++) for (let t = 0; t < st.length; t++) {
      if (f === t || isComplete(st[f]) || !canPour(st[f], st[t])) continue;
      const uniform = st[f].every((c) => c === st[f][0]);
      if (!st[t].length && uniform) continue;
      cand.push([(st[t].length ? 2 : 0) + (uniform ? 0 : 1), f, t]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, f, t] of cand) {
      const next = st.map((x) => [...x]);
      pour(next, f, t);
      const k = stateKey(next);
      if (!seen.has(k)) { seen.add(k); stack.push(next); }
    }
  }
  return false;
}

function backwardWalk(colors: number[], spare: number, maxSteps: number, random: () => number) {
  const state: State = colors.map((c) => [c, c, c, c]).concat(Array.from({ length: spare }, () => [] as Tube));
  const forward: Array<[number, number]> = [];
  let lastFrom = -1, lastTo = -1;
  for (let step = 0; step < maxSteps; step++) {
    const moves: Array<[number, number, number]> = [];
    for (let b = 0; b < state.length; b++) {
      const B = state[b];
      if (!B.length) continue;
      const c = B[B.length - 1], run = topRun(B);
      for (let k = 1; k <= run; k++) {
        if (!(k < run || k === B.length)) continue;
        for (let a = 0; a < state.length; a++) {
          if (a === b) continue;
          const A = state[a];
          if (A.length + k > CAPACITY) continue;
          if (A.length && A[A.length - 1] === c && B.length !== CAPACITY) continue;
          if (b === lastTo && a === lastFrom) continue;
          moves.push([b, a, k]);
        }
      }
    }
    if (!moves.length) break;
    const [b, a, k] = moves[Math.floor(random() * moves.length)];
    for (let i = 0; i < k; i++) state[a].push(state[b].pop()!);
    forward.push([a, b]);
    lastFrom = b; lastTo = a;
  }
  return { state, forward };
}

const runsOf = (s: State) => { let r = 0; for (const t of s) for (let i = 0; i < t.length; i++) if (i === 0 || t[i] !== t[i - 1]) r++; return r; };
const replaysToSolved = (start: State, forward: Array<[number, number]>) => {
  const s = start.map((t) => [...t]);
  for (let i = forward.length - 1; i >= 0; i--) if (!pour(s, forward[i][0], forward[i][1])) return false;
  return isSolvedBoard(s);
};

/** Built by playing backwards from the solved board, so it can always be solved. */
function guaranteedPuzzle(level: number): State {
  const spec = levelSpec(level);
  const colors = Array.from({ length: spec.colors }, (_, i) => i);
  const random = mulberry32((level * 2654435761) >>> 0);
  let best: State | null = null, bestRuns = -1;
  for (let attempt = 0; attempt < 60; attempt++) {
    const { state, forward } = backwardWalk(colors, spec.spare, spec.scramble * 3, random);
    if (tooSorted(state)) continue;
    const runs = runsOf(state);
    if (runs <= bestRuns || !replaysToSolved(state, forward)) continue;
    best = state; bestRuns = runs;
  }
  if (best) return best;
  const base: State = colors.map((c) => [c, c, c, c]).concat(Array.from({ length: spec.spare }, () => [] as Tube));
  base[spec.colors].push(base[0].pop()!);
  base[0].push(base[1].pop()!);
  return base;
}

/** The puzzle for a level: a well mixed random deal if it is proven winnable, otherwise a backwards-built one. */
export function makeLevelPuzzle(level: number): State {
  const spec = levelSpec(level);
  const colors = Array.from({ length: spec.colors }, (_, i) => i);
  const random = mulberry32(((level * 2654435761) ^ 0x9e3779b9) >>> 0);
  const units = colors.flatMap((c) => [c, c, c, c]);
  for (let attempt = 0; attempt < 30; attempt++) {
    const mixed = shuffle(units, random);
    const deal: State = colors.map((_, i) => mixed.slice(i * CAPACITY, (i + 1) * CAPACITY)).concat(Array.from({ length: spec.spare }, () => [] as Tube));
    if (isSolvedBoard(deal) || tooSorted(deal)) continue;
    if (isSolvable(deal)) return deal;
  }
  return guaranteedPuzzle(level);
}
