// RM4-G06 — catalogue d'actions A01–A15, coûts, faits issus des croyances.
// Ne prouve PAS l'exécution physique des actions : seulement leur planification.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { ACTIONS } = require('../engine/ai/actions.js');
const { factsFromBeliefs, buildPlannerActions, feasibleActions, estimateAction } = require('../engine/ai/action-cost.js');
const { planGoal } = require('../engine/ai/goal-planner.js');
const { profilePour, deriveSituation } = require('../engine/ai/goals.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { detectConflicts, FACT_NAMES } = require('../engine/ai/facts.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');
const { MatchEngine } = require('../engine/rugby-engine.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const copie = (e) => JSON.parse(JSON.stringify(e));
const joueur = (e, team, n) => (team === 'A' ? e.equipeA : e.equipeB).find((j) => j.numero === n);
function etat(id, ticks = 20) {
  const f = corpus.scenarios.find((s) => s.id === id);
  const m = createScenarioEngine(f);
  for (let i = 0; i < ticks; i++) m.tick(f.tickSeconds);
  return copie(m.getState());
}
// Ruck de S01 jouable : le 9 est debout à la base, le ballon est disponible.
function ruckJouable() {
  const e = etat('S01');
  // Le 9 regarde sa ligne de passe (l'orientation du moteur est la direction de course,
  // pas le regard : constat RM4-G05/G06).
  const n = joueur(e, 'A', 9); n.auSol = 0; n.x = 51; n.y = 26;
  const d = joueur(e, 'A', 10); n.orientation = Math.atan2(d.y - n.y, d.x - n.x);
  e.ruck.ballAvailable = true;
  return e;
}
const croyances = (e, team, n) => new AgentContext({ team, numero: n }, { reactionDelay: 0 }).update(e);
function plan(e, team, n, but, opts) {
  const b = croyances(e, team, n);
  const faits = factsFromBeliefs(b);
  const base = Object.assign({}, faits);
  for (const k of Object.keys(but)) if (!(k in base)) base[k] = false;
  const actions = feasibleActions(base, buildPlannerActions(b, profilePour(n), opts));
  return { faits, resultat: planGoal(base, but, actions) };
}

test('catalogue : A01–A15 identiques au catalogue 05 (identifiants et noms), sans doublon', () => {
  const doc = fs.readFileSync(path.join(__dirname, '../docs/SIMULATION_V4/05_CATALOGUE_GOALS_ACTIONS.md'), 'utf8');
  const lignes = [...doc.matchAll(/^\| (A(?:0[1-9]|1[0-5])) \| `([A-Z0-9_]+)` \|/gm)].map((m) => [m[1], m[2]]);
  assert.strictEqual(lignes.length, 15);
  assert.deepStrictEqual(ACTIONS.map((a) => [a.id, a.name]), lignes);
  assert.strictEqual(new Set(ACTIONS.map((a) => a.id)).size, 15);
  assert.strictEqual(new Set(ACTIONS.map((a) => a.name)).size, 15);
});

test('intégrité : faits canoniques seulement, effets non vides, aucun conflit après application', () => {
  for (const a of ACTIONS) {
    assert.ok(Object.keys(a.effects).length > 0, a.id);
    for (const k of [...Object.keys(a.preconditions), ...Object.keys(a.effects)]) assert.ok(FACT_NAMES.includes(k), `${a.id} : fait inconnu ${k}`);
    const apres = Object.assign({}, a.preconditions, a.effects);
    assert.deepStrictEqual(detectConflicts(apres), [], `${a.id} : conflit après effets`);
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.preconditions) && Object.isFrozen(a.effects), a.id + ' modifiable');
  }
});

