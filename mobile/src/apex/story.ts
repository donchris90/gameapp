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
