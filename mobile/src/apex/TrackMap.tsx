import React, { useMemo } from 'react';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { CIRCUIT } from './circuit';
import { curvatureAt, curvesFor, levelSpec } from './sim';

/** A small top-down drawing of a track, built by walking down the same bends the race uses. */
export function TrackMap({ track, height = 120, color = '#5eaaff', locked = false }: { track: string; height?: number; color?: string; locked?: boolean }) {
  const { points, start, end } = useMemo(() => {
    const length = levelSpec(30).length, curves = curvesFor(track, length), w = { curves };
    let pts: Array<[number, number]> = []; let x = 0, y = 0, th = 0; const step = 12;
    if (track === 'circuit') pts = CIRCUIT.x.map((px, i) => [px, CIRCUIT.z[i]] as [number, number]).concat([[CIRCUIT.x[0], CIRCUIT.z[0]]]);
    else for (let z = 0; z <= length; z += step) {
      pts.push([x, y]);
      const next = th + curvatureAt(w, z + step / 2) * step, mid = (th + next) / 2;
      x += step * Math.sin(mid); y -= step * Math.cos(mid); th = next;
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(60, maxX - minX, maxY - minY), pad = 8, size = 100 - pad * 2;
    const nx = (p: [number, number]) => pad + ((p[0] - minX) / span) * size + (size - ((maxX - minX) / span) * size) / 2;
    const ny = (p: [number, number]) => pad + ((p[1] - minY) / span) * size + (size - ((maxY - minY) / span) * size) / 2;
    const mapped = pts.map((p) => [nx(p), ny(p)] as [number, number]);
    return { points: mapped.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), start: mapped[0], end: mapped[mapped.length - 1] };
  }, [track]);
  const c = locked ? '#59627a' : color;
  return (
    <Svg width={height} height={height} viewBox="0 0 100 100">
      <Polyline points={points} fill="none" stroke="#0b1226" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <Polyline points={points} fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={start[0]} cy={start[1]} r={4.5} fill="#3ddc97" />
      <Circle cx={end[0]} cy={end[1]} r={4.5} fill="#ffffff" stroke="#111" strokeWidth={1.5} />
    </Svg>
  );
}
