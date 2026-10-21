APEX RUN: NO LIMITS — AFRICA CAMPAIGN UPDATE

FILES IN THIS ZIP
- app/apex.tsx
- src/apex/AfricaScene.tsx
- src/apex/storage.ts

INSTALL
1. Back up your current copies of these three files.
2. Extract this ZIP into the MOBILE PROJECT ROOT — the folder that contains both `app/` and `src/`.
3. Allow the files to overwrite their matching paths.
4. Run the project using its normal Expo dev-client workflow and test on a device.

WHAT THIS UPDATE ADDS / FIXES
- Region-specific checkpoint routes across all ten African tour destinations.
- A rival with region-dependent pace and a stronger final-sector push.
- Win/loss messaging that does not report a lost race as completed or count it toward tour completion.
- Persistent Africa Cup scoring: gold = 3 points, silver = 2, bronze = 1.
- Best regional Cup score is saved per destination; replaying a destination cannot grant its one-time coin reward again.
- Cup points and regional progress appear in the Africa Tour UI and are stored through the existing SecureStore save flow.
- Sequential destination progression remains connected to saved regional completion.
- Existing Lagos and Africa story missions remain connected to the existing race engine; the Africa story finale and ten-region tour status determine whether the Africa milestone is complete.

IMPORTANT LIMITATIONS / VALIDATION
- This is a playable procedural 3D campaign foundation, not a full-scale recreation of ten real African cities or a GTA-sized seamless world.
- The Europe campaign itself is not included; completing the Africa story and all ten regional challenges earns the Europe invitation/status shown in Story Mode.
- The current environment did not have the project's npm dependencies installed, so a full Expo build, whole-project TypeScript check, and device gameplay test could not be run here.
- TypeScript/TSX transpile syntax checks passed for all three changed source files. Install dependencies and test with the project's normal Expo dev-client command before release.
