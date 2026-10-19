import { useEffect, useState } from 'react';
import { api } from './api';

export interface ShopItem { id: string; kind: 'FRAME' | 'TITLE' | 'THEME'; name: string; price: number; look: Record<string, string>; owned: boolean }
export interface Equipped { frame: string | null; title: string | null; theme: string }
interface Shop { items: ShopItem[]; equipped: Equipped }

export const DEFAULT_LOOK = { board: '#151C33', cell: '#1D2645', accent: '#7C5CFF', wood: '#6B4426', pit: '#4A2F1B' };

// What other players wear is sent with every room and match; these map the ids to how they are drawn.
const FRAME_COLORS: Record<string, string> = { frame_gold: '#FFC83D', frame_emerald: '#2ED573', frame_neon: '#B26BFF', frame_fire: '#FF5A2E', frame_ice: '#5EE6FF' };
const TITLE_TEXT: Record<string, string> = { title_lucky: 'Lucky', title_naija: '🇳🇬 Naija Pride', title_champion: '🏆 Champion', title_grandmaster: '👑 Grandmaster' };
export const frameColor = (id?: string | null) => (id ? FRAME_COLORS[id] : undefined);
export const titleText = (id?: string | null) => (id ? TITLE_TEXT[id] : undefined);

// One shared copy of my shop state, so the equipped theme reaches the game boards without prop drilling.
let current: Shop | null = null;
const listeners = new Set<(s: Shop) => void>();
export const setShop = (s: Shop) => { current = s; listeners.forEach((l) => l(s)); };
export const clearShop = () => { current = null; };

export async function loadShop(): Promise<Shop> {
  const s = await api<Shop>('/shop/items');
  setShop(s);
  return s;
}

export function useShop(): Shop | null {
  const [s, setS] = useState<Shop | null>(current);
  useEffect(() => {
    listeners.add(setS);
    if (!current) loadShop().catch(() => undefined);
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

/** The colours of the board theme I have equipped. Falls back to the default while loading or offline. */
export function useTheme() {
  const s = useShop();
  const item = s?.items.find((i) => i.id === s.equipped.theme);
  return { ...DEFAULT_LOOK, ...(item?.look ?? {}) };
}
