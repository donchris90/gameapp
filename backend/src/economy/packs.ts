/**
 * Coin packs sold through the app stores. Create one consumable product per row with the same
 * product id in Google Play Console and App Store Connect. Prices are set in the stores, not here.
 */
export interface CoinPack { productId: string; coins: number; label: string; }

export const COIN_PACKS: readonly CoinPack[] = [
  { productId: 'coins_500', coins: 500, label: 'Starter' },
  { productId: 'coins_1200', coins: 1200, label: 'Handful' },
  { productId: 'coins_3000', coins: 3000, label: 'Bag' },
  { productId: 'coins_7000', coins: 7000, label: 'Chest' },
  { productId: 'coins_16000', coins: 16000, label: 'Vault' },
];

export const packById = (id: string) => COIN_PACKS.find((p) => p.productId === id);
