# PlayCircle

Friends-first multiplayer games (Tic Tac Toe, Water Sort, Ayo, Ludo) played with coins. No real money anywhere.

## Coin rules (decided, enforced in code)

- **One coin balance per player.** Bought coins, ad coins, bonuses and winnings all land in the same balance.
- Coins **can be bought** (Google Play / Apple in-app purchase only) and **earned** (rewarded ads with a daily cap, daily bonus, winning matches).
- Coins can **never be withdrawn or converted to cash.** There is no payout code, bank code or KYC in this repo.
- Players can **stake coins** on matches. The winner takes the pot minus a house cut (planned: 10%, configurable). A draw refunds both stakes.
- Coins are spent in the **cosmetic shop** and on stakes.
- **18+ only.** Registration needs a birth date, an "I am 18 or older" confirmation and acceptance of the terms.

## Layout

```
backend/   NestJS + Prisma 7 + PostgreSQL   <- step 1, done
mobile/    Expo app (iOS + Android)          <- step 2 onward
admin/     small admin panel                 <- last
```

## Build order

1. Foundation: auth, coin wallet, ledger, age gate  **(done)**
2. Friends and rooms: friend requests, friend codes, private rooms, invites, quick match, sockets  **(done)**
3. Tic Tac Toe with staking, end to end
4. Water Sort
5. Ayo, then Ludo
6. Coin packs (Google Play / Apple, server-side receipt checks) and rewarded ads (AdMob, server-side verification, daily caps)
7. Cosmetic shop
8. Admin panel

## Step 1: what exists

- `POST /auth/register` `/login` `/refresh` `/logout`, `GET/PATCH /users/me`
- `GET /wallet`, `GET /wallet/ledger?limit=&cursor=`
- Passwords hashed with argon2. Access JWT (15 min) plus rotating opaque refresh tokens; replaying an old refresh token revokes the whole session family. Suspending or banning a user cuts off their existing access token on the next request.
- **Wallet ledger.** `WalletService` is the only code allowed to change a balance. Every change is a ledger row written in the same transaction as the balance update, under a row lock. Retrying with the same idempotency key is safe; reusing a key for a different movement is rejected. The database also has a `CHECK (balance >= 0)`.
- Ledger types are tied to a direction (for example `GAME_STAKE` can only remove coins, `AD_REWARD` can only add them), so a bug can't turn a stake into a credit.

## Step 2: friends, rooms, quick match, realtime

Commands go over REST, the socket pushes events. Connect with `io(url, { auth: { token: accessToken } })`.

**Friends**: `GET /friends`, `GET /friends/requests`, `GET /friends/search?q=`, `POST /friends/requests` (`{username}` or `{friendCode}`), `POST /friends/requests/:id/accept`, `DELETE /friends/requests/:id` (cancel or decline), `DELETE /friends/:userId`, `GET /blocks`, `POST|DELETE /blocks/:userId`.
Asking someone who already asked you makes you friends. A blocked player gets the same "No player found" as for an unknown name.

**Rooms** (one room per player at a time): `POST /rooms` (`{game, stake, maxPlayers?}`), `POST /rooms/join` (`{code}`), `GET /rooms/current`, `POST /rooms/current/ready|start|leave|invite`, `POST /rooms/current/kick/:userId`, `GET /rooms/invites`, `POST /rooms/invites/:id/accept`, `DELETE /rooms/invites/:id`.
Stakes come from a fixed list (0, 50, 100, 250, 500, 1000, 5000; 0 is a friendly game). Coins are only checked here, not taken: **the stake is debited from the ledger when a game actually begins (step 3)**. Start re-checks everyone's balance and names who is short.
Player counts: Tic Tac Toe 2, Ayo 2, Ludo 2 to 4, Water Sort race 2 to 4.
The host role passes to the next player when the host leaves; a lobby is deleted when empty; players offline for 10 minutes are removed from a lobby that is not mid-game.

**Quick match**: `POST /matchmaking/queue` (`{game, stake, size?}`), `DELETE /matchmaking/queue`. Pairs by game, stake and table size, skips blocked pairs, times out after 90 seconds. The queue is in memory, so run one server instance until it moves to Redis.

**Socket events to the client**: `friend:request`, `friend:accepted`, `friend:online`, `friend:offline`, `room:update`, `room:started`, `room:aborted`, `room:kicked`, `room:invite`, `room:chat`, `match:found`, `match:failed`, `match:timeout`.
**From the client**: `room:chat` `{text}` (max 200 characters, 5 messages per 5 seconds, members only; acknowledges `{ok}`).

