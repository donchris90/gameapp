export type EuropeRequirement = 'finish' | 'podium' | 'win';
export interface EuropeMission {
  id: string;
  title: string;
  city: string;
  subtitle: string;
  briefing: string;
  track: 'circuit' | 'coast' | 'dunes' | 'city' | 'pass';
  level: number;
  requirement: EuropeRequirement;
  objective: string;
  reward: number;
}
export const EUROPE_MISSIONS: EuropeMission[] = [
  { id: 'europe-london-arrival', title: 'Cold Arrival', city: 'London, United Kingdom', subtitle: 'DOCKLANDS NIGHT SPRINT · LONDON', briefing: 'Tomi arrives in Europe with the African title and a damaged trail of evidence. Vanguard’s works team controls the invite-only grid. Beat their local driver and get inside.', track: 'city', level: 20, requirement: 'podium', objective: 'Finish on the podium in London.', reward: 900 },
  { id: 'europe-london-blackout', title: 'Blackout Protocol', city: 'London, United Kingdom', subtitle: 'RIVERSIDE CIRCUIT · LONDON', briefing: 'The first race is interrupted by a telemetry blackout. Mara suspects someone is testing the same manipulation used in Johannesburg. Win the rematch and secure the timing logs.', track: 'circuit', level: 20, requirement: 'win', objective: 'Win the Riverside Circuit.', reward: 1100 },
  { id: 'europe-paris-contact', title: 'A Contact in Paris', city: 'Paris, France', subtitle: 'PÉRIPHÉRIQUE RUN · PARIS', briefing: 'A journalist offers to authenticate the files, but only after you prove Vanguard cannot buy every result. Keep control through the city route and earn the meeting.', track: 'coast', level: 21, requirement: 'finish', objective: 'Finish the Paris route.', reward: 950 },
  { id: 'europe-paris-double-cross', title: 'Double-Cross at Midnight', city: 'Paris, France', subtitle: 'MIDNIGHT INVITATIONAL · PARIS', briefing: 'The meeting is leaked. A rival crew tries to force Tomi out before the journalist can hand over a key. Take the win and recover the contact’s evidence.', track: 'city', level: 21, requirement: 'win', objective: 'Win the midnight invitational.', reward: 1250 },
  { id: 'europe-amsterdam-slipstream', title: 'Slipstream', city: 'Amsterdam, Netherlands', subtitle: 'CANAL RING · AMSTERDAM', briefing: 'A courier carries a drive containing the European race-control records. The route is fast and narrow; catch the courier’s team before the drive leaves the city.', track: 'circuit', level: 22, requirement: 'podium', objective: 'Finish in the top three.', reward: 1100 },
  { id: 'europe-berlin-underpass', title: 'Underpass Kings', city: 'Berlin, Germany', subtitle: 'BERLIN NIGHT GRID · BERLIN', briefing: 'The courier identifies a private test facility. Berlin’s underground crew demands a race before sharing the access code. Darius warns Tomi that this team never loses cleanly.', track: 'city', level: 23, requirement: 'win', objective: 'Win the Berlin night grid.', reward: 1400 },
  { id: 'europe-alps-heat', title: 'Thin Air', city: 'Swiss Alps', subtitle: 'ALPINE PASS · SWITZERLAND', briefing: 'The access code points to an alpine proving ground. The old car’s cooling and brakes will be tested on the climbs and hairpins. Reach the finish to expose the prototype route.', track: 'pass', level: 24, requirement: 'finish', objective: 'Complete the Alpine Pass.', reward: 1300 },
  { id: 'europe-milan-prototype', title: 'Prototype Zero', city: 'Milan, Italy', subtitle: 'MILAN MOTOR SHOW SPRINT · MILAN', briefing: 'Vanguard unveils a prototype built from stolen telemetry. Rafael spots a flaw in its setup. Beat the prototype driver and get close enough to inspect the car.', track: 'circuit', level: 25, requirement: 'win', objective: 'Beat the prototype driver.', reward: 1600 },
  { id: 'europe-barcelona-switch', title: 'The Switch', city: 'Barcelona, Spain', subtitle: 'COASTLINE CHASE · BARCELONA', briefing: 'Amara discovers that the race-control master key is moving through Barcelona. A planted route sends the crew toward an ambush; trust the evidence, not the radio.', track: 'coast', level: 26, requirement: 'podium', objective: 'Finish in the top three.', reward: 1500 },
  { id: 'europe-monaco-pressure', title: 'Million-Euro Pressure', city: 'Monaco', subtitle: 'MONACO HARBOUR GRAND PRIX · MONTE CARLO', briefing: 'Vanguard’s European director offers to erase the case if Tomi throws the showcase race. The crew is split, the stakes are public, and the only honest answer is on the track.', track: 'circuit', level: 27, requirement: 'win', objective: 'Win the Monaco showcase.', reward: 1900 },
  { id: 'europe-prague-evidence', title: 'The Evidence Room', city: 'Prague, Czechia', subtitle: 'OLD CITY NIGHT RUN · PRAGUE', briefing: 'The Monaco win opens a secure archive in Prague. Race the extraction route while Vanguard tries to wipe the final records connecting the European works team to Tomi’s father.', track: 'city', level: 28, requirement: 'finish', objective: 'Finish the evidence extraction run.', reward: 1800 },
  { id: 'europe-nurburgring-final', title: 'No Limits', city: 'Nürburgring, Germany', subtitle: 'EUROPEAN WORKS FINAL · NÜRBURGRING', briefing: 'The evidence is public, but Vanguard’s director challenges Tomi to one final race to decide who controls the future of Project Apex. The African champion has reached the world stage. Bring it home.', track: 'circuit', level: 30, requirement: 'win', objective: 'Win the European Works Final.', reward: 3000 },
];
export function europeMissionComplete(mission: EuropeMission, result: { ticks: number; rank: number; track: string }) {
  if (result.ticks <= 0 || result.track !== mission.track) return false;
  if (mission.requirement === 'win') return result.rank === 1;
  if (mission.requirement === 'podium') return result.rank >= 1 && result.rank <= 3;
  return true;
}
export function currentEuropeMission(completed: string[]) {
  return EUROPE_MISSIONS.find((mission) => !completed.includes(mission.id)) ?? null;
}

