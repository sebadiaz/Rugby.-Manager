/*
 * Validation des OBSERVATIONS DE MATCHS (documentaires, pas vidéo-trackées).
 * Ce test ne prouve pas que l'IA réalise les actions : il interdit de
 * présenter des paroles/coordonnées imaginaires comme données observées.
 */
'use strict';
const assert=require('assert');
const corpus=require('../docs/SIMULATION_V4/fixtures/observations_matchs_reels.json');
const ID=/^(IRF|ENF|ENW|FIF)[0-9]{2}$/;
const URL=/^https:\/\/[^/]+\//;
const allowedKinds=new Set([
  'LINEOUT_MAUL_RELEASE','MAUL_PEEL','SCRUM_HALF_REPLACEMENT',
  'COUNTER_RUCK_KICK_CHASE','MULTI_OFFLOAD','INTERCEPTION_COUNTER',
  'GRUBBER_COMBINATION','HIGH_KICK_REGATHER',
  'PENALTY_CORNER_LINEOUT_CLOSE','BLIND_SIDE_INSERTION',
  'NUMBER_EIGHT_PICK','SCRUM_HALF_KICK_IN_BEHIND',
  'MAUL_COLLAPSE_PENALTY_TRY','TURNOVER_TO_BACKS',
  'COUNTER_ATTACK_FIX_PASS','MAUL_TO_NINE_PEEP',
]);
assert.strictEqual(corpus.schemaVersion,'1.0.0');
assert.strictEqual(corpus.researchDate,'2026-11-08');
assert.strictEqual(corpus.events.length,16);
assert.deepStrictEqual(Object.keys(corpus.sources).sort(),['ENF','ENW','FIF','IRF']);
assert.ok(corpus.notObserved.length>=4);
assert.ok(corpus.notObserved.some(s=>/appels entre 9 et 10/.test(s)));

for(const [sourceId,match] of Object.entries(corpus.sources)){
  assert.ok(match.match.length>10,sourceId+' match');
  assert.match(match.date,/^20[0-9]{2}-[0-1][0-9]-[0-3][0-9]$/);
  assert.match(match.score,/^[0-9]{1,3}-[0-9]{1,3}$/);
  assert.match(match.sourceUrl,URL);
  assert.ok(match.sourceTitle.length>15);
}
const ids=new Set(), kinds=new Set();
for(const e of corpus.events){
  assert.match(e.id,ID);
  assert.strictEqual(e.sourceKey,e.id.slice(0,3),'id et source cohérents');
  assert.ok(!ids.has(e.id),'duplicate '+e.id);ids.add(e.id);
  assert.ok(corpus.sources[e.sourceKey],'source référencée');
  assert.ok(allowedKinds.has(e.kind),e.id+' kind non déclaré '+e.kind);
  kinds.add(e.kind);
  assert.strictEqual(e.evidenceType,'OBSERVED_MATCH_REPORT');
  assert.ok(e.observation.length>45 && e.gameMechanicHypothesis.length>40,e.id+' contenu court');
  assert.ok(e.clock && typeof e.clock.label==='string' && e.clock.label.length>=4);
  assert.strictEqual(e.clock.seconds,null,'on ne connaît pas les secondes d une action de match');
  assert.strictEqual(e.clock.exact,false,'minute approximative, non tracking');
  assert.ok(Array.isArray(e.tags) && e.tags.length>=3);
  assert.ok(e.tags.every(t=>/^[a-z][a-z_]+$/.test(t)));
  assert.strictEqual(e.coachCallsObserved,false,
    'interdire les dialogues présentés à tort comme faits : '+e.id);
  assert.strictEqual(e.exactPlayerCoordinatesObserved,false,
    'interdire les positions inventées : '+e.id);
  assert.strictEqual(e.testStatus,'SPECIFIED_NOT_IMPLEMENTED',
    'le moteur ne démontre pas encore ce scénario');
  assert.ok(!('audioTranscript' in e) && !('playerCoordinates' in e),
    'données d observation inventées dans '+e.id);
  console.log('OK REAL-DATA '+e.id+' '+e.kind);
}
assert.strictEqual(kinds.size,allowedKinds.size,'16 séquences indépendantes');
assert.ok(ids.has('ENW01'),'départ par le 8 en vrai match');
assert.ok(ids.has('IRF01'),'touche > maul > passe 9 vers aile');
assert.ok(ids.has('ENF02'),'coup de pied haut de l ouvreur');
assert.ok(ids.has('FIF05'),'9 marque après maul');
assert.ok(ids.has('FIF02'),'essai pénalité depuis maul');
assert.ok(ids.has('IRF03'),'remplacement du 9 blessé');
console.log('16 observations documentaires valides / 4 matchs ; aucune prétention de vidéo ou dialogues réels.');
