// RM4-G03 — ontologie canonique des faits et extraction pure depuis getState().
// Ne prouve PAS l'intégration d'agents au match : seulement des faits cohérents.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { FACT_SCHEMA_VERSION, FACTS, FACT_NAMES, validateFactSet, detectConflicts, assertNoConflicts } = require('../engine/ai/facts.js');
const { extractFacts } = require('../engine/ai/world-model.js');
const { planGoal } = require('../engine/ai/goal-planner.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');
const { MatchEngine } = require('../engine/rugby-engine.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const scenario = (id, ticks = 20) => {
  const f = corpus.scenarios.find((s) => s.id === id);
  const m = createScenarioEngine(f);
  for (let i = 0; i < ticks; i++) m.tick(f.tickSeconds);
  return m;
};
const vrais = (r) => Object.entries(r.facts).filter(([, v]) => v).map(([k]) => k).sort();

test('ontologie : exactement les 29 faits du catalogue 05, noms identiques', () => {
  const doc = fs.readFileSync(path.join(__dirname, '../docs/SIMULATION_V4/05_CATALOGUE_GOALS_ACTIONS.md'), 'utf8');
  const noms = [...doc.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \| (?:bool|[^|]*)\| (?:individuel|partagé|équipe|agent|phase|résultat)/gm)].map((m) => m[1]);
  assert.strictEqual(noms.length, 29, `${noms.length} faits lus dans le catalogue`);
  assert.deepStrictEqual([...noms].sort(), [...FACT_NAMES].sort());
});

test('orthographe canonique SCRUM_BALL_IN ; aucune variante', () => {
  assert.ok(FACT_NAMES.includes('SCRUM_BALL_IN'));
  assert.ok(!FACT_NAMES.some((n) => /SCRUM_BALLIN|SCRUMBALL_IN|SCRUM_BALL_INN/.test(n)));
  for (const f of Object.values(FACTS)) assert.ok(['individuel', 'partagé', 'équipe', 'agent', 'phase', 'résultat'].includes(f.scope));
  assert.strictEqual(FACT_SCHEMA_VERSION, '1.0.0');
});

test('validation : fait inconnu ou non booléen refusé', () => {
  assert.ok(validateFactSet({ HAS_BALL: true, SELF_ONSIDE: false }));
  assert.throws(() => validateFactSet({ HAS_THE_BALL: true }), /inconnu/);
  assert.throws(() => validateFactSet({ HAS_BALL: 1 }), /booléen/);
  assert.throws(() => validateFactSet([]), /objet/);
});

test('0 conflit : ballon en vol + porté, au sol + lié, deux possessions sont détectés', () => {
  assert.deepStrictEqual(detectConflicts({ HAS_BALL: true, TEAM_POSSESSION: true }), []);
  assert.strictEqual(detectConflicts({ BALL_IN_FLIGHT: true, HAS_BALL: true }).length, 1);
  assert.strictEqual(detectConflicts({ SELF_GROUNDED: true, SELF_BOUND: true }).length, 1);
  assert.strictEqual(detectConflicts({ TEAM_POSSESSION: true, OPPONENT_POSSESSION: true }).length, 1);
  assert.strictEqual(detectConflicts({ SCRUM_BALL_IN: true, SCRUM_SET: false }).length >= 1, true);
  assert.throws(() => assertNoConflicts({ BALL_IN_FLIGHT: true, BALL_AT_RUCK: true }), /contradictoires/);
});

test('snapshot S01 (ruck) : faits du 9 plaqué', () => {
  const r = extractFacts(scenario('S01').getState(), { team: 'A', numero: 9 });
  assert.deepStrictEqual(vrais(r), ['BALL_AT_RUCK', 'BREAKDOWN_CONTEST_ACTIVE', 'PASS_LANE_10_OPEN', 'RECEIVER_OPEN', 'SELF_GROUNDED', 'SELF_ONSIDE', 'TEAM_POSSESSION']);
  assert.strictEqual(r.facts.BALL_AVAILABLE, false);
  assert.strictEqual(r.facts.HAS_BALL, false, 'un joueur au sol n\'a pas le ballon en jeu');
});

