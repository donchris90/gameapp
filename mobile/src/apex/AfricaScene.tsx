import * as THREE from 'three';
import { makeRenderer } from './glfix';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CarStyle, LAMPS } from './style';
import { loadCarModel } from './model';
import './cars';

export type AfricaRegionId = 'accra' | 'abidjan' | 'dakar' | 'nairobi' | 'cairo' | 'atlas' | 'namib' | 'victoria' | 'cape' | 'johannesburg';
type Biome = 'coastal-city' | 'tropical-city' | 'savanna' | 'desert' | 'mountain' | 'coast' | 'waterfall' | 'modern-city';
export type AfricaRegion = { id: AfricaRegionId; city: string; country: string; title: string; biome: Biome; sky: number; ground: number; road: number; accent: number; landmark: string; checkpoints: [string, string, string] };
export const AFRICA_REGIONS: AfricaRegion[] = [
  { id: 'accra', city: 'Accra', country: 'Ghana', title: 'Coastal Welcome', biome: 'coastal-city', sky: 0x87c8e7, ground: 0xbca77a, road: 0x353a43, accent: 0xe4a34d, landmark: 'COASTAL GATE', checkpoints: ['INDEPENDENCE AVENUE', 'FISHING HARBOUR', 'COASTAL GATE'] },
  { id: 'abidjan', city: 'Abidjan', country: 'Côte d’Ivoire', title: 'Lagoon Night Sprint', biome: 'tropical-city', sky: 0x5b6f91, ground: 0x4c594b, road: 0x252b38, accent: 0x48c9ad, landmark: 'LAGOON BRIDGE', checkpoints: ['PLATEAU DISTRICT', 'LAGOON BRIDGE', 'NIGHT MARKET'] },
  { id: 'dakar', city: 'Dakar', country: 'Senegal', title: 'Atlantic Dust Run', biome: 'desert', sky: 0xe7b77d, ground: 0xcba36c, road: 0x51473d, accent: 0xf1d08b, landmark: 'PINK LAKE ROAD', checkpoints: ['FISHING QUARTER', 'RED DUNE PASS', 'PINK LAKE ROAD'] },
  { id: 'nairobi', city: 'Nairobi', country: 'Kenya', title: 'Savanna Crossing', biome: 'savanna', sky: 0x94c9e6, ground: 0x78814d, road: 0x363a3c, accent: 0xe5c36d, landmark: 'ACACIA RIDGE', checkpoints: ['CITY OUTSKIRTS', 'ACACIA RIDGE', 'SAVANNA LOOKOUT'] },
  { id: 'cairo', city: 'Cairo', country: 'Egypt', title: 'Signal in the Sand', biome: 'desert', sky: 0xe8c59b, ground: 0xcab184, road: 0x514a43, accent: 0xd9a45d, landmark: 'PYRAMID ROAD', checkpoints: ['OLD CITY GATE', 'DESERT HIGHWAY', 'PYRAMID ROAD'] },
  { id: 'atlas', city: 'Atlas Pass', country: 'Morocco', title: 'The Atlas Ascent', biome: 'mountain', sky: 0x9bb6ce, ground: 0x716a58, road: 0x393d43, accent: 0xd3b28a, landmark: 'ATLAS SUMMIT', checkpoints: ['RED ROCK BEND', 'MOUNTAIN VILLAGE', 'ATLAS SUMMIT'] },
  { id: 'namib', city: 'Namib Coast', country: 'Namibia', title: 'Last Light', biome: 'coast', sky: 0xe5a879, ground: 0xb78b61, road: 0x3c3e42, accent: 0xf0c68a, landmark: 'SKELETON COAST', checkpoints: ['SANDSTONE TRACK', 'COASTAL LIGHTHOUSE', 'SKELETON COAST'] },
  { id: 'victoria', city: 'Victoria Falls', country: 'Zambia / Zimbabwe', title: 'The Edge of the Map', biome: 'waterfall', sky: 0x91c6e5, ground: 0x5e7d4d, road: 0x343a3e, accent: 0x55d4c0, landmark: 'FALLS OVERLOOK', checkpoints: ['RIVER ROAD', 'RAINFOREST GATE', 'FALLS OVERLOOK'] },
  { id: 'cape', city: 'Cape Town', country: 'South Africa', title: 'Cape Storm', biome: 'mountain', sky: 0x9ac4df, ground: 0x59785e, road: 0x333941, accent: 0x66c5df, landmark: 'TABLE MOUNTAIN ROAD', checkpoints: ['HARBOUR FRONT', 'MOUNTAIN HAIRPIN', 'TABLE MOUNTAIN ROAD'] },
  { id: 'johannesburg', city: 'Johannesburg', country: 'South Africa', title: 'King of the Continent', biome: 'modern-city', sky: 0x7e9db6, ground: 0x667052, road: 0x292f38, accent: 0xffc56d, landmark: 'CHAMPIONSHIP CIRCUIT', checkpoints: ['GOLD REEF AVENUE', 'DOWNTOWN SKYLINE', 'CHAMPIONSHIP CIRCUIT'] },
];

type Controls = { left: boolean; right: boolean; gas: boolean; brake: boolean; nitro: boolean };
const CHECKPOINTS = [{ x: 0, z: -42 }, { x: 34, z: -104 }, { x: -28, z: -166 }];
// Routes use the connected boulevard/cross-street network but change the line for each region.
// This makes waypoint order and driving rhythm differ even while the environments stay mobile-friendly.
const REGION_ROUTES: Record<AfricaRegionId, Array<{ x: number; z: number }>> = {
  accra: [{ x: 0, z: -42 }, { x: 42, z: -105 }, { x: -42, z: -168 }],
  abidjan: [{ x: -42, z: -42 }, { x: 0, z: -105 }, { x: 84, z: -168 }],
  dakar: [{ x: 0, z: -42 }, { x: -84, z: -105 }, { x: 0, z: -168 }],
  nairobi: [{ x: 42, z: -42 }, { x: 84, z: -105 }, { x: -42, z: -168 }],
  cairo: [{ x: -42, z: -42 }, { x: 42, z: -105 }, { x: 84, z: -168 }],
  atlas: [{ x: 0, z: -42 }, { x: -42, z: -105 }, { x: -84, z: -168 }],
  namib: [{ x: 42, z: -42 }, { x: 0, z: -105 }, { x: 42, z: -168 }],
  victoria: [{ x: -42, z: -42 }, { x: -84, z: -105 }, { x: 42, z: -168 }],
  cape: [{ x: 84, z: -42 }, { x: 42, z: -105 }, { x: -42, z: -168 }],
  johannesburg: [{ x: 0, z: -42 }, { x: 84, z: -105 }, { x: -84, z: -168 }],
};
const MEDAL_TARGETS: Record<AfricaRegionId, { gold: number; silver: number }> = {
  accra: { gold: 27, silver: 43 }, abidjan: { gold: 25, silver: 40 }, dakar: { gold: 29, silver: 46 },
  nairobi: { gold: 28, silver: 44 }, cairo: { gold: 26, silver: 42 }, atlas: { gold: 32, silver: 50 },
  namib: { gold: 30, silver: 48 }, victoria: { gold: 31, silver: 49 }, cape: { gold: 33, silver: 52 },
  johannesburg: { gold: 24, silver: 39 },
};
function medalFor(regionId: AfricaRegionId, elapsed: number) {
  const target = MEDAL_TARGETS[regionId];
  return elapsed <= target.gold ? 'GOLD' : elapsed <= target.silver ? 'SILVER' : 'BRONZE';
}
function pointsFor(regionId: AfricaRegionId, elapsed: number) {
  const award = medalFor(regionId, elapsed);
  return award === 'GOLD' ? 3 : award === 'SILVER' ? 2 : 1;
}

