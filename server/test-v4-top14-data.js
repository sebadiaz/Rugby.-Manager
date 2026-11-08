// Corpus de vrais matchs TOP14, uniquement contrôle documentaire.
// Les 19 cas TOP14-01..19 sont des tests moteur FUTURS.
'use strict';
const assert = require('assert');
const c = require('../docs/SIMULATION_V4/fixtures/observations_top14_2025_2026.json');
assert.strictEqual(c.schemaVersion,'1.0.0');
assert.strictEqual(c.competition,'TOP_14');
assert.strictEqual(c.researchDate,'2026-11-08');
assert.strictEqual(c.sourcePriority,'LNR_OFFICIAL_THEN_MATCH_REPORT');
const matchKeys=Object.keys(c.matches);
assert.strictEqual(matchKeys.length,9);
assert.strictEqual(c.events.length,19);
assert.strictEqual(c.stats.length,6);
assert.strictEqual(c.futureTests.length,19);
assert.ok(/no direct 9-10, 8-9 audio/.test(c.warning));

for(const [id,m] of Object.entries(c.matches)){
  assert.match(m.date,/^20\d{2}-\d{2}-\d{2}$/,id+' date');
  assert.ok(m.match.length>=13,id+' match');
  assert.match(m.sourceUrl,/^https:\/\/[^/]+\/.+/,id+' URL');
  assert.ok(/TOP14_/.test(m.stage),id+' competition/stage');
}
const ids=new Set(),phaseTypes=new Set();
for(let i=0;i<c.events.length;i++){
  const e=c.events[i],id='T14-'+String(i+1).padStart(2,'0');
  assert.strictEqual(e.id,id,'IDs ordonnés et pas de trous');
  assert.ok(!ids.has(e.id),'id dupliqué');ids.add(e.id);
  assert.ok(matchKeys.includes(e.matchId),e.id+' match absent');
  assert.match(e.sourceUrl,/^https:\/\/[^/]+\/.+/);
  assert.ok(typeof e.clock.label==='string' && e.clock.label.length>=2);
  assert.strictEqual(e.clock.exactSeconds,null,'minute non suivie à la seconde');
  assert.ok(['MATCH_TIMELINE','MATCH_SCORE_EVENT','MATCH_STATISTICS'].includes(e.evidenceType));
  phaseTypes.add(e.evidenceType);
  assert.ok(e.observation.length>65,e.id+' observation trop peu explicite');
  assert.ok(e.simulationHypothesis.length>65,e.id+' hypothèse trop peu explicite');
  assert.ok(Array.isArray(e.tags)&&e.tags.length>=3);
  assert.strictEqual(e.dialogueVerified,false,'interdit de prétendre entendre le dialogue 8/9');
  assert.strictEqual(e.playerTrajectoriesVerified,false,'interdit tracking inventé');
  assert.strictEqual(e.engineScenarioStatus,'SPECIFIED_NOT_IMPLEMENTED');
}
assert.strictEqual(phaseTypes.size,3);

for(const [i,t] of c.futureTests.entries()){
  assert.strictEqual(t,'TOP14-'+String(i+1).padStart(2,'0'));
}
const statIds=new Set();
for(const e of c.stats){
  assert.match(e.id,/^STAT-0[1-6]$/);
  assert.ok(!statIds.has(e.id));statIds.add(e.id);
  assert.ok(matchKeys.includes(e.matchId));
  assert.strictEqual(e.status,'LNR_RECORDED');
  assert.match(e.sourceUrl,/^https:\/\/top14\.lnr\.fr\//);
  const metrics=Object.entries(e.metrics);
  assert.ok(metrics.length>=3);
  for(const [key,values] of metrics){
    assert.ok(/^[a-zA-Z]+$/.test(key),'metric key '+key);
    assert.ok(Array.isArray(values) && values.length===2);
    assert.ok(values.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0));
  }
}
function get(id){return c.stats.find(s=>s.id===id).metrics;}
assert.deepStrictEqual(get('STAT-01').passes,[139,152]);
assert.deepStrictEqual(get('STAT-01').penaltiesConceded,[8,17]);
assert.deepStrictEqual(get('STAT-02').passes,[212,112]);
assert.deepStrictEqual(get('STAT-02').kicksFromHand,[18,37]);
assert.deepStrictEqual(get('STAT-03').passes,[110,211]);
assert.deepStrictEqual(get('STAT-04').passes,[107,206]);
assert.deepStrictEqual(get('STAT-05').tries,[3,2]);
assert.deepStrictEqual(get('STAT-05').successfulPenalties,[1,3]);
assert.deepStrictEqual(get('STAT-06').possessionPct,[46,54]);
assert.deepStrictEqual(get('STAT-06').tries,[4,2]);
const ex=c.excludedSource;
assert.strictEqual(ex.matchId,'TOU-MHR-2026');
assert.ok(/zero|zéro|zeros/i.test(ex.reason),'la cause des données manquantes est explicitée');
assert.match(ex.url,/\/2025-2026\/finale\//);
assert.strictEqual(c.stats.some(s=>s.matchId===ex.matchId),false,
  'zéros non renseignés de la finale 2026 exclus de la calibration');

const racing=c.events.find(e=>e.id==='T14-01');
assert.ok(/Nathan Hughes/.test(racing.observation) && /melee/.test(racing.observation),
  'vrai départ 8 identifié');
const pau=c.events.find(e=>e.id==='T14-17');
assert.ok(/sans que la source decrive un depart de melee/.test(pau.observation),
  'les deux essais du 8 Isa ne prouvent PAS une sortie de mêlée');
const pause=c.events.find(e=>e.id==='T14-11');
assert.ok(/orage et une interruption/.test(pause.observation));
console.log('Top14 OK : 9 matchs, 19 observations, 6 relevés LNR utilisables ; faux zéros exclus.');
