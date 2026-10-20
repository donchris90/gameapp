import { CIRCUIT } from './circuit';
import { World, curvatureAt } from './sim';

/** The centre line of a track as points in the scene (x, z), for the minimap. A circuit is read from its table, other tracks are walked bend by bend. */
export interface TrackPath { pts: Array<[number, number]>; step: number; closed: boolean; length: number; wrap?: number }

export function trackPath(world: Pick<World, 'curves' | 'lapLength' | 'length' | 'loop'>, step = 8): TrackPath {
  if (world.loop) {
    const pts = CIRCUIT.x.map((x, i) => [x, CIRCUIT.z[i]] as [number, number]);
    return { pts, step: CIRCUIT.step, closed: true, length: CIRCUIT.length };
  }
  const pts: Array<[number, number]> = []; let x = 0, z = 0, th = 0;
  const span = world.lapLength || world.length; // a road split into laps: one lap is drawn, and every lap runs over it
  for (let d = 0; d <= span; d += step) {
    pts.push([x, z]);
    const next = th + curvatureAt(world, d + step / 2) * step, mid = (th + next) / 2;
    x += step * Math.sin(mid); z -= step * Math.cos(mid); th = next;
  }
  return { pts, step, closed: false, length: span, wrap: world.lapLength || undefined };
}

/** Where a car that is `z` metres down the road is on the path. */
export function pointAt(p: TrackPath, z: number): [number, number] {
  const n = p.pts.length;
  if (p.wrap) z = ((z % p.wrap) + p.wrap) % p.wrap;
  const f = p.closed ? ((z % p.length) + p.length) % p.length / p.step : Math.max(0, Math.min(n - 1.001, z / p.step));
  const i = Math.floor(f), u = f - i, a = p.pts[i % n], b = p.pts[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
