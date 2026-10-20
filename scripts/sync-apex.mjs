// The race rules must be identical on the server and in the app. Edit them in backend/src/games/apex, then run:
//   node scripts/sync-apex.mjs
// (a backend test fails if the two copies differ).
import { copyFileSync } from 'node:fs';
for (const f of ['sim.ts', 'bot.ts']) copyFileSync(`backend/src/games/apex/${f}`, `mobile/src/apex/${f}`);
console.log('Copied the Apex Run rules into mobile/src/apex');
