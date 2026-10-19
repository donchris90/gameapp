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
See `docs/DEPLOY.md` for the full checklist. `docker-compose.yml` runs Postgres, the API and HTTPS (Caddy) on one server.

## Legal
`docs/PRIVACY_POLICY.md` and `docs/TERMS_OF_SERVICE.md` are drafts with [PLACEHOLDERS]. Fill them in, have a lawyer check them, host them on a public web page, and use the page links in both store listings. Players can delete their own account in the app (Me tab); this is required by Google Play and the App Store.