**Hooks for step 3**: `RoomsService.start()` flips a room to `IN_PROGRESS`; the game engine takes over from there, debits stakes through `WalletService`, and calls `RoomsService.finishGame(roomId)` to return everyone to the lobby for a rematch. If players leave and too few remain, the room emits `room:aborted` (stakes get refunded there).

## Step 3: Tic Tac Toe with staking, end to end

Starting a game from a lobby (or a quick match) creates a **match**. Only games with a registered engine can be played (`GET /games` says which; right now Tic Tac Toe).

- **Stakes**: every player's stake is taken when the match starts, in the same transaction as the room start. If anyone cannot afford it, nothing is taken and the start fails with `INSUFFICIENT_COINS`.
- **Payout**: winner gets pot minus the house cut (`HOUSE_FEE_PERCENT`, default 10, rounded down for the house) as `GAME_PAYOUT`; the cut is a `HOUSE_FEE` platform entry. A draw refunds every stake in full (`GAME_REFUND`). Stake 0 is a friendly game and touches no coins.
- **Zero-sum check**: all ledger entries with reference `match:<id>` add up to 0.
- **Forfeits**: resigning, leaving the room mid-game, or running out of time (`TURN_TIMEOUT_MS`, default 30000) makes the opponent the winner. With 3-4 players the match continues until one remains.
- **Safety**: moves carry the match `version` (stale moves get `STALE_STATE`), duplicates apply once, and a winning move racing the timeout sweeper settles exactly once.

REST: `GET /games`, `GET /matches/current`, `GET /matches/history?limit&cursor`, `GET /matches/:id`, `POST /matches/:id/move` `{version, move:{cell}}`, `POST /matches/:id/forfeit`.
Socket events: `match:started`, `match:state`, `match:ended`.
Ayo, Ludo and Water Sort are rejected with `GAME_NOT_AVAILABLE` until their engines land (steps 4 and 5).

## Step 4: Water Sort race

2-4 players get the **same puzzle** (7 colours, 4 units per tube, 2 empty tubes) and each solves their own copy at the same time. First to finish wins the pot (minus the house cut). Moves are `POST /matches/:id/move` with `{ "move": { "from": tubeIndex, "to": tubeIndex } }`; no `version` and no turns for this game.

- **Fair puzzles**: generated by scrambling a solved board with reverse pours, so every puzzle is solvable under the real pour rules (a pour moves the whole top run of one colour as far as it fits).
- **Clock**: one 5 minute clock for the whole match. If it runs out, the most finished tubes wins; a tie refunds every stake.
- **Leaving**: with 2 players the opponent wins; with 3-4 the race goes on without the one who left (they cannot win on time either).
- **Live view**: everyone sees every board and the finished-tube counts in `match:state`, so clients can show opponents' progress.
- **Engine hooks added for simultaneous games**: `simultaneous`, `matchTimeoutMs`, `onDeadline` (Ludo can reuse the first two if it ever needs them).
- Known limit: moves are checked by the server, but a script could still solve a puzzle faster than a human. Plan: minimum solve time and move-rate checks before launch.

## Step 5: Ayo

Standard Ayo/Oware (abapa) rules for two players, 4 seeds in each of 12 pits. Seat 0 owns pits 0-5, seat 1 owns pits 6-11; seeds are sown in increasing pit order. Move: `{ "move": { "pit": 0-11 } }` with the match `version`.

- Sowing skips the starting pit on laps of 12+. If the last seed makes an opponent pit hold 2 or 3 you capture it and the pits before it that also hold 2 or 3.
- A move that would capture every seed on the opponent's row captures nothing.
- If the opponent has no seeds you must play a move that gives them some (`MUST_FEED`); if none exists the game ends and each side keeps its own row.
- First to 25 wins; 24-24 is a draw (stakes refunded). A game with no capture for 120 moves ends the same way as a no-feed ending.
- `match:state` carries `last` (pit played, where it ended, seeds captured) so clients can animate.

## Step 6: Ludo

2-4 players. The **server rolls the dice** (cryptographic random), so nobody can pick a number. Two moves: `{ "move": { "action": "roll" } }` then, if `canMove` is not empty, `{ "move": { "action": "move", "token": 0-3 } }`, each with the match `version`.

