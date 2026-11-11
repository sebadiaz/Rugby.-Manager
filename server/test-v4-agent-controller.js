// RM4-G08 — contrôleur GoalBasedRugbyAgent : perception -> but -> plan -> action -> suivi.
// Les actions de ballon n'ont pas d'acteur moteur : ces tests utilisent des DOUBLURES
// déclarées (STUB_*) pour SECURE_BALL / PASS_*, jamais un succès du moteur.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { GoalBasedRugbyAgent } = require('../engine/ai/agent-controller.js');
const { ACTEURS } = require('../engine/ai/action-executor.js');
const { LocalCommunication } = require('../engine/ai/local-communication.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const DT = 0.05;
const joueur = (m, team, n) => (team === 'A' ? m.equipeA : m.equipeB).find((j) => j.numero === n);
const copie = (e) => JSON.parse(JSON.stringify(e));
function ruck() {
  // Le plaqué du regroupement est le joueur le plus proche du ballon : on éloigne le 9 dans la
  // fixture pour qu'il reste debout, libre de jouer son rôle.
  const f = JSON.parse(JSON.stringify(corpus.scenarios.find((s) => s.id === 'S01')));
  const p9 = f.setup.players.find((p) => p.id === 'A9'); p9.x = 46; p9.y = 26;
  const m = createScenarioEngine(f);
  for (let i = 0; i < 20; i++) m.tick(DT);
  const n9 = joueur(m, 'A', 9); n9.x = 51; n9.y = 26; n9.auSol = 0;
  const d = joueur(m, 'A', 10); n9.orientation = Math.atan2(d.y - n9.y, d.x - n9.x);
  m.ruckDureeCible = 120;
  return m;
}
const etat = (m) => { const e = copie(m.getState()); if (m.phase === 'RUCK' && e.ruck) e.ruck.ballAvailable = true; return e; };
// Boucle : le moteur avance, chaque agent décide et transmet son intention.
function boucle(m, agents, secondes, comm, apres) {
  for (let t = 0; t < secondes; t += DT) {
    const e = etat(m);
    for (const a of agents) {
      const r = a.tick(e, comm);
      if (r.intent) m.setAgentIntent(a.agent.team, a.agent.numero, r.intent); else m.clearAgentIntent(a.agent.team, a.agent.numero);
    }
    m.tick(DT);
    if (apres) apres(m, t);
  }
}
const types = (a) => a.events.map((e) => e.type);

// --- DOUBLURES des acteurs de ballon (déclarées) -----------------------------
function doublures(etatMonde) {
  return Object.assign({}, ACTEURS, {
    SECURE_BALL: { maxSeconds: 3, startGuard: () => null, intent: () => null, successGuard: () => { etatMonde.porteBalle = true; return true; }, abortGuard: () => null },
    PASS_TO_10: { maxSeconds: 3, startGuard: () => null, intent: () => null, successGuard: () => false, abortGuard: () => null },
    PASS_TO_POD: { maxSeconds: 3, startGuard: () => null, intent: () => null, successGuard: () => false, abortGuard: () => null },
  });
}

test('boucle complète sur un vrai ruck : but choisi, plan créé, action démarrée puis réussie dans le moteur (B6 conteste)', () => {
  const m = ruck();
  const b6 = joueur(m, 'B', 6); b6.x = m.ruckPoint.x + 6; b6.y = m.ruckPoint.y + 5; b6.vitesseCourante = 0; b6.orientation = Math.PI;
  const a = new GoalBasedRugbyAgent({ team: 'B', numero: 6 });
  boucle(m, [a], 8);
  const t = types(a);
  assert.ok(t.indexOf('GOAL_CHANGED') < t.indexOf('PLAN_CREATED') && t.indexOf('PLAN_CREATED') < t.indexOf('ACTION_STARTED'), t.join(','));
  assert.strictEqual(a.goal === 'CONTEST_BREAKDOWN' || a.goal === 'DEFEND' || !!a.goal, true);
  assert.ok(a.events.some((e) => e.type === 'PLAN_CREATED' && e.goal === 'CONTEST_BREAKDOWN' && e.steps.includes('MOVE_TO_RUCK')), JSON.stringify(a.events.filter((e) => e.type === 'PLAN_CREATED')));
  assert.ok(a.events.some((e) => e.type === 'ACTION_SUCCEEDED' && e.action === 'MOVE_TO_RUCK'), 'B6 arrive au ruck');
});

test('critère G08 : le 10 se couvre à la 3e étape -> A9 remplace PASS_TO_10 par PASS_TO_POD sans repartir de la remise en jeu', () => {
  const m = ruck();
  const n9 = joueur(m, 'A', 9); n9.x = 51 - 6; n9.y = 26; n9.vitesseCourante = 0; // à 6 m du ruck
  const monde = { porteBalle: false };
  const a = new GoalBasedRugbyAgent({ team: 'A', numero: 9 }, {
    acteurs: doublures(monde),
    // Doublure de perception : couloir du pod ouvert ; ballon « porté » une fois SECURE_BALL réussi.
    extraFacts: (b, f) => Object.assign({ PASS_LANE_POD_OPEN: true }, monde.porteBalle ? { HAS_BALL: true, SELF_AT_RUCK: true } : {}),
  });
  let ferme = false;
  boucle(m, [a], 25, null, () => {
    // Dès que PASS_TO_10 est la 3e étape en cours, un adversaire ferme le couloir 9 -> 10.
    if (!ferme && a.plan && a.plan.index === 2 && a.executor.busy) {
      const d10 = joueur(m, 'A', 10), n = joueur(m, 'A', 9), b7 = joueur(m, 'B', 7);
      b7.x = (n.x + d10.x) / 2; b7.y = (n.y + d10.y) / 2; ferme = true;
    }
  });
  const initial = a.events.find((e) => e.type === 'PLAN_CREATED');
  assert.deepStrictEqual(initial.steps, ['MOVE_TO_RUCK', 'SECURE_BALL', 'PASS_TO_10']);
  assert.ok(ferme, 'la 3e étape n\'a jamais été atteinte');
  const re = a.events.find((e) => e.type === 'PLAN_REPLANNED');
  assert.ok(re, JSON.stringify(types(a)));
  assert.strictEqual(re.reason, 'PRECONDITION_INVALID');
  assert.deepStrictEqual(re.steps, ['PASS_TO_POD'], 'replanifié : ' + re.steps);
  assert.ok(!re.steps.includes('MOVE_TO_RUCK') && !re.steps.includes('GET_UP'), 'ne recommence pas depuis la remise en jeu');
  assert.ok(a.events.some((e) => e.type === 'ACTION_ABORTED' && e.action === 'PASS_TO_10' && e.reason === 'PRECONDITION_INVALID'));
});

test('D01 : même but DISTRIBUTE_BALL, deux plans selon le couloir (10 ouvert -> via le 10 ; 10 fermé + pod ouvert -> via le pod)', () => {
  const planPour = (couvre10) => {
    const m = ruck();
    if (couvre10) { const d = joueur(m, 'A', 10); joueur(m, 'B', 6).x = d.x + 1; joueur(m, 'B', 6).y = d.y; }
    const monde = { porteBalle: true };
    const a = new GoalBasedRugbyAgent({ team: 'A', numero: 9 }, { acteurs: doublures(monde), extraFacts: () => ({ PASS_LANE_POD_OPEN: true }) });
    boucle(m, [a], 1);
    return { goal: a.goal, steps: a.events.find((e) => e.type === 'PLAN_CREATED').steps };
  };
  const libre = planPour(false), couvert = planPour(true);
  assert.strictEqual(libre.goal, 'DISTRIBUTE_BALL'); assert.strictEqual(couvert.goal, 'DISTRIBUTE_BALL');
  assert.ok(libre.steps.includes('PASS_TO_10') && !libre.steps.includes('PASS_TO_POD'), libre.steps);
  assert.ok(couvert.steps.includes('PASS_TO_POD') && !couvert.steps.includes('PASS_TO_10'), couvert.steps);
});

test('I03 : aucune option de passe légale (10 couvert, pas de pod) -> NO_PLAN explicite, le but est tenu, pas d\'action illégale', () => {
  const m = ruck();
  const d = joueur(m, 'A', 10); joueur(m, 'B', 6).x = d.x + 1; joueur(m, 'B', 6).y = d.y;
  const a = new GoalBasedRugbyAgent({ team: 'A', numero: 9 }, { acteurs: doublures({ porteBalle: true }) });
  boucle(m, [a], 3);
  assert.strictEqual(a.goal, 'DISTRIBUTE_BALL');
  assert.ok(a.events.some((e) => e.type === 'NO_PLAN'));
  assert.ok(!a.events.some((e) => e.type === 'ACTION_STARTED' && /PASS_TO/.test(e.action)), 'aucune passe lancée');
});

test('deux trajectoires différentes, même but : B6 et B8 contestent depuis deux endroits distincts', () => {
  const m = ruck();
  const b6 = joueur(m, 'B', 6), b8 = joueur(m, 'B', 8);
  b6.x = m.ruckPoint.x + 7; b6.y = m.ruckPoint.y - 6; b8.x = m.ruckPoint.x + 9; b8.y = m.ruckPoint.y + 7;
  b6.vitesseCourante = 0; b8.vitesseCourante = 0; b6.orientation = Math.PI; b8.orientation = Math.PI;
  const a6 = new GoalBasedRugbyAgent({ team: 'B', numero: 6 }), a8 = new GoalBasedRugbyAgent({ team: 'B', numero: 8 });
  const tr6 = [], tr8 = [];
  boucle(m, [a6, a8], 3, null, () => { tr6.push([b6.x, b6.y]); tr8.push([b8.x, b8.y]); });
  assert.strictEqual(a6.goal, a8.goal, `${a6.goal} / ${a8.goal}`);
  assert.notDeepStrictEqual(tr6, tr8);
  assert.ok(Math.abs(tr6[tr6.length - 1][1] - tr8[tr8.length - 1][1]) > 3, 'ils n\'arrivent pas au même point');
});

test('cadence : la décision n\'est pas rejouée à chaque tick (période 0,4 s) mais l\'exécution est suivie à chaque tick', () => {
  const m = ruck();
  const a = new GoalBasedRugbyAgent({ team: 'A', numero: 7 }, { decisionPeriod: 0.4 });
  boucle(m, [a], 10);
  assert.ok(a.decisions <= 10 / 0.4 + 6, `${a.decisions} décisions en 10 s`);
  assert.ok(a.decisions >= 5);
});

test('action sans acteur : ACTION_FAILED NO_ACTUATOR, action écartée un moment, pas de boucle infinie', () => {
  const m = ruck();
  const a = new GoalBasedRugbyAgent({ team: 'A', numero: 9 }); // sans doublures : SECURE_BALL n'a pas d'acteur
  boucle(m, [a], 6);
  const echecs = a.events.filter((e) => e.type === 'ACTION_FAILED' && e.reason === 'NO_ACTUATOR');
  assert.ok(echecs.length >= 1 && echecs.length <= 3, `${echecs.length} échecs en 6 s`);
});

test('parole locale : le soutien lance « Soutien ! » de lui-même, le coéquipier l\'entend sans qu\'un plan lui soit imposé', () => {
  const m = createScenarioEngine(corpus.scenarios.find((s) => s.id === 'S08'));
  for (let i = 0; i < 10; i++) m.tick(DT);
  const comm = new LocalCommunication();
  const a8 = new GoalBasedRugbyAgent({ team: 'A', numero: 8 }), a6 = new GoalBasedRugbyAgent({ team: 'A', numero: 6 });
  boucle(m, [a8, a6], 6, comm);
  const dit = [a8, a6].flatMap((a) => a.events.filter((e) => e.type === 'SPOKE').map((e) => a.id + ':' + e.kind));
  assert.ok(dit.length >= 1, 'personne n\'a parlé : ' + [a8.goal, a6.goal]);
  assert.ok(dit.every((d) => /SUPPORT|MINE|COVER/.test(d)));
  // L'agent qui écoute garde ses propres buts : hear() n'impose aucun plan.
  assert.ok(Array.isArray(a8.hear()) && Array.isArray(a6.hear()));
});

test('déterminisme : deux exécutions identiques donnent mêmes événements et mêmes positions', () => {
  const run = () => {
    const m = ruck();
    const b6 = joueur(m, 'B', 6); b6.x = m.ruckPoint.x + 6; b6.y = m.ruckPoint.y + 5; b6.vitesseCourante = 0;
    const a = new GoalBasedRugbyAgent({ team: 'B', numero: 6 });
    boucle(m, [a], 6);
    return JSON.stringify([a.events, [b6.x.toFixed(4), b6.y.toFixed(4)]]);
  };
  assert.strictEqual(run(), run());
});

test('l\'état source n\'est pas muté ; aucune IA collective ; options invalides refusées', () => {
  const m = ruck();
  const e = copie(m.getState()); const avant = JSON.stringify(e);
  new GoalBasedRugbyAgent({ team: 'A', numero: 9 }).tick(e);
  assert.strictEqual(JSON.stringify(e), avant);
  assert.throws(() => new GoalBasedRugbyAgent({ team: 'A', numero: 9 }, { decisionPeriod: 0 }), /invalides/);
  assert.throws(() => new GoalBasedRugbyAgent({ team: 'Z', numero: 9 }), /agent invalide/);
  const src = fs.readFileSync(path.join(__dirname, '../engine/ai/agent-controller.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/TeamCoordinator|TeamBlackboard|assignRoles|reserveRole|Date\.now|Math\.random/.test(src));
  assert.ok(!/\b(state|engine|moteur)\.(porteur|ruckPoint|score|possession|phase)\s*=[^=]/.test(src));
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : le contrôleur GoalBasedRugbyAgent V4 perçoit, choisit, planifie, agit et replanifie.');