const REGION_CHALLENGES: Record<AfricaRegionId, string> = {
  accra: 'CLEAN ARRIVAL · Finish with zero impacts for a 100-coin first-clear bonus.',
  abidjan: 'NIGHT BOOST · Use nitro for at least 2 seconds for a 100-coin first-clear bonus.',
  dakar: 'DESERT LINE · Spend no more than 3.5 seconds off-road for a 100-coin first-clear bonus.',
  nairobi: 'SAFE CROSSING · Finish with no more than one impact for a 100-coin first-clear bonus.',
  cairo: 'SIGNAL BOOST · Use nitro for at least 2.5 seconds for a 100-coin first-clear bonus.',
  atlas: 'MOUNTAIN CONTROL · Avoid impacts and stay off-road for less than 4 seconds for a 100-coin first-clear bonus.',
  namib: 'COASTLINE LINE · Spend no more than 3.5 seconds off-road for a 100-coin first-clear bonus.',
  victoria: 'EVIDENCE RUN · Finish with no more than one impact for a 100-coin first-clear bonus.',
  cape: 'HAIRPIN MASTER · Spend less than 4.5 seconds off-road for a 100-coin first-clear bonus.',
  johannesburg: 'CHAMPIONSHIP PACE · Finish within the silver time target for a 100-coin first-clear bonus.',
};
function regionChallengeComplete(regionId: AfricaRegionId, stats: { collisions: number; offroadSeconds: number; nitroSeconds: number }, elapsed: number) {
  switch (regionId) {
    case 'accra': return stats.collisions === 0;
    case 'abidjan': return stats.nitroSeconds >= 2;
    case 'dakar': return stats.offroadSeconds <= 3.5;
    case 'nairobi': return stats.collisions <= 1;
    case 'cairo': return stats.nitroSeconds >= 2.5;
    case 'atlas': return stats.collisions === 0 && stats.offroadSeconds < 4;
    case 'namib': return stats.offroadSeconds <= 3.5;
    case 'victoria': return stats.collisions <= 1;
    case 'cape': return stats.offroadSeconds < 4.5;
    case 'johannesburg': return elapsed <= MEDAL_TARGETS.johannesburg.silver;
    default: return false;
  }
}

const REGION_BRIEFINGS: Record<AfricaRegionId, { speaker: string; line: string; objective: string; debrief: string }> = {
  accra: { speaker: 'MARA', line: 'First stop outside Lagos. Let the driving speak for us. The local crews respect control more than noise.', objective: 'Pass Independence Avenue, the fishing harbour and the coastal gate.', debrief: 'Accra knows your name now. A contact in Abidjan has offered the crew a night invitation.' },
  abidjan: { speaker: 'DARIUS', line: 'You think crossing a border makes you a champion? The lagoon roads will show whether you can hold a line.', objective: 'Cross Plateau District, the lagoon bridge and the night market.', debrief: 'The sprint is over, but a message points north to a Dakar racer who knows the notebook trade.' },
  dakar: { speaker: 'AMADOU', line: 'Out here, the road changes under you. Do not fight the car. Read the surface and keep your nerve.', objective: 'Reach the fishing quarter, clear the red dune pass and finish at Pink Lake Road.', debrief: 'Amadou shares a lead toward Nairobi. Someone has been asking racers about Tomi’s father.' },
  nairobi: { speaker: 'AMARA', line: 'A sponsor is watching this run. Stay smooth through the city and do not let the traffic bait you into a mistake.', objective: 'Hit the city outskirts, Acacia Ridge and the savanna lookout.', debrief: 'The sponsor funds the next leg. The notebook’s coded signal was traced to Cairo.' },
  cairo: { speaker: 'ELENA', line: 'The signal repeats at three points along this route. Reach them in order; the mechanic will only talk when we prove we followed the trail.', objective: 'Pass the old city gate, desert highway and Pyramid Road.', debrief: 'The Cairo mechanic confirms Vanguard bought the stolen design. The next clue is hidden in Morocco.' },
  atlas: { speaker: 'RAFAEL', line: 'Mountain roads punish overconfidence. Brake before the bend, then let the car settle before you accelerate.', objective: 'Reach Red Rock Bend, the mountain village and Atlas Summit.', debrief: 'The shipping broker used the Atlas route. Elena has tracked the next shipment to Namibia.' },
  namib: { speaker: 'TOMI', line: 'The coast looks empty, but the broker moved parts through these roads. Keep moving and watch the route markers.', objective: 'Cross the sandstone track, lighthouse road and Skeleton Coast.', debrief: 'The shipment trail turns toward South Africa. Rafael says the Cape roads will test everything you have learned.' },
  victoria: { speaker: 'AMARA', line: 'We have the proof now. Get to the falls overlook and secure the last piece before Vanguard can erase the trail.', objective: 'Follow River Road, pass the rainforest gate and reach Falls Overlook.', debrief: 'The evidence is secured. Vanguard’s African representative has called for a final showdown in Johannesburg.' },
  cape: { speaker: 'RAFAEL', line: 'This is where good drivers become great ones. The hairpins are tight; keep your speed under control and finish clean.', objective: 'Cross the harbour front, mountain hairpin and Table Mountain Road.', debrief: 'You have mastered the Cape route. The continent’s final qualifier is waiting in Johannesburg.' },
  johannesburg: { speaker: 'TOMI', line: 'Every road brought us here. This run is our last regional test before the championship. Let’s show them what this crew is made of.', objective: 'Reach Gold Reef Avenue, the downtown skyline and the championship circuit gate.', debrief: 'You have completed the regional driving challenge. The African Championship story races decide the continental crown.' },
};
function box(scene: THREE.Scene, x: number, y: number, z: number, w: number, h: number, d: number, color: number, material?: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material ?? new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
  mesh.position.set(x, y, z); scene.add(mesh); return mesh;
}
function distanceToSegment(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared)) : 0;
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
}

function roadSegment(scene: THREE.Scene, a: { x: number; z: number }, b: { x: number; z: number }, width: number, material: THREE.Material, y = 0.015) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, Math.max(1, length)), material);
  mesh.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  scene.add(mesh);
  return mesh;
}

function makeTree(scene: THREE.Scene, x: number, z: number, kind: 'palm' | 'acacia' | 'pine', scale = 1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.38 * scale, 3.2 * scale, 7), new THREE.MeshStandardMaterial({ color: 0x66503b, roughness: 1 }));
  trunk.position.set(x, 1.6 * scale, z); scene.add(trunk);
  if (kind === 'palm') {
    for (let i = 0; i < 6; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.38 * scale, 3.8 * scale, 5), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x4f8051 : 0x65965a, roughness: 0.9 })); leaf.position.set(x + Math.sin(i * Math.PI / 3) * 1.25 * scale, 3.35 * scale, z + Math.cos(i * Math.PI / 3) * 1.25 * scale); leaf.rotation.z = Math.cos(i * Math.PI / 3) * 0.8; leaf.rotation.x = Math.sin(i * Math.PI / 3) * 0.8; scene.add(leaf); }
  } else if (kind === 'acacia') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.25 * scale, 8, 5), new THREE.MeshStandardMaterial({ color: 0x6e8550, roughness: 1 })); crown.scale.y = 0.48; crown.position.set(x, 3.65 * scale, z); scene.add(crown);
  } else {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.8 * scale, 4.2 * scale, 7), new THREE.MeshStandardMaterial({ color: 0x3f7655, roughness: 1 })); crown.position.set(x, 4.2 * scale, z); scene.add(crown);
  }
}
function createCar(scene: THREE.Scene, paint: number, style?: CarStyle) {
  const car = new THREE.Group();
  const fallback = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.62, 4.2), new THREE.MeshStandardMaterial({ color: paint, metalness: 0.48, roughness: 0.27 })); body.position.y = 0.78; fallback.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.65, 1.9), new THREE.MeshStandardMaterial({ color: 0x152a3d, metalness: 0.35, roughness: 0.25 })); cabin.position.set(0, 1.36, -0.25); fallback.add(cabin);
  const tire = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: style?.rimDesign ? style.rim : 0x7d8794, metalness: 0.8, roughness: 0.25 });
  for (const x of [-1.05, 1.05]) for (const z of [-1.35, 1.35]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12), tire); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.42, z); fallback.add(wheel); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.255, 12), rim); r.rotation.z = Math.PI / 2; r.position.set(x * 1.015, 0.42, z); fallback.add(r); }
  const lamps = LAMPS[style?.lamp ?? 0].hex;
  for (const x of [-0.72, 0.72]) { const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.08), new THREE.MeshBasicMaterial({ color: lamps })); light.position.set(x, 0.85, -2.12); fallback.add(light); }
  car.add(fallback);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 3.6), new THREE.MeshBasicMaterial({ color: style?.glow ?? 0x000000, transparent: true, opacity: 0.34, side: THREE.DoubleSide })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.1; glow.visible = Boolean(style?.glow); car.add(glow);
  scene.add(car); return { car, fallback };
}

