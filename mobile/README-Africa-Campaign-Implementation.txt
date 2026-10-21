APEX RUN: NO LIMITS — AFRICA CAMPAIGN IMPLEMENTATION

CAMPAIGN CONTENT
- 7 sequential Lagos story missions and 49 sequential Africa story missions (56 total).
- The full mission list is rendered in story order, including expansion missions.
- Every story mission has a briefing, dialogue scene, mission thumbnail/art fallback, track, requirement and progression gate.
- Ten separate procedural Africa regional driving challenges are retained: Accra, Abidjan, Dakar, Nairobi, Cairo, Atlas Pass, Namib Coast, Victoria Falls, Cape Town and Johannesburg.
- Regional driving has ordered checkpoints, rival timing, destination-specific route layouts, bonus objectives, medals, saved best times and Cup points.

NEW STORY SYSTEMS IN THIS BUILD
- Persistent story fuel and car condition, saved with the existing Apex settings.
- Story workshop before each mission with paid refuelling (+25 fuel for 100 coins) and repairs (+25 condition for 150 coins).
- Race approach choices: balanced, speed, grip and reliability. Speed/grip affect the race setup; speed consumes more fuel and wears the car harder, while reliability reduces fuel use and wear.
- Persistent crew trust and evidence/clue tracking.
- Saved decisions for Darius, Vanguard's offer, Amara and the final evidence release; choices update crew trust and the final invitation reports the chosen evidence path.
- The Africa story list now displays all 49 African missions, rather than only the original eleven base missions.
- Story mission ordering in the Lagos screen now matches the sequential progression order.

TECHNICAL NOTES / LIMITATIONS
- Story race missions still use the existing five race tracks and race engine. Story text and decisions do not create bespoke GTA-scale free-roam missions, police systems, stealth mechanics, fully simulated delivery routes or destructible vehicles.
- The Lagos and Africa free-drive scenes are compact procedural mobile-friendly environments, not handcrafted, full-scale real-world city maps.
- Story choices persist and affect trust/evidence/ending presentation, but do not yet branch the entire mission graph into separate campaigns.
- Fuel/condition are story-mode systems; normal career races and free-drive challenges do not consume these resources.
- Europe remains an invitation/epilogue screen, not a playable chapter.

VALIDATION PERFORMED
- TypeScript/TSX syntax transpilation passed for 63 project source files.
- Campaign data check: 56 unique mission IDs (7 Lagos, 49 Africa); every mission uses a supported existing track.
- Full TypeScript type-check, Metro bundle, Android build and device playthrough could not be completed because package installation did not finish in this environment. These must be run on the development machine with dependencies installed before release.