export const EUROPE_TALK: Record<string, { before: { who: string; line: string }[] }> = {
  'europe-london-arrival': { before: [{ who: 'Mara Okafor', line: 'Sloane did not invite us here to race. He wants to see what evidence we brought.' }, { who: 'Tomi', line: 'Then we make sure everyone remembers who crossed the finish line first.' }, { who: 'Darius Cole', line: 'Docklands grid is live. Keep the car clean and earn the invitation.' }] },
  'europe-london-blackout': { before: [{ who: 'Amara Diallo', line: 'Timing telemetry dropped for six seconds. Same signature as the Johannesburg finale.' }, { who: 'Rafael Costa', line: 'Someone is testing a way to rewrite the result while the race is still running.' }, { who: 'Tomi', line: 'We win the rematch and take the logs before they vanish.' }] },
  'europe-paris-contact': { before: [{ who: 'Elena Voss', line: 'A journalist in Paris can authenticate the notebook, but she does not trust racers.' }, { who: 'Tomi', line: 'She does not have to trust me. She only has to see the proof.' }, { who: 'Mara Okafor', line: 'Finish the route. I will keep the meeting location off the radio.' }] },
  'europe-paris-double-cross': { before: [{ who: 'Darius Cole', line: 'The meeting leaked. Two cars are circling the contact’s block.' }, { who: 'Elena Voss', line: 'The journalist has the evidence drive. If Vanguard gets it, the trail ends here.' }, { who: 'Tomi', line: 'Then we get there first. Nobody gets left behind.' }] },
  'europe-amsterdam-slipstream': { before: [{ who: 'Amara Diallo', line: 'The drive contains race-control records from every European event Sloane owns.' }, { who: 'Rafael Costa', line: 'The courier team knows the canal ring better than we do.' }, { who: 'Tomi', line: 'They have the route. We have the reason.' }] },
  'europe-berlin-underpass': { before: [{ who: 'Darius Cole', line: 'Berlin’s underground crew can get us inside the test facility. They want a win, not a speech.' }, { who: 'Mara Okafor', line: 'Do not chase their tricks through the underpass. Hold your line.' }, { who: 'Tomi', line: 'One race. Then they give us the access code.' }] },
  'europe-alps-heat': { before: [{ who: 'Rafael Costa', line: 'Long climb, tight hairpins. If your cooling is weak, the engine will lose power before the summit.' }, { who: 'Tomi', line: 'We brought the old car this far. I am not letting a mountain finish what Vanguard started.' }, { who: 'Amara Diallo', line: 'Brake early, keep the car settled, and bring back the proving-ground coordinates.' }] },
  'europe-milan-prototype': { before: [{ who: 'Elena Voss', line: 'The prototype uses a copy of your father’s telemetry. They built their advantage from his work.' }, { who: 'Tomi', line: 'Then I will look the driver in the eye when I beat him.' }, { who: 'Darius Cole', line: 'Milan grid in thirty seconds. Make them show the whole world.' }] },
  'europe-barcelona-switch': { before: [{ who: 'Amara Diallo', line: 'The master key is moving along the coast. The radio route is a trap.' }, { who: 'Mara Okafor', line: 'Trust the evidence board, not an unknown voice on comms.' }, { who: 'Tomi', line: 'We take the real route and expose whoever set us up.' }] },
  'europe-monaco-pressure': { before: [{ who: 'Victor Sloane', line: 'Throw the showcase race and I will make the case disappear. Your crew can go home rich.' }, { who: 'Tomi', line: 'My father’s name is not a bargaining chip.' }, { who: 'Darius Cole', line: 'Monaco is watching. Let the result speak.' }] },
  'europe-prague-evidence': { before: [{ who: 'Elena Voss', line: 'The archive is wiping itself. We have one run to reach the extraction point.' }, { who: 'Rafael Costa', line: 'If those records survive, they connect Vanguard to the cover-up.' }, { who: 'Tomi', line: 'Then every corner counts. We leave with the truth.' }] },
  'europe-nurburgring-final': { before: [{ who: 'Victor Sloane', line: 'You have the records. You have the headlines. But nobody remembers the second-place driver.' }, { who: 'Tomi', line: 'This is not about your title. It is about what you buried and what my father paid for.' }, { who: 'Mara Okafor', line: 'The whole crew is here, Tomi. Bring it home.' }] },
};