/** Procedural African tour scene. Each destination swaps its own biome, landmarks, road dressing and skyline. */
export function AfricaScene({ carId, paint = 0x2788ff, style, completedRegions = [], bestTimes = {}, championshipPoints = {}, quality = 2, onExit, onWorkshop, onRegionComplete }: { carId: string; paint?: number; style?: CarStyle; completedRegions?: string[]; bestTimes?: Record<string, number>; championshipPoints?: Record<string, number>; quality?: number; onExit: () => void; onWorkshop: () => void; onRegionComplete: (regionId: AfricaRegionId, reward: number, elapsedSeconds: number, points: number) => void }) {
  const [regionId, setRegionId] = useState<AfricaRegionId>(() => (AFRICA_REGIONS.find((r) => !completedRegions.includes(r.id)) ?? AFRICA_REGIONS[0]).id);
  const completionSent = useRef(0);
  const runToken = useRef(0);
  const [lastCompletedRegion, setLastCompletedRegion] = useState<AfricaRegionId | null>(null);
  const [missionStarted, setMissionStarted] = useState(false);
  const [raceResult, setRaceResult] = useState<'WIN' | 'LOSE' | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  const missionStartedRef = useRef(false);
  const [hud, setHud] = useState({ speed: 0, checkpoint: 0, collision: false, nearWorkshop: false, elapsed: 0, rivalGap: 0 });
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const checkpointRingsRef = useRef<THREE.Mesh[]>([]);
  const alive = useRef(true);
  const win = useWindowDimensions(); const wide = win.width > win.height;
  const [glReady, setGlReady] = useState(false);
  // Wait until the phone is really in landscape before creating the 3D view, or it keeps its portrait size.
  useEffect(() => { if (!wide) return; const id = setTimeout(() => setGlReady(true), 200); return () => clearTimeout(id); }, [wide]);
  const glRef = useRef<any>(null);
  const resizeRef = useRef<((w: number, h: number) => void) | null>(null);
  const modelToken = useRef(0);
  const controls = useRef<Controls>({ left: false, right: false, gas: false, brake: false, nitro: false });
  const motion = useRef({ x: 0, z: 4, heading: 0, speed: 0, checkpoints: 0, elapsed: 0 });
  const rivalMotionRef = useRef({ x: 3.7, z: 9, segment: 0, progress: 0, elapsed: 0 });
  const missionStatsRef = useRef({ collisions: 0, offroadSeconds: 0, nitroSeconds: 0, collisionLatch: 0 });
  const region = AFRICA_REGIONS.find((item) => item.id === regionId) ?? AFRICA_REGIONS[0];
  const finished = hud.checkpoint >= 3;
  const routeCheckpoints = REGION_ROUTES[regionId] ?? CHECKPOINTS;
  const totalChampionshipPoints = AFRICA_REGIONS.reduce((sum, r) => sum + (championshipPoints[r.id] ?? 0), 0);
  const tourComplete = AFRICA_REGIONS.every((r) => completedRegions.includes(r.id));
  const challengeComplete = regionChallengeComplete(regionId, missionStatsRef.current, hud.elapsed);
  const runReward = challengeComplete ? 350 : 250;

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    alive.current = true;
    motion.current = { x: 0, z: 4, heading: 0, speed: 0, checkpoints: 0, elapsed: 0 };
    setHud({ speed: 0, checkpoint: 0, collision: false, nearWorkshop: false, elapsed: 0, rivalGap: 0 });
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const canvas: any = { width: w, height: h, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientWidth: w, clientHeight: h, getContext: () => gl };
    const renderer = makeRenderer(gl, canvas, { antialias: false });
    renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.setClearColor(region.sky, 1); renderer.shadowMap.enabled = false; rendererRef.current = renderer;
    const scene = new THREE.Scene(); sceneRef.current = scene; scene.background = new THREE.Color(region.sky); const qf = [0.6, 0.8, 1][Math.max(0, Math.min(2, Math.round(quality)))]; scene.fog = new THREE.Fog(region.sky, 125 * qf, 340 * qf);
    const camera = new THREE.PerspectiveCamera(62, w / Math.max(1, h), 0.1, 650 * qf); glRef.current = gl; resizeRef.current = (nw, nh) => { if (nw < 1 || nh < 1) return; renderer.setSize(nw, nh, false); camera.aspect = nw / nh; camera.updateProjectionMatrix(); };
    scene.add(new THREE.HemisphereLight(0xe6f3ff, region.ground, 2.0));
    const sun = new THREE.DirectionalLight(0xffe2bd, 2.15); sun.position.set(-35, 70, 25); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(650, 650), new THREE.MeshStandardMaterial({ color: region.ground, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; scene.add(ground);
    const asphalt = new THREE.MeshStandardMaterial({ color: region.road, roughness: 0.96 });
    const road = (x: number, z: number, width: number, depth: number) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, depth), asphalt); mesh.position.set(x, 0, z); scene.add(mesh); };
    // Main boulevard, two cross streets and a curved-looking switchback made from connected road sections.
    road(0, -105, 15, 310); road(0, -105, 310, 15); road(42, -105, 15, 310); road(-42, -105, 15, 310); road(0, -42, 310, 15); road(0, -168, 310, 15); road(84, -105, 15, 310); road(-84, -105, 15, 310);
    road(104, -202, 72, 12); road(137, -222, 12, 48); road(98, -244, 90, 12);
    // Lay a wider, region-specific racing line over the street network. The route bends and
    // diagonals differ per destination, so the tour is not just a different colour palette.
    const routeRoadMat = new THREE.MeshStandardMaterial({ color: region.road, roughness: 0.9 });
    const routeEdgeMat = new THREE.MeshStandardMaterial({ color: region.accent, roughness: 0.62, metalness: 0.12 });
    const routePoints = [{ x: 0, z: 4 }, ...routeCheckpoints];
    for (let i = 0; i < routePoints.length - 1; i++) {
      const a = routePoints[i], b = routePoints[i + 1];
      roadSegment(scene, a, b, 17, routeRoadMat, 0.035);
      // Bright shoulders make the intended racing line readable from the chase camera.
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.max(1, Math.hypot(dx, dz));
      const nx = -dz / len * 8.9, nz = dx / len * 8.9;
      roadSegment(scene, { x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz }, 0.34, routeEdgeMat, 0.105);
      roadSegment(scene, { x: a.x - nx, z: a.z - nz }, { x: b.x - nx, z: b.z - nz }, 0.34, routeEdgeMat, 0.105);
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2dca3 }); const dashGeo = new THREE.BoxGeometry(0.16, 0.035, 4); const dummy = new THREE.Object3D(); let idx = 0;
    const dashes = new THREE.InstancedMesh(dashGeo, lineMat, 5 * 33); for (const x of [-42, 0, 42, 84, -84]) for (let z = -250; z < 45; z += 9) { dummy.position.set(x, 0.09, z); dummy.updateMatrix(); dashes.setMatrixAt(idx++, dummy.matrix); } dashes.count = idx; scene.add(dashes);
    const sideLine = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.035, 0.16), lineMat, 3 * 33); idx = 0; for (const z of [-42, -105, -168]) for (let x = -145; x < 150; x += 9) { dummy.position.set(x, 0.09, z); dummy.updateMatrix(); sideLine.setMatrixAt(idx++, dummy.matrix); } sideLine.count = idx; scene.add(sideLine);

    const buildingColliders: Array<{ x: number; z: number; halfW: number; halfD: number }> = [];
    const facades = [0xc56b45, 0xd6b26c, 0x879c9e, 0xc4c7b9, 0x9c705a, 0xe0a15a, 0x788c76, 0x6b839b];
    const cityBiome = ['coastal-city', 'tropical-city', 'modern-city'].includes(region.biome);
    if (cityBiome) {
      let n = 0;
      for (let z = -235; z < 24; z += 25) for (const side of [-1, 1]) for (const lane of [0, 1]) {
        if ([-168, -105, -42].some((rz) => Math.abs(z - rz) < 13)) continue;
        const x = side * (20 + lane * 42 + ((n % 3) - 1) * 2); const bz = z + (n % 2) * 5; const height = (region.biome === 'modern-city' ? 18 : 8) + ((n * 7) % (region.biome === 'modern-city' ? 38 : 19)); const bw = region.biome === 'modern-city' ? 15 : 12 + (n % 4) * 2;
        box(scene, x, height / 2, bz, bw, height, 15, facades[n % facades.length]); buildingColliders.push({ x, z: bz, halfW: bw / 2, halfD: 7.5 });
        if (region.biome === 'modern-city' && n % 4 === 0) { box(scene, x, height + 1.2, bz, bw * 0.7, 1.2, 11, 0x253747); }
        if (n % 3 === 0) box(scene, x, height + 1.3, bz, 3.2, 2.2, 3.2, 0x25333a);
        n++;
      }
    }
    // Regional landscape dressing: palms on the coast, acacias on savanna, dunes and rocky ridges in desert/mountains.
    if (region.biome === 'coastal-city' || region.biome === 'tropical-city' || region.biome === 'coast') {
      for (let i = 0; i < 28; i++) { const z = -250 + (i % 14) * 18; const side = i < 14 ? -1 : 1; makeTree(scene, side * (region.biome === 'coast' ? 30 : 115 + (i % 3) * 12), z, 'palm', 0.8 + (i % 3) * 0.12); }
      // blue-green water beyond the beach/coast road
      const water = new THREE.Mesh(new THREE.PlaneGeometry(125, 420), new THREE.MeshStandardMaterial({ color: 0x2b91b0, roughness: 0.34, metalness: 0.12 })); water.rotation.x = -Math.PI / 2; water.position.set(-205, -0.03, -125); scene.add(water);
      for (let i = 0; i < 9; i++) box(scene, -150 - (i % 3) * 18, 1.3 + (i % 2), -225 + i * 27, 7, 2.6 + (i % 2), 9, 0xd4b48a);
    } else if (region.biome === 'savanna') {
      for (let i = 0; i < 42; i++) { const x = ((i * 37) % 240) - 120; const z = -245 + ((i * 53) % 285); if (Math.abs(x) < 18 || [-42, -105, -168].some((rz) => Math.abs(z - rz) < 12)) continue; makeTree(scene, x, z, 'acacia', 0.72 + (i % 4) * 0.13); }
      for (let i = 0; i < 11; i++) { const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.8 + (i % 3), 0), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x86785a : 0x9b8a63, roughness: 1 })); rock.position.set((i % 2 ? 1 : -1) * (72 + (i % 3) * 14), 1.6, -230 + i * 23); rock.scale.y = 0.55; scene.add(rock); }
    } else if (region.biome === 'desert') {
      for (let i = 0; i < 32; i++) { const dune = new THREE.Mesh(new THREE.SphereGeometry(12 + (i % 4) * 3, 8, 5), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd6b77e : 0xb98e59, roughness: 1 })); dune.scale.set(1.6, 0.28, 0.85); dune.position.set((i % 2 ? 1 : -1) * (40 + (i % 5) * 16), -1.2, -245 + i * 9); scene.add(dune); }
      if (region.id === 'cairo') { for (let i = 0; i < 3; i++) { const pyramid = new THREE.Mesh(new THREE.ConeGeometry(17 - i * 2, 27 - i * 3, 4), new THREE.MeshStandardMaterial({ color: 0xc9ad7d, roughness: 1 })); pyramid.rotation.y = Math.PI / 4; pyramid.position.set(112 + i * 20, 13 - i, -225 + i * 27); scene.add(pyramid); } }
      for (let i = 0; i < 8; i++) makeTree(scene, (i % 2 ? 1 : -1) * (75 + (i % 3) * 10), -225 + i * 29, 'palm', 0.72);
    } else if (region.biome === 'mountain') {
      for (let i = 0; i < 15; i++) { const mountain = new THREE.Mesh(new THREE.ConeGeometry(19 + (i % 4) * 5, 35 + (i % 3) * 12, 5 + (i % 3)), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x746c5f : 0x88877a, roughness: 1 })); mountain.position.set((i % 2 ? 1 : -1) * (75 + (i % 4) * 17), 12 + (i % 3) * 3, -245 + i * 18); mountain.rotation.z = (i % 2 ? 1 : -1) * 0.08; scene.add(mountain); }
      for (let i = 0; i < 22; i++) { const x = (i % 2 ? 1 : -1) * (27 + (i % 4) * 12); makeTree(scene, x, -235 + i * 12, 'pine', 0.65 + (i % 3) * 0.15); }
    } else if (region.biome === 'waterfall') {
      const river = new THREE.Mesh(new THREE.PlaneGeometry(72, 380), new THREE.MeshStandardMaterial({ color: 0x3a9fa9, roughness: 0.25, metalness: 0.12 })); river.rotation.x = -Math.PI / 2; river.position.set(145, -0.03, -130); scene.add(river);
      for (let i = 0; i < 32; i++) makeTree(scene, (i % 2 ? 1 : -1) * (75 + (i % 4) * 13), -245 + i * 8.5, i % 3 ? 'pine' : 'acacia', 0.8 + (i % 3) * 0.1);
      for (let i = 0; i < 6; i++) box(scene, 128 + (i % 2) * 8, 4 + (i % 3), -198 + i * 7, 3.5, 8 + (i % 3), 5, 0x68c8d0);
      box(scene, 142, 12, -225, 28, 24, 6, 0x718b82); box(scene, 154, 11, -225, 3, 22, 6, 0x83d9e1);
    }
    // City entrance / destination landmark. Every region has a recognisable sign and a different palette.
    box(scene, 0, 4.2, -22, 23, 0.7, 1.2, region.accent); box(scene, -10.5, 2.2, -22, 0.7, 4.4, 1, 0x26323b); box(scene, 10.5, 2.2, -22, 0.7, 4.4, 1, 0x26323b);
    // Simple billboard text is represented by bold high-contrast colour blocks to keep rendering lightweight.
    for (let i = 0; i < 5; i++) box(scene, -8 + i * 4, 4.25, -21.3, 2.3, 0.24, 0.12, [0xffd16b, 0xffffff, 0x17273b, region.accent, 0xffffff][i]);
    // A small workshop landmark for car service / garage integration.
    box(scene, -20, 3.2, -47, 14, 6.4, 15, region.accent); box(scene, -20, 5, -39, 8, 1.3, 6, 0x1c293a); box(scene, -20, 1.5, -39, 5.5, 3, 4.5, 0x27394c); buildingColliders.push({ x: -20, z: -47, halfW: 7, halfD: 7.5 });
    // traffic follows the boulevard; lightweight models keep the scene mobile-friendly
    const traffic: Array<{ group: THREE.Group; x: number; z: number; direction: number; speed: number }> = [];
    const trafficColors = [0xe5ad43, 0xc84e45, 0x4d9ed8, 0xd8dedc];
    for (let i = 0; i < 4; i++) { const g = new THREE.Group(); const shell = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.58, 3.7), new THREE.MeshStandardMaterial({ color: trafficColors[i], metalness: 0.22, roughness: 0.42 })); shell.position.y = 0.68; g.add(shell); const glass = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.48, 1.45), new THREE.MeshStandardMaterial({ color: 0x172c3e, roughness: 0.25 })); glass.position.set(0, 1.17, -0.12); g.add(glass); const z = -35 - i * 48; const x = i % 2 ? 3.6 : -3.6; g.position.set(x, 0, z); if (i % 2) g.rotation.y = Math.PI; scene.add(g); traffic.push({ group: g, x, z, direction: i % 2 ? 1 : -1, speed: 9 + i * 2 }); }
    const ringMat = new THREE.MeshStandardMaterial({ color: region.accent, emissive: region.accent, emissiveIntensity: 0.75, roughness: 0.25 });
    const rings: THREE.Mesh[] = [];
    routeCheckpoints.forEach((cp, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.3, 8, 28), ringMat.clone());
      ring.position.set(cp.x, 2.1, cp.z); ring.rotation.x = Math.PI / 2; scene.add(ring); rings.push(ring);
      // Regional gateposts and a banner create a visible destination marker without heavy assets.
      const gateMat = new THREE.MeshStandardMaterial({ color: region.accent, roughness: 0.58, metalness: 0.12 });
      const gateOffset = 6.4;
      box(scene, cp.x - gateOffset, 2.1, cp.z, 0.55, 4.2, 0.55, region.accent, gateMat);
      box(scene, cp.x + gateOffset, 2.1, cp.z, 0.55, 4.2, 0.55, region.accent, gateMat);
      box(scene, cp.x, 4.05, cp.z, 13.2, 0.36, 0.5, region.accent, gateMat);
      // Small reflective panels point toward the checkpoint in the approach direction.
      for (let panel = -1; panel <= 1; panel++) box(scene, cp.x + panel * 2.6, 3.55, cp.z + 0.31, 1.5, 0.22, 0.08, panel === 0 ? 0xffffff : 0x17283a);
    });
    checkpointRingsRef.current = rings;
    const { car, fallback } = createCar(scene, paint, style); car.position.set(0, 0, 4);
    // Rival AI: a lightweight red opponent advances through the same route during each regional event.
    const rival = new THREE.Group();
    const rivalBody = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.62, 4.0), new THREE.MeshStandardMaterial({ color: 0xc93643, metalness: 0.42, roughness: 0.28 })); rivalBody.position.y = 0.78; rival.add(rivalBody);
    const rivalCabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.56, 1.65), new THREE.MeshStandardMaterial({ color: 0x172332, metalness: 0.3, roughness: 0.24 })); rivalCabin.position.set(0, 1.32, -0.2); rival.add(rivalCabin);
    const rivalTyre = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.9 });
    const rivalRim = new THREE.MeshStandardMaterial({ color: 0xd7dce3, metalness: 0.82, roughness: 0.22 });
    for (const wx of [-1.03, 1.03]) for (const wz of [-1.32, 1.32]) {
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.23, 12), rivalTyre); tyre.rotation.z = Math.PI / 2; tyre.position.set(wx, 0.4, wz); rival.add(tyre);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.245, 12), rivalRim); rim.rotation.z = Math.PI / 2; rim.position.set(wx * 1.015, 0.4, wz); rival.add(rim);
    }
    const rivalLightMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });
    for (const lx of [-0.68, 0.68]) { const light = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.13, 0.07), rivalLightMat); light.position.set(lx, 0.88, -2.03); rival.add(light); }
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a2029, metalness: 0.3, roughness: 0.34 })); spoiler.position.set(0, 1.25, 1.75); rival.add(spoiler);
    rival.position.set(3.7, 0, 9); scene.add(rival);
    const rivalMotion = rivalMotionRef.current; rivalMotion.x = 3.7; rivalMotion.z = 9; rivalMotion.segment = 0; rivalMotion.progress = 0; rivalMotion.elapsed = 0;
    const token = ++modelToken.current;
    void (quality === 0 ? loadCarModel(`${carId}_lo`).then((m) => m ?? loadCarModel(carId)) : loadCarModel(carId)).then((model) => {
      if (!model || !alive.current || token !== modelToken.current || !car.parent) return;
      const imported = new THREE.Group(); const cache = new Map<any, THREE.Material>();
      for (const [name, part] of Object.entries(model.parts)) {
        const mats: THREE.Material[] = model.modern ? part.materials.map((desc) => { let mat = cache.get(desc); if (!mat) { const paintPart = /paint|body/i.test(desc.name) || (/^body$/i.test(name) && !/glass|window|light|rubber|tyre|tire/i.test(desc.name)); const rimPart = /rim/i.test(desc.name); const glassPart = /glass|window|windscreen|windshield/i.test(desc.name); const lampPart = /head.?light|tail.?light|lamp|reflector/i.test(desc.name); const lamp = LAMPS[style?.lamp ?? 0].hex; mat = new THREE.MeshStandardMaterial({ color: paintPart ? paint : rimPart && (style?.rimDesign ?? 0) > 0 ? style?.rim ?? 0x7d8794 : lampPart ? lamp : new THREE.Color(desc.color[0], desc.color[1], desc.color[2]), map: desc.map ?? undefined, metalness: desc.metallic, roughness: paintPart ? (style?.finish === 3 ? 0.2 : style?.finish === 2 ? 0.8 : 0.3) : Math.max(0.18, desc.roughness), transparent: desc.blend || desc.color[3] < 0.99 || (glassPart && (style?.tint ?? 0) > 0), opacity: glassPart ? [1, 0.82, 0.58, 0.32][style?.tint ?? 0] : desc.color[3], side: desc.doubleSided ? THREE.DoubleSide : THREE.FrontSide, emissive: lampPart ? new THREE.Color(lamp) : new THREE.Color(desc.emissive[0], desc.emissive[1], desc.emissive[2]) }); cache.set(desc, mat); } return mat; }) : [new THREE.MeshStandardMaterial({ color: paint, metalness: 0.38, roughness: 0.3 })];
        const mesh = new THREE.Mesh(part.geometry, mats.length > 1 ? mats : mats[0]); mesh.name = name; mesh.position.set(part.at[0], part.at[1], part.at[2]); imported.add(mesh);
      }
      const bounds = new THREE.Box3().setFromObject(imported); const size = new THREE.Vector3(); bounds.getSize(size); if (!Number.isFinite(size.z) || size.z < 0.1) return;
      const scale = 4.2 / size.z; imported.scale.setScalar(scale); imported.position.set(-((bounds.min.x + bounds.max.x) * 0.5) * scale, -bounds.min.y * scale, -((bounds.min.z + bounds.max.z) * 0.5) * scale); car.add(imported); fallback.visible = false;
    }).catch(() => undefined);
    const clock = new THREE.Clock(); let raf = 0; let hudClock = 0; let collisionTimer = 0;
    const animate = () => {
      if (!alive.current) return; raf = requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), 0.04); const m = motion.current; const c = controls.current;
      traffic.forEach((npc) => { npc.z += npc.direction * npc.speed * dt; if (npc.z > 24) npc.z = -260; if (npc.z < -260) npc.z = 24; npc.group.position.z = npc.z; });
      if (missionStartedRef.current && rivalMotion.segment < routeCheckpoints.length) {
        rivalMotion.elapsed += dt;
        // Each crew has a different pace profile; the final sector gets a controlled push.
        const basePace: Record<AfricaRegionId, number> = { accra: 11.8, abidjan: 12.5, dakar: 11.3, nairobi: 12.2, cairo: 12.8, atlas: 10.5, namib: 11.7, victoria: 11.2, cape: 10.8, johannesburg: 13.5 };
        const sectorBoost = rivalMotion.segment === 2 ? 1.13 : rivalMotion.segment === 1 ? 1.04 : 1;
        let distanceLeft = basePace[region.id] * sectorBoost * dt;
        // Carry unused movement across a waypoint instead of making the rival hesitate at every gate.
        while (distanceLeft > 0 && rivalMotion.segment < routeCheckpoints.length) {
          const target = routeCheckpoints[rivalMotion.segment];
          const dx = target.x - rivalMotion.x, dz = target.z - rivalMotion.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= Math.max(0.8, distanceLeft)) {
            rivalMotion.x = target.x; rivalMotion.z = target.z;
            distanceLeft = Math.max(0, distanceLeft - dist);
            rivalMotion.segment++; rivalMotion.progress = 0;
          } else {
            const step = Math.min(dist, distanceLeft);
            rivalMotion.x += dx / dist * step; rivalMotion.z += dz / dist * step;
            rivalMotion.progress += step; distanceLeft = 0;
            rival.rotation.y = Math.atan2(dx, -dz);
          }
        }
        rival.position.set(rivalMotion.x, 0, rivalMotion.z);
      }

      let collision = false;
      if (m.checkpoints < 3 && missionStartedRef.current) {
        m.elapsed += dt;
        const px = m.x, pz = m.z; const accel = c.gas ? 24 : 0; const brake = c.brake ? 38 : 0; m.speed += (accel - brake - m.speed * (c.gas ? 0.45 : 1.25)) * dt; if (c.nitro && c.gas) m.speed += 18 * dt; m.speed = Math.max(0, Math.min(c.nitro ? 47 : 34, m.speed));
        const onRouteRoad = routePoints.slice(0, -1).some((point, index) => distanceToSegment(m.x, m.z, point, routePoints[index + 1]) < 9);
        const onRoad = onRouteRoad || [0, 42, -42, 84, -84].some((x) => Math.abs(m.x - x) < 9) || [-42, -105, -168, -202, -244].some((z) => Math.abs(m.z - z) < 9);
        if (!onRoad) { missionStatsRef.current.offroadSeconds += dt; m.speed = Math.max(0, m.speed - 10 * dt); }
        if (c.nitro && c.gas) missionStatsRef.current.nitroSeconds += dt;
        missionStatsRef.current.collisionLatch = Math.max(0, missionStatsRef.current.collisionLatch - dt);
        m.heading += ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * 1.5 * Math.min(1, m.speed / 9) * dt; m.x += Math.sin(m.heading) * m.speed * dt; m.z -= Math.cos(m.heading) * m.speed * dt;
        if (Math.abs(m.x) > 150) { m.x = Math.sign(m.x) * 150; m.speed *= 0.72; } if (m.z > 16) { m.z = 16; m.speed *= 0.75; }
        for (const obstacle of buildingColliders) if (Math.abs(m.x - obstacle.x) < obstacle.halfW + 1.35 && Math.abs(m.z - obstacle.z) < obstacle.halfD + 1.9) { m.x = px; m.z = pz; m.speed *= 0.38; collision = true; break; }
        for (const npc of traffic) { const dx = m.x - npc.x, dz = m.z - npc.z; if (dx * dx + dz * dz < 10.5) { m.speed *= 0.48; collision = true; m.x += Math.sign(dx || 1) * 0.35; m.z += Math.sign(dz || 1) * 0.22; } }
        if (collision && missionStatsRef.current.collisionLatch <= 0) { missionStatsRef.current.collisions++; missionStatsRef.current.collisionLatch = 0.8; }
        car.position.set(m.x, 0, m.z); car.rotation.y = m.heading; car.rotation.z = ((c.left ? 1 : 0) - (c.right ? 1 : 0)) * -0.035;
        const cp = routeCheckpoints[m.checkpoints]; if (cp && Math.hypot(cp.x - m.x, cp.z - m.z) < 7) { m.checkpoints++; rings[m.checkpoints - 1]?.scale.setScalar(0.001); }
      }
      rings.forEach((ring, i) => { if (i >= m.checkpoints) ring.rotation.z += dt * (i === m.checkpoints ? 0.85 : 0.22); });
      const target = new THREE.Vector3(m.x + Math.sin(m.heading) * 10, 5.8, m.z + Math.cos(m.heading) * 10); camera.position.lerp(target, 0.11); camera.lookAt(m.x, 0.9, m.z - 8); renderer.render(scene, camera); (gl as any).endFrameEXP?.();
      collisionTimer = collision ? 0.45 : Math.max(0, collisionTimer - dt); hudClock += dt; if (hudClock > 0.12) { hudClock = 0; setHud({ speed: Math.round(m.speed * 3.6), checkpoint: m.checkpoints, collision: collisionTimer > 0, nearWorkshop: Math.hypot(m.x + 20, m.z + 47) < 14, elapsed: m.elapsed, rivalGap: Math.round(Math.hypot(m.x - rivalMotion.x, m.z - rivalMotion.z)) }); }
    };
    camera.position.set(0, 6, 16); camera.lookAt(0, 1, -5); animate();
    return () => { cancelAnimationFrame(raf); traffic.forEach((npc) => scene.remove(npc.group)); scene.remove(rival); };
  }, [regionId, carId, paint, style]);

  useEffect(() => () => {
    alive.current = false; modelToken.current++;
    const scene = sceneRef.current;
    if (scene) scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material?.dispose());
    });
    sceneRef.current = null;
    rendererRef.current?.dispose(); rendererRef.current = null;
  }, [regionId]);
  useEffect(() => {
    if (!finished || completionSent.current === runToken.current) return;
    completionSent.current = runToken.current;
    controls.current = { left: false, right: false, gas: false, brake: false, nitro: false };
    missionStartedRef.current = false;
    // A destination is only cleared when the player actually beats the rival.
    // Reaching the final checkpoint alone must not grant completion or coins.
    const rival = rivalMotionRef.current;
    const lost = rival.segment >= routeCheckpoints.length && rival.elapsed < motion.current.elapsed;
    setRaceResult(lost ? 'LOSE' : 'WIN');
    if (lost) {
      setLastCompletedRegion(null);
      return;
    }
    setLastCompletedRegion(completedRegions.includes(regionId) ? null : regionId);
    onRegionComplete(regionId, runReward, motion.current.elapsed, pointsFor(regionId, motion.current.elapsed));
  }, [finished, regionId, completedRegions, onRegionComplete, runReward]);
  const setControl = (key: keyof Controls, value: boolean) => { controls.current[key] = value; };
  const control = (label: string, key: keyof Controls, wide = false) => <Pressable key={key} onPressIn={() => setControl(key, true)} onPressOut={() => setControl(key, false)} style={[styles.control, wide && styles.wide]}><Text style={styles.controlText}>{label}</Text></Pressable>;
  return <View style={styles.root}>
    {glReady ? <GLView key={regionId} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} onLayout={() => { setTimeout(() => { const g = glRef.current; if (g) resizeRef.current?.(g.drawingBufferWidth ?? 0, g.drawingBufferHeight ?? 0); }, 60); }} /> : null}
    <View style={styles.header}><View><Text style={styles.eyebrow}>APEX RUN · AFRICA TOUR</Text><Text style={styles.speed}>{hud.speed} <Text style={styles.unit}>KM/H</Text></Text><Text style={styles.timer}>TIME {hud.elapsed.toFixed(1)}s  ·  BEST {(bestTimes[regionId] ? bestTimes[regionId].toFixed(1) + 's' : '--')}</Text><Text style={styles.timer}>AFRICA CUP · {totalChampionshipPoints} PTS</Text>{hud.collision ? <Text style={styles.impact}>IMPACT · SPEED REDUCED</Text> : null}{missionStarted && !finished ? <Text style={styles.rival}>RIVAL DISTANCE · {hud.rivalGap}m</Text> : null}</View><View style={styles.location}><Text style={styles.city}>{region.city.toUpperCase()}</Text><Text style={styles.country}>{region.country.toUpperCase()}</Text><Text style={styles.mission}>{finished ? 'DESTINATION COMPLETE' : `WAYPOINT ${hud.checkpoint + 1}/3`}</Text><Text style={styles.checkpoint}>{finished ? 'Explore or choose another region' : region.checkpoints[hud.checkpoint]}</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.regions} contentContainerStyle={styles.regionRow}>{AFRICA_REGIONS.map((r, i) => { const locked = i > 0 && !completedRegions.includes(AFRICA_REGIONS[i - 1].id) && !completedRegions.includes(r.id); const done = completedRegions.includes(r.id); return <Pressable key={r.id} disabled={locked || (missionStarted && !finished)} onPress={() => { if (r.id !== regionId) { controls.current = { left: false, right: false, gas: false, brake: false, nitro: false }; setHud({ speed: 0, checkpoint: 0, collision: false, nearWorkshop: false, elapsed: 0, rivalGap: 0 }); missionStartedRef.current = false; setMissionStarted(false); setRaceResult(null); setShowStandings(false); setRegionId(r.id); } }} style={[styles.regionChip, r.id === regionId && styles.regionActive, locked && styles.regionLocked]}><Text style={[styles.regionName, r.id === regionId && styles.regionNameActive]}>{locked ? '🔒 ' : done ? '✓ ' : ''}{r.city}</Text><Text style={styles.regionCountry}>{r.country}</Text></Pressable>; })}</ScrollView>
    <Pressable onPress={() => setShowStandings((visible) => !visible)} style={styles.standingsToggle}><Text style={styles.standingsToggleText}>{showStandings ? 'HIDE CUP TABLE' : 'CUP TABLE  ↗'}</Text></Pressable>
    {showStandings ? <View style={styles.standingsPanel}><Text style={styles.standingsTitle}>AFRICA CUP · REGIONAL STANDINGS</Text>{[...AFRICA_REGIONS].sort((a, b) => (championshipPoints[b.id] ?? 0) - (championshipPoints[a.id] ?? 0) || AFRICA_REGIONS.indexOf(a) - AFRICA_REGIONS.indexOf(b)).map((r, i) => <View key={r.id} style={styles.standingRow}><Text style={styles.standingRank}>{String(i + 1).padStart(2, '0')}</Text><Text style={styles.standingCity}>{r.city.toUpperCase()}</Text><Text style={styles.standingStatus}>{completedRegions.includes(r.id) ? 'FINISHED' : 'PENDING'}</Text><Text style={styles.standingPoints}>{championshipPoints[r.id] ?? 0} PTS</Text></View>)}<Text style={styles.standingsFoot}>{completedRegions.length}/10 REGIONS CLEARED · {totalChampionshipPoints} TOTAL POINTS</Text>{tourComplete ? <Text style={styles.championBanner}>AFRICA CUP COMPLETE · CONTINENTAL CHAMPION</Text> : null}</View> : null}
    <View style={styles.leftControls}>{control('◀', 'left')}{control('▶', 'right')}</View><View style={styles.rightControls}>{control('ACCEL', 'gas', true)}{control('BRAKE', 'brake', true)}{control('NITRO', 'nitro', true)}</View>
    {hud.nearWorkshop ? <Pressable onPress={onWorkshop} style={styles.workshop}><Text style={styles.workshopTitle}>REGIONAL GARAGE</Text><Text style={styles.workshopSub}>TAP TO TUNE YOUR CAR  →</Text></Pressable> : null}
    {!missionStarted && !finished ? <View style={styles.briefing}><Text style={styles.briefingEyebrow}>APEX RUN · AFRICA STORY</Text><Text style={styles.briefingTitle}>{region.title.toUpperCase()}</Text><Text style={styles.briefingPlace}>{region.city.toUpperCase()} · {region.country.toUpperCase()}</Text><View style={styles.dialogue}><Text style={styles.speaker}>{REGION_BRIEFINGS[region.id].speaker}</Text><Text style={styles.dialogueText}>“{REGION_BRIEFINGS[region.id].line}”</Text></View><Text style={styles.objectiveLabel}>YOUR OBJECTIVE</Text><Text style={styles.objectiveText}>{REGION_BRIEFINGS[region.id].objective}</Text><Text style={styles.challengeText}>{REGION_CHALLENGES[region.id]}</Text><Text style={styles.objectiveText}>TIME TRIAL · GOLD {MEDAL_TARGETS[region.id].gold}s · SILVER {MEDAL_TARGETS[region.id].silver}s</Text><Pressable onPress={() => { motion.current.x = 0; motion.current.z = 4; motion.current.heading = 0; motion.current.speed = 0; motion.current.checkpoints = 0; motion.current.elapsed = 0; missionStatsRef.current = { collisions: 0, offroadSeconds: 0, nitroSeconds: 0, collisionLatch: 0 }; checkpointRingsRef.current.forEach((ring) => ring.scale.setScalar(1)); setHud({ speed: 0, checkpoint: 0, collision: false, nearWorkshop: false, elapsed: 0, rivalGap: 0 }); runToken.current++; setRaceResult(null); controls.current = { left: false, right: false, gas: false, brake: false, nitro: false }; rivalMotionRef.current = { x: 3.7, z: 9, segment: 0, progress: 0, elapsed: 0 }; missionStartedRef.current = true; setMissionStarted(true); }} style={styles.nextRegion}><Text style={styles.nextRegionText}>START REGIONAL MISSION  →</Text></Pressable></View> : null}
    {finished ? <View style={styles.complete}><Text style={styles.completeTitle}>{region.city.toUpperCase()} · DESTINATION REACHED</Text><Text style={styles.raceResult}>{raceResult === 'WIN' ? 'RIVAL BEATEN · RACE WON' : 'RIVAL FINISHED FIRST · TRY AGAIN'}</Text><Text style={styles.medal}>{raceResult === 'WIN' ? `${medalFor(regionId, hud.elapsed)} MEDAL` : 'NO MEDAL · BEAT THE RIVAL TO CLEAR'} · {hud.elapsed.toFixed(1)}s</Text><Text style={styles.completeSub}>{bestTimes[regionId] ? `PERSONAL BEST ${Math.min(bestTimes[regionId], hud.elapsed).toFixed(1)}s` : 'FIRST RECORDED RUN'}</Text><Text style={styles.completeSub}>{raceResult === 'LOSE' ? 'RACE LOST · NO COMPLETION OR REWARD GRANTED' : lastCompletedRegion === region.id ? `DESTINATION CLEARED · +${runReward} COINS EARNED` : completedRegions.includes(region.id) ? 'DESTINATION SAVED · ONE-TIME REWARD ALREADY CLAIMED' : `DESTINATION CLEARED · +${runReward} COINS`}</Text>{raceResult === 'WIN' ? <Text style={challengeComplete ? styles.challengePassed : styles.challengeMissed}>{challengeComplete ? (lastCompletedRegion === region.id ? 'BONUS OBJECTIVE CLEARED · +100 BONUS COINS' : 'BONUS OBJECTIVE CLEARED · FIRST-CLEAR BONUS ALREADY CLAIMED') : 'BONUS OBJECTIVE MISSED · DESTINATION STILL CLEARED'}</Text> : null}<Text style={styles.completeSub}>{REGION_BRIEFINGS[region.id].debrief}</Text><Text style={styles.completeSub}>DRIVING REPORT · {missionStatsRef.current.collisions} IMPACTS · {missionStatsRef.current.offroadSeconds.toFixed(1)}s OFF-ROAD · {missionStatsRef.current.nitroSeconds.toFixed(1)}s NITRO</Text><Text style={styles.completeSub}>{completedRegions.length + (raceResult === 'WIN' && !completedRegions.includes(region.id) ? 1 : 0)}/{AFRICA_REGIONS.length} DESTINATIONS COMPLETED · {totalChampionshipPoints + (raceResult === 'WIN' && !completedRegions.includes(region.id) ? pointsFor(regionId, hud.elapsed) : 0)} CUP POINTS</Text>{raceResult === 'WIN' && (tourComplete || completedRegions.length + (!completedRegions.includes(region.id) ? 1 : 0) >= AFRICA_REGIONS.length) ? <Text style={styles.championBanner}>AFRICA CUP COMPLETE · CONTINENTAL CHAMPION</Text> : <Text style={styles.completeSub}>CHAMPIONSHIP SCORING · GOLD 3 PTS · SILVER 2 PTS · BRONZE 1 PT</Text>}<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 10 }}><Pressable onPress={() => { motion.current.x = 0; motion.current.z = 4; motion.current.heading = 0; motion.current.speed = 0; motion.current.checkpoints = 0; motion.current.elapsed = 0; missionStatsRef.current = { collisions: 0, offroadSeconds: 0, nitroSeconds: 0, collisionLatch: 0 }; checkpointRingsRef.current.forEach((ring) => ring.scale.setScalar(1)); setHud({ speed: 0, checkpoint: 0, collision: false, nearWorkshop: false, elapsed: 0, rivalGap: 0 }); missionStartedRef.current = false; setMissionStarted(false); setRaceResult(null); runToken.current++; rivalMotionRef.current = { x: 3.7, z: 9, segment: 0, progress: 0, elapsed: 0 }; controls.current = { left: false, right: false, gas: false, brake: false, nitro: false }; }} style={styles.nextRegion}><Text style={styles.nextRegionText}>REPLAY RUN ↻</Text></Pressable><Pressable onPress={() => {
      if (raceResult !== 'WIN') {
        motion.current.x = 0; motion.current.z = 4; motion.current.heading = 0; motion.current.speed = 0; motion.current.checkpoints = 0; motion.current.elapsed = 0; missionStatsRef.current = { collisions: 0, offroadSeconds: 0, nitroSeconds: 0, collisionLatch: 0 };
        checkpointRingsRef.current.forEach((ring) => ring.scale.setScalar(1));
        setHud({ speed: 0, checkpoint: 0, collision: false, nearWorkshop: false, elapsed: 0, rivalGap: 0 });
        missionStartedRef.current = false; setMissionStarted(false); setRaceResult(null); runToken.current++;
        rivalMotionRef.current = { x: 3.7, z: 9, segment: 0, progress: 0, elapsed: 0 };
        controls.current = { left: false, right: false, gas: false, brake: false, nitro: false };
        return;
      }
      const currentIndex = AFRICA_REGIONS.findIndex((entry) => entry.id === region.id);
      const next = AFRICA_REGIONS.find((r, i) => i > currentIndex && !completedRegions.includes(r.id)) ?? AFRICA_REGIONS.find((r) => !completedRegions.includes(r.id));
      if (next) {
        setHud({ speed: 0, checkpoint: 0, collision: false, nearWorkshop: false, elapsed: 0, rivalGap: 0 });
        missionStartedRef.current = false; setMissionStarted(false); setRaceResult(null); runToken.current++; setRegionId(next.id);
      } else onExit();
    }} style={styles.nextRegion}><Text style={styles.nextRegionText}>{raceResult !== 'WIN' ? 'RETRY RACE ↻' : completedRegions.length >= AFRICA_REGIONS.length ? 'FINISH AFRICA TOUR' : 'NEXT DESTINATION  →'}</Text></Pressable></View></View> : null}
    <View style={styles.footer}><Pressable onPress={onExit} style={styles.exit}><Text style={styles.exitText}>✕  EXIT TOUR</Text></Pressable><Text style={styles.hint}>DRIVE THROUGH ALL 3 WAYPOINTS · REGIONAL GARAGE NEAR THE START</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#10192b' }, standingsToggle: { position: 'absolute', top: 177, right: 12, zIndex: 4, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: 'rgba(6,13,27,.9)', borderWidth: 1, borderColor: '#4d7c83' }, standingsToggleText: { color: '#9dffe5', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }, standingsPanel: { position: 'absolute', zIndex: 6, top: '18%', right: 12, width: 260, maxHeight: '64%', padding: 11, borderRadius: 13, borderWidth: 1, borderColor: '#4d7c83', backgroundColor: 'rgba(5,12,25,.97)' }, standingsTitle: { color: '#7fffd9', fontSize: 10, fontWeight: '900', marginBottom: 7, letterSpacing: 0.5 }, standingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(115,145,168,.2)', gap: 7 }, standingRank: { width: 20, color: '#ffd17d', fontSize: 9, fontWeight: '900' }, standingCity: { flex: 1, color: '#fff', fontSize: 9, fontWeight: '800' }, standingStatus: { color: '#a8c0d2', fontSize: 7, fontWeight: '800' }, standingPoints: { color: '#7fffd9', fontSize: 9, fontWeight: '900', minWidth: 38, textAlign: 'right' }, standingsFoot: { color: '#dfe9f2', fontSize: 9, fontWeight: '900', marginTop: 8, textAlign: 'center' }, briefing: { position: 'absolute', zIndex: 5, top: '17%', left: '23%', right: '23%', backgroundColor: 'rgba(5,12,25,.96)', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#7fffd9' }, briefingEyebrow: { color: '#7fffd9', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, briefingTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 5 }, briefingPlace: { color: '#9fb8cc', fontSize: 9, fontWeight: '800', marginTop: 3 }, dialogue: { marginTop: 12, padding: 11, backgroundColor: '#142239', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#e6b45e' }, speaker: { color: '#ffd17d', fontSize: 10, fontWeight: '900', marginBottom: 4 }, dialogueText: { color: '#fff', fontSize: 12, lineHeight: 17 }, objectiveLabel: { color: '#7fffd9', fontSize: 9, fontWeight: '900', marginTop: 12 }, objectiveText: { color: '#dfe9f2', fontSize: 11, lineHeight: 16, marginTop: 4 }, challengeText: { color: '#ffd17d', fontSize: 10, lineHeight: 15, fontWeight: '800', marginTop: 7 }, challengePassed: { color: '#7fffd9', fontSize: 10, fontWeight: '900', textAlign: 'center', marginTop: 5 }, challengeMissed: { color: '#ffb37a', fontSize: 10, fontWeight: '900', textAlign: 'center', marginTop: 5 }, header: { position: 'absolute', top: 34, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, eyebrow: { color: '#7fffd9', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, speed: { color: '#fff', fontSize: 30, fontWeight: '900', fontStyle: 'italic' }, timer: { color: '#d8e6f3', fontSize: 9, fontWeight: '900', marginTop: 2 }, medal: { color: '#ffd17d', fontSize: 12, fontWeight: '900', marginTop: 7 }, unit: { color: '#b4c6d8', fontSize: 10 }, impact: { color: '#ffb37a', fontSize: 9, fontWeight: '900' }, rival: { color: '#ff777f', fontSize: 9, fontWeight: '900', marginTop: 3 }, location: { maxWidth: '52%', backgroundColor: 'rgba(6,13,27,.88)', borderWidth: 1, borderColor: '#4d7c83', borderRadius: 12, padding: 9 }, city: { color: '#fff', fontWeight: '900', fontSize: 14 }, country: { color: '#a8c0d2', fontSize: 8, fontWeight: '800', marginTop: 2 }, mission: { color: '#7fffd9', fontWeight: '900', fontSize: 9, marginTop: 5 }, checkpoint: { color: '#fff', fontSize: 9, fontWeight: '700', marginTop: 2 }, regions: { position: 'absolute', top: 112, left: 10, right: 10, maxHeight: 57 }, regionRow: { gap: 6, paddingRight: 12 }, regionChip: { backgroundColor: 'rgba(6,13,27,.84)', borderColor: '#47566a', borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, minWidth: 86 }, regionActive: { backgroundColor: 'rgba(22,95,90,.94)', borderColor: '#7fffd9' }, regionLocked: { opacity: 0.48 }, regionName: { color: '#fff', fontSize: 10, fontWeight: '900' }, regionNameActive: { color: '#9dffe5' }, regionCountry: { color: '#bdc7d3', fontSize: 8, marginTop: 2 }, leftControls: { position: 'absolute', bottom: 72, left: 15, flexDirection: 'row', gap: 9 }, rightControls: { position: 'absolute', bottom: 68, right: 15, gap: 7, alignItems: 'center' }, control: { minWidth: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,16,31,.82)', borderWidth: 1, borderColor: 'rgba(157,190,224,.65)' }, wide: { minWidth: 76, height: 40, borderRadius: 12, backgroundColor: 'rgba(25,81,120,.9)', borderColor: '#59c6e6' }, controlText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 0.4 }, workshop: { position: 'absolute', top: '48%', alignSelf: 'center', backgroundColor: 'rgba(6,19,31,.92)', borderColor: '#e6b45e', borderWidth: 1, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 15 }, workshopTitle: { color: '#ffd17d', fontWeight: '900', fontSize: 11, textAlign: 'center' }, workshopSub: { color: '#fff', fontSize: 8, fontWeight: '800', marginTop: 4, textAlign: 'center' }, championBanner: { color: '#ffd96b', fontWeight: '900', fontSize: 13, letterSpacing: 1, textAlign: 'center', marginTop: 6 }, complete: { position: 'absolute', top: '42%', left: '20%', right: '20%', alignItems: 'center', backgroundColor: 'rgba(5,12,25,.84)', padding: 14, borderRadius: 13, borderWidth: 1, borderColor: '#7fffd9' }, completeTitle: { color: '#7fffd9', fontWeight: '900', fontSize: 15, textAlign: 'center' }, raceResult: { color: '#ffd17d', fontSize: 11, fontWeight: '900', textAlign: 'center', marginTop: 5 }, completeSub: { color: '#e1e9f2', fontSize: 10, textAlign: 'center', marginTop: 5 }, nextRegion: { marginTop: 10, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 9, backgroundColor: '#1c8d78' }, nextRegionText: { color: '#fff', fontSize: 10, fontWeight: '900' }, footer: { position: 'absolute', left: 12, right: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, exit: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(10,15,29,.9)', borderWidth: 1, borderColor: '#53647b' }, exitText: { color: '#fff', fontSize: 9, fontWeight: '900' }, hint: { color: '#fff', fontSize: 8, fontWeight: '700', flex: 1, textAlign: 'right', textShadowColor: '#000', textShadowRadius: 4 },
});
