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
