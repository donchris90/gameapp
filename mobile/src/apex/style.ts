/**
 * How a car looks, apart from its performance. Everything here is visual: the race rules, replays and rewards never read it,
 * so changing it can never change a result. It is saved per car on the phone.
 */
export interface CarStyle {
  finish: number; // index into FINISHES
  paint: number; // body colour
  rimDesign: number; // index into RIM_DESIGNS (0 = the car's own rims)
  rim: number; // rim colour (used by designs 1 and up)
  caliper: number; // brake caliper colour
  glow: number; // underglow colour (0 = none; otherwise this replaces the glow the upgrades give)
  tint: number; // index into TINTS
  lamp: number; // index into LAMPS
  ride: number; // -2 (lowest) to 2 (highest)
}

export const FINISHES = [
  { id: 'gloss', name: 'Gloss', note: 'Deep clear-coat shine' },
  { id: 'satin', name: 'Satin', note: 'Soft low sheen' },
  { id: 'matte', name: 'Matte', note: 'Flat, no shine' },
  { id: 'metallic', name: 'Metallic', note: 'Bright metal flake' },
  { id: 'pearl', name: 'Pearlescent', note: 'Colour glints at angles' },
  { id: 'shift', name: 'Colour-shift', note: 'Changes hue as you look' },
] as const;

export const RIM_DESIGNS = [
  { name: 'Stock', note: 'The car’s own rims' },
  { name: '5-spoke', note: 'Wide, classic' },
  { name: 'Multi-spoke', note: 'Ten slim spokes' },
  { name: 'Mesh', note: 'Cross-hatch lattice' },
  { name: 'Split-spoke', note: 'Paired spokes' },
  { name: 'Turbofan', note: 'Swept blades' },
] as const;

export const TINTS = [
  { name: 'Clear', dark: 0 }, { name: 'Light', dark: 0.35 }, { name: 'Dark', dark: 0.65 }, { name: 'Limo', dark: 0.92 },
] as const;

export const LAMPS = [
  { name: 'Warm white', hex: 0xfff3c4 }, { name: 'Cool white', hex: 0xdcecff }, { name: 'Ice blue', hex: 0x7cc4ff },
  { name: 'Amber', hex: 0xffb347 }, { name: 'Violet', hex: 0xb58cff }, { name: 'Green', hex: 0x7dffb0 },
] as const;

export const SWATCHES = [
  { name: 'Electric Blue', hex: 0x2788ff }, { name: 'Neon Violet', hex: 0x7548ff }, { name: 'Crimson', hex: 0xe52b43 },
  { name: 'Pearl White', hex: 0xe7edf7 }, { name: 'Midnight', hex: 0x171b2b }, { name: 'Volt Yellow', hex: 0xf4c542 },
  { name: 'Emerald', hex: 0x12a87b }, { name: 'Sunset Orange', hex: 0xff6a1f }, { name: 'Hot Pink', hex: 0xff3d9a },
  { name: 'Silver', hex: 0xb9c1cf }, { name: 'Gunmetal', hex: 0x4a5160 }, { name: 'Lime', hex: 0x9cff3d },
] as const;

export const GLOWS = [
  { name: 'Off', hex: 0 }, { name: 'Cyan', hex: 0x2ee6ff }, { name: 'Violet', hex: 0x8a5cff }, { name: 'Magenta', hex: 0xff3dd0 },
  { name: 'Gold', hex: 0xffc83d }, { name: 'Red', hex: 0xff2a3d }, { name: 'Green', hex: 0x3dff8a }, { name: 'White', hex: 0xffffff },
] as const;

export const DEFAULT_STYLE: CarStyle = { finish: 0, paint: 0x2788ff, rimDesign: 0, rim: 0xc9d2e0, caliper: 0xff3b30, glow: 0, tint: 1, lamp: 0, ride: 0 };

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const colour = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(0xffffff, Math.floor(v))) : d);

/** Turns whatever was saved into a safe style (unknown or damaged values fall back to the defaults). */
export function cleanStyle(raw: unknown, paintFallback: number): CarStyle {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    finish: int(s.finish, 0, FINISHES.length - 1, DEFAULT_STYLE.finish),
    paint: colour(s.paint, paintFallback),
    rimDesign: int(s.rimDesign, 0, RIM_DESIGNS.length - 1, DEFAULT_STYLE.rimDesign),
    rim: colour(s.rim, DEFAULT_STYLE.rim),
    caliper: colour(s.caliper, DEFAULT_STYLE.caliper),
    glow: colour(s.glow, 0),
    tint: int(s.tint, 0, TINTS.length - 1, DEFAULT_STYLE.tint),
    lamp: int(s.lamp, 0, LAMPS.length - 1, DEFAULT_STYLE.lamp),
    ride: int(s.ride, -2, 2, 0),
  };
}

/** A short text that changes whenever the look changes (used to know when the 3D car must be rebuilt). */
export const styleKey = (s: CarStyle) => `${s.finish}.${s.paint}.${s.rimDesign}.${s.rim}.${s.caliper}.${s.glow}.${s.tint}.${s.lamp}.${s.ride}`;
