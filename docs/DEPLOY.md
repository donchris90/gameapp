# Taking PlayCircle live

Do these in order. Each step says what you need and how to know it worked.

## 0. Before anything: one server only
The API keeps live connections and game timers in memory, so run exactly **one** copy of it. One modest server (2 GB RAM) handles thousands of players. Do not add a second copy or autoscale until the realtime part is moved to Redis.

## 1. Server and domain
1. Get a VPS (DigitalOcean, Hetzner, Contabo or any Ubuntu 22.04+ box; pick a region near your players).
2. Buy a domain. Point two names at the server's IP (A records): `api.yourdomain.com` and `admin.yourdomain.com`.
3. On the server: `curl -fsSL https://get.docker.com | sh`, then upload this project (git clone your repo).

## 2. Configure
1. `cp backend/.env.example backend/.env.production` and edit it:
   - `JWT_ACCESS_SECRET`: run `openssl rand -hex 32` and paste the result.
   - `STORE_MODE=live` (never `fake` in production).
   - `CORS_ORIGINS=https://admin.yourdomain.com`.
   - Remove the `DATABASE_URL` and `PORT` lines (docker-compose sets them).
   - Fill the Google Play / Apple values once you have them (step 4).
2. Create `.env` next to `docker-compose.yml` with `DB_PASSWORD=` followed by a long random password.
3. Edit `Caddyfile`: replace `api.example.com` with `api.yourdomain.com`.

## 3. Start
```
docker compose up -d --build
curl https://api.yourdomain.com/health
```
The health call should answer ok. Database migrations run automatically on every start.

Make yourself admin (after registering in the app): 
`docker compose exec api npm run make-admin -- you@email.com`

Back up the database daily: `docker compose exec db pg_dump -U postgres playcircle | gzip > backup-$(date +%F).gz` (put it in cron and copy it off the server). The coin ledger is your money record; losing it is the worst outcome.

## 4. Store accounts and coin packs
- **Google Play Console** (one-time $25): create the app, then In-app products: create consumables with the ids `coins_500`, `coins_1200`, `coins_3000`, `coins_7000`, `coins_16000`. Create a service account in Google Cloud, give it access in Play Console (Users and permissions, "View financial data" and "Manage orders"), download its JSON key and paste it on one line into `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Set `GOOGLE_PLAY_PACKAGE_NAME=com.playcircle.app` (or your final id).
- **Apple Developer** ($99/year): create the app in App Store Connect, add the same five consumable products, then Users and Access, Integrations, In-App Purchase: create a key. Fill `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8 with newlines as `\n`) and `APPLE_BUNDLE_ID`.
- **AdMob**: create the app, one rewarded ad unit, and turn on server-side verification with the callback `https://api.yourdomain.com/ads/ssv`. Put your real AdMob app ids in `mobile/app.json` (they are Google's test ids now) and your rewarded unit ids in `mobile/.env` as `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID` and `EXPO_PUBLIC_ADMOB_REWARDED_IOS`. If they are missing, release builds quietly fall back to Google's test ads and you earn nothing.
- Replace the placeholder name and bundle ids (`com.playcircle.app`) in `mobile/app.json` with your final ones **before** creating store products: they cannot be changed later.

## 5. Admin website
```
cd admin && echo "VITE_API_URL=https://api.yourdomain.com" > .env && npm ci && npx vite build
```
Upload the `dist` folder to any static host (Cloudflare Pages, Netlify) or serve it with Caddy at `admin.yourdomain.com`. Only users with the ADMIN role can sign in to it.

## 6. Build the apps
```
cd mobile && echo "EXPO_PUBLIC_API_URL=https://api.yourdomain.com" > .env
npm i -g eas-cli && eas login && eas build:configure
eas build --profile preview --platform android     # installable APK for testing
eas build --profile production --platform all      # store builds
eas submit --platform android   # then ios
```
Ads and purchases only work in these builds, not in Expo Go.

## 7. Test with real stores before release (do not skip)
1. Android: add yourself as a licence tester in Play Console, install the internal build, buy `coins_500`. Coins must arrive once; a second tap must not double credit.
2. iOS: create a sandbox tester in App Store Connect and repeat.
3. Watch a rewarded ad; coins must arrive only after the whole ad. Do it 11 times: the 11th must pay nothing.
4. Play every game with two real phones, including killing the app mid-game and reopening it.
5. Check `admin` shows the purchases and the ledger.

## 8. Store listing requirements
- Privacy policy URL and terms of service (needed by both stores and by AdMob).
- Age rating: the app has coin staking, so answer the questionnaires honestly (simulated gambling, no real money). Apple and Google both have rules for this: coins must have no cash value and be impossible to withdraw, which is how the app is built. Set the audience to 18+.
- Data safety form (Google) and privacy labels (Apple): you collect email, username, birth date, purchases and gameplay data.
- Screenshots of each game, an icon (1024x1024) and a short description.
