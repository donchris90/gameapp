import { TUBE_CAPACITY } from '../src/games/watersort.engine';

type Tubes = number[][];
const top = (t: number[]) => t[t.length - 1];
const run = (t: number[]) => { let n = 0; for (let i = t.length - 1; i >= 0 && t[i] === top(t); i--) n++; return n; };
const done = (t: number[]) => t.length === 0 || (t.length === TUBE_CAPACITY && t.every((c) => c === t[0]));
const key = (tubes: Tubes) => tubes.map((t) => t.join('')).sort().join('|');

function moves(tubes: Tubes): Array<[number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let f = 0; f < tubes.length; f++) {
    if (tubes[f].length === 0 || (tubes[f].length === TUBE_CAPACITY && done(tubes[f]))) continue;
    for (let t = 0; t < tubes.length; t++) {
      if (f === t || tubes[t].length >= TUBE_CAPACITY) continue;
      if (tubes[t].length > 0 && top(tubes[t]) !== top(tubes[f])) continue;
      // moving a whole uniform tube onto an empty tube gets nowhere
      if (tubes[t].length === 0 && run(tubes[f]) === tubes[f].length) continue;
      // prefer pours onto matching colours
      out.push([f, t, tubes[t].length > 0 ? 0 : 1]);
    }
  }
  return out.sort((a, b) => a[2] - b[2]).map(([f, t]) => [f, t]);
}

function apply(tubes: Tubes, f: number, t: number): Tubes {
  const next = tubes.map((x) => x.slice());
  const c = top(next[f]);
  const n = Math.min(run(next[f]), TUBE_CAPACITY - next[t].length);
  next[f].splice(next[f].length - n, n);
  next[t].push(...Array(n).fill(c));
  return next;
}

/** Finds a list of [from, to] pours that solves the puzzle, or null if the search gives up. */
export function solve(start: Tubes, maxNodes = 200_000): Array<[number, number]> | null {
  const seen = new Set<string>();
  let nodes = 0;
  const path: Array<[number, number]> = [];
  const dfs = (tubes: Tubes): boolean => {
    if (tubes.every(done)) return true;
    if (++nodes > maxNodes) return false;
    const k = key(tubes);
    if (seen.has(k)) return false;
    seen.add(k);
    for (const [f, t] of moves(tubes)) {
      path.push([f, t]);
      if (dfs(apply(tubes, f, t))) return true;
      path.pop();
    }
    return false;
  };
  return dfs(start) ? path : null;
}
