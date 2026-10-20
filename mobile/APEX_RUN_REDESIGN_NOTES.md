# Apex Run redesign — first implementation pass

## Included in this build
- Redesigned Apex Run home screen with dark navy, neon-blue/purple styling and quick-access navigation.
- Garage with four car classes mapped to the existing deterministic race stats.
- Coin wallet and race completion rewards, persisted alongside existing Apex settings in SecureStore.
- Coin-based car unlocks and career-level requirements.
- Workshop paint selection persisted and passed into the 3D race car.
- Rotating Three.js car preview component used by Garage and Customize screens.
- Switchable chase/cockpit camera button during races.
- Existing level, tilt steering, invert tilt, traffic, nitro, bots, race standings and top-three level unlock behavior preserved.
- Friends-first multiplayer scope screen explaining server dependency rather than pretending online rooms already work.

## Important scope boundary
This archive contains the mobile app package. It does not contain a confirmed multiplayer server implementation. Real private rooms, invite codes, synchronized online races and server-validated rewards still require the backend repository/API contract and a separate implementation pass.

## Validation
- TypeScript/TSX syntax transpilation passed for the modified Apex files.
- A full project typecheck/build could not be completed in this environment because npm dependency installation timed out. Please run the project's normal install and Expo validation before building an APK.
