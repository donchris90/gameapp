import { useState } from 'react';
import { Platform, View } from 'react-native';

// Google's public test banner units. Your own ids go in EXPO_PUBLIC_ADMOB_BANNER_ANDROID / _IOS.
const TEST_UNIT = Platform.select({ ios: 'ca-app-pub-3940256099942544/2934735716', default: 'ca-app-pub-3940256099942544/6300978111' })!;
const REAL_UNIT = Platform.select({ ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS, default: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID });

import Constants from 'expo-constants';
const inExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
let ads: any = null;
if (!inExpoGo) { try { ads = require('react-native-google-mobile-ads'); } catch { ads = null; } } // Expo Go has no ads module: show nothing

/** A small banner for the bottom of the Play, Friends and Coins tabs. Never used on a game screen. Takes no space if no ad loads. */
export function AdBanner() {
  const [failed, setFailed] = useState(false);
  if (!ads?.BannerAd || failed) return null;
  return (
    <View style={{ alignItems: 'center', paddingVertical: 4 }}>
      <ads.BannerAd
        unitId={__DEV__ ? TEST_UNIT : REAL_UNIT || TEST_UNIT}
        size={ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
