import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Text, View } from 'react-native';
import * as THREE from 'three';
import { loadCarModel, MODEL_ERRORS } from './model';
import { lookFor } from './cars';
import { makeHeroCar } from './scene';
import { CarStyle, styleKey } from './style';

export type PreviewView = 'spin' | 'front' | 'side' | 'rear' | 'top';
/** Camera spots for the fixed views, as [camera position, look-at point]. The car's nose points towards +z. */
const SPOTS: Record<PreviewView, [number[], number[]]> = {
  spin: [[5.8, 3.6, 7.6], [0, 0.6, 0]],
  front: [[0, 1.5, 9.4], [0, 0.6, 0]],
  side: [[9.4, 1.4, 0], [0, 0.6, 0]],
  rear: [[0, 1.7, -9.4], [0, 0.6, 0]],
  top: [[0, 11.5, 0.01], [0, 0, 0]],
};

/**
 * The garage's 3D car. It draws the stage at once and adds the car when its file has loaded. When the style, paint or upgrades change
 * the car is rebuilt in place (the graphics context is kept, so nothing flickers). One finger turns the car; `view` picks a camera spot and
 * `zoom` moves the camera in or out.
 */
export function CarPreview({ color, carId = 'cts', upgrades = [], tier = 2, height = 190, style, view = 'spin', zoom = 1 }: { color: number; carId?: string; upgrades?: number[]; tier?: number; height?: number; style?: CarStyle; view?: PreviewView; zoom?: number }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const alive = useRef(true);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const carRef = useRef<THREE.Group | null>(null);
  const frameRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 1, height });
  const readyRef = useRef(false);
  const turn = useRef({ yaw: Math.PI, dragging: false });
  const latest = useRef({ color, carId, upgrades, tier, style, view, zoom });
  latest.current = { color, carId, upgrades, tier, style, view, zoom };

  const placeCamera = useCallback(() => {
    const cam = cameraRef.current; if (!cam) return;
    const { view: v, zoom: z } = latest.current;
    const [p, t] = SPOTS[v] ?? SPOTS.spin; const k = Math.max(0.45, Math.min(1.8, z));
    cam.position.set(t[0] + (p[0] - t[0]) * k, t[1] + (p[1] - t[1]) * k, t[2] + (p[2] - t[2]) * k);
    cam.lookAt(t[0], t[1], t[2]); cam.updateProjectionMatrix();
  }, []);

  /** (Re)builds the car from the latest props and swaps it into the scene. */
  const rebuild = useCallback(() => {
    const scene = sceneRef.current; if (!scene || !readyRef.current) return;
    const { color: c, carId: id, upgrades: up, tier: t, style: st } = latest.current;
    if (carRef.current) { scene.remove(carRef.current); carRef.current = null; }
    const car = makeHeroCar(st?.paint ?? c, t, id, { ...lookFor(up), style: st });
    car.group.position.y = 0.04;
    scene.add(car.group); carRef.current = car.group;
  }, []);

  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;
    const width = gl.drawingBufferWidth || sizeRef.current.width;
    const heightPx = gl.drawingBufferHeight || sizeRef.current.height;
    const canvas: any = { width, height: heightPx, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientWidth: width, clientHeight: heightPx, getContext: () => gl };
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: false, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, heightPx, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101a31');
    const camera = new THREE.PerspectiveCamera(34, width / Math.max(1, heightPx), 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x15172c, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(4, 8, 5); scene.add(key);
    const rim = new THREE.PointLight(0x398bff, 12, 20); rim.position.set(-5, 3, -4); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: 0x121a2d, metalness: 0.4, roughness: 0.55 })); floor.name = '__preview_floor';
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.025, 8, 80), new THREE.MeshBasicMaterial({ color: 0x328cff, transparent: true, opacity: 0.85 })); ring.name = '__preview_ring';
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
    rendererRef.current = renderer; sceneRef.current = scene; cameraRef.current = camera;
    placeCamera();
    // The real car file can take a few seconds to read, so the stage is drawn first and the car is added when it is ready.
    void (async () => {
      try {
        await loadCarModel(latest.current.carId);
        if (!alive.current || sceneRef.current !== scene) return;
        setErr(MODEL_ERRORS[latest.current.carId] ?? '');
        readyRef.current = true; rebuild(); setBusy(false);
      } catch (e) { if (alive.current) { setErr(String((e as Error)?.message ?? e).slice(0, 200)); setBusy(false); } }
    })();
    let last = Date.now();
    const draw = () => {
      const r = rendererRef.current; const g = glRef.current; const s = sceneRef.current; const c = cameraRef.current;
      if (!r || !g || !s || !c) return;
      const now = Date.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (latest.current.view === 'spin' && !turn.current.dragging) turn.current.yaw += dt * 0.42;
      if (carRef.current) carRef.current.rotation.y = turn.current.yaw;
      r.render(s, c); g.endFrameEXP();
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
  }, [placeCamera, rebuild]);

  // the car changes: rebuild it in place
  const sig = `${carId}|${color}|${tier}|${upgrades.join(',')}|${style ? styleKey(style) : ''}`;
  useEffect(() => { rebuild(); }, [sig, rebuild]);
  // a fixed view faces the car front-on to that side; a new camera spot or zoom moves the camera
  useEffect(() => {
    if (view !== 'spin') turn.current.yaw = Math.PI;
    placeCamera();
  }, [view, zoom, placeCamera]);

  useEffect(() => { alive.current = true; }, []);
  useEffect(() => () => {
    alive.current = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    // The preview's floor/ring are private to this scene. Do not dispose car materials here:
    // car meshes may use module-level shared materials also used by the live race renderer.
    const scene = sceneRef.current;
    scene?.traverse((object) => {
      if (object.name === '__preview_floor' || object.name === '__preview_ring') {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((material) => material.dispose());
      }
    });
    rendererRef.current?.dispose();
    rendererRef.current = null; glRef.current = null; sceneRef.current = null; cameraRef.current = null; carRef.current = null; readyRef.current = false;
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { turn.current.dragging = true; },
    onPanResponderMove: (_e, g) => { turn.current.yaw += (g.dx - (lastDx.current || 0)) * 0.012; lastDx.current = g.dx; },
    onPanResponderRelease: () => { turn.current.dragging = false; lastDx.current = 0; },
    onPanResponderTerminate: () => { turn.current.dragging = false; lastDx.current = 0; },
  }), []);
  const lastDx = useRef(0);

  const onLayout = (event: LayoutChangeEvent) => {
    sizeRef.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
    const renderer = rendererRef.current; const camera = cameraRef.current;
    if (renderer && camera) {
      renderer.setSize(Math.max(1, sizeRef.current.width), Math.max(1, sizeRef.current.height), false);
      camera.aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height); camera.updateProjectionMatrix();
    }
  };

  return <View onLayout={onLayout} style={{ height, overflow: 'hidden', borderRadius: 14 }} {...pan.panHandlers}>
    <GLView style={{ flex: 1 }} pointerEvents="none" onContextCreate={onContextCreate} />
    {busy && !err ? <Text style={{ position: 'absolute', alignSelf: 'center', top: '45%', color: '#9db4d8', fontSize: 12, fontWeight: '700' }}>Loading car…</Text> : null}
    {err ? <Text style={{ position: 'absolute', left: 8, right: 8, bottom: 6, color: '#ff8a80', fontSize: 10, backgroundColor: '#000a', padding: 4, borderRadius: 6 }}>3D model failed: {err}</Text> : null}
  </View>;
}
