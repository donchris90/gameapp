import { chapterProgress } from './story';

// Everything the story needs beyond the missions themselves: the look of each race, the dialogue,
// the needs (upgrades, licence, fuel, papers) and the Africa completion check. It lives in its own file
// so it never depends on story.ts being the very latest copy.

/** Visual-only look for each story race: sky, light and ground. The race rules never read it. */
export const STORY_SKINS: Record<string, { sky: number; horizon: number; fog: number; sun: number; sunPower: number; ambient: number; ground: number; night: boolean; lamps: boolean }> = {
  'one-more-start': { sky: 0x4a8fd8, horizon: 0xffd9a8, fog: 0xffd9a8, sun: 0xffe2b0, sunPower: 2.0, ambient: 0xffe8cf, ground: 0x6f8a4a, night: false, lamps: false },
  'the-night-run': { sky: 0x070b22, horizon: 0x2a2f66, fog: 0x141a40, sun: 0x8ea6ff, sunPower: 1.0, ambient: 0x7a8ccc, ground: 0x1d2a2c, night: true, lamps: true },
  'africa-accra-welcome': { sky: 0x2f8fd8, horizon: 0xffe0a8, fog: 0xffe0a8, sun: 0xffe2b0, sunPower: 2.2, ambient: 0xfff0d8, ground: 0x4f8a3a, night: false, lamps: false },
  'africa-abidjan-rhythm': { sky: 0x0b1a2c, horizon: 0x2f5a6a, fog: 0x1a3342, sun: 0x9fd0ff, sunPower: 1.1, ambient: 0x7aa0b8, ground: 0x1a2c2a, night: true, lamps: true },
  'africa-dakar-dust': { sky: 0x4a8fd0, horizon: 0xf2d39a, fog: 0xe8c88a, sun: 0xfff0c8, sunPower: 2.3, ambient: 0xffecc8, ground: 0xc9a15a, night: false, lamps: false },
  'africa-nairobi-crossing': { sky: 0x3c86d6, horizon: 0xdbe9f2, fog: 0xd3e3ee, sun: 0xfff6e0, sunPower: 2.2, ambient: 0xe0eeff, ground: 0x8a9a4a, night: false, lamps: false },
  'africa-cairo-signal': { sky: 0x5a3f86, horizon: 0xffb070, fog: 0xeaa268, sun: 0xffb27a, sunPower: 1.8, ambient: 0xffd8b0, ground: 0xd2b074, night: false, lamps: true },
  'africa-atlas-ascent': { sky: 0x3a6fb0, horizon: 0xc9d9ea, fog: 0xc2d2e4, sun: 0xf4f8ff, sunPower: 2.0, ambient: 0xd0e0f4, ground: 0x7a6a5a, night: false, lamps: false },
  'africa-namib-last-light': { sky: 0x4a3a7a, horizon: 0xff9a5a, fog: 0xe0845a, sun: 0xffa060, sunPower: 1.7, ambient: 0xffc8a0, ground: 0xc7743a, night: false, lamps: true },
  'africa-cape-storm': { sky: 0x34445c, horizon: 0x93a4b8, fog: 0x8797ab, sun: 0xcfd8e6, sunPower: 1.2, ambient: 0xaebbd0, ground: 0x4f6b4a, night: false, lamps: false },
  'africa-victoria-falls': { sky: 0x4b9be0, horizon: 0xe0f2ee, fog: 0xd5ece6, sun: 0xffffff, sunPower: 2.1, ambient: 0xe4f4f0, ground: 0x2f7a4a, night: false, lamps: false },
  'africa-johannesburg-qualifier': { sky: 0x2b2a5a, horizon: 0xff8a5a, fog: 0xc86a58, sun: 0xffa070, sunPower: 1.5, ambient: 0xe0b0a0, ground: 0x2a2f3a, night: false, lamps: true },
  'africa-grand-championship': { sky: 0x050818, horizon: 0x3a2f7a, fog: 0x1a1a4a, sun: 0xb8c8ff, sunPower: 1.2, ambient: 0x8a98d8, ground: 0x222c46, night: true, lamps: true },
};

