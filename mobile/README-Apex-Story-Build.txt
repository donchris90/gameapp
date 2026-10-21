APEX RUN: NO LIMITS — STORY CAMPAIGN BUILD

WHAT CHANGED
- Expanded the Lagos origin chapter from five to seven sequential missions.
- Expanded the continental narrative into 49 sequential Africa story missions across the ten existing destination environments.
- Added story beats for the father's missing notebook, fuel and repair trouble, driving qualification, race-data manipulation, Vanguard's Project Apex, Darius's secret, Amara's apparent betrayal, the continental championship, and the final recording.
- Added pre-race dialogue for every mission. Existing hand-authored dialogue is preserved; new missions receive a short dialogue scene generated from their briefing.
- Added offline illustration fallbacks for all story missions. Existing images are reused to avoid adding dozens of large image assets.
- Updated the story screen's mission-count messaging to match the expanded campaign.
- Existing race engine, garage, upgrades, coin rewards, save storage, and regional Africa free-drive mode are retained.

CURRENT CAMPAIGN SIZE
- 7 Lagos missions
- 49 Africa story missions
- 56 sequential story missions total
- 10 existing regional free-drive challenges remain separate from the story races.

IMPORTANT LIMITATIONS
- This is a narrative/campaign expansion, not a claim that every mission is a bespoke open-world mission. The story races reuse the project's existing tracks and race engine.
- Fuel stops, repair interactions, driving licence tests, stealth/investigation gameplay, vehicle interception, and branching gameplay outcomes are described in the story text but are not newly implemented as separate mechanics in this pass. The relevant story beats currently launch the existing race types.
- Player choices are not yet a persistent branching-choice system; that should be implemented as a separate state/UI pass.
- Unique city-scale 3D environments and unique art for each mission are not included. Existing procedural environments and bundled story art are reused.

VALIDATION
- TypeScript/TSX syntax transpilation passed for src/apex/story.ts, src/apex/storyArt.ts, and app/apex.tsx.
- A full Expo typecheck, Metro bundle, and device build were not run in this environment because project dependencies are not installed here. Run `npm install --legacy-peer-deps` and `npx expo start --dev-client` from mobile before producing a release APK.
