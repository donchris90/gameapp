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