export interface StoryLine { who: string; line: string }

/** Short scenes shown before a mission starts and after it is won. */
export const STORY_TALK: Record<string, { before: StoryLine[]; after: StoryLine }> = {
  'one-more-start': { before: [{ who: 'Tomi', line: 'She coughs, but she runs. Do not push her hard on the first corner.' }, { who: 'You', line: 'Dad built this engine. I just need one clean start.' }], after: { who: 'Tomi', line: 'Listen to that. Your father would be smiling.' } },
  'the-night-run': { before: [{ who: 'Darius Cole', line: 'Nice old car. Try not to leave pieces of it under the bridge.' }, { who: 'Mara Okafor', line: 'Ignore him. Clean laps, top three, and people will start asking your name.' }], after: { who: 'Mara Okafor', line: 'That is how you answer Darius. Quietly, and fast.' } },
  'earn-your-name': { before: [{ who: 'Mara Okafor', line: 'One lucky win gets forgotten by Monday. Three honest races get you respect.' }], after: { who: 'Mara Okafor', line: 'Now they know you show up. A lead just came in.' } },
  'the-stolen-blueprint': { before: [{ who: 'Tomi', line: 'The workshop was turned over. Your father’s notebook is gone.' }, { who: 'Mara Okafor', line: 'Someone downtown saw the thief. Beat the field there and they will talk.' }], after: { who: 'Tomi', line: 'The trail points to Darius’s crew. I knew it.' } },
  'lagos-grand-sprint': { before: [{ who: 'Darius Cole', line: 'Win this and take your invitation. Lose, and go back to fixing cars.' }, { who: 'You', line: 'I am not racing for a trophy. I am racing for my father’s notebook.' }], after: { who: 'Mara Okafor', line: 'The Lagos Crown is yours. An invitation just arrived. Ghana wants you.' } },
  'africa-accra-welcome': { before: [{ who: 'Mara Okafor', line: 'First event outside Nigeria. Finish clean and Accra will remember you.' }], after: { who: 'Mara Okafor', line: 'Good start. Abidjan is next, and it is faster.' } },
  'africa-abidjan-rhythm': { before: [{ who: 'Tomi', line: 'Tight streets, brake early. Darius’s contact is in the crowd tonight.' }], after: { who: 'Tomi', line: 'He left a message: the notebook was sold on. Dakar next.' } },
  'africa-dakar-dust': { before: [{ who: 'Amadou', line: 'Sand does not forgive big steering. Keep the car smooth.' }], after: { who: 'Amadou', line: 'Respect. East Africa will want to meet you.' } },
  'africa-nairobi-crossing': { before: [{ who: 'Mara Okafor', line: 'A sponsor is watching. Beat the city racers and they fund the next leg.' }], after: { who: 'Mara Okafor', line: 'Sponsor signed. The road to Cairo is open.' } },
  'africa-cairo-signal': { before: [{ who: 'Amara Diallo', line: 'The coded note names a mechanic here. She only meets the desert winner.' }, { who: 'You', line: 'Then I win.' }], after: { who: 'Amara Diallo', line: 'The note mentions a buyer called Vanguard. Same name Elena found.' } },
  'africa-atlas-ascent': { before: [{ who: 'Tomi', line: 'Hairpins all the way up. Gentle on the brakes, or they will fade.' }], after: { who: 'Tomi', line: 'We have a shipping broker’s name. Now we go south.' } },
  'africa-namib-last-light': { before: [{ who: 'Elena Voss', line: 'Long coast road, time to think. The broker moves parts and data for Vanguard.' }], after: { who: 'Elena Voss', line: 'The trail ends in South Africa. Cape Town next.' } },
  'africa-cape-storm': { before: [{ who: 'Rafael Costa', line: 'Beat my time on these roads and I will drive with your team.' }], after: { who: 'Rafael Costa', line: 'Fair enough. You earned a teammate.' } },
  'africa-victoria-falls': { before: [{ who: 'Amara Diallo', line: 'Vanguard has been buying race telemetry to build an unbeatable car. I need proof.' }], after: { who: 'Amara Diallo', line: 'Got it. Every file. They cannot hide this now.' } },
  'africa-johannesburg-qualifier': { before: [{ who: 'Victor Sloane', line: 'Win the qualifier and I will see you on the world stage. Lose, and the evidence goes away.' }], after: { who: 'Victor Sloane', line: 'You are on the grid. I will enjoy watching you try.' } },
  'africa-grand-championship': { before: [{ who: 'Darius Cole', line: 'Same grid at last. No tricks this time.' }, { who: 'Mara Okafor', line: 'From Lagos to here. Win it for all of us.' }], after: { who: 'Mara Okafor', line: 'King of the Continent. And Europe just called.' } },
};

