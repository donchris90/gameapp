import { CareerRaceResult } from './career';

export type StoryChapter = 'lagos' | 'africa';
export interface StoryMission {
  id: string;
  chapter: StoryChapter;
  title: string;
  subtitle: string;
  briefing: string;
  track: string;
  level: number;
  objective: string;
  reward: string;
  requirement: 'finish' | 'podium' | 'three-races' | 'win';
  lockedHint?: string;
}

/** Chapter 1: Lagos origin. These missions reuse the tested race engine. */
export const LAGOS_STORY: StoryMission[] = [
  {
    id: 'one-more-start', chapter: 'lagos', title: 'One More Start', subtitle: 'TOMI’S WORKSHOP · LAGOS, NIGERIA',
    briefing: 'Your father’s old car is barely running. Tomi has repaired enough to make one test run possible. Prove the engine still has life in it.',
    track: 'coast', level: 1, objective: 'Finish your first race.', reward: 'Story progress + first-race reward', requirement: 'finish',
  },
  {
    id: 'the-night-run', chapter: 'lagos', title: 'The Night Run', subtitle: 'UNDER THE BRIDGE · LAGOS, NIGERIA',
    briefing: 'Darius Cole has challenged you to a night event. The car is outmatched, so keep it clean, learn the racing line, and make the finish count.',
    track: 'circuit', level: 1, objective: 'Finish in the top three on Apex Circuit.', reward: 'Story progress + podium rewards', requirement: 'podium',
  },
  {
    id: 'earn-your-name', chapter: 'lagos', title: 'Earn Your Name', subtitle: 'THE CITY IS WATCHING · LAGOS',
    briefing: 'Prize money is tight. Mara tells you to stop chasing one lucky win and build consistency. Complete three races to earn enough respect for the next lead.',
    track: 'coast', level: 1, objective: 'Complete at least three races in total.', reward: 'Story progress + normal race rewards', requirement: 'three-races',
  },
  {
    id: 'the-stolen-blueprint', chapter: 'lagos', title: 'The Stolen Blueprint', subtitle: 'DOWNTOWN · AFTER DARK',
    briefing: 'Someone broke into Tomi’s workshop and stole your father’s notebook. Follow a lead into the city and prove you can compete on tighter roads.',
    track: 'city', level: 6, objective: 'Place in the top three on Downtown Night.', reward: 'Story progress + podium rewards', requirement: 'podium',
    lockedHint: 'Reach career level 6 to unlock Downtown Night.',
  },
  {
    id: 'lagos-grand-sprint', chapter: 'lagos', title: 'The Lagos Grand Sprint', subtitle: 'CHAPTER FINALE · LAGOS, NIGERIA',
    briefing: 'The stolen notebook points back to Darius’s crew. Win the Lagos Grand Sprint and earn the invitation that can take your team beyond Nigeria.',
    track: 'coast', level: 6, objective: 'Win the race to earn the Lagos Crown.', reward: 'Lagos chapter complete · Africa invitation unlocked', requirement: 'win',
  },
];

/**
 * Chapter 2: The African tour. It is a playable championship campaign using the
 * project's existing race tracks, career unlocks, reward loop, and save system.
 * Country names and story beats identify each event; the tracks themselves are
 * the existing game environments, not bespoke real-world city recreations.
 */
