import type { Theme } from './scene';

/** How each region's job district looks: sky, ground and building colours. Layout stays the same street grid. */
export interface RegionLook { name: string; skin: Partial<Theme>; facade: number[]; palm: number; ground: number }

const L = (name: string, skin: Partial<Theme>, facade: number[], palm: number, ground: number): RegionLook => ({ name, skin, facade, palm, ground });
const DAY = { night: false, lamps: false };

export const REGION_LOOKS: Record<string, RegionLook> = {
  lagos: L('LAGOS', { sky: 0x1a1740, horizon: 0xff8a52, fog: 0xc86a52, sun: 0xffa56a, sunPower: 1.5, ambient: 0xffc8a0, lamps: true }, [0xc56b45, 0xd6b26c, 0x879c9e, 0xc4c7b9, 0x9c705a], 0x2e8b3d, 0x7b8a50),
  accra: L('ACCRA', { sky: 0x3a8ee6, horizon: 0xffe2a8, fog: 0xffe2a8, sun: 0xfff0c8, sunPower: 2.2, ambient: 0xfff0d8, ...DAY }, [0xf0c75e, 0xe8e0c8, 0xd9663f, 0xf2d9a4, 0x6fae9a], 0x35a04a, 0x8a9a52),
  abidjan: L('ABIDJAN', { sky: 0x2f5f86, horizon: 0xb7d8c8, fog: 0x9fc4b4, sun: 0xe8f4d8, sunPower: 1.5, ambient: 0xcfe8dc, ...DAY }, [0x9fb7a8, 0xc9d6c4, 0x6f8f86, 0xd8cfae, 0x7b9aa8], 0x1f7a3a, 0x4f8a52),
  dakar: L('DAKAR', { sky: 0x6a4a8c, horizon: 0xffc06b, fog: 0xe8a860, sun: 0xffc27a, sunPower: 1.9, ambient: 0xffd8a8, lamps: true }, [0xe0b574, 0xd6a05e, 0xf0d9a8, 0xc98a4e, 0xe8c48a], 0x6f8f3a, 0xc2a066),
  nairobi: L('NAIROBI', { sky: 0x4a9be8, horizon: 0xd6ecff, fog: 0xcfe6f6, sun: 0xffffff, sunPower: 2.4, ambient: 0xe6f2ff, ...DAY }, [0xc4c7b9, 0x9fb0a8, 0xd9d2c0, 0x8aa0b4, 0xb59e8a], 0x2f9a45, 0x6f9a4a),
  cairo: L('CAIRO', { sky: 0x4a3a7a, horizon: 0xffb86b, fog: 0xe8a468, sun: 0xffb870, sunPower: 1.8, ambient: 0xffd9a8, lamps: true }, [0xe0c08a, 0xd9b27a, 0xe8d4a8, 0xc9a06a, 0xb8946a], 0x7a8a3a, 0xcaa86a),
  atlas: L('ATLAS', { sky: 0x2c4a7a, horizon: 0xe8c8a8, fog: 0xc8b49c, sun: 0xfff0d8, sunPower: 1.6, ambient: 0xd8d0e0, ...DAY }, [0xb8896a, 0xc9a583, 0x9c7a5e, 0xd4b496, 0x8a6f5a], 0x4f7a3a, 0x8a7a5a),
  namib: L('NAMIB COAST', { sky: 0x3a2a6a, horizon: 0xff9a4a, fog: 0xe8884a, sun: 0xffa050, sunPower: 1.9, ambient: 0xffc890, lamps: true }, [0xd9a35e, 0xc98a4a, 0xe8c08a, 0xb8763e, 0xd6b078], 0x8a8a3a, 0xd49a5a),
  victoria: L('VICTORIA FALLS', { sky: 0x3a7ab8, horizon: 0xcfe8e0, fog: 0xb4d4cc, sun: 0xf0fff0, sunPower: 1.7, ambient: 0xdcf0e8, ...DAY }, [0x8fb09a, 0xc4d4b8, 0x6f9a84, 0xd6d8c0, 0x7ca58f], 0x1f8a3a, 0x3f8a4a),
  cape: L('CAPE TOWN', { sky: 0x2a3a52, horizon: 0x9aa8b8, fog: 0x8a98a8, sun: 0xd8e0f0, sunPower: 1.2, ambient: 0xb8c4d4, ...DAY }, [0xd8d8d8, 0xb8c4cc, 0x8a9aa8, 0xe6dfd0, 0x9ab0c0], 0x3f7a4a, 0x5f7a52),
  johannesburg: L('JOHANNESBURG', { sky: 0x070b22, horizon: 0x2a3a70, fog: 0x141c44, sun: 0x8ea6ff, sunPower: 1.0, ambient: 0x7a8ccc, night: true, lamps: true }, [0x6f7a8a, 0x8a94a4, 0x5c6678, 0x9aa4b0, 0x7a8696], 0x2a5a3a, 0x3a4a3a),
};

export function regionOf(missionId: string): RegionLook {
  const key = Object.keys(REGION_LOOKS).find((k) => missionId.startsWith(k) || missionId.startsWith(`africa-${k}`));
  return REGION_LOOKS[key ?? 'lagos'];
}
