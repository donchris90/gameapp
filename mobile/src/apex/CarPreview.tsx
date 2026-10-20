import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import * as THREE from 'three';
import { loadCarModel, MODEL_ERRORS } from './model';
import { lookFor } from './cars';
import { makeHeroCar } from './scene';

/** Lightweight, rotating Three.js vehicle preview for the garage and workshop. */
export function CarPreview({ color, carId = 'cts', upgrades = [], tier = 2, height = 190 }: { color: number; carId?: string; upgrades?: number[]; tier?: number; height?: number }) {
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
    camera.position.set(5.8, 3.6, 7.6);
    camera.lookAt(0, 0.6, 0);
    scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x15172c, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(4, 8, 5); scene.add(key);
    const rim = new THREE.PointLight(0x398bff, 12, 20); rim.position.set(-5, 3, -4); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: 0x121a2d, metalness: 0.4, roughness: 0.55 })); floor.name = '__preview_floor';
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.025, 8, 80), new THREE.MeshBasicMaterial({ color: 0x328cff, transparent: true, opacity: 0.85 })); ring.name = '__preview_ring';
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
    rendererRef.current = renderer; sceneRef.current = scene; cameraRef.current = camera;
    // The real car file can take a few seconds to read, so the stage is drawn first and the car is added when it is ready.
    void (async () => {
      try {
        await loadCarModel(carId);
        if (!alive.current || sceneRef.current !== scene) return;
        setErr(MODEL_ERRORS[carId] ?? '');
        const car = makeHeroCar(color, tier, carId, lookFor(upgrades));
        car.group.rotation.y = Math.PI;
        car.group.position.y = 0.04;
        scene.add(car.group);
        carRef.current = car.group;
        setBusy(false);
      } catch (e) { if (alive.current) { setErr(String((e as Error)?.message ?? e).slice(0, 200)); setBusy(false); } }
    })();
    let last = Date.now();
    const draw = () => {
      const r = rendererRef.current; const g = glRef.current; const s = sceneRef.current; const c = cameraRef.current;
      if (!r || !g || !s || !c) return;
      const now = Date.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (carRef.current) carRef.current.rotation.y += dt * 0.42;
      r.render(s, c); g.endFrameEXP();
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
  }, [color, tier, carId, upgrades]);

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
    rendererRef.current = null; glRef.current = null; sceneRef.current = null; cameraRef.current = null; carRef.current = null;
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    sizeRef.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
    const renderer = rendererRef.current; const camera = cameraRef.current;
    if (renderer && camera) {
      renderer.setSize(Math.max(1, sizeRef.current.width), Math.max(1, sizeRef.current.height), false);
      camera.aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height); camera.updateProjectionMatrix();
    }
  };

  return <View onLayout={onLayout} style={{ height, overflow: 'hidden', borderRadius: 14 }}><GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />{busy && !err ? <Text style={{ position: 'absolute', alignSelf: 'center', top: '45%', color: '#9db4d8', fontSize: 12, fontWeight: '700' }}>Loading car…</Text> : null}{err ? <Text style={{ position: 'absolute', left: 8, right: 8, bottom: 6, color: '#ff8a80', fontSize: 10, backgroundColor: '#000a', padding: 4, borderRadius: 6 }}>3D model failed: {err}</Text> : null}</View>;
}