- 4 tokens each. Need a 6 to leave the yard. Token progress: -1 yard, 0 start square, 0-50 on the 52 square ring, 51-55 home column, 56 home. Exact roll needed to finish.
- A 6, a capture, or getting a token home gives another roll. Three 6s in a row lose the turn. No legal move: the turn passes by itself (`lastRoll.skipped`).
- Landing on a ring square held by opponents sends all their tokens there back to the yard. Start squares and the four star squares (ring squares 0, 8, 13, 21, 26, 34, 39, 47) are safe. No blocks.
- First to bring all four tokens home wins the pot. Two players sit opposite each other (`startSquares` in the state).
- Each action (roll or move) has its own 30 s clock; running out removes you from the table. With 3-4 players the game goes on without you (your tokens leave the board, turns skip you), with 2 the opponent wins.

All four games are now playable. `GET /games` reports every one as available.

## Step 7: Buying and earning coins

All three ways in end up in the same single wallet, through the same ledger.

**Coin packs (Google Play and App Store)**: `GET /store/packs` lists them (edit `src/economy/packs.ts`; create the same product ids as *consumable* in both stores). After a purchase the app sends `POST /store/purchases { platform: "GOOGLE"|"APPLE", productId, token }` (Google: purchase token, Apple: transaction id). The server asks the store itself whether the purchase is real, paid and for that product, then credits the coins once. The same receipt sent again credits nothing; another account sending it gets `RECEIPT_ALREADY_USED`. Google purchases are consumed so the pack can be bought again.

**Daily bonus**: `GET /rewards` shows what is available, `POST /rewards/daily` claims. 50 coins, +10 per streak day up to day 7; missing a day restarts the streak. The day resets at local midnight (`DAY_OFFSET_MINUTES=60` for Nigeria).

**Rewarded ads**: the app calls `POST /ads/rewarded/start` and gets `{ nonce, userId }`. It shows the ad with AdMob server-side verification options `userId` = that userId and `customData` = the nonce. AdMob then calls `GET /ads/ssv` on your server; the server checks AdMob's ECDSA signature, matches the nonce, and only then pays (25 coins, 10 ads a day). The app never tells the server an ad was watched, so it cannot fake one. Each ad pays once, and the cap holds even when callbacks arrive together.

In the AdMob console set the rewarded ad unit's server-side verification callback URL to `https://<your-api>/ads/ssv`.

