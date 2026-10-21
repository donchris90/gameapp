APEX RUN: NO LIMITS — STORY IMAGE INTEGRATION

Files to copy into the mobile project root (the folder containing app/ and src/):
- app/apex.tsx
- src/apex/StoryScene.tsx
- src/apex/storyArt.ts
- assets/story/*.png

What this update does:
- Adds locally bundled story artwork so story screens work offline.
- Shows an image banner in the pre-mission dialogue scene.
- Adds an image thumbnail to every Lagos and Africa story mission card.
- Adds a cinematic image header to the Africa-completion / Europe-invitation screen.
- Maps story mission IDs to bundled assets using static React Native require() calls for Metro compatibility.

Artwork note:
The included artwork is cropped from a generated Apex Run concept collage. Some crops may contain small baked-in concept UI/text. These are illustrative story images, not gameplay screenshots or final bespoke character renders. Replace them with individual clean illustrations when commissioned/generated.

Validation performed:
- TypeScript/TSX syntax transpilation passed for all three changed TypeScript files.
- Full project type-check, Expo build, and device testing were not performed in this workspace.
