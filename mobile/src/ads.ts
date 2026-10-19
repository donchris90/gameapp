import { Platform } from 'react-native';

// Google's public test ad units. Replace with your own through EXPO_PUBLIC_ADMOB_REWARDED_* before release.
const TEST_UNIT = Platform.select({ ios: 'ca-app-pub-3940256099942544/1712485313', default: 'ca-app-pub-3940256099942544/5224354917' })!;
const REAL_UNIT = Platform.select({ ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS, default: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID });

export type AdResult = 'watched' | 'closed' | 'unavailable';

/**
 * Shows a rewarded video. The coins are NOT paid by this code: AdMob calls the server, which pays.
 * Needs a development or production build; in Expo Go the ads module does not exist and this returns 'unavailable'.
 */
export async function showRewardedAd(opts: { userId: string; nonce: string }): Promise<AdResult> {
  let ads: any;
  try { ads = require('react-native-google-mobile-ads'); } catch { return 'unavailable'; }
  if (!ads?.RewardedAd) return 'unavailable';
  const unit = __DEV__ ? TEST_UNIT : REAL_UNIT || TEST_UNIT;
  const ad = ads.RewardedAd.createForAdRequest(unit, { serverSideVerificationOptions: { userId: opts.userId, customData: opts.nonce } });

  return new Promise<AdResult>((resolve) => {
    let earned = false, done = false;
    const finish = (r: AdResult) => { if (done) return; done = true; subs.forEach((u: () => void) => u()); resolve(r); };
    const subs = [
      ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => { void ad.show().catch(() => finish('unavailable')); }),
      ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      ad.addAdEventListener(ads.AdEventType.CLOSED, () => finish(earned ? 'watched' : 'closed')),
      ad.addAdEventListener(ads.AdEventType.ERROR, () => finish('unavailable')),
    ];
    ad.load();
    setTimeout(() => finish('unavailable'), 30_000);
  });
}

// ---- full-screen ad after every finished game ----
const TEST_INTERSTITIAL = Platform.select({ ios: 'ca-app-pub-3940256099942544/4411468910', default: 'ca-app-pub-3940256099942544/1033173712' })!;
const REAL_INTERSTITIAL = Platform.select({ ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS, default: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID });

let loaded: { ad: any; ads: any; ready: boolean } | null = null;

/** Starts loading the next end-of-game ad so it is ready the moment the game ends. Safe to call any time. */
export function preloadInterstitial() {
  if (loaded) return;
  let ads: any;
  try { ads = require('react-native-google-mobile-ads'); } catch { return; }
  if (!ads?.InterstitialAd) return;
  try {
    const ad = ads.InterstitialAd.createForAdRequest(__DEV__ ? TEST_INTERSTITIAL : REAL_INTERSTITIAL || TEST_INTERSTITIAL);
    const state = { ad, ads, ready: false };
    loaded = state;
    ad.addAdEventListener(ads.AdEventType.LOADED, () => { state.ready = true; });
    ad.addAdEventListener(ads.AdEventType.ERROR, () => { if (loaded === state) loaded = null; });
    ad.load();
  } catch { loaded = null; }
}

/**
 * Plays the full-screen ad that follows every finished game. The player cannot skip it from our side
 * (the ad's own close button appears after a few seconds). If no ad is ready, the game flow simply continues.
 */
export async function showInterstitial(): Promise<void> {
  preloadInterstitial();
  const cur = loaded;
  if (!cur) return;
  // Give a just-requested ad a moment to arrive, but never hold the player up for long.
  for (let i = 0; i < 12 && !cur.ready && loaded === cur; i++) await new Promise((r) => setTimeout(r, 250));
  if (!cur.ready || loaded !== cur) return;
  loaded = null; // each ad plays once; the next one is requested straight after
  await new Promise<void>((resolve) => {
    const { ad, ads } = cur;
    const done = () => { off.forEach((u: () => void) => u()); preloadInterstitial(); resolve(); };
    const off = [ad.addAdEventListener(ads.AdEventType.CLOSED, done), ad.addAdEventListener(ads.AdEventType.ERROR, done)];
    ad.show().catch(done);
    setTimeout(done, 120_000);
  });
}
