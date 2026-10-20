import React, { useMemo } from 'react';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { TrackPath, pointAt } from './trackpath';

export interface Dot { z: number; color: string; r: number }

/** A small top-down map of the track with every car as a dot. */
export function MiniMap({ path, dots, size = 96 }: { path: TrackPath; dots: Dot[]; size?: number }) {
  const fit = useMemo(() => {
    const xs = path.pts.map((p) => p[0]), zs = path.pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const span = Math.max(60, maxX - minX, maxZ - minZ), pad = 10, k = (100 - pad * 2) / span;
    const ox = pad + ((100 - pad * 2) - (maxX - minX) * k) / 2, oz = pad + ((100 - pad * 2) - (maxZ - minZ) * k) / 2;
    const map = (p: [number, number]) => [ox + (p[0] - minX) * k, oz + (p[1] - minZ) * k] as [number, number];
    const line = path.pts.concat(path.closed ? [path.pts[0]] : []).map(map).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    return { map, line };
  }, [path]);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Polyline points={fit.line} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <Polyline points={fit.line} fill="none" stroke="#c9cfdf" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      {dots.map((d, i) => { const p = fit.map(pointAt(path, d.z)); return <Circle key={i} cx={p[0]} cy={p[1]} r={d.r} fill={d.color} stroke={d.r > 5 ? '#07090f' : 'none'} strokeWidth={1.5} />; })}
    </Svg>
  );
}
