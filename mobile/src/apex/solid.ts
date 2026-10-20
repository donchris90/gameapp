import { CAR_HALF_L, CAR_HALF_W, ROAD_HALF, Racer } from './sim';

/**
 * Cars are solid: two cars never share the same space. Only the computer drivers give way (the player's own run is
 * never changed, so a race can still be re-checked from the player's inputs alone).
 */
export function keepApart(me: Racer, rivals: Racer[]) {
  const all = [me, ...rivals];
  const long = CAR_HALF_L * 2 + 0.2, wide = CAR_HALF_W * 2 + 0.15, edge = ROAD_HALF - CAR_HALF_W;
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    const dz = a.z - b.z, dx = a.x - b.x;
    if (Math.abs(dz) >= long || Math.abs(dx) >= wide) continue;
    const front = dz >= 0 ? a : b, rear = dz >= 0 ? b : a;
    const side = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);          // the direction a moves away from b
    const awayA = side, awayB = -side;
    const shove = (r: Racer, dir: number, amt: number) => { r.x = Math.max(-edge, Math.min(edge, r.x + dir * amt)); };
    // the car behind never passes through the one ahead: it is held back to its speed
    if (rear !== me) { rear.z = Math.min(rear.z, front.z - long); rear.v = Math.min(rear.v, front.v * 0.97); }
    if (a !== me) shove(a, awayA, 0.16);
    if (b !== me) shove(b, awayB, 0.16);
  }
}