/** Canonical region IDs used by the Africa Tour save data. */
export const AFRICA_CAMPAIGN_REGION_IDS = [
  'accra', 'abidjan', 'dakar', 'nairobi', 'cairo',
  'atlas', 'namib', 'victoria', 'cape', 'johannesburg',
] as const;

/**
 * Africa is complete only when every Africa story mission (including the Grand
 * Championship finale) is complete and every canonical regional drive is saved.
 * Checking the IDs, rather than just array length, prevents stale/unknown values
 * in old saves from unlocking Europe early.
 */
export const africaCampaignDone = (completed: string[], regions: string[]) => {
  const cleared = new Set(regions);
  const allRegionsCleared = AFRICA_CAMPAIGN_REGION_IDS.every((id) => cleared.has(id));
  return chapterProgress(completed, 'africa').complete && allRegionsCleared;
};

/**
 * Story "needs": things the car or the driver must have before a mission can start. Upgrades are part of the story:
 * an old engine that will not pull, bald tyres, a licence, fuel for a long road, border papers.
 * `price` is the story price (usually below the garage price, since Tomi and friends help out). It is paid once.
 */
export type NeedArt = 'engine' | 'tyres' | 'licence' | 'fuel' | 'border' | 'heat' | 'boost';
export interface StoryNeed {
  id: string; art: NeedArt; title: string; who: string; line: string; price: number;
  upgrade?: { kind: 0 | 1 | 2 | 3; level: number }; // kind: 0 engine, 1 turbo, 2 tyres, 3 nitro
  button: string;
}
const up = (kind: 0 | 1 | 2 | 3, level: number) => ({ kind, level });
export const STORY_NEEDS: Record<string, StoryNeed[]> = {
  'the-night-run': [{ id: 'n-engine-1', art: 'engine', title: 'The engine will not pull', who: 'Tomi', line: 'She coughs like an old man on a hill. Give me a new set of plugs and a tuned engine and she will fly. Friend price.', price: 250, upgrade: up(0, 1), button: 'TUNE THE ENGINE' }],
  'earn-your-name': [{ id: 'n-licence', art: 'licence', title: 'You need a racing licence', who: 'Mara Okafor', line: 'No licence, no city events. The office closes soon. Pay the fee, sit the test, get your photo taken. Smile.', price: 300, button: 'GET THE LICENCE' }],
  'the-stolen-blueprint': [{ id: 'n-tyres-1', art: 'tyres', title: 'Bald tyres on wet streets', who: 'Tomi', line: 'Look at these. You could read a newspaper through them. Downtown is all tight corners, so fit proper tyres.', price: 350, upgrade: up(2, 1), button: 'FIT NEW TYRES' }],
  'lagos-grand-sprint': [{ id: 'n-turbo-1', art: 'boost', title: 'Add a turbo for the finale', who: 'Tomi', line: 'Darius will have the fastest car in Lagos. We bolt on a turbo, and the old car bites back.', price: 500, upgrade: up(1, 1), button: 'INSTALL TURBO' }],
  'africa-accra-welcome': [{ id: 'n-papers-gh', art: 'border', title: 'Border papers for Ghana', who: 'Mara Okafor', line: 'The road to Accra crosses two borders. Car papers, a travel permit and the fees. Do it right or we sit at the gate all day.', price: 200, button: 'PAY FOR THE PAPERS' }],
  'africa-dakar-dust': [{ id: 'n-tyres-2', art: 'tyres', title: 'Tyres for the sand', who: 'Tomi', line: 'Dakar is sand and gravel. These road tyres will skate. Get grippy ones with a deeper tread.', price: 600, upgrade: up(2, 2), button: 'FIT SAND TYRES' }],
  'africa-nairobi-crossing': [{ id: 'n-fuel-ke', art: 'fuel', title: 'Out of fuel on the long road', who: 'Mara Okafor', line: 'Two thousand kilometres, and the tank is on empty. Fill up and carry spare cans, or we are pushing this thing to Nairobi.', price: 250, button: 'BUY FUEL AND CANS' }],
  'africa-cairo-signal': [{ id: 'n-engine-2', art: 'heat', title: 'The desert will cook the engine', who: 'Tomi', line: 'Hot sand, hot engine. Steam everywhere. A stronger engine with a better cooler, or we do not make it to Cairo.', price: 700, upgrade: up(0, 2), button: 'UPGRADE THE ENGINE' }],
  'africa-atlas-ascent': [{ id: 'n-nitro-1', art: 'boost', title: 'Mountain climb needs a boost', who: 'Amara Diallo', line: 'Steep climbs eat speed. A nitro system gives you a burst out of the hairpins. I can wire it in tonight.', price: 450, upgrade: up(3, 1), button: 'WIRE IN NITRO' }],
  'africa-namib-last-light': [{ id: 'n-fuel-na', art: 'fuel', title: 'Empty coast, no fuel stops', who: 'Elena Voss', line: 'Hundreds of kilometres with no stations. Fill every tank and carry extra, or we are stuck in the dunes.', price: 300, button: 'BUY FUEL AND CANS' }],
  'africa-cape-storm': [{ id: 'n-turbo-2', art: 'boost', title: 'A stronger turbo', who: 'Rafael Costa', line: 'Those mountain roads punish a weak turbo. Upgrade it, and you might keep up with me.', price: 800, upgrade: up(1, 2), button: 'UPGRADE THE TURBO' }],
  'africa-victoria-falls': [{ id: 'n-papers-zm', art: 'border', title: 'Crossing permits for Zambia and Zimbabwe', who: 'Mara Okafor', line: 'Two borders, a car permit, and a fee at each. The officers are strict. Papers first, racing second.', price: 400, button: 'PAY FOR THE PERMITS' }],
  'africa-johannesburg-qualifier': [{ id: 'n-engine-3', art: 'engine', title: 'A proper race engine', who: 'Tomi', line: 'The old block has carried you across a continent. For the qualifier we build it properly. This is the big one.', price: 1000, upgrade: up(0, 3), button: 'BUILD THE ENGINE' }],
  'africa-grand-championship': [
    { id: 'n-tyres-3', art: 'tyres', title: 'Race tyres for the final', who: 'Tomi', line: 'Final tyres. The best grip we can fit. The whole continent is watching.', price: 900, upgrade: up(2, 3), button: 'FIT RACE TYRES' },
    { id: 'n-nitro-2', art: 'boost', title: 'A bigger nitro tank', who: 'Amara Diallo', line: 'One more trick. I doubled the nitro tank, so you have a burst when it counts.', price: 900, upgrade: up(3, 2), button: 'UPGRADE NITRO' },
  ],
};
export const needsFor = (missionId: string): StoryNeed[] => STORY_NEEDS[missionId] ?? [];
export const needDone = (need: StoryNeed, done: string[], levels: number[]) =>
  done.includes(need.id) || (!!need.upgrade && (levels[need.upgrade.kind] ?? 0) >= need.upgrade.level);
