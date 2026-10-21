import { StoryLine } from './story';
export type { StoryLine };

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
