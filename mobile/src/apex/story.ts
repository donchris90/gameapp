import { CareerRaceResult } from './career';
import { JOB_BY_MISSION, jobKindLabel } from './jobs';
import { MORE_TALK } from './storyTalkMore';

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
  /** Optional extra gameplay condition enforced from the race result. */
  specialRule?: 'clean-finish' | 'low-damage';
  lockedHint?: string;
  /** Set when the mission is played as a job (see jobs.ts) instead of a race. */
  jobKind?: string;
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
    id: 'empty-tank', chapter: 'lagos', title: 'Empty Tank', subtitle: 'DELIVERY ROUTE · LAGOS, NIGERIA',
    briefing: 'Tomi accepts a small delivery job to pay for repairs. Halfway through, the fuel warning flashes and the customer starts calling. Finish the route before the delivery window closes, without wrecking the package.',
    track: 'coast', level: 1, objective: 'Finish the delivery run with no more than two collisions.', specialRule: 'low-damage', reward: 'Delivery earnings + fuel-system upgrade access', requirement: 'finish',
  },
  {
    id: 'no-licence-no-respect', chapter: 'lagos', title: 'No Licence, No Respect', subtitle: 'DRIVING ASSESSMENT · LAGOS',
    briefing: 'The next organiser refuses to admit Tomi without proof of controlled driving. Complete the assessment route without hitting rivals or pedestrians to earn access to official events.',
    track: 'city', level: 1, objective: 'Pass the assessment with zero collisions.', specialRule: 'clean-finish', reward: 'Official event access + career XP', requirement: 'finish',
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


/** Additional narrative races that fill out the continental story between the original destination milestones. */
const AFRICA_EXPANSION: StoryMission[] = [
  { id: 'accra-ghost-lap', chapter: 'africa', title: 'The Ghost Lap', subtitle: 'ACCRA DATA RUN · GHANA', briefing: 'Mara spots identical timing data in two supposedly independent races. Retrieve a data drive from a courier before the event organisers erase the record. The data must survive a clean run.', track: 'city', level: 6, objective: 'Finish the data-run with zero collisions.', specialRule: 'clean-finish', reward: 'Timing evidence + race earnings', requirement: 'finish' },
  { id: 'accra-second-flag', chapter: 'africa', title: 'The Second Flag', subtitle: 'ACCRA NIGHT FINAL · GHANA', briefing: 'The courier points to a relay vehicle leaving the venue. Race the local final, then follow the signal to its source.', track: 'circuit', level: 6, objective: 'Win the night final.', reward: 'Kade broker lead + career XP', requirement: 'win' },
  { id: 'abidjan-price-introduction', chapter: 'africa', title: 'The Price of an Introduction', subtitle: 'ABIDJAN DOCK ROAD · CÔTE D’IVOIRE', briefing: 'Broker Kade will not meet an unknown driver. Prove the crew can handle Abidjan’s technical roads and earn an introduction.', track: 'city', level: 6, objective: 'Finish in the top three.', reward: 'Broker meeting unlocked', requirement: 'podium' },
  { id: 'abidjan-no-cameras', chapter: 'africa', title: 'No Cameras', subtitle: 'INDUSTRIAL DISTRICT · ABIDJAN', briefing: 'The promised meeting is a trap. Escape the surveillance crew and reach the safe garage without losing the lead or taking too much damage.', track: 'coast', level: 6, objective: 'Finish the escape with no more than two collisions.', specialRule: 'low-damage', reward: 'Kade’s encrypted message', requirement: 'finish' },
  { id: 'abidjan-missing-courier', chapter: 'africa', title: 'The Missing Courier', subtitle: 'ABIDJAN SERVICE ROADS · CÔTE D’IVOIRE', briefing: 'A courier who carried the ledger fragment has vanished. Follow the vehicle trail and reach the rendezvous before Vanguard’s crew.', track: 'city', level: 6, objective: 'Win the pursuit.', reward: 'Witness testimony + race earnings', requirement: 'win' },
  { id: 'abidjan-burn-contract', chapter: 'africa', title: 'Burn the Contract', subtitle: 'ABIDJAN OUTBOUND · CÔTE D’IVOIRE', briefing: 'Kade offers his contract records if Tomi helps him escape. Keep the car intact through a long pursuit and get the broker to safety.', track: 'coast', level: 6, objective: 'Finish the escape route.', reward: 'Vanguard shipping lead', requirement: 'finish' },
  { id: 'dakar-sand-intake', chapter: 'africa', title: 'Sand in the Intake', subtitle: 'DAKAR ENDURANCE · SENEGAL', briefing: 'Dust and heat expose the old engine’s weaknesses. Darius asks Tomi to prove the car can finish a longer endurance route before the crew travels farther. Avoid heavy impacts that could finish the engine.', track: 'dunes', level: 6, objective: 'Finish the endurance race with no more than two collisions.', specialRule: 'low-damage', reward: 'Cooling and reliability tuning access', requirement: 'finish' },
  { id: 'dakar-long-route', chapter: 'africa', title: 'The Long Route', subtitle: 'COAST ROAD · SENEGAL', briefing: 'A promoter offers a suspicious shortcut. Mara recommends the safer route, but the team is running low on money and time.', track: 'coast', level: 6, objective: 'Finish the route race.', reward: 'Route record + career XP', requirement: 'finish' },
  { id: 'dakar-driver-remembered', chapter: 'africa', title: 'The Driver Who Remembered', subtitle: 'DAKAR COAST CIRCUIT · SENEGAL', briefing: 'An older driver remembers Tomi’s father. Win the technical event and earn a private conversation about the night he disappeared.', track: 'circuit', level: 6, objective: 'Place in the top three.', reward: 'Father’s past clue', requirement: 'podium' },
  { id: 'dakar-black-box', chapter: 'africa', title: 'The Black Box', subtitle: 'SERVICE YARD · DAKAR', briefing: 'A damaged recorder contains fragments from the old test. Vanguard agents are closing in; secure the device and get out.', track: 'city', level: 6, objective: 'Win the recovery run.', reward: 'Telemetry fragment recovered', requirement: 'win' },
  { id: 'nairobi-data-run', chapter: 'africa', title: 'The Data Run', subtitle: 'NAIROBI TEST ROUTE · KENYA', briefing: 'The recorder’s signal leads to a technology supplier. Complete a precise test route to gain access to the telemetry operation.', track: 'city', level: 8, objective: 'Finish in the top three.', reward: 'Telemetry operation lead', requirement: 'podium' },
  { id: 'nairobi-friend-inside', chapter: 'africa', title: 'A Friend on the Inside', subtitle: 'NAIROBI NIGHT EVENT · KENYA', briefing: 'Amara is racing for a Vanguard-backed team and claims she knows nothing about the data theft. Beat her and follow the trail she leaves behind.', track: 'circuit', level: 8, objective: 'Finish the rival event.', reward: 'Amara relationship scene', requirement: 'finish' },
  { id: 'nairobi-wrong-passenger', chapter: 'africa', title: 'The Wrong Passenger', subtitle: 'NAIROBI ESCAPE ROUTE · KENYA', briefing: 'A whistle-blower carrying telemetry files is exposed by a route leak. Get the passenger out while a pursuing crew tries to force the car off the road.', track: 'coast', level: 8, objective: 'Finish the escape with no more than two collisions.', specialRule: 'low-damage', reward: 'Crew-leak evidence', requirement: 'finish' },
  { id: 'nairobi-switch', chapter: 'africa', title: 'The Nairobi Switch', subtitle: 'TELEMETRY RELAY · KENYA', briefing: 'Tomi and Amara race to identify the relay vehicle before its data is wiped. Trusting Amara may be the fastest route, but Tomi must still finish the job.', track: 'city', level: 8, objective: 'Win the relay pursuit.', reward: 'Cairo Project Apex lead', requirement: 'win' },
  { id: 'cairo-desert-invitation', chapter: 'africa', title: 'The Desert Invitation', subtitle: 'CAIRO OUTER ROAD · EGYPT', briefing: 'Vanguard invites Tomi to an elite event that may be a trap. Cross the desert route and decide whether the team accepts the sponsor’s help.', track: 'dunes', level: 10, objective: 'Finish the desert run.', reward: 'Elite event access', requirement: 'finish' },
  { id: 'cairo-museum-car', chapter: 'africa', title: 'The Museum Car', subtitle: 'PRIVATE MOTOR COLLECTION · CAIRO', briefing: 'A restored car carries the same serial mark as Tomi’s vehicle. Win the exhibition race and gain access to its service records.', track: 'circuit', level: 10, objective: 'Place in the top three.', reward: 'Transfer record from the night of the disappearance', requirement: 'podium' },
  { id: 'cairo-floodlights', chapter: 'africa', title: 'Under the Floodlights', subtitle: 'CAIRO NIGHT FINAL · EGYPT', briefing: 'A Vanguard driver accuses Tomi of cheating and challenges the crew in front of the crowd. Win cleanly and expose the edited telemetry overlay.', track: 'city', level: 10, objective: 'Win the night race.', reward: 'Public rival exposed', requirement: 'win' },
  { id: 'cairo-project-files', chapter: 'africa', title: 'The Project Files', subtitle: 'VANGUARD DATA ROUTE · CAIRO', briefing: 'Mara locates a route to the central Project Apex files. Complete the high-pressure event and secure the evidence before the system is wiped.', track: 'coast', level: 10, objective: 'Finish the data recovery run.', reward: 'Project Apex revealed', requirement: 'finish' },
  { id: 'atlas-mountain-contract', chapter: 'africa', title: 'The Mountain Contract', subtitle: 'ATLAS PASS · MOROCCO', briefing: 'A former Vanguard engineer agrees to speak if Tomi can reach the meeting point. The mountain route punishes late braking and poor preparation.', track: 'pass', level: 10, objective: 'Finish in the top three.', reward: 'Engineer meeting unlocked', requirement: 'podium' },
  { id: 'atlas-cut-line', chapter: 'africa', title: 'The Cut Line', subtitle: 'ATLAS HAIRPINS · MOROCCO', briefing: 'Sabotage disables part of the car’s electrical system. Reach the repair point while a pursuing driver tries to block the mountain road. Every impact risks losing power.', track: 'pass', level: 10, objective: 'Finish the escape with no more than one collision.', specialRule: 'low-damage', reward: 'Sabotage evidence + diagnostics access', requirement: 'finish' },
  { id: 'atlas-what-darius-hid', chapter: 'africa', title: 'What Darius Hid', subtitle: 'HIDDEN STORAGE ROAD · MOROCCO', briefing: 'Tomi confronts Darius about the serial plate and his connection to the missing father. An old record points to a hidden storage site.', track: 'coast', level: 10, objective: 'Reach the storage route finish.', reward: 'Father’s survival clue', requirement: 'finish' },
  { id: 'atlas-betrayal', chapter: 'africa', title: 'The Atlas Betrayal', subtitle: 'ATLAS PASS FINALE · MOROCCO', briefing: 'The engineer’s meeting is ambushed. Amara appears to hand the recovered files to Vanguard. Tomi must escape with what remains.', track: 'city', level: 10, objective: 'Win the mountain escape.', reward: 'Encrypted message from Amara', requirement: 'win' },
  { id: 'namib-longest-night', chapter: 'africa', title: 'The Longest Night', subtitle: 'NAMIB COAST ENDURANCE · NAMIBIA', briefing: 'The team is divided and supplies are low. Complete a long coastal endurance run to reach a contact who can decode Amara’s message.', track: 'coast', level: 12, objective: 'Finish the endurance run.', reward: 'Crew regroup + reliability tuning', requirement: 'finish' },
  { id: 'namib-wreck-marker', chapter: 'africa', title: 'The Wreck Marker', subtitle: 'REMOTE COAST · NAMIBIA', briefing: 'A roadside marker leads to a wreck from an old Project Apex test. Recover its data module before the search crew arrives without damaging the recovered equipment.', track: 'dunes', level: 12, objective: 'Finish the recovery run with no more than two collisions.', specialRule: 'low-damage', reward: 'Evidence from the test night', requirement: 'finish' },
  { id: 'namib-ghost-convoy', chapter: 'africa', title: 'The Ghost Convoy', subtitle: 'COASTAL CONVOY · NAMIBIA', briefing: 'A convoy carries prototype components connected to Project Apex. Identify the correct vehicle and intercept it without losing control.', track: 'coast', level: 12, objective: 'Win the convoy pursuit.', reward: 'Prototype lead or route records', requirement: 'win' },
  { id: 'namib-signal-dawn', chapter: 'africa', title: 'The Signal at Dawn', subtitle: 'REMOTE RELAY · NAMIBIA', briefing: 'The recovered module contains a recording in Tomi’s father’s voice. Reach the relay point and secure the full signal before Vanguard arrives.', track: 'pass', level: 12, objective: 'Finish the relay run.', reward: 'Proof the father survived the original incident', requirement: 'finish' },
  { id: 'victoria-crossing', chapter: 'africa', title: 'The Crossing', subtitle: 'VICTORIA FALLS REGION · ZAMBIA / ZIMBABWE', briefing: 'A route closure forces the crew to find another way to the rendezvous. Complete the route challenge and keep the team’s supplies moving.', track: 'coast', level: 16, objective: 'Finish the crossing.', reward: 'Local contact support', requirement: 'finish' },
  { id: 'victoria-last-witness', chapter: 'africa', title: 'The Last Witness', subtitle: 'GRAND CIRCUIT · VICTORIA FALLS REGION', briefing: 'A former Vanguard driver witnessed the father’s escape. Win the local champion’s challenge and earn the testimony.', track: 'circuit', level: 16, objective: 'Place in the top three.', reward: 'Witness confirms father escaped', requirement: 'podium' },
  { id: 'victoria-price-silence', chapter: 'africa', title: 'The Price of Silence', subtitle: 'PRIVATE TEST ROUTE · VICTORIA FALLS REGION', briefing: 'Vanguard offers Tomi a guaranteed championship place in exchange for abandoning the investigation. The crew needs to decide how to respond.', track: 'city', level: 16, objective: 'Finish the test route.', reward: 'Branching dialogue and sponsor consequence', requirement: 'finish' },
  { id: 'victoria-broken-team', chapter: 'africa', title: 'The Broken Team', subtitle: 'SAFEHOUSE RUN · VICTORIA FALLS REGION', briefing: 'The threat triggers a crew argument. Recover a vehicle taken during the confrontation and reunite the team at a safe location.', track: 'coast', level: 16, objective: 'Finish the recovery run.', reward: 'Amara’s Cape Town rendezvous', requirement: 'finish' },
  { id: 'cape-invitation', chapter: 'africa', title: 'The Invitation', subtitle: 'CAPE TOWN QUALIFIERS · SOUTH AFRICA', briefing: 'Tomi enters the continental championship qualifiers. The car must prove it can compete with elite drivers without falling apart.', track: 'pass', level: 14, objective: 'Place in the top three.', reward: 'Continental championship access', requirement: 'podium' },
  { id: 'cape-rivals-confession', chapter: 'africa', title: 'A Rival’s Confession', subtitle: 'CAPE TOWN GARAGE ROAD · SOUTH AFRICA', briefing: 'Amara returns with proof that her apparent betrayal was an infiltration. Reconstruct her route and hear what she learned inside Vanguard.', track: 'city', level: 14, objective: 'Finish the evidence run.', reward: 'Crew trust restored', requirement: 'finish' },
  { id: 'cape-qualifier', chapter: 'africa', title: 'The Qualifier', subtitle: 'CONTINENTAL GRID · CAPE TOWN', briefing: 'The strongest drivers on the continent compete for the final grid. Finish high enough to secure Tomi’s place in the championship.', track: 'circuit', level: 14, objective: 'Win the qualifier.', reward: 'Championship grid position', requirement: 'win' },
  { id: 'cape-garage-raid', chapter: 'africa', title: 'The Garage Raid', subtitle: 'TEAM WORKSHOP · CAPE TOWN', briefing: 'Vanguard agents attempt to steal the evidence and disable Tomi’s car before the final. Escape, recover the stolen parts and get back to the workshop without taking too much damage.', track: 'coast', level: 14, objective: 'Finish the garage escape with no more than two collisions.', specialRule: 'low-damage', reward: 'Emergency repairs before the final', requirement: 'finish' },
  { id: 'johannesburg-last-tune', chapter: 'africa', title: 'The Last Tune', subtitle: 'CHAMPIONSHIP GARAGE · JOHANNESBURG', briefing: 'The crew prepares the old car for the final. Choose whether to spend the last budget on speed, grip or reliability before the hardest race yet.', track: 'pass', level: 18, objective: 'Finish the final test drive.', reward: 'Final race preparation', requirement: 'finish' },
  { id: 'johannesburg-championship', chapter: 'africa', title: 'The Championship', subtitle: 'AFRICA GRAND CHAMPIONSHIP · JOHANNESBURG', briefing: 'The race begins, but the telemetry behaves strangely. Race for the title while watching for a suspicious route change that could reveal Vanguard’s interference.', track: 'circuit', level: 20, objective: 'Win the Africa Grand Championship.', reward: 'Continental title + evidence trail', requirement: 'win' },
  { id: 'johannesburg-control-room', chapter: 'africa', title: 'The Control Room', subtitle: 'VANGUARD FACILITY · JOHANNESBURG', briefing: 'Mara and Amara locate the control system manipulating race data. Reach the facility before Sloane erases the logs.', track: 'city', level: 20, objective: 'Win the final pursuit.', reward: 'Vanguard’s race manipulation exposed', requirement: 'win' },
  { id: 'johannesburg-road-home', chapter: 'africa', title: 'The Road Home', subtitle: 'SUNRISE · JOHANNESBURG', briefing: 'Tomi receives the complete recording. The truth about the father’s disappearance is finally clear, but the crew must choose how to release the evidence.', track: 'coast', level: 20, objective: 'Finish the final drive.', reward: 'Africa story ending + Europe invitation', requirement: 'finish' },
];

const STORY_ORDER = [
  'one-more-start','empty-tank','the-night-run','earn-your-name','no-licence-no-respect','the-stolen-blueprint','lagos-grand-sprint',
  'africa-accra-welcome','accra-ghost-lap','accra-second-flag',
  'africa-abidjan-rhythm','abidjan-price-introduction','abidjan-no-cameras','abidjan-missing-courier','abidjan-burn-contract',
  'africa-dakar-dust','dakar-sand-intake','dakar-long-route','dakar-driver-remembered','dakar-black-box',
  'africa-nairobi-crossing','nairobi-data-run','nairobi-friend-inside','nairobi-wrong-passenger','nairobi-switch',
  'africa-cairo-signal','cairo-desert-invitation','cairo-museum-car','cairo-floodlights','cairo-project-files',
  'africa-atlas-ascent','atlas-mountain-contract','atlas-cut-line','atlas-what-darius-hid','atlas-betrayal',
  'africa-namib-last-light','namib-longest-night','namib-wreck-marker','namib-ghost-convoy','namib-signal-dawn',
  'africa-victoria-falls','victoria-crossing','victoria-last-witness','victoria-price-silence','victoria-broken-team',
  'africa-cape-storm','cape-invitation','cape-rivals-confession','cape-qualifier','cape-garage-raid',
  'africa-johannesburg-qualifier','johannesburg-last-tune','africa-grand-championship','johannesburg-championship','johannesburg-control-room','johannesburg-road-home',
];
const ALL_MISSION_DATA = [...LAGOS_STORY, ...AFRICA_STORY, ...AFRICA_EXPANSION];
const MISSION_BY_ID = new Map(ALL_MISSION_DATA.map((mission) => [mission.id, mission]));
/** Missions with a job (chase, delivery, investigation...) are played as that job, so they show the job's goal. */
const withJob = (m: StoryMission): StoryMission => { const j = JOB_BY_MISSION[m.id]; return j ? { ...m, objective: `${jobKindLabel(j.kind)} · ${j.goal}`, jobKind: j.kind, specialRule: undefined } : m; };
export const STORY_MISSIONS: StoryMission[] = STORY_ORDER.map((id) => MISSION_BY_ID.get(id)).filter((mission): mission is StoryMission => Boolean(mission)).map(withJob);


export function storyMissionComplete(
  mission: StoryMission,
  result: CareerRaceResult,
  totalRacesAfterResult: number,
): boolean {
  if (result.ticks <= 0) return false;
  let baseObjective = false;
  switch (mission.requirement) {
    case 'finish': baseObjective = result.track === mission.track; break;
    case 'podium': baseObjective = result.rank >= 1 && result.rank <= 3 && result.track === mission.track; break;
    case 'three-races': baseObjective = result.track === mission.track && totalRacesAfterResult >= 3; break;
    case 'win': baseObjective = result.rank === 1 && result.track === mission.track; break;
    default: baseObjective = false;
  }
  if (!baseObjective) return false;
  // Story jobs can impose a real race-result condition, not just a different briefing.
  if (mission.specialRule === 'clean-finish') return result.hits === 0 && result.pedHits === 0;
  if (mission.specialRule === 'low-damage') return result.hits <= (mission.id === 'atlas-cut-line' ? 1 : 2) && result.pedHits === 0;
  return true;
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
const STORY_TALK_BASE: Record<string, { before: StoryLine[]; after: StoryLine }> = {
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


/** Every campaign mission has a playable pre-race story beat, including the newly expanded chapters. */
export const STORY_TALK: Record<string, { before: StoryLine[]; after: StoryLine }> = Object.fromEntries(
  STORY_MISSIONS.map((mission) => {
    const existing = STORY_TALK_BASE[mission.id];
    if (existing) return [mission.id, existing];
    const more = MORE_TALK[mission.id];
    if (more) return [mission.id, more];
    const speaker = mission.briefing.toLowerCase().includes('mara') ? 'Mara Okafor' : mission.briefing.toLowerCase().includes('darius') ? 'Darius Cole' : mission.briefing.toLowerCase().includes('amara') ? 'Amara Diallo' : 'Tomi';
    return [mission.id, {
      before: [
        { who: speaker, line: mission.briefing },
        { who: 'Tomi', line: `We get through this run, keep the car in one piece, and find the next clue. ${mission.title} starts now.` },
      ],
      after: { who: 'Tomi', line: `${mission.title} is behind us. The clue is useful, but Vanguard is still ahead of us. We keep moving.` },
    }];
  }),
) as Record<string, { before: StoryLine[]; after: StoryLine }>;

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
