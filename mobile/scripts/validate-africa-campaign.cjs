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
  for (const file of ['career.ts', 'jobs.ts', 'storyTalkMore.ts', 'story.ts']) {
    const source = fs.readFileSync(path.join(root, 'src', 'apex', file), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    fs.writeFileSync(path.join(temp, file.replace(/\.ts$/, '.js')), compiled);
  }
  const story = require(path.join(temp, 'story.js'));
  const missions = story.STORY_MISSIONS;
  const ids = new Set(missions.map((mission) => mission.id));
  assert.equal(missions.length, 56, 'Expected 56 ordered story missions');
  assert.equal(ids.size, 56, 'Story mission IDs must be unique');
  assert.equal(missions.filter((mission) => mission.chapter === 'lagos').length, 7, 'Expected 7 Lagos missions');
  assert.equal(missions.filter((mission) => mission.chapter === 'africa').length, 49, 'Expected 49 Africa missions');
  for (const mission of missions) assert.ok(story.STORY_TALK[mission.id], `Missing story dialogue: ${mission.id}`);
  assert.equal(story.currentStoryMission([]).id, 'one-more-start', 'Fresh campaign must begin in Lagos');
  assert.equal(story.currentStoryMission(missions.map((mission) => mission.id)), null, 'Completed campaign should have no current mission');
  const licence = missions.find((mission) => mission.id === 'no-licence-no-respect');
  const delivery = missions.find((mission) => mission.id === 'empty-tank');
  const result = { track: 'city', laps: 1, ticks: 100, rank: 1, hits: 0, pedHits: 0, bestLap: 10 };
  assert.equal(story.storyMissionComplete(licence, result, 1), true, 'Clean licence attempt should pass');
  assert.equal(story.storyMissionComplete(licence, { ...result, hits: 1 }, 1), false, 'Licence must fail on a collision');
  assert.equal(story.storyMissionComplete(delivery, { ...result, track: delivery.track, hits: 2 }, 1), true, 'Delivery should tolerate two impacts');
  assert.equal(story.storyMissionComplete(delivery, { ...result, track: delivery.track, hits: 3 }, 1), false, 'Delivery should fail above two impacts');
  const allStory = missions.map((mission) => mission.id);
  const regions = story.AFRICA_CAMPAIGN_REGION_IDS;
  assert.equal(regions.length, 10, 'Expected ten Africa regional driving challenges');
  assert.equal(story.africaCampaignDone(allStory, [...regions]), true, 'All story missions and regions should finish Africa');
  assert.equal(story.africaCampaignDone(allStory, regions.slice(1)), false, 'Missing a regional challenge must keep Africa incomplete');
  console.log(`PASS: ${sourceFiles.length} TypeScript/TSX files syntax-checked.`);
  console.log('PASS: 56 missions (7 Lagos + 49 Africa), unique IDs, dialogue, and campaign order.');
  console.log('PASS: clean licence condition, delivery damage limit, and ten-region Africa completion gate.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
