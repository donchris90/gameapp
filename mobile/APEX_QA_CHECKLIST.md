# Apex Run: No Limits — manual QA checklist (device)

Automated checks cover the rules (see `npm run validate:apex` and `backend/src/games/apex/*.spec.ts`). These items need a phone.

## Campaign rules in force
- Order: 7 Lagos missions, then the Africa tour opens; 49 Africa missions in strict order (56 total). Out-of-order starts are refused with a reason.
- Africa → Europe gate: all 49 Africa missions (ending with *The Road Home*) AND all 10 regional drives, checked by id. Europe has 12 missions, strictly in order.
- Money: every job/race pays; free races never need fuel, so there is always a way to earn coins. Fuel +25 for 100 coins, repair +25 for 150 coins. Story needs and parts charge once.
- Settlement: a race (track + seed) settles once (persisted keys); a job pays once per mission (the completion is saved); a region pays once.
- Europe ending scene plays once (`europeEndingSeen`).

## Run through
1. Fresh install: first mission is *One More Start*; later missions show why they are locked.
2. Buy the first need (engine) and check coins drop once even with double taps.
3. Win a race mission; reopen the app; completion, coins and unlocked level are still there.
4. Fail a race and a job; no completion; retry works; job retry gets a fresh attempt.
5. Run fuel/condition below 15; the mission explains it; refuel/repair in the workshop; start works.
6. Play each job type: chase (Stolen Blueprint), delivery (Accra Ghost Lap), escape (No Cameras), investigation (Namib Wreck Marker), infiltration (Dakar Black Box). Check HUD, arrow, pursuers, result screen, case board.
7. Start a free race after a story race: no fuel/condition change, no mission progress.
8. Africa tour: all 10 regions, reward once, replays only improve best time.
9. Johannesburg: Round one (podium) → The Championship (win) → Control Room → Road Home; the Europe invitation appears once.
10. Europe: 12 missions in order; wrong order is refused; Nürburgring needs a win.
11. Europe ending scene appears once after the final mission; restart; it does not repeat.
12. Small phone and large phone/tablet in landscape; low/medium/high quality; time to first frame of jobs.