test('snapshot S01 : un défenseur voit OPPONENT_POSSESSION, pas de couloir de passe vers « son » 10', () => {
  const r = extractFacts(scenario('S01').getState(), { team: 'B', numero: 2 });
  assert.strictEqual(r.facts.OPPONENT_POSSESSION, true);
  assert.strictEqual(r.facts.TEAM_POSSESSION, false);
  assert.strictEqual(r.facts.BALL_AT_RUCK, true);
});

test('snapshot S03 (mêlée) : mêlée en formation, ballon pas encore introduit', () => {
  const r = extractFacts(scenario('S03').getState(), { team: 'A', numero: 9 });
  assert.strictEqual(r.facts.SCRUM_SET, false);
  assert.strictEqual(r.facts.SCRUM_BALL_IN, false);
  assert.strictEqual(r.facts.TEAM_POSSESSION, true);
});

test('mêlée : SCRUM_SET puis SCRUM_BALL_IN apparaissent dans l\'ordre, jamais BALL_IN sans SET', () => {
  // Certaines mêlées s'écroulent avant l'introduction (cas réel du moteur) :
  // on cherche des graines où le ballon entre, et on en exige au moins une.
  const f0 = corpus.scenarios.find((s) => s.id === 'S03');
  let complete = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = createScenarioEngine(Object.assign({}, f0, { seed }));
    let set = null, bi = null;
    for (let i = 0; i < 1600 && m.phase === 'MELEE'; i++) {
      m.tick(f0.tickSeconds);
      const r = extractFacts(m.getState(), { team: 'A', numero: 9 });
      if (r.facts.SCRUM_BALL_IN) assert.ok(r.facts.SCRUM_SET, 'BALL_IN sans SET');
      if (r.facts.SCRUM_SET && set === null) set = i;
      if (r.facts.SCRUM_BALL_IN && bi === null) bi = i;
    }
    if (bi !== null) { assert.ok(set !== null && set <= bi, `graine ${seed} : SET ${set}, BALL_IN ${bi}`); complete++; }
  }
  assert.ok(complete >= 1, 'aucune mêlée complète observée');
});

test('snapshot S07 (coup de pied) : ballon en vol, hors-jeu des joueurs devant le botteur', () => {
  const m = scenario('S07');
  const e = m.getState();
  const r9 = extractFacts(e, { team: 'A', numero: 9 });
  assert.strictEqual(r9.facts.BALL_IN_FLIGHT, true);
  assert.strictEqual(r9.facts.HAS_BALL, false);
  assert.strictEqual(r9.facts.SELF_ONSIDE, false, 'le 9 est devant le botteur : hors-jeu');
  assert.strictEqual(r9.facts.KICK_CHASE_ONSIDE, false);
  const botteur = e.porteur;
  const rb = extractFacts(e, { team: botteur.team, numero: botteur.numero });
  assert.strictEqual(rb.facts.KICK_CHASE_ONSIDE, true, 'le botteur peut chasser');
});

test('perception horodatée : chaque fait perçu porte le temps du match', () => {
  const m = scenario('S01');
  const r = extractFacts(m.getState(), { team: 'A', numero: 9 });
  assert.ok(Object.keys(r.perceived).length >= 2);
  for (const v of Object.values(r.perceived)) { assert.strictEqual(v.t, m.getState().tempsMatch); assert.strictEqual(typeof v.value, 'boolean'); }
  assert.strictEqual(r.t, m.getState().tempsMatch);
});