export const AFRICA_STORY: StoryMission[] = [
  {
    id: 'africa-accra-welcome', chapter: 'africa', title: 'Across the Border', subtitle: 'ACCRA STREET INVITATIONAL · GHANA',
    briefing: 'Mara secures the team’s first event outside Nigeria. A local favourite offers you a place on the grid, but says Lagos drivers have more noise than discipline. Finish clean and earn respect.',
    track: 'coast', level: 6, objective: 'Finish the Accra Invitational.', reward: 'Africa Tour unlocked · race earnings + career XP', requirement: 'finish',
  },
  {
    id: 'africa-abidjan-rhythm', chapter: 'africa', title: 'City Rhythm', subtitle: 'ABIDJAN NIGHT SPRINT · CÔTE D’IVOIRE',
    briefing: 'A fast, technical street event puts your braking and lane control to the test. Darius’s contact is watching from the crowd and sends a message after the finish: the stolen notebook was traded further north.',
    track: 'city', level: 6, objective: 'Place in the top three in Abidjan.', reward: 'Rival respect + podium earnings', requirement: 'podium',
  },
  {
    id: 'africa-dakar-dust', chapter: 'africa', title: 'Dust and Thunder', subtitle: 'DAKAR DUNE RUN · SENEGAL',
    briefing: 'The coast gives way to open sand and sweeping bends. A Dakar racer named Amadou challenges you to keep speed without losing control. The winner earns a lead toward the east African circuit.',
    track: 'dunes', level: 6, objective: 'Finish in the top three on Desert Esses.', reward: 'Dakar event reward + career XP', requirement: 'podium',
    lockedHint: 'Reach career level 6 to enter the Dakar event.',
  },
  {
    id: 'africa-nairobi-crossing', chapter: 'africa', title: 'The Long Crossing', subtitle: 'NAIROBI CITY CHALLENGE · KENYA',
    briefing: 'In Nairobi, a sponsor offers to fund the next leg if you can beat a pack of aggressive city racers. Keep your line through the tight corners and finish on the podium.',
    track: 'city', level: 8, objective: 'Place in the top three in Nairobi.', reward: 'Sponsor backing + career XP', requirement: 'podium',
  },
  {
    id: 'africa-cairo-signal', chapter: 'africa', title: 'Signal in the Sand', subtitle: 'CAIRO DESERT RUN · EGYPT',
    briefing: 'A coded note in your father’s notebook points to a former mechanic in Cairo. They will only meet the driver who wins the desert event. The message mentions a European buyer named Vanguard.',
    track: 'dunes', level: 10, objective: 'Win the Cairo Desert Run.', reward: 'Notebook clue revealed · race earnings', requirement: 'win',
    lockedHint: 'Reach career level 10 to unlock the desert challenge.',
  },
  {
    id: 'africa-atlas-ascent', chapter: 'africa', title: 'The Atlas Ascent', subtitle: 'MOUNTAIN PASS · MOROCCO',
    briefing: 'The mechanic traces the notebook’s buyer to a shipping broker. Before you can reach them, you must survive the Atlas mountain invitational: narrow hairpins, steep changes and no room for careless steering.',
    track: 'pass', level: 10, objective: 'Finish the Atlas Ascent in the top three.', reward: 'Atlas medal + career XP', requirement: 'podium',
  },
  {
    id: 'africa-namib-last-light', chapter: 'africa', title: 'Last Light', subtitle: 'NAMIB COAST RUN · NAMIBIA',
    briefing: 'A long coastal race gives the team time to regroup. Elena discovers that the shipping broker has been moving parts and vehicle data for Vanguard. The trail now leads to South Africa.',
    track: 'coast', level: 12, objective: 'Complete the Namib Coast Run.', reward: 'New lead + race earnings', requirement: 'finish',
  },
  {
    id: 'africa-cape-storm', chapter: 'africa', title: 'Cape Storm', subtitle: 'CAPE TOWN MOUNTAIN SPRINT · SOUTH AFRICA',
    briefing: 'Cape Town’s mountain roads punish every mistake. Rafael, a former championship contender, agrees to help if you beat his time and prove you can handle a serious car without relying on raw speed alone.',
    track: 'pass', level: 14, objective: 'Place in the top three at Cape Storm.', reward: 'Rafael joins the team · podium earnings', requirement: 'podium',
  },
  {
    id: 'africa-victoria-falls', chapter: 'africa', title: 'The Edge of the Map', subtitle: 'VICTORIA FALLS GRAND CIRCUIT · ZAMBIA / ZIMBABWE',
    briefing: 'The team follows the broker’s trail inland. At the international event near Victoria Falls, Amara uncovers proof that Vanguard has been buying race telemetry to build an unbeatable car. Take the win and expose the deal.',
    track: 'circuit', level: 16, objective: 'Win the Victoria Falls Grand Circuit.', reward: 'Vanguard evidence secured + race earnings', requirement: 'win',
  },
  {
    id: 'africa-johannesburg-qualifier', chapter: 'africa', title: 'No Turning Back', subtitle: 'JOHANNESBURG ELITE QUALIFIER · SOUTH AFRICA',
    briefing: 'Vanguard’s African representative offers a final qualifier: win and the team receives an invitation to the international championship. Lose, and the evidence may disappear. Tomi prepares the car for its hardest test yet.',
    track: 'city', level: 18, objective: 'Win the Johannesburg Elite Qualifier.', reward: 'Championship grid position + major race earnings', requirement: 'win',
  },
  {
    id: 'africa-grand-championship', chapter: 'africa', title: 'King of the Continent', subtitle: 'AFRICA GRAND CHAMPIONSHIP · JOHANNESBURG',
    briefing: 'Every race across the continent has led to this grid. Darius’s crew arrives, Vanguard’s scouts are watching, and your team finally has a car worthy of the challenge. Win the African Championship and earn the right to take the fight to Europe.',
    track: 'circuit', level: 20, objective: 'Win the Africa Grand Championship.', reward: 'African Championship won · Europe invitation earned', requirement: 'win',
  },
];

export const STORY_MISSIONS: StoryMission[] = [...LAGOS_STORY, ...AFRICA_STORY];

export function storyMissionComplete(
  mission: StoryMission,
  result: CareerRaceResult,
  totalRacesAfterResult: number,
): boolean {
  if (result.ticks <= 0) return false;
  switch (mission.requirement) {
    case 'finish': return true;
    case 'podium': return result.rank >= 1 && result.rank <= 3 && result.track === mission.track;
    case 'three-races': return totalRacesAfterResult >= 3;
    case 'win': return result.rank === 1 && result.track === mission.track;
    default: return false;
  }
}

export function currentStoryMission(completed: string[]): StoryMission | null {
  return STORY_MISSIONS.find((mission) => !completed.includes(mission.id)) ?? null;
}

export function chapterProgress(completed: string[], chapter: StoryChapter) {
  const missions = STORY_MISSIONS.filter((mission) => mission.chapter === chapter);
  return { total: missions.length, completed: missions.filter((mission) => completed.includes(mission.id)).length, complete: missions.every((mission) => completed.includes(mission.id)) };
}

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

/** The Africa campaign is done when the championship is won and all ten regional drives are cleared. */
export const africaCampaignDone = (completed: string[], regions: string[]) =>
  chapterProgress(completed, 'africa').complete && regions.length >= 10;