**Setup you must do before launch**
1. Google Play: create a service account with access to the Play Console API, put its JSON in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` and the app id in `GOOGLE_PLAY_PACKAGE_NAME`.
2. App Store: create an In-App Purchase key; set `APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`.
3. Keep `STORE_MODE=live`. `STORE_MODE=fake` (tests and local development only) accepts `fake:<transactionId>:<productId>` receipts and unsigned ad callbacks, and the server refuses to start with it in production. Without store credentials, live mode answers `STORE_NOT_CONFIGURED` rather than ever giving free coins.

Honest note: the Google, Apple and AdMob checks are tested here against simulated store responses and locally generated keys. They have not been run against the real services, so run one sandbox purchase on each store and one test ad before release.

## Mobile app

The Expo app lives in `mobile/` (see `mobile/README.md`). Sign up and log in, free coins, quick match, friends, rooms and chat, and boards for all four games. The Coins tab (store purchases) is in; it needs the store products and credentials described in `mobile/README.md`.

## Admin website

`admin/` is a small React site for running the game (dashboard, players, coin adjustments, suspend/ban, games, purchases, audit log). See `admin/README.md`. Backend side: `/admin/*` endpoints, admin role only, every action recorded in the audit log. Make yourself admin with `npm run make-admin -- you@example.com` in `backend/`, and set `CORS_ORIGINS` to the admin site's address.

## Run it

```bash
cd backend
cp .env.example .env            # set DATABASE_URL and a real JWT_ACCESS_SECRET
npm install
npx prisma migrate dev          # creates the tables from prisma/migrations
npm run start:dev
```

Tests need a throwaway Postgres database whose name contains "test" (it is wiped each run):

```bash
# set TEST_DATABASE_URL in .env, then
npm test
```

## Notes

- The first migration was written by hand because the build sandbox could not download Prisma's migration engine. Run `npx prisma migrate dev` once on your machine; if Prisma reports any drift from `schema.prisma`, accept its generated migration instead and delete mine.
- Socket.io CORS is open (`origin: true`) for now. Restrict it once the admin web panel exists.
- Prisma 7 generates the client into `src/generated/prisma` (git-ignored). `npm install` then `npx prisma generate` recreates it.

## Step 8: Cosmetic shop

Players spend coins on looks only: avatar frames, titles and board themes (`backend/src/shop/items.ts`). Nothing affects gameplay.

- `GET /shop/items` catalog with `owned` flags and what is equipped; `POST /shop/items/:id/buy`; `POST /shop/items/:id/equip`; `POST /shop/unequip/:kind` (frame, title, theme).
- Buying writes the item and the `SHOP_PURCHASE` ledger debit in one transaction, so a failed payment gives no item and a double tap charges once.
- Frame and title are shown to other players in rooms and matches; the board theme is applied to your own Tic Tac Toe and Ayo boards.
- Mobile: Me tab, "Customize" (`mobile/app/cosmetics.tsx`). To add an item, add it to `items.ts` and, for frames/titles, to the maps in `mobile/src/cosmetics.ts`.

## Step 9: Polish

- How to play: a collapsible rules card on each game's lobby screen (`mobile/src/howto.ts`).
- Sound and vibration: short effects for moves, your turn, win, loss and draw (`mobile/src/sfx.ts`, files in `mobile/assets/sfx`). Players can switch it off in the Me tab. Effects are plain generated tones; swap the .wav files for nicer ones any time.

## Going live
See `docs/DEPLOY_RENDER_SUPABASE.md` (Supabase database + Render API, with `render.yaml`) and `docs/DEPLOY.md` (checklist, or a single VPS with Docker). `docker-compose.yml` runs Postgres, the API and HTTPS (Caddy) on one server.

## Legal
`docs/PRIVACY_POLICY.md` and `docs/TERMS_OF_SERVICE.md` are drafts with [PLACEHOLDERS]. Fill them in, have a lawyer check them, host them on a public web page, and use the page links in both store listings. Players can delete their own account in the app (Me tab); this is required by Google Play and the App Store.

## Step 10: Computer opponents and solo Water Sort

- **Computer opponents (free games only).** In quick match with a stake of 0, a player who has waited 6 to 12 seconds gets computer opponents for the empty seats (Tic Tac Toe, Ayo, Ludo). They are ordinary accounts with random ordinary usernames (`backend/src/bots/bot-names.ts`), flagged `isBot` in the database: they cannot log in, never appear in friend search, and are left out of admin counts (admin match lists mark them with a robot). They play only legal moves, checked with the real game rules, and slip now and then so they can be beaten (`bot-policy.ts`). A game against them ends and closes its room, so "rematch" means searching again. **Games with coins at stake never use them.** Timings can be changed with `BOT_FILL_MS_MIN/MAX`, `BOT_MOVE_MS_MIN/MAX`, and `BOTS_ENABLED=false` turns them off.
- **Water Sort is solo.** One player, a new always-solvable puzzle each time, 5 minutes, no stake and no coins. Start with `POST /matches/solo {game:'WATER_SORT'}`. Running out of time or giving up ends it with no winner.
- The Terms of Service draft says some opponents in free games may be computer-controlled. Keep that sentence.

## Step 11: Friends chat, push notifications, reports

- **Chat** (`backend/src/chat`): private messages between accepted, unblocked friends only. 500 characters, 20 messages a minute, hidden characters refused, messages deleted after 30 days (`CHAT_RETENTION_DAYS`) and with the account. Endpoints: `GET /chat/conversations`, `GET /chat/unread`, `GET/POST /chat/with/:userId`, `POST /chat/with/:userId/read`, `POST /chat/report`. Live delivery uses the socket events `chat:message` and `chat:read`.
- **Push** (`backend/src/push`): `POST/DELETE /push/token`. A friend who is offline gets a notification for a message or a game invite, sent through Expo's push service (`EXPO_ACCESS_TOKEN` is optional). See `docs/DEPLOY.md`, step 4b, for the Android/iOS keys. `PUSH_MODE=off` turns it off.
- **Reports:** long-press a message from a friend, then Report or Report and block. Moderators see them in the admin site, Reports tab, with the conversation around the message, and close them with a note (audited).
- Mobile: chat button on every friend in the Friends tab with an unread badge (`mobile/app/chat/[userId].tsx`).

## Step 12: the social layer (profiles, leaderboard, activity, reactions, rematch, voice)

All in `backend/src/social` (plus the friends list and the socket gateway).

- **Profiles:** `GET /players/:id` returns name, frame, title, online, your relation to them (`self`, `friend`, `none`, `sent`, `received`), games and wins per game, win rate and the highest Water Sort level. No email or friend code. Blocked players and computer accounts answer 404.
- **Leaderboard:** `GET /leaderboard?period=week|all&game=` returns the top 25 by wins plus your own rank. Only wins in games with at least one other real player count, so beating the computer cannot climb the board. Without `game`, Water Sort is left out (it is played alone); ask for `game=WATER_SORT` to rank solved levels.
- **Friend activity:** `GET /friends` now includes `activity`: `offline`, `online`, `lobby` (with the room `code`, `game`, `stake` and `joinable`) or `playing`. The app shows a Join button for a joinable room.
- **Reactions:** socket event `match:emote` `{ matchId, emote }` with an acknowledgement. The ids come from a fixed list (`GET /emotes`), so nothing typed reaches the other player. One every 1.2 seconds; blocked players never receive them. The other player gets `match:emote`.
- **Rematch:** `POST /social/rematch/:matchId`. After a game with real players everyone is back in the room's lobby, so this marks you ready and tells the others (`match:rematch`, plus a push if they are offline). Against the computer it answers `VS_COMPUTER` and the app starts a new search; if the room is gone it answers `ROOM_GONE`.
- **Voice (Agora):** `POST /voice/room` gives a token for the channel of the room you are in; `POST /voice/calls` `{userId}` rings an online friend (`call:incoming`), `POST /voice/calls/:id/answer` `{accept}` and `POST /voice/calls/:id/end` finish it (`call:answered`, `call:declined`, `call:ended`). Channel names are chosen by the server, tokens last an hour, and nothing is recorded. Set `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` on the server; without them the endpoints answer `VOICE_NOT_CONFIGURED`.
- **Mobile:** player profile (`app/player/[id].tsx`), leaderboard (`app/leaderboard.tsx`, from the Play and Friends tabs), reaction button and voice button in the game header, Rematch button after a game, a call bar and incoming-call prompt across the app. Voice uses `react-native-agora`, which is native code: it works in a development or store build, **not in Expo Go** (the app says so instead of crashing).

- **Ad after every game:** when a game ends, the match screen plays a full-screen AdMob interstitial about two seconds after the result shows (`mobile/src/ads.ts`, `showInterstitial`). Coins are already paid by then, so it never delays a payout. It is skipped when no ad is ready, in Expo Go, and when you reopen a game that had already finished. Set `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID` and `EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS` to your own ad unit ids; Google's test ids are used in development.

- **Ad frequency (admin):** the admin site has an **Ads** page where you set, per game, "show an ad after every Nth finished game" (1 = every game, 3 = every third, 0 = never; 0 to 20). Stored in the `AppSetting` table (`backend/src/settings`), changed with `GET/POST /admin/settings/ads` (audited as `SET_AD_POLICY`) and handed to the app in `GET /games` as `adEvery`. The app counts finished games per game kind on the phone and shows the ad when the count reaches the setting. Changes reach players within about 15 seconds of their next game ending. Needs the new migration `20261020000000_app_settings`.

- **Banner:** a small AdMob banner sits at the bottom of the Play, Friends and Coins tabs (`mobile/src/AdBanner.tsx`), never on a game screen. Ids: `EXPO_PUBLIC_ADMOB_BANNER_ANDROID` and `EXPO_PUBLIC_ADMOB_BANNER_IOS`. In Expo Go, or when no ad loads, it takes no space.

## Apex Run (racing game) – step 1: the race

A 3D racing game (three.js on expo-gl). You race 5 computer drivers (random names) to a finish line through traffic: cars, motorbikes (level 3+), trucks (6+), buses (10+) and people crossing the road (2+). Crashes slow you down but never end the race. Steer by tilting the phone or with the ◀ ▶ buttons; ⚡ Nitro and ■ Brake. Finish in the top 3 to unlock the next level.

- The rules live in `backend/src/games/apex/sim.ts` and `bot.ts` (deterministic, so the server can replay a race later to confirm a time). After editing them run `node scripts/sync-apex.mjs` to copy into `mobile/src/apex/`; a test fails if the copies differ.
- Admin → Ads can set "ad after every Nth game" for Apex Run like the other games.
- If tilt steers the wrong way on your phone, press **Flip tilt** on the Apex Run menu (it has a live test bar).
- Coming next: online rooms and quick match (up to 6), stakes, garage/shop and boosts.

### 3D car models
`mobile/assets/cars/hero.glb` (your car, ~22k triangles) and `rival.glb` (the computer drivers, ~7k) are loaded by `mobile/src/apex/model.ts`. If a file is missing or fails to load, the built-in cars are used. To make these files from any car OBJ (one body object + four wheel objects): `python3 tools/obj_to_car_glb.py car.obj out.glb --tris 22000` (needs `pip install trimesh fast-simplification scipy numpy`). The current models are a test model of a real-world car brand: use original or properly licensed models before you release the game.

### Apex garage
Six-car catalogue in `mobile/src/apex/cars.ts` (price, career level, upgrade cost factor). Each car has 4 upgrades (engine, turbo, tyres, nitro) up to level 5; they change the stats (`carStats` in the shared sim) and the look (underglow, flame colour). New cars: run `tools/car-pipeline/optimize_car.mjs` on the source model, drop `<id>_hi.glb`/`<id>_lo.glb` into `mobile/assets/cars/`, and register it in `cars.ts`. After installing, run `npm install --legacy-peer-deps` (new deps: expo-screen-orientation, expo-asset, upng-js). Real-brand models need a licence/trademark check before release.

### Apex tracks
`TRACKS` in `backend/src/games/apex/sim.ts` (synced to the app): Coastal Sweep, Desert Esses, Downtown Night, Mountain Pass. Each is a list of `[length, radius]` bends (+ right, - left, 0 straight) with a straight start and finish. Rules stay in road space (x across, z along); a bend pushes the car to the outside (`driftAt`) and scraping the barrier slows it, so you steer against it or brake. The phone draws the road curved (`ApexScene.buildPath`), and `replay`/`makeWorld` take the track id, so the server check will use it too. The player picks a track in the Tracks panel; harder tracks open by career level.

### Apex Circuit and the new look
- **Circuit mode:** `circuit.ts` (generated by `tools/make_circuit.py`) holds one closed lap. `makeWorld(seed, level, 'circuit', laps)` repeats it for 2, 3 or 5 laps with no traffic, a 6-car grid and 5 nitro pads that refill nitro and give a short boost once per lap. The rules read only the bend table; the phone draws the road from the same points, so every lap is the same road.
- **Look:** filmic tone mapping, a sky with stars, a far-off city, speckled asphalt and grass, striped barriers, blob shadows under cars, glowing pads. HUD: position, lap, time, best lap, minimap, speed and nitro.
- **Sound:** `tools/make_engine_sounds.py` builds the engine loops (V8 firing pulses at four rev levels, wind, tyre squeal, nitro whoosh, blow-off, pop). `engineUpdate` in `src/sfx.ts` runs a six-gear gearbox on top of them and adds the nearest rival's engine with a doppler shift. If pitch does not follow the revs on a device, check `shouldCorrectPitch` in `loopOf`.
- **Nitro pads** now appear on every track (one every 220–360 m, any lane) as well as the circuit; driving over one refills 40% of the tank and gives a short boost. The nitro meter in the HUD shows the level and turns red when low.

## Apex Run paint studio (customization, slice 1)

The Customize panel is a studio: a 3D car you can drag to turn, zoom, and view from the front, side, rear or top. Per car, saved on the phone (under its own `apex.styles` key):

- **Paint:** six finishes (gloss, satin, matte, metallic, pearlescent, colour-shift) and twelve body colours.
- **Wheels:** five rim designs drawn in code and fitted to each model's real wheel size (so they work on every car), a rim colour, and brake-caliper colour.
- **Stance:** five ride heights, and the body-kit tiers.
- **Glass and lights:** window tint, headlight colour, underglow colour.

All of this is visual only: `src/apex/style.ts` is never read by the race rules (`sim.ts`), so replays, rewards and the server can't be affected. Planned next: aero add-ons and decals, cockpit and interior, the performance workshop (brakes, suspension, transmission), and paying for premium parts with coins.

## Apex Run controls and graphics

- **Throttle:** "Auto gas" (default) holds the throttle for you. Choose "Gas pedal" on the Apex home screen to get a GAS button: off the throttle the car coasts and slows gently, and nitro only works with the throttle on. The throttle is part of the shared rules (`gas` in `Input`, bit 1024 in the packed input); a recording without the bit means "throttle on", so every older replay is unchanged.
- **Graphics:** Low / Medium / High on the home screen. Low draws every other roadside piece, no distant skyline or stars, a shorter view, no filmic tone mapping, and the lighter version of the car model. Saved per phone.
- The on-screen buttons are smaller and see-through so they don't cover the road.
