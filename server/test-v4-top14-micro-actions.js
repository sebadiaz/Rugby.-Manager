/*
 * Top14 micro-action documentation safety checker, NOT an engine behavior test.
 * 7 studies / 47 decision steps / 22 alternative situations.
 */
'use strict';
const assert = require('assert');
const data = require('../docs/SIMULATION_V4/fixtures/micro_actions_top14.json');

assert.strictEqual(data.schemaVersion,'1.0.0');
assert.strictEqual(data.researchDate,'2026-11-08');
assert.strictEqual(data.competition,'TOP14');
assert.strictEqual(data.realSpokenCallsAvailable,false);
assert.strictEqual(data.videoTrackingFrameByFrameVerified,false);
assert.ok(data.notes.some(s => /contre-factuels|contre-factuel/i.test(s)));
assert.strictEqual(data.cases.length,7);

const validEvidence=new Set(['REPORT_SUPPORTED','SIMULATION_ONLY','STATS_DERIVED_SCENARIO']);
const caseIds=new Set(), altIds=new Set();
let stepCount=0, alternativeCount=0, syntheticCount=0, reportCount=0, distinctActors=new Set();
for(const [caseIndex,c] of data.cases.entries()){
  const caseId='MICRO-'+String(caseIndex+1).padStart(2,'0');
  assert.strictEqual(c.id,caseId);
  assert.ok(!caseIds.has(c.id));caseIds.add(c.id);
  assert.ok(c.title.length>20);
  assert.ok(c.match.length>15);
  assert.ok(typeof c.reportedMinute==='string' && c.reportedMinute.length>=3);
  assert.ok(typeof c.officialPhase==='string' && c.officialPhase.length>=7);
  assert.strictEqual(c.videoTrackingVerified,false);
  assert.strictEqual(c.verbatimPlayerCallVerified,false);
  assert.ok(Array.isArray(c.sourceIds) && c.sourceIds.length>=1);
  for(const src of c.sourceIds){
    assert.ok(Object.prototype.hasOwnProperty.call(data.sources,src),
      'source ID must exist: '+src);
    assert.match(data.sources[src],/^https:\/\/[^/]+\/.+/);
  }
  assert.ok(c.steps.length>=5,'not deep enough: '+c.id);
  assert.ok(c.counterfactuals.length>=3,'requires alternative decision cases');
  assert.ok(Array.isArray(c.notes)&&c.notes.length>=1);
  for(const [i,s] of c.steps.entries()){
    stepCount++;
    assert.strictEqual(s.order,i+1,c.id+' ordered steps');
    assert.ok(validEvidence.has(s.evidence),c.id+' invalid evidence');
    assert.ok(typeof s.actor==='string' && s.actor.length>=5);
    distinctActors.add(s.actor);
    assert.ok(typeof s.reported==='string' && s.reported.length>=25);
    assert.ok(s.modeled && typeof s.modeled==='object');
    const m=s.modeled;
    for(const k of ['limitedPerception','goal','legalGuard',
                    'individualMovement','possibleConsequence']){
      assert.ok(typeof m[k]==='string' && m[k].trim().length>=5,
        'missing modeled field '+c.id+' '+i+' '+k);
    }
    assert.ok(Array.isArray(m.options) && m.options.length>=2,
      'must model choice, not a predefined move');
    assert.ok(m.options.every(x => typeof x==='string'&&x.length>=4));
    assert.ok(!('exactMatchSecond' in s) && !('realPlayerCoordinates' in s)
      && !('historicalDialogue' in s),'unverified observations');
    if(s.evidence==='STATS_DERIVED_SCENARIO')syntheticCount++;
    if(s.evidence==='REPORT_SUPPORTED')reportCount++;
  }
  for(const [i,alt] of c.counterfactuals.entries()){
    alternativeCount++;
    assert.strictEqual(alt.id,c.id+'-ALT'+(i+1));
    assert.ok(!altIds.has(alt.id));altIds.add(alt.id);
    for(const k of ['variable','difference','expectedBehavior'])
      assert.ok(typeof alt[k]==='string' && alt[k].length>=8);
    assert.ok(alt.expectedBehavior.toLowerCase().indexOf('always wins')===-1);
  }
  console.log('OK '+c.id+' '+c.steps.length+' micro-étapes / '+c.counterfactuals.length+' alternatives');
}
assert.strictEqual(stepCount,47,'micro-actions count must be verified');
assert.strictEqual(alternativeCount,22,'alternative decisions count must be verified');
assert.strictEqual(data.cases[0].steps.length,13);
assert.strictEqual(data.cases[6].officialPhase,'STATISTICS_DERIVED_SYNTHETIC');
assert.strictEqual(data.cases[6].steps.length,6);
assert.strictEqual(syntheticCount,6,
  'last scenario all stats-derived, none should masquerade as match timeline');
assert.ok(reportCount>=30,'need enough documented source-backed actions');
assert.ok(distinctActors.size>=16,'must cover more than just the ball carrier');
assert.ok(data.cases[0].notes.some(x=>/pénalité|coup franc/.test(x)),
  'explicit warning on conflicting restart descriptions');
assert.ok(data.cases[2].steps.some(x=>x.actor.includes('Hughes')));
assert.ok(data.cases[2].steps.some(x=>x.actor.includes('9')));
assert.ok(data.cases[2].steps.some(x=>x.evidence==='SIMULATION_ONLY'
  && /SCRUM_8_GOING/.test(x.modeled.options.join(' '))),
  '8 to 9 call must not be mistaken for real spoken dialogue');
assert.ok(data.cases[3].notes.some(x=>/deux essais séparés/.test(x)));
console.log('Top14 micro-actions OK: 7 études, 47 étapes, 22 alternatives ; intentions reconstituées, aucun suivi vidéo ni dialogue inventé.');
