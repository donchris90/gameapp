/**
 * The cosmetic shop catalog. Cosmetics change how a player looks, never how they play, so nothing here
 * affects a game. `look` is what the app draws; the server only cares about id, kind and price.
 */
export type ItemKind = 'FRAME' | 'TITLE' | 'THEME';

export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  price: number;
  /** Free items are owned by everyone from the start. */
  free?: boolean;
  look: Record<string, string>;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'frame_gold', kind: 'FRAME', name: 'Gold ring', price: 500, look: { color: '#FFC83D' } },
  { id: 'frame_emerald', kind: 'FRAME', name: 'Emerald ring', price: 800, look: { color: '#2ED573' } },
  { id: 'frame_neon', kind: 'FRAME', name: 'Neon purple', price: 800, look: { color: '#B26BFF' } },
  { id: 'frame_fire', kind: 'FRAME', name: 'Fire ring', price: 1200, look: { color: '#FF5A2E' } },
  { id: 'frame_ice', kind: 'FRAME', name: 'Ice ring', price: 1200, look: { color: '#5EE6FF' } },

  { id: 'title_lucky', kind: 'TITLE', name: 'Lucky', price: 300, look: { text: 'Lucky' } },
  { id: 'title_naija', kind: 'TITLE', name: 'Naija Pride', price: 1000, look: { text: '🇳🇬 Naija Pride' } },
  { id: 'title_champion', kind: 'TITLE', name: 'Champion', price: 1500, look: { text: '🏆 Champion' } },
  { id: 'title_grandmaster', kind: 'TITLE', name: 'Grandmaster', price: 5000, look: { text: '👑 Grandmaster' } },

  { id: 'theme_midnight', kind: 'THEME', name: 'Midnight', price: 0, free: true, look: { board: '#151C33', cell: '#1D2645', accent: '#7C5CFF', wood: '#6B4426', pit: '#4A2F1B' } },
  { id: 'theme_sunset', kind: 'THEME', name: 'Sunset', price: 1000, look: { board: '#3A1C2B', cell: '#5A2A3C', accent: '#FF8A4C', wood: '#8A3B2B', pit: '#5E2418' } },
  { id: 'theme_forest', kind: 'THEME', name: 'Forest', price: 1000, look: { board: '#12301F', cell: '#1C4A30', accent: '#2ED573', wood: '#3E5B2A', pit: '#2B3F1C' } },
  { id: 'theme_ocean', kind: 'THEME', name: 'Ocean', price: 1500, look: { board: '#0E2A44', cell: '#17406A', accent: '#35C4F0', wood: '#1F5B78', pit: '#123A52' } },
  { id: 'theme_royal', kind: 'THEME', name: 'Royal', price: 3000, look: { board: '#2A1850', cell: '#3D2575', accent: '#FFC83D', wood: '#5B3A8C', pit: '#3A2260' } },
];

export const itemById = (id: string) => SHOP_ITEMS.find((i) => i.id === id);
