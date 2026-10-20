import * as THREE from 'three';

/**
 * Some Android drivers answer getShaderPrecisionFormat (and a few other early capability queries) with nothing while the
 * graphics context is still settling. three.js then fails with "Cannot read property 'precision' of undefined".
 * This fills in safe answers so the renderer can start, and retries once if it still fails.
 */
export function makeRenderer(gl: any, canvas: any, opts: THREE.WebGLRendererParameters = {}): THREE.WebGLRenderer {
  const spf = gl.getShaderPrecisionFormat?.bind(gl);
  gl.getShaderPrecisionFormat = (...a: any[]) => spf?.(...a) ?? { rangeMin: 127, rangeMax: 127, precision: 23 };
  const gp = gl.getParameter?.bind(gl);
  gl.getParameter = (p: number) => { const v = gp?.(p); return v === undefined ? null : v; };
  const make = () => new THREE.WebGLRenderer({ ...opts, canvas, context: gl });
  try { return make(); } catch { return make(); }
}