test('coûts strictement positifs et finis pour 30 joueurs × états d\'un vrai match (graine 11)', () => {
  const m = new MatchEngine(11, 4800);
  let n = 0;
  for (let t = 0; t < 600; t += 0.1) {
    m.tick(0.1);
    if (Math.round(t * 10) % 100 !== 0) continue;
    const e = copie(m.getState());
    for (const team of ['A', 'B']) for (let k = 1; k <= 15; k++) {
      const b = croyances(e, team, k);
      for (const a of buildPlannerActions(b, profilePour(k))) {
        assert.ok(Number.isFinite(a.cost) && a.cost > 0, `${team}${k} ${a.id} : coût ${a.cost}`);
        assert.ok(Number.isFinite(a.duration) && a.duration >= 0);
      }
      n++;
    }
  }
  assert.ok(n >= 300);
});

test('SECURE_BALL non sélectionnable si le ballon n\'est pas disponible ; sélectionné quand il l\'est', () => {
  const ferme = etat('S01');
  const n = joueur(ferme, 'A', 9); n.auSol = 0; n.x = 51; n.y = 26; n.orientation = 0; // ruck non jouable
  const a = plan(ferme, 'A', 9, { HAS_BALL: true });
  assert.strictEqual(a.faits.BALL_AVAILABLE, false);
  assert.strictEqual(a.resultat.status, 'NO_PLAN');
  const b = plan(ruckJouable(), 'A', 9, { HAS_BALL: true });
  assert.strictEqual(b.faits.BALL_AVAILABLE, true);
  assert.strictEqual(b.resultat.status, 'OK');
  assert.deepStrictEqual(b.resultat.steps, ['SECURE_BALL']);
});

test('GET_ONSIDE rend un plan légal : un défenseur hors-jeu ne peut pas rejoindre le ruck sans repasser onside', () => {
  const e = ruckJouable();
  const b7 = joueur(e, 'B', 7); b7.x = e.ruck.x - 3; b7.y = e.ruck.y + 4; b7.orientation = Math.PI;
  const un = plan(e, 'B', 7, { SELF_ONSIDE: true });
  assert.strictEqual(un.faits.SELF_ONSIDE, false);
  assert.deepStrictEqual(un.resultat.steps, ['GET_ONSIDE']);
  const deux = plan(e, 'B', 7, { SELF_AT_RUCK: true });
  assert.strictEqual(deux.resultat.status, 'OK');
  assert.strictEqual(deux.resultat.steps[0], 'GET_ONSIDE', 'aucune entrée au ruck avant d\'être en jeu : ' + deux.resultat.steps);
  assert.ok(['MOVE_TO_RUCK', 'APPROACH_FROM_GATE'].includes(deux.resultat.steps[1]));
});

test('A9 (exemple formel) : ruck jouable -> SECURE_BALL puis PASS_TO_10', () => {
  const r = plan(ruckJouable(), 'A', 9, { DISTRIBUTED: true });
  assert.strictEqual(r.resultat.status, 'OK', JSON.stringify(r.resultat).slice(0, 120));
  assert.deepStrictEqual(r.resultat.steps, ['SECURE_BALL', 'PASS_TO_10']);
  assert.ok(r.resultat.cost > 0);
});

test('PASS_TO_10 échoue à la planification si le 10 est couvert ; si le couloir est barré, aucun plan de passe', () => {
  const e = ruckJouable();
  // Le 10 est marqué de près : RECEIVER_OPEN faux.
  const marque = copie(e);
  const dix = joueur(marque, 'A', 10); const b6 = joueur(marque, 'B', 6);
  b6.x = dix.x + 1; b6.y = dix.y;
  const a = plan(marque, 'A', 9, { DISTRIBUTED: true });
  assert.strictEqual(a.faits.RECEIVER_OPEN, false);
  assert.strictEqual(a.resultat.status, 'NO_PLAN');
  // Couloir barré par un adversaire sur la trajectoire.
  const barre = copie(e);
  const n9 = joueur(barre, 'A', 9), d10 = joueur(barre, 'A', 10), b7 = joueur(barre, 'B', 7);
  b7.x = (n9.x + d10.x) / 2; b7.y = (n9.y + d10.y) / 2;
  const b = plan(barre, 'A', 9, { DISTRIBUTED: true });
  assert.strictEqual(b.faits.PASS_LANE_10_OPEN, false);
  assert.strictEqual(b.resultat.status, 'NO_PLAN');
});

