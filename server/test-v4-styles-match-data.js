// Vérifie le corpus England/RSA/NZ : faits sourcés distincts des presets IA.
// Ce test ne prétend PAS reproduire les matchs ni les appels 8-9 au moteur.
'use strict';
const assert=require('assert');
const corpus=require('../docs/SIMULATION_V4/fixtures/observations_styles_2023_2026.json');
assert.strictEqual(corpus.schemaVersion,'1.0.0');
assert.strictEqual(corpus.researchDate,'2026-11-08');
assert.strictEqual(corpus.type,'DOCUMENTARY_OBSERVATIONS_NO_TRACKING');
assert.ok(/spoken calls|spoken|trajector/i.test(corpus.warning));
const matches=Object.keys(corpus.matches);
assert.strictEqual(matches.length,5);
assert.strictEqual(corpus.observations.length,12);
const uniqueIds=new Set();
for(const [id,m] of Object.entries(corpus.matches)){
  assert.match(m.date,/^20\d{2}-\d{2}-\d{2}$/);
  assert.ok(m.name.length>25,id);
  assert.match(m.sourceUrl,/^https:\/\/[^/]+/);
}
for(const e of corpus.observations){
  assert.match(e.id,/^ST-(0[1-9]|1[0-2])$/);
  assert.ok(!uniqueIds.has(e.id),'duplicated ID');uniqueIds.add(e.id);
  assert.ok(matches.includes(e.matchId));
  assert.strictEqual(e.sourceUrl,corpus.matches[e.matchId].sourceUrl);
  assert.strictEqual(e.evidenceType,'MATCH_REPORT_EVENT');
  assert.ok(e.observation.length>35);
  assert.strictEqual(e.exactGameTimeSeconds,null);
  assert.strictEqual(e.realSpokenCallsVerified,false);
  assert.strictEqual(e.real30PlayerCoordinatesVerified,false);
  assert.strictEqual(e.gameplayStatus,'SPEC_ONLY');
  assert.ok(['NONE','SCRUM','LINEOUT','RUCK'].includes(e.phase));
  assert.ok(!('playerTargets' in e || 'audioTranscript' in e));
}
assert.ok(corpus.observations.some(e=>e.phase==='SCRUM'));
assert.ok(corpus.observations.some(e=>e.phase==='RUCK'));
assert.ok(corpus.observations.some(e=>e.phase==='LINEOUT'));
const s=corpus.snapshot;
assert.strictEqual(s.date,'2026-09-04');
assert.strictEqual(s.matchId,null);
assert.strictEqual(s.unit,'per_team_per_test_as_of_2026_09_04_not_final_season');
assert.match(s.sourceUrl,/^https:\/\/www\.allblacks\.com\//);
assert.strictEqual(s.NewZealand.passesPerMatch,230);
assert.strictEqual(s.SouthAfrica.passesPerMatch,112);
assert.strictEqual(s.NewZealand.kicksFromHandPerMatch,19.8);
assert.strictEqual(s.SouthAfrica.kicksFromHandPerMatch,29.7);
assert.ok(s.NewZealand.carriesPerMatch>s.SouthAfrica.carriesPerMatch);
assert.ok(s.SouthAfrica.lineoutSuccessPct>s.NewZealand.lineoutSuccessPct);
const ruck=corpus.observations.find(e=>e.id==='ST-12');
assert.strictEqual(ruck.phase,'RUCK','Hanekom scored from ruck, never from scrum');
assert.ok(/not scrum/.test(ruck.observation));
console.log('12 observations / 5 matchs + comparaison du 04-09-2026 : corpus validé, pas de tracking ni dialogues inventés.');
