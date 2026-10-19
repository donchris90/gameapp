# PlayCircle mobile app (Expo, iOS and Android)

React Native with Expo Router. Talks to the backend in `../backend` over REST and socket.io.

## Run it

```bash
cd mobile
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your backend
npm install --legacy-peer-deps
npx expo start               # scan the QR code with Expo Go, or press a / i for an emulator
```

Address to use for `EXPO_PUBLIC_API_URL`: `http://10.0.2.2:3000` for the Android emulator, `http://localhost:3000` for the iOS simulator, your computer's LAN address (for example `http://192.168.1.20:3000`) for a real phone on the same Wi-Fi. Start the backend first (`../backend`, `npm run start:dev`).

Rewarded ads need a **development build** (Expo Go cannot load the ads module): `npx expo run:android` or `eas build --profile development`. Without it the "Watch ad" button says no ad is available. Everything else works in Expo Go.

## What is in the app today

- Sign up (18+ gate and date of birth), log in, automatic token refresh, secure token storage
- Play tab: free coins (daily bonus, rewarded ad), game list, join by room code
- Pick a game, a stake and (Ludo, Water Sort) a table size, then Quick match or Play with friends
- Room lobby: room code, ready / start, kick, invite a friend, share code, chat
- Friends: search by username or friend code, requests, online status, invite
- Match screen with turn timer, resign, result and coin payout
- Tic Tac Toe board (all four games already work on the server)
- Me tab: friend code, game history with net coins, coin history
- Resume: reopening the app drops you back into a game or room in progress

## Still to build in the app

Water Sort, Ayo and Ludo boards (server side done), the coin pack shop (Google Play / App Store purchases), cosmetics.

## Layout

```
app/            screens (expo-router: (auth), (tabs), play/[game], room, match/[id])
src/api.ts      REST client with refresh-token handling
src/session.tsx  login state, wallet, one socket.io connection, useSocketEvent
src/games/      one component per game board
src/ads.ts      rewarded ads (server pays through AdMob verification)
```