test('le plan change quand le monde change : couloir du pod ouvert -> PASS_TO_POD à la place de PASS_TO_10 fermé', () => {
  const e = ruckJouable();
  const marque = copie(e); const dix = joueur(marque, 'A', 10); joueur(marque, 'B', 6).x = dix.x + 1; joueur(marque, 'B', 6).y = dix.y;
  const b = croyances(marque, 'A', 9);
  const faits = Object.assign({}, factsFromBeliefs(b), { PASS_LANE_POD_OPEN: true, DISTRIBUTED: false });
  const r = planGoal(faits, { DISTRIBUTED: true }, feasibleActions(faits, buildPlannerActions(b, profilePour(9))));
  assert.deepStrictEqual(r.steps, ['SECURE_BALL', 'PASS_TO_POD']);
});

test('coûts : plus loin du ruck = plus cher ; fatigue = plus cher ; un joueur lent coûte plus qu\'un rapide', () => {
  const e = etat('S01');
  const proche = croyances(e, 'A', 8), loin = croyances(e, 'A', 14);
  const get = (b, p) => buildPlannerActions(b, p).find((a) => a.id === 'MOVE_TO_RUCK');
  assert.ok(get(loin, profilePour(14)).cost > get(proche, profilePour(8)).cost);
  assert.ok(get(proche, profilePour(8, { fatigue: 0.8 })).cost > get(proche, profilePour(8)).cost);
  assert.ok(get(proche, profilePour(8, { vitesseMs: 4 })).cost > get(proche, profilePour(8, { vitesseMs: 8 })).cost);
  // Pénalité d'abandon d'engagement.
  const sans = buildPlannerActions(proche, profilePour(8)).find((a) => a.id === 'GET_UP').cost;
  const avec = buildPlannerActions(proche, profilePour(8), { abandon: { GET_UP: 1 } }).find((a) => a.id === 'GET_UP').cost;
  assert.ok(avec > sans);
});

test('faisabilité avant recherche : une action dont une précondition de phase est contredite est écartée', () => {
  const faits = { TEAM_POSSESSION: false, BALL_AVAILABLE: false };
  const a = feasibleActions(faits, ACTIONS.map((x) => ({ id: x.name, preconditions: x.preconditions, effects: x.effects, cost: 1 })));
  assert.ok(!a.some((x) => x.id === 'SECURE_BALL'));
  assert.ok(!a.some((x) => x.id === 'RUN_SUPPORT_INSIDE'));
  assert.ok(a.some((x) => x.id === 'GET_ONSIDE'));
});

test('faits issus des croyances seules : un 10 perdu de vue n\'a pas de fait de passe (absent, jamais faux)', () => {
  const e = ruckJouable();
  const loin = joueur(e, 'A', 10); loin.x = 5; loin.y = 65; // hors de portée de vue du 9
  const b = croyances(e, 'A', 9);
  const f = factsFromBeliefs(b);
  assert.ok(!('PASS_LANE_10_OPEN' in f) && !('RECEIVER_OPEN' in f), JSON.stringify(f));
});

test('pureté : croyances non mutées, aucune source d\'aléa dans actions.js / action-cost.js', () => {
  const e = ruckJouable();
  const b = croyances(e, 'A', 9);
  const avant = JSON.stringify(b);
  buildPlannerActions(b, profilePour(9)); factsFromBeliefs(b); estimateAction(ACTIONS[0], deriveSituation(b), profilePour(9), b);
  assert.strictEqual(JSON.stringify(b), avant);
  for (const f of ['actions.js', 'action-cost.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../engine/ai', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Date\.now|Math\.random|performance\.now|TeamCoordinator|TeamBlackboard|assignRoles|reserveRole/.test(src), f);
  }
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : le catalogue d\'actions A01–A15 est planifiable, légal et chiffré.');
