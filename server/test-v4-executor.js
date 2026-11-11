// RM4-G07 — exécuteur physique : intention bornée, gardes sur le monde réel,
// succès/échec/abandon. Ne prouve PAS les passes/plaquages d'agents (NO_ACTUATOR).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { ActionExecutor, PlanRunner } = require('../engine/ai/action-executor.js');
const { planGoal } = require('../engine/ai/goal-planner.js');
const { buildPlannerActions, factsFromBeliefs } = require('../engine/ai/action-cost.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { profilePour } = require('../engine/ai/goals.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');
const { MatchEngine } = require('../engine/rugby-engine.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const DT = 0.05;
const scen = (id) => corpus.scenarios.find((s) => s.id === id);
const joueur = (m, team, n) => (team === 'A' ? m.equipeA : m.equipeB).find((j) => j.numero === n);
// Un ruck de S01 où le 9 est debout (le moteur garde ses propres règles).
function ruck() {
  const m = createScenarioEngine(scen('S01'));
  const n9 = joueur(m, 'A', 9); n9.auSol = 0;
  m.ruckDureeCible = 60; // un ruck naturel ne dure que 2-3 s : on le garde ouvert pour observer la course
  return m;
}
// Pilote un exécuteur : le moteur avance, l'intention est rafraîchie à chaque pas.
function piloter(m, runner, secondes, suivi) {
  const eq = runner.executor ? runner.executor.agent : runner.agent;
  for (let t = 0; t < secondes; t += DT) {
    const intent = runner.step(JSON.parse(JSON.stringify(m.getState())));
    if (intent) m.setAgentIntent(eq.team, eq.numero, intent); else m.clearAgentIntent(eq.team, eq.numero);
    m.tick(DT);
    if (suivi) suivi(m);
    if (['DONE', 'FAILED', 'ABORTED'].includes(runner.status)) break;
  }
  m.clearAgentIntent(eq.team, eq.numero);
}

test('moteur : sans intention le jeu est identique ; une intention posée puis retirée ne change rien', () => {
  const a = new MatchEngine(7, 4800), b = new MatchEngine(7, 4800);
  b.setAgentIntent('A', 8, { tx: 50, ty: 30 }); b.clearAgentIntent('A', 8);
  for (let i = 0; i < 2000; i++) { a.tick(0.1); b.tick(0.1); }
  assert.strictEqual(JSON.stringify(a.getState()), JSON.stringify(b.getState()));
});

test('moteur : intentions invalides refusées (équipe, numéro, cible non finie, vitesse hors ]0,1])', () => {
  const m = new MatchEngine(3, 4800);
  assert.strictEqual(m.setAgentIntent('C', 3, { tx: 1, ty: 1 }), false);
  assert.strictEqual(m.setAgentIntent('A', 16, { tx: 1, ty: 1 }), false);
  assert.strictEqual(m.setAgentIntent('A', 3, { tx: NaN, ty: 1 }), false);
  assert.strictEqual(m.setAgentIntent('A', 3, { tx: 1, ty: 1, vmaxFactor: 1.5 }), false);
  assert.strictEqual(m.setAgentIntent('A', 3, { tx: 1, ty: 1, vmaxFactor: 0 }), false);
  assert.strictEqual(m.setAgentIntent('A', 3, { tx: 1, ty: 1, vmaxFactor: 0.5 }), true);
});

test('temps physique > 0 : parcourir 6 m prend du temps, sans téléportation ni dépassement de la vitesse maximale', () => {
  const m = new MatchEngine(5, 4800);
  m.phase = 'PORTE';
  const j = joueur(m, 'A', 9); j.x = 40; j.y = 30; j.vitesseCourante = 0; j.auSol = 0;
  let t = 0, prec = { x: j.x, y: j.y }, maxPas = 0;
  m.setAgentIntent('A', 9, { tx: 46, ty: 30 });
  for (; t < 10 && Math.hypot(j.x - 46, j.y - 30) > 0.3; t += DT) {
    m.tick(DT); m.setAgentIntent('A', 9, { tx: 46, ty: 30 });
    maxPas = Math.max(maxPas, Math.hypot(j.x - prec.x, j.y - prec.y)); prec = { x: j.x, y: j.y };
  }
  assert.ok(t > 0.9, `6 m parcourus en ${t.toFixed(2)} s : trop court`);
  assert.ok(t < 5, `6 m en ${t.toFixed(2)} s : trop long`);
  assert.ok(maxPas <= 8.1 * DT + 1e-6, `pas max ${maxPas.toFixed(3)} m (vitesse max 8 m/s)`);
});

test('GET_ONSIDE : un joueur hors-jeu revient derrière la ligne ; effet confirmé seulement à la réussite réelle', () => {
  const m = ruck();
  const b7 = joueur(m, 'B', 7); b7.x = m.ruckPoint.x - 3; b7.y = m.ruckPoint.y + 4; b7.vitesseCourante = 0;
  const runner = new PlanRunner({ team: 'B', numero: 7 }, ['GET_ONSIDE']);
  let positions = [];
  piloter(m, runner, 6, (mm) => positions.push([b7.x, b7.y]));
  assert.strictEqual(runner.status, 'DONE', JSON.stringify(runner.events.map((e) => e.type + ':' + e.reason)));
  assert.deepStrictEqual(runner.confirmedEffects, { SELF_ONSIDE: true });
  assert.ok(positions.length > 2, 'le déplacement a pris plusieurs pas');
  for (let i = 1; i < positions.length; i++) assert.ok(Math.hypot(positions[i][0] - positions[i - 1][0], positions[i][1] - positions[i - 1][1]) <= 0.5);
  assert.ok(runner.events.some((e) => e.type === 'ACTION_SUCCEEDED'));
});

test('plan GET_ONSIDE -> MOVE_TO_RUCK exécuté pas à pas jusqu\'au ruck, sans sauter d\'étape', () => {
  const m = ruck();
  const b7 = joueur(m, 'B', 7); b7.x = m.ruckPoint.x - 3; b7.y = m.ruckPoint.y + 8; b7.vitesseCourante = 0;
  const runner = new PlanRunner({ team: 'B', numero: 7 }, ['GET_ONSIDE', 'MOVE_TO_RUCK']);
  piloter(m, runner, 15);
  assert.strictEqual(runner.status, 'DONE', JSON.stringify(runner.events.map((e) => e.type + ':' + e.action + ':' + e.reason)));
  const ordre = runner.events.filter((e) => e.type === 'ACTION_SUCCEEDED').map((e) => e.action);
  assert.deepStrictEqual(ordre, ['GET_ONSIDE', 'MOVE_TO_RUCK']);
  assert.deepStrictEqual(runner.confirmedEffects, { SELF_ONSIDE: true, SELF_AT_RUCK: true });
});

test('startGuard sur le monde réel : un joueur au sol ne peut pas MOVE_TO_RUCK ; hors-jeu non plus', () => {
  const m = ruck();
  const e = new ActionExecutor({ team: 'A', numero: 9 });
  const n9 = joueur(m, 'A', 9); n9.auSol = 2;
  const r = e.start('MOVE_TO_RUCK', m.getState());
  assert.strictEqual(r.started, false);
  assert.match(r.events[0].reason, /START_GUARD/);
  assert.strictEqual(r.events[0].type, 'ACTION_FAILED');
  const b7 = joueur(m, 'B', 7); b7.x = m.ruckPoint.x - 4; b7.y = m.ruckPoint.y;
  const r2 = new ActionExecutor({ team: 'B', numero: 7 }).start('MOVE_TO_RUCK', m.getState());
  assert.strictEqual(r2.started, false);
  assert.match(r2.events[0].reason, /OFFSIDE/);
});

test('abortGuard : le ruck se termine pendant la course -> ACTION_ABORTED (PHASE_CHANGED), plan arrêté', () => {
  const m = ruck();
  const a8 = joueur(m, 'A', 8); a8.x = m.ruckPoint.x - 15; a8.y = m.ruckPoint.y + 10; a8.vitesseCourante = 0;
  const runner = new PlanRunner({ team: 'A', numero: 8 }, ['MOVE_TO_RUCK']);
  piloter(m, runner, 0.5);
  assert.strictEqual(runner.status, 'RUNNING');
  m.phase = 'PORTE'; // le jeu repart : le regroupement n'existe plus
  piloter(m, runner, 1);
  assert.strictEqual(runner.status, 'ABORTED');
  assert.ok(runner.events.some((e) => e.type === 'ACTION_ABORTED' && e.reason === 'PHASE_CHANGED'));
  assert.deepStrictEqual(runner.confirmedEffects, {}, 'aucun effet confirmé');
});

test('échec : délai dépassé -> ACTION_FAILED (TIMEOUT), aucun effet confirmé', () => {
  const m = ruck();
  const a14 = joueur(m, 'A', 14); a14.x = 5; a14.y = 65; a14.vitesseCourante = 0; // très loin du ruck
  const runner = new PlanRunner({ team: 'A', numero: 14 }, ['MOVE_TO_RUCK'], { deadlineFactor: 0.2 });
  piloter(m, runner, 6);
  assert.strictEqual(runner.status, 'FAILED');
  assert.ok(runner.events.some((e) => e.type === 'ACTION_FAILED' && e.reason === 'TIMEOUT'));
  assert.deepStrictEqual(runner.confirmedEffects, {});
});

test('intention ≠ résultat : actions de ballon sans acteur -> ACTION_FAILED NO_ACTUATOR, jamais un succès simulé', () => {
  const m = ruck();
  for (const nom of ['PASS_TO_10', 'SECURE_BALL', 'CLEAR_OUT_LEGALLY', 'RUN_INTO_GAP', 'FIX_DEFENDER', 'PASS_TO_POD', 'PASS_TO_OUTSIDE']) {
    const r = new ActionExecutor({ team: 'A', numero: 9 }).start(nom, m.getState());
    assert.strictEqual(r.started, false, nom);
    assert.strictEqual(r.events[0].reason, 'NO_ACTUATOR', nom);
  }
  const porteur0 = m.porteur, poss0 = m.possession;
  const runner = new PlanRunner({ team: 'A', numero: 9 }, ['SECURE_BALL', 'PASS_TO_10']);
  piloter(m, runner, 2);
  assert.strictEqual(runner.status, 'FAILED');
  assert.strictEqual(m.porteur, porteur0); assert.strictEqual(m.possession, poss0);
});

test('un joueur au sol n\'obéit pas à une intention (le moteur reste juge) : même déplacement qu\'sans intention', () => {
  const lance = (avecIntention) => {
    const m = ruck();
    const n9 = joueur(m, 'A', 9); n9.auSol = 2; n9.x = 51; n9.y = 26;
    for (let i = 0; i < 20; i++) { if (avecIntention) m.setAgentIntent('A', 9, { tx: 20, ty: 5 }); m.tick(DT); }
    return [n9.x, n9.y];
  };
  assert.deepStrictEqual(lance(true), lance(false), 'l\'intention a déplacé un joueur au sol');
});

test('G01/G02 branchés au moteur : planifier depuis les croyances puis exécuter dans le moteur (B7 hors-jeu, but SELF_AT_RUCK)', () => {
  const m = ruck();
  const b7 = joueur(m, 'B', 7); b7.x = m.ruckPoint.x - 3; b7.y = m.ruckPoint.y + 5; b7.orientation = Math.PI; b7.vitesseCourante = 0;
  const croyances = new AgentContext({ team: 'B', numero: 7 }, { reactionDelay: 0 }).update(JSON.parse(JSON.stringify(m.getState())));
  const faits = Object.assign({}, factsFromBeliefs(croyances), { SELF_AT_RUCK: false });
  const plan = planGoal(faits, { SELF_AT_RUCK: true }, buildPlannerActions(croyances, profilePour(7)));
  assert.strictEqual(plan.status, 'OK');
  assert.strictEqual(plan.steps[0], 'GET_ONSIDE');
  const runner = new PlanRunner({ team: 'B', numero: 7 }, plan.steps);
  piloter(m, runner, 20);
  assert.strictEqual(runner.status, 'DONE', JSON.stringify(runner.events.map((e) => e.type + ':' + e.action + ':' + e.reason)));
});

test('déterminisme : même scénario, mêmes intentions -> mêmes positions et événements', () => {
  const run = () => {
    const m = ruck();
    const b7 = joueur(m, 'B', 7); b7.x = m.ruckPoint.x - 3; b7.y = m.ruckPoint.y + 6; b7.vitesseCourante = 0;
    const runner = new PlanRunner({ team: 'B', numero: 7 }, ['GET_ONSIDE', 'MOVE_TO_RUCK']);
    piloter(m, runner, 12);
    return JSON.stringify([m.equipeA.concat(m.equipeB).map((j) => [j.x.toFixed(4), j.y.toFixed(4)]), runner.events]);
  };
  assert.strictEqual(run(), run());
});

test('rejet architectural : ni le planificateur ni l\'exécuteur n\'écrivent porteur, ruckPoint, score ou possession ; le hook moteur non plus', () => {
  // Écritures sur le MONDE (état, moteur, instantané) ; la mémoire locale d'un agent est autorisée.
  const interdit = /\b(state|etat|engine|moteur|monde|world|snapshot|match)\.(porteur|ruckPoint|score|possession|phase)\s*=[^=]/;
  for (const f of fs.readdirSync(path.join(__dirname, '../engine/ai')).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(__dirname, '../engine/ai', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!interdit.test(src), f + ' écrit dans le monde');
    assert.ok(!/Date\.now|Math\.random|performance\.now|TeamCoordinator|TeamBlackboard|assignRoles|reserveRole/.test(src), f);
  }
  const eng = fs.readFileSync(path.join(__dirname, '../engine/rugby-engine.js'), 'utf8');
  const blocs = [...eng.matchAll(/=== AGENT_INTENTS_BEGIN[\s\S]*?=== AGENT_INTENTS_END/g)].map((m) => m[0]);
  assert.ok(blocs.length >= 3, 'blocs du hook introuvables');
  for (const b of blocs) assert.ok(!/\bthis\.(porteur|ruckPoint|score|possession|phase)\s*=[^=]/.test(b.replace(/\/\/.*$/gm, '')), 'le hook moteur écrit dans le monde');
  assert.strictEqual(fs.readFileSync(path.join(__dirname, '../docs/rugby-engine.js'), 'utf8'), eng, 'copie docs/ non synchronisée');
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : l\'exécuteur physique V4 est borné, honnête et déterministe.');
