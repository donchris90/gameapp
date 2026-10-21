import { STORY_MISSIONS } from './story';

/** Bundled, offline story artwork. Static requires keep Metro asset discovery reliable. */
const STORY_ART_BASE: Record<string, number> = {
  'one-more-start': require('../../assets/story/lagos-intro.png'),
  'the-night-run': require('../../assets/story/race-action.png'),
  'earn-your-name': require('../../assets/story/characters.png'),
  'the-stolen-blueprint': require('../../assets/story/betrayal.png'),
  'lagos-grand-sprint': require('../../assets/story/mission-complete.png'),
  'africa-accra-welcome': require('../../assets/story/africa-campaign.png'),
  'africa-abidjan-rhythm': require('../../assets/story/race-action.png'),
  'africa-dakar-dust': require('../../assets/story/mission-briefing.png'),
  'africa-nairobi-crossing': require('../../assets/story/characters.png'),
  'africa-cairo-signal': require('../../assets/story/mission-briefing.png'),
  'africa-atlas-ascent': require('../../assets/story/race-action.png'),
  'africa-namib-last-light': require('../../assets/story/lagos-intro.png'),
  'africa-cape-storm': require('../../assets/story/race-action.png'),
  'africa-victoria-falls': require('../../assets/story/africa-campaign.png'),
  'africa-johannesburg-qualifier': require('../../assets/story/betrayal.png'),
  'africa-grand-championship': require('../../assets/story/mission-complete.png'),
};


// New missions reuse the existing small illustration set instead of bundling a unique
// large image for every beat. This keeps the story complete offline without ballooning the APK.
const FALLBACK_ART = {
  lagos: require('../../assets/story/lagos-intro.png'),
  race: require('../../assets/story/race-action.png'),
  clue: require('../../assets/story/mission-briefing.png'),
  crew: require('../../assets/story/characters.png'),
  betrayal: require('../../assets/story/betrayal.png'),
  finale: require('../../assets/story/mission-complete.png'),
  africa: require('../../assets/story/africa-campaign.png'),
};

export const STORY_ART: Record<string, number> = Object.fromEntries(STORY_MISSIONS.map((mission) => {
  if (STORY_ART_BASE[mission.id]) return [mission.id, STORY_ART_BASE[mission.id]];
  const text = `${mission.title} ${mission.briefing}`.toLowerCase();
  const art = mission.chapter === 'lagos' ? FALLBACK_ART.lagos
    : /betray|wrong passenger|broken team|ambush|sabotage|raid/.test(text) ? FALLBACK_ART.betrayal
    : /father|record|clue|evidence|data|project|signal|witness|notebook|telemetry/.test(text) ? FALLBACK_ART.clue
    : /crew|friend|rival|amara|darius|mara|team|contract/.test(text) ? FALLBACK_ART.crew
    : /championship|champion|final|crown|king of/.test(text) ? FALLBACK_ART.finale
    : /race|run|pursuit|crossing|route|qualifier|coast|circuit/.test(text) ? FALLBACK_ART.race
    : FALLBACK_ART.africa;
  return [mission.id, art];
})) as Record<string, number>;