/** European visual palettes for the existing 3D race renderer; no extra texture bundle is required. */
export const EUROPE_SKINS: Record<string, { sky: number; horizon: number; fog: number; sun: number; sunPower: number; ambient: number; ground: number; night: boolean; lamps: boolean }> = {
  'europe-london-arrival': { sky: 0x101b35, horizon: 0x304b70, fog: 0x1b2b47, sun: 0x9cb9e8, sunPower: 0.24, ambient: 0x617aa4, ground: 0x1b283b, night: true, lamps: true },
  'europe-london-blackout': { sky: 0x090e21, horizon: 0x1b3158, fog: 0x131c35, sun: 0x759de2, sunPower: 0.12, ambient: 0x4e6b9b, ground: 0x121b2a, night: true, lamps: true },
  'europe-paris-contact': { sky: 0x647b9c, horizon: 0xc5a78e, fog: 0x9a9eae, sun: 0xffd4a1, sunPower: 0.55, ambient: 0xb5bac6, ground: 0x3a3b45, night: false, lamps: false },
  'europe-paris-double-cross': { sky: 0x14162d, horizon: 0x4a2e55, fog: 0x24213c, sun: 0xd39af8, sunPower: 0.16, ambient: 0x77729d, ground: 0x211c30, night: true, lamps: true },
  'europe-amsterdam-slipstream': { sky: 0x536b84, horizon: 0x86a9b4, fog: 0x8099a7, sun: 0xe5e3d2, sunPower: 0.42, ambient: 0x9bb7bf, ground: 0x303b42, night: false, lamps: false },
  'europe-berlin-underpass': { sky: 0x101323, horizon: 0x384257, fog: 0x222b3c, sun: 0x9eb9d8, sunPower: 0.18, ambient: 0x6d7e9d, ground: 0x1a202c, night: true, lamps: true },
  'europe-alps-heat': { sky: 0x72a2d0, horizon: 0xd4e1e9, fog: 0xabc3d7, sun: 0xffe8b3, sunPower: 0.82, ambient: 0xc3d8e8, ground: 0x536b63, night: false, lamps: false },
  'europe-milan-prototype': { sky: 0x687f9b, horizon: 0xb9a49b, fog: 0x9d9fa6, sun: 0xffd5a4, sunPower: 0.58, ambient: 0xb5b0ad, ground: 0x48434a, night: false, lamps: false },
  'europe-barcelona-switch': { sky: 0x4d9dc4, horizon: 0xd5b78b, fog: 0x8bb8c5, sun: 0xffe1a1, sunPower: 0.74, ambient: 0xb8d5d7, ground: 0x4c5145, night: false, lamps: false },
  'europe-monaco-pressure': { sky: 0x0d1831, horizon: 0x355b7b, fog: 0x1a2c48, sun: 0xffd0a1, sunPower: 0.34, ambient: 0x7392ad, ground: 0x1a2d3a, night: true, lamps: true },
  'europe-prague-evidence': { sky: 0x11152b, horizon: 0x5a4b68, fog: 0x2a273e, sun: 0xb5a4d7, sunPower: 0.14, ambient: 0x817997, ground: 0x262333, night: true, lamps: true },
  'europe-nurburgring-final': { sky: 0x344d69, horizon: 0x7d8e9c, fog: 0x657a8b, sun: 0xffd3a0, sunPower: 0.62, ambient: 0x9eacb6, ground: 0x394a3b, night: false, lamps: false },
};
