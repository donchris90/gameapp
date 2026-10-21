APEX RUN: NO LIMITS — AFRICA SCENE CAMPAIGN UPDATE

FILES
- app/apex.tsx
- src/apex/AfricaScene.tsx
- src/apex/storage.ts

INSTALL
1. Back up the matching files in your mobile project.
2. Extract this ZIP into the mobile project root (the folder containing app/ and src/).
3. Allow the files to overwrite their matching paths.
4. Run the existing Expo dev-client workflow and test on an actual device.

INCLUDED IN THIS UPDATE
- Ten Africa destinations with region palettes, biome scenery, landmarks, distinct checkpoint sequences, route-line road overlays and checkpoint gates.
- Touch driving controls: steering, accelerator, brake and nitro.
- Traffic and building collisions with speed penalties, plus a driving report for impacts, off-road time and nitro use.
- Region-dependent rival pacing, waypoint navigation that carries movement across gates, race result handling, and retry/replay controls.
- Region-specific optional bonus objectives; a first successful clear awards 250 coins, plus 100 extra coins when the region's bonus objective is met. First-clear rewards are protected by saved completion state.
- Medal/time scoring (gold 3 Cup points, silver 2, bronze 1), saved best times and saved best regional Cup score.
- On-screen Cup standings, sequential destination progression, garage access, regional briefings/debriefs and story links in the existing Story panel.
- Renderer/scene resource cleanup when switching destinations or leaving the scene.

PROJECT STATUS / LIMITATIONS
- The environments are lightweight procedural 3D scenes, not full-scale, detailed recreations of real African cities or one seamless GTA-sized world.
- Story missions and the Africa Grand Championship remain connected through the existing Story panel/race engine. The Africa Tour scene itself is the ten-destination driving campaign.
- Europe is not built by this update; the Africa milestone can earn the invitation/status that points toward Europe.
- Syntax transpilation and ZIP integrity checks were run. The project has no installed node_modules in this workspace, so a full strict TypeScript project check, Expo build, and real-device playthrough could not be run here. Run those checks before release.
