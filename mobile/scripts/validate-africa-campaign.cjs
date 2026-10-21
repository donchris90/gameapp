/* Lightweight campaign integrity checks. Run with: npm run validate:apex */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const ignore = new Set(['node_modules', '.git', '.expo', 'dist', 'build']);
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignore.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(root);
let syntaxErrors = [];
for (const file of sourceFiles) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, strict: true },
  });
  for (const diagnostic of result.diagnostics || []) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      syntaxErrors.push(`${path.relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }
  }
}
assert.equal(syntaxErrors.length, 0, syntaxErrors.join('\n'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-campaign-'));
try {
  for (const file of ['career.ts', 'jobs.ts', 'storyTalkMore.ts', 'story.ts', 'storyExtras.ts', 'storyEconomy.ts', 'europe.ts']) {
    const source = fs.readFileSync(path.join(root, 'src', 'apex', file), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    fs.writeFileSync(path.join(temp, file.replace(/\.ts$/, '.js')), compiled);
  }
  const story = require(path.join(temp, 'story.js'));
  const jobs = require(path.join(temp, 'jobs.js'));
  const extras = require(path.join(temp, 'storyExtras.js'));
  const economy = require(path.join(temp, 'storyEconomy.js'));
  const europe = require(path.join(temp, 'europe.js'));
  const missions = story.STORY_MISSIONS;
  const ids = new Set(missions.map((mission) => mission.id));
  assert.equal(missions.length, 56, 'Expected 56 ordered story missions');
  assert.equal(ids.size, 56, 'Story mission IDs must be unique');
  assert.equal(missions.filter((mission) => mission.chapter === 'lagos').length, 7, 'Expected 7 Lagos missions');
  assert.equal(missions.filter((mission) => mission.chapter === 'africa').length, 49, 'Expected 49 Africa missions');
  for (const mission of missions) assert.ok(story.STORY_TALK[mission.id], `Missing story dialogue: ${mission.id}`);
  const validTracks = new Set(['circuit', 'coast', 'dunes', 'city', 'pass']);
  const validRequirements = new Set(['finish', 'podium', 'three-races', 'win']);
  for (const mission of missions) {
    assert.ok(mission.title?.trim(), 'Mission title is missing: ' + mission.id);
    assert.ok(mission.briefing?.trim(), 'Mission briefing is missing: ' + mission.id);
    assert.ok(mission.objective?.trim(), 'Mission objective is missing: ' + mission.id);
    assert.ok(validTracks.has(mission.track), 'Unknown track ' + mission.track + ': ' + mission.id);
    assert.ok(validRequirements.has(mission.requirement), 'Unknown completion requirement ' + mission.requirement + ': ' + mission.id);
    assert.ok(Number.isFinite(mission.level) && mission.level >= 1, 'Invalid mission level: ' + mission.id);
    assert.ok(['lagos', 'africa'].includes(mission.chapter), 'Unknown story chapter: ' + mission.id);
  }
  assert.equal(story.currentStoryMission([]).id, 'one-more-start', 'Fresh campaign must begin in Lagos');
  assert.equal(story.currentStoryMission(missions.map((mission) => mission.id)), null, 'Completed campaign should have no current mission');
  const licence = missions.find((mission) => mission.id === 'no-licence-no-respect');
  const delivery = missions.find((mission) => mission.id === 'empty-tank');
  const result = { track: 'city', laps: 1, ticks: 100, rank: 1, hits: 0, pedHits: 0, bestLap: 10 };
  assert.equal(story.storyMissionComplete(licence, result, 1), true, 'Clean licence attempt should pass');
  assert.equal(story.storyMissionComplete(licence, { ...result, hits: 1 }, 1), false, 'Licence must fail on a collision');
  assert.equal(story.storyMissionComplete(licence, { ...result, ticks: 0 }, 1), false, 'A DNF/zero-time result must not complete a story mission');
  const cleanRuleMission = missions.find((mission) => mission.specialRule === 'clean-finish');
  assert.ok(cleanRuleMission, 'Campaign should contain a clean-finish mission');
  assert.equal(story.storyMissionComplete(cleanRuleMission, { ...result, track: cleanRuleMission.track }, 1), true, 'Clean-finish objective should pass without impacts');
  assert.equal(story.storyMissionComplete(cleanRuleMission, { ...result, track: cleanRuleMission.track, pedHits: 1 }, 1), false, 'Clean-finish objective must reject pedestrian impacts');
  const lowDamageMission = missions.find((mission) => mission.specialRule === 'low-damage');
  assert.ok(lowDamageMission, 'Campaign should contain a low-damage mission');
  assert.equal(story.storyMissionComplete(lowDamageMission, { ...result, track: lowDamageMission.track, hits: 3 }, 1), false, 'Low-damage objective must reject excessive collisions');
  assert.equal(story.storyMissionComplete(delivery, { ...result, track: delivery.track, hits: 2 }, 1), true, 'Delivery should tolerate two impacts');
  assert.equal(story.storyMissionComplete(delivery, { ...result, track: delivery.track, hits: 3 }, 1), false, 'Delivery should fail above two impacts');
  // Every story objective must reject a result from another track, even when the
  // rank/tick count would otherwise satisfy the objective.
  for (const mission of missions) {
    const wrongTrack = mission.track === 'city' ? 'coast' : 'city';
    assert.equal(story.storyMissionComplete(mission, { ...result, track: wrongTrack }, 3), false, `Wrong-track result must not complete ${mission.id}`);
  }
  // Non-race jobs must be real, unique job definitions connected to campaign missions.
  const jobIds = new Set(jobs.JOBS.map((job) => job.missionId));
  assert.equal(jobIds.size, jobs.JOBS.length, 'Job mission IDs must be unique');
  const jobMissions = missions.filter((mission) => mission.jobKind);
  assert.ok(jobMissions.length >= 10, 'Expected at least ten story missions with dedicated job gameplay');
  for (const mission of jobMissions) assert.ok(jobIds.has(mission.id), `Missing job definition for ${mission.id}`);
  for (const job of jobs.JOBS) {
    assert.ok(ids.has(job.missionId), `Job references unknown story mission ${job.missionId}`);
    if (job.kind === 'chase') assert.ok((job.target?.path?.length ?? 0) >= 2, `Chase job needs a target route: ${job.missionId}`);
    else assert.ok(job.points.length >= 2, `Job needs at least two playable points: ${job.missionId}`);
    assert.ok(job.reward >= 0 && job.maxHits >= 0, `Invalid job tuning: ${job.missionId}`);
  }
  // Story upgrades and special parts must be charged once and never overdraw the wallet.
  const needState = { coins: 1000, activeCar: 'tomi-classic', upgrades: { 'tomi-classic': [0, 0, 0, 0] }, storyNeedsDone: [] };
  const engineNeed = extras.applyNeed(needState, 'n-engine-1');
  assert.equal(engineNeed.ok, true, 'Engine story need should be purchasable with sufficient coins');
  if (engineNeed.ok) {
    assert.equal(engineNeed.patch.coins, 750, 'Engine story need should charge its price once');
    assert.equal(engineNeed.patch.upgrades['tomi-classic'][0], 1, 'Engine story need should apply the upgrade');
    const repeatEngine = extras.applyNeed({ ...needState, ...engineNeed.patch }, 'n-engine-1');
    assert.equal(repeatEngine.ok, false, 'An already-satisfied story need must not be charged twice');
    if (!repeatEngine.ok) assert.equal(repeatEngine.reason, 'done');
  }
  const coolingNeed = extras.applyNeed({ ...needState, coins: 1000 }, 'n-cooling');
  assert.equal(coolingNeed.ok, true, 'Cooling part should be purchasable');
  if (coolingNeed.ok) {
    const repeatCooling = extras.applyNeed({ ...needState, ...coolingNeed.patch }, 'n-cooling');
    assert.equal(repeatCooling.ok, false, 'Non-upgrade story parts must not be charged twice');
  }
  const fuelNeed = extras.applyNeed({ ...needState, coins: 1000, storyFuel: 8 }, 'n-fuel-ke');
  assert.equal(fuelNeed.ok, true, 'Long-road fuel purchase should be available');
  if (fuelNeed.ok) {
    assert.equal(fuelNeed.patch.storyFuel, 100, 'Buying story fuel must refill the tank so the mission can launch');
    const repeatFuel = extras.applyNeed({ ...needState, ...fuelNeed.patch, storyFuel: fuelNeed.patch.storyFuel }, 'n-fuel-ke');
    assert.equal(repeatFuel.ok, false, 'Fuel supplies must not be charged twice');
  }
  const poorNeed = extras.applyNeed({ ...needState, coins: 0 }, 'n-engine-1');
  assert.equal(poorNeed.ok, false, 'Story need purchase must reject insufficient funds');
  if (!poorNeed.ok) assert.equal(poorNeed.reason, 'funds');
  // The long-road fuel story beat must actually restore the resource used by mission launch.
  const fuelNeed = extras.applyNeed({ ...needState, coins: 1000, storyFuel: 8 }, 'n-fuel-ke');
  assert.equal(fuelNeed.ok, true, 'Long-road fuel purchase should be available');
  if (fuelNeed.ok) {
    assert.equal(fuelNeed.patch.storyFuel, 100, 'Buying story fuel must refill the tank so the mission can launch');
    const repeatFuel = extras.applyNeed({ ...needState, ...fuelNeed.patch, storyFuel: fuelNeed.patch.storyFuel }, 'n-fuel-ke');
    assert.equal(repeatFuel.ok, false, 'Fuel supplies must not be charged twice');
  }
  // Job results have clear success/failure rewards, resource costs, and idempotency.
  const sampleJob = jobs.JOBS[0];
  const sampleMission = missions.find((mission) => mission.id === sampleJob.missionId);
  assert.ok(sampleMission, 'Sample job must belong to a story mission');
  const jobSave = { coins: 500, careerXP: 20, unlocked: sampleMission.level, storyCompleted: [], storyFuel: 80, storyCondition: 90, storyTrust: 50, storyEvidence: [], storyApproach: 'balanced', storyNeedsDone: [] };
  const successOutcome = { success: true, reason: 'complete', hits: 0, seconds: 10, timeBonus: 20, clues: ['blueprint-proof'] };
  const successfulJob = economy.applyJobResult(jobSave, sampleMission, sampleJob, successOutcome, 60);
  assert.equal(successfulJob.coins, 500 + sampleJob.reward + 70, 'Successful clean job should award base, time, and clean bonuses');
  assert.ok(successfulJob.storyCompleted.includes(sampleMission.id), 'Successful job should complete its mission');
  assert.equal(successfulJob.careerXP, 80, 'Successful job should award career XP');
  assert.ok(successfulJob.storyEvidence.includes('blueprint-proof'), 'Successful job should save recovered clues');
  assert.ok(successfulJob.storyFuel < jobSave.storyFuel, 'Story jobs should consume fuel');
  assert.ok(successfulJob.storyCondition < jobSave.storyCondition, 'Story jobs should wear the car');
  const failedJob = economy.applyJobResult(jobSave, sampleMission, sampleJob, { ...successOutcome, success: false, reason: 'failed', timeBonus: 0, clues: [] }, 60);
  assert.equal(failedJob.coins, jobSave.coins + jobs.FAIL_FEE, 'Failed job should award only the small recovery fee');
  assert.ok(!failedJob.storyCompleted, 'Failed job must not complete the story mission');
  assert.equal(failedJob.careerXP, undefined, 'Failed job must not award career XP');
  assert.ok(failedJob.storyFuel < jobSave.storyFuel, 'Failed job still consumes fuel');
  const repeatedJob = economy.applyJobResult({ ...jobSave, storyCompleted: [sampleMission.id] }, sampleMission, sampleJob, successOutcome, 60);
  assert.equal(repeatedJob.coins, jobSave.coins, 'Replayed completed job must not pay twice');
  assert.equal(repeatedJob.coinsGained, 0, 'Replayed completed job should report zero coins gained');
  assert.equal(repeatedJob.storyFuel, undefined, 'Replayed completed job must not spend fuel twice');
  const allStory = missions.map((mission) => mission.id);
  const regions = story.AFRICA_CAMPAIGN_REGION_IDS;
  assert.equal(regions.length, 10, 'Expected ten Africa regional driving challenges');
  assert.equal(new Set(regions).size, regions.length, 'Canonical Africa region IDs must be unique');
  const africaSceneSource = fs.readFileSync(path.join(root, 'src', 'apex', 'AfricaScene.tsx'), 'utf8');
  const renderedRegionIds = [...africaSceneSource.matchAll(/\{ id: '([^']+)', city:/g)].map((match) => match[1]);
  assert.deepEqual(renderedRegionIds, [...regions], 'Africa Tour region IDs and order must match campaign save IDs');
  const regionLookSource = fs.readFileSync(path.join(root, 'src', 'apex', 'regionLook.ts'), 'utf8');
  for (const id of regions) assert.ok(new RegExp('^\\s*' + id + ': L\\(', 'm').test(regionLookSource), 'Missing regional job visual theme: ' + id);
  assert.equal(story.africaCampaignDone(allStory, [...regions]), true, 'All story missions and regions should finish Africa');
  assert.equal(story.africaCampaignDone(allStory, regions.slice(1)), false, 'Missing a regional challenge must keep Africa incomplete');
  const europeMissions = europe.EUROPE_MISSIONS;
  const europeIds = new Set(europeMissions.map((mission) => mission.id));
  assert.equal(europeMissions.length, 12, 'Europe chapter should contain twelve missions');
  assert.equal(europeIds.size, europeMissions.length, 'Europe mission IDs must be unique');
  for (const mission of europeMissions) {
    assert.ok(mission.title?.trim() && mission.city?.trim() && mission.subtitle?.trim(), 'Europe mission metadata is incomplete: ' + mission.id);
    assert.ok(mission.briefing?.trim() && mission.objective?.trim(), 'Europe mission briefing/objective is missing: ' + mission.id);
    assert.ok(validTracks.has(mission.track), 'Unknown Europe track ' + mission.track + ': ' + mission.id);
    assert.ok(validRequirements.has(mission.requirement), 'Unknown Europe requirement ' + mission.requirement + ': ' + mission.id);
    assert.ok(Number.isFinite(mission.reward) && mission.reward > 0, 'Europe mission reward must be positive: ' + mission.id);
  }
  const europeSkins = europe.EUROPE_SKINS;
  for (const mission of europeMissions) assert.ok(europeSkins[mission.id], 'Europe mission is missing its regional race palette: ' + mission.id);
  const europeTalk = europe.EUROPE_TALK;
  for (const mission of europeMissions) {
    assert.ok(europeTalk[mission.id]?.before?.length >= 2, 'Europe mission needs a dialogue scene: ' + mission.id);
    for (const line of europeTalk[mission.id].before) assert.ok(line.who?.trim() && line.line?.trim(), 'Invalid Europe dialogue line: ' + mission.id);
  }
  const firstEurope = europeMissions[0];
  assert.equal(europe.currentEuropeMission([]).id, firstEurope.id, 'Europe should begin at its first mission');
  assert.equal(europe.currentEuropeMission([firstEurope.id]).id, europeMissions[1].id, 'Europe should advance in order');
  assert.equal(europe.europeMissionComplete(firstEurope, { ticks: 100, rank: 2, track: firstEurope.track }), true, 'A valid podium mission should complete');
  assert.equal(europe.europeMissionComplete(firstEurope, { ticks: 0, rank: 1, track: firstEurope.track }), false, 'DNF must not complete a Europe mission');
  assert.equal(europe.europeMissionComplete(firstEurope, { ticks: 100, rank: 1, track: 'wrong-track' }), false, 'Wrong-track results must not complete a Europe mission');
  const apexScreen = fs.readFileSync(path.join(root, 'app', 'apex.tsx'), 'utf8');
  assert.ok(apexScreen.includes('africaCampaignDone(settings.storyCompleted'), 'Europe start must be gated by the full Africa milestone');
  assert.ok(apexScreen.includes('europeCompleted: europeWon ?'), 'Europe completion must be persisted only on a valid win/result');
  console.log('PASS: Europe chapter has 12 unique, fully specified missions, sequential progress, result validation, and the Africa completion gate.');
  console.log(`PASS: ${sourceFiles.length} TypeScript/TSX files syntax-checked.`);
  console.log('PASS: 56 missions (7 Lagos + 49 Africa), metadata, unique IDs, dialogue, and campaign order.');
  console.log('PASS: race-result rules, clean/low-damage conditions, delivery damage limit, and ten-region Africa completion gate.');
  console.log('PASS: Africa Tour region IDs match save-data IDs and every region has a job visual theme.');
  console.log('PASS: story upgrade/part purchases are idempotent, fuel purchases refill the tank, and insufficient funds are rejected.');
  console.log('PASS: story jobs reward success/failure correctly, consume resources, and cannot pay twice.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
