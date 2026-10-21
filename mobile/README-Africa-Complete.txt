APEX RUN: NO LIMITS — AFRICA CAMPAIGN DEVELOPMENT BUILD

PROJECT
This is the complete mobile-project archive, with the Africa campaign work integrated into the existing Expo / React Native project. It is a development build, not a claim of store-ready release status.

INSTALL
1. Back up your existing project.
2. Extract this ZIP into the mobile project root (the folder containing app/, src/, and assets/).
3. Install dependencies with npm ci.
4. Run npm run validate:apex to check campaign integrity and TypeScript/TSX syntax.
5. Run npx expo start --dev-client.
6. Before release, run a full TypeScript type-check, Expo/Metro bundle, Android build, and real-device playthrough.

AFRICA CAMPAIGN CONTENT
- 56 ordered story missions: 7 Lagos missions and 49 Africa missions.
- Mission dialogue and bundled art mapping for every story mission.
- Ten regional driving challenges with procedural environments, regional route layouts, three waypoints, rival timing, time medals, bonus objectives, first-clear rewards, saved best times, and Africa Cup standings.
- Persistent story fuel, vehicle condition, crew trust, evidence, choices, and driving approach.
- Workshop refuelling and repair, plus a direct route from mission preparation to the car garage/upgrades.
- Mission-specific race-result conditions: the Lagos licence assessment requires a clean run; delivery, escape, and recovery jobs can enforce damage limits.
- Story mission completion and the Europe invitation require the full ordered campaign and all ten regional challenges.
- A lightweight validation script is included: npm run validate:apex.

KNOWN LIMITATIONS — DO NOT MISREPRESENT THESE AS FINISHED
- The story races use the existing race engine and five existing race tracks. Mission-specific clean-run/damage conditions add gameplay rules, but this is not a bespoke GTA-style mission engine.
- Fuel and condition are campaign resources managed between story races. They are not yet a continuously simulated fuel tank or detailed mechanical damage model inside the 3D race.
- The Africa tour uses compact procedural environments inspired by regional settings, not full-scale handcrafted real-world city maps.
- The story includes race-based representations of pursuits, deliveries, recovery, and investigations; dedicated stealth/search/intercept systems are not fully implemented.
- Story choices are persisted and influence crew trust and some ending text, but do not yet branch the entire mission tree or create separate cinematic endings throughout the campaign.
- The Europe invitation is an ending milestone only; a playable Europe campaign is not included.
- Full dependency installation, type-checking, Metro bundling, Android build, and device playthrough could not be completed in this environment. Validate on the target development machine before release.