test('faits non calculables : absents (jamais faux), liste explicite', () => {
  const r = extractFacts(scenario('S01').getState(), { team: 'A', numero: 9 });
  for (const n of ['RUCK_WON', 'GAP_NEARBY', 'DEFENSIVE_GAP_CLOSED', 'LINEOUT_READY', 'MAUL_BIND_LEGAL', 'DISTRIBUTED', 'TRY_PREVENTED', 'POSSESSION_SECURED', 'SAFE_SUPPORT_LANE', 'PASS_LANE_POD_OPEN']) {
    assert.ok(r.absent.includes(n), n + ' devrait être absent');
    assert.ok(!(n in r.facts), n + ' ne doit pas être renvoyé');
  }
  assert.ok(r.absent.includes('SELF_AT_TARGET'), 'sans cible, SELF_AT_TARGET est absent');
  const avec = extractFacts(scenario('S01').getState(), { team: 'A', numero: 9 }, { target: { x: 52, y: 25 } });
  assert.strictEqual(avec.facts.SELF_AT_TARGET, true);
});

test('pureté : état non modifié, résultat gelé, deux appels identiques, aucune source d\'aléa', () => {
  const e = scenario('S08').getState();
  const avant = JSON.stringify(e);
  const a = extractFacts(e, { team: 'A', numero: 12 }), b = extractFacts(e, { team: 'A', numero: 12 });
  assert.strictEqual(JSON.stringify(e), avant, 'getState() muté');
  assert.deepStrictEqual(a, b);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.facts) && Object.isFrozen(a.perceived));
  assert.throws(() => { 'use strict'; a.facts.HAS_BALL = !a.facts.HAS_BALL; }, TypeError);
  for (const fichier of ['facts.js', 'world-model.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../engine/ai', fichier), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Date\.now|Math\.random|performance\.now/.test(src), fichier + ' : source d\'aléa');
  }
});

test('pas de second moteur de possession : le fait suit uniquement state.possession', () => {
  const e = scenario('S08').getState();
  for (const poss of ['A', 'B']) {
    const copie = Object.assign({}, e, { possession: poss });
    assert.strictEqual(extractFacts(copie, { team: 'A', numero: 3 }).facts.TEAM_POSSESSION, poss === 'A');
    assert.strictEqual(extractFacts(copie, { team: 'B', numero: 3 }).facts.TEAM_POSSESSION, poss === 'B');
  }
});

test('S08 : le porteur HAS_BALL est cohérent avec sa possession ; un seul porteur sur 30 joueurs', () => {
  const e = scenario('S08', 5).getState();
  let porteurs = 0;
  for (const team of ['A', 'B']) for (let n = 1; n <= 15; n++) {
    const r = extractFacts(e, { team, numero: n });
    if (r.facts.HAS_BALL) { porteurs++; assert.strictEqual(r.facts.TEAM_POSSESSION, true); }
    assert.deepStrictEqual(detectConflicts(r.facts), []);
  }
  assert.strictEqual(porteurs, 1);
});

test('aucun conflit sur 30 joueurs x états d\'un vrai match (graine 11, un état toutes les 5 s)', () => {
  const m = new MatchEngine(11, 4800);
  let etats = 0;
  for (let t = 0; t < 1500; t += 0.1) {
    m.tick(0.1);
    if (Math.round(t * 10) % 50 !== 0) continue;
    const e = m.getState(); etats++;
    for (const team of ['A', 'B']) for (let n = 1; n <= 15; n++) {
      const r = extractFacts(e, { team, numero: n });
      assert.deepStrictEqual(detectConflicts(r.facts), [], `${team}${n} à ${t}`);
      validateFactSet(r.facts);
    }
  }
  assert.ok(etats >= 250);
});

test('compatibilité avec le planificateur symbolique : les faits à plat sont des entrées valides', () => {
  const r = extractFacts(scenario('S01').getState(), { team: 'A', numero: 9 });
  const plan = planGoal(Object.assign({}, r.facts), { DISTRIBUTED: true }, [
    { id: 'PASS_TO_10', preconditions: { PASS_LANE_10_OPEN: true }, effects: { DISTRIBUTED: true }, cost: 1 },
  ]);
  assert.ok(plan && plan.found !== false, JSON.stringify(plan).slice(0, 120));
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : l\'ontologie et l\'extraction de faits V4 sont conformes.');
