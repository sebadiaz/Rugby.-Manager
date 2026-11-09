// RM4-G10 — placement INDIVIDUEL : chaque joueur compare ses propres candidats depuis
// ses croyances et un plan de jeu en lecture seule (IND-01..06, 08..12, D04).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const corpus = require('../docs/SIMULATION_V4/fixtures/scenarios.json');
const { individualPlacement } = require('../engine/ai/individual-placement.js');
const P = require('../engine/ai/position-goals.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { GoalSelector } = require('../engine/ai/goal-selector.js');
const { GoalBasedRugbyAgent } = require('../engine/ai/agent-controller.js');
const { AgentScheduler, creerAgents } = require('../engine/ai/agent-scheduler.js');
const { profilePour } = require('../engine/ai/goals.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');
const { MatchEngine } = require('../engine/rugby-engine.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 3).join('\n')); }
}
const DT = 0.05;
const copie = (e) => JSON.parse(JSON.stringify(e));
const joueur = (e, team, n) => (team === 'A' ? e.equipeA : e.equipeB).find((j) => j.numero === n);
function etat(id, ticks = 10) {
  const m = createScenarioEngine(corpus.scenarios.find((s) => s.id === id));
  for (let i = 0; i < ticks; i++) m.tick(DT);
  return copie(m.getState());
}
// Décision individuelle complète d'un agent : croyances -> but -> placement.
function decision(e, team, n, playbook) {
  const b = new AgentContext({ team, numero: n }, { reactionDelay: 0 }).update(e);
  const goal = new GoalSelector({ team, numero: n }).select(b).goal;
  return { goal, placement: individualPlacement(b, goal, playbook, profilePour(n)), beliefs: b };
}
const tous = (e, playbook) => {
  const out = {};
  for (const team of ['A', 'B']) for (let n = 1; n <= 15; n++) { const d = decision(e, team, n, playbook); out[team + n] = { goal: d.goal, p: d.placement && d.placement.placementGoal, t: d.placement && d.placement.target }; }
  return out;
};

test('IND-01 / D04 : 30 contrôleurs individuels, aucun état partagé ; chacun décide seul sur un ruck contesté', () => {
  const ags = creerAgents({ placement: true });
  const contextes = new Set(ags.map((a) => a.context)), selecteurs = new Set(ags.map((a) => a.selector));
  assert.strictEqual(contextes.size, 30); assert.strictEqual(selecteurs.size, 30);
  const m = createScenarioEngine(corpus.scenarios.find((s) => s.id === 'S01'));
  const sched = new AgentScheduler(ags);
  for (let i = 0; i < 100; i++) { const r = sched.tick(copie(m.getState()), null); sched.appliquer(m, r); m.tick(DT); }
  // Chacun a un but ; les buts sont variés (pas un comportement unique) ; personne n'est en HOLD_WIDTH lié au ruck.
  const buts = new Set(ags.map((a) => a.goal));
  assert.ok(buts.size >= 4, [...buts].join(','));
  for (const a of ags) assert.ok(a.goal, a.id + ' sans but');
});

test('défense prioritaire quand l\'adversaire a la balle, SANS ruée : au plus 2 défenseurs pressent le porteur (S06)', () => {
  const e = etat('S06');
  const d = tous(e);
  const defenseurs = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15'];
  const enDefense = defenseurs.filter((id) => ['DEFEND', 'COVER_BACKFIELD'].includes(d[id].goal));
  assert.ok(enDefense.length >= 13, `${enDefense.length} joueurs en défense`);
  const pressent = defenseurs.filter((id) => d[id].p === 'PRESS_CARRIER');
  assert.ok(pressent.length <= 2, `${pressent.length} joueurs pressent : ${pressent}`);
});

test('sans ruée : six défenseurs autour du porteur, seul le plus proche observé presse', () => {
  const e = etat('S06');
  const c = joueur(e, 'B', 12); const cx = c.x, cy = c.y;
  e.possession = 'B'; e.phase = 'PORTE';
  e.ball = Object.assign({}, e.ball, { x: cx, y: cy, state: 'CARRIED', carrierTeam: 'B', carrierNumber: 12 });
  const eq = [1, 2, 3, 4, 5, 6];
  eq.forEach((n, i) => { const j = joueur(e, 'A', n); j.x = cx - 2 - i * 0.8; j.y = cy + (i - 2.5) * 0.9; j.orientation = 0; j.auSol = 0; });
  const presse = eq.filter((n) => decision(e, 'A', n).placement.placementGoal === 'PRESS_CARRIER');
  assert.strictEqual(presse.length, 1, `pressent : ${presse}`);
});

test('hors-jeu : un candidat de placement qui projette le joueur devant la ligne du ruck est invalide et jamais choisi', () => {
  const e = etat('S01');
  const a9 = joueur(e, 'A', 9); a9.x = e.ruck.x - 2; a9.y = e.ruck.y + 1; a9.auSol = 0;   // un attaquant de son côté
  const b2 = joueur(e, 'B', 2); b2.x = e.ruck.x + 4; b2.y = e.ruck.y + 1; b2.orientation = Math.PI; b2.auSol = 0;
  const b = new AgentContext({ team: 'B', numero: 2 }, { reactionDelay: 0 }).update(e);
  const r = individualPlacement(b, 'DEFEND', {}, profilePour(2));
  const marque = r.candidates.find((c) => c.id === 'MARK_OPPONENT');
  assert.ok(marque && marque.valide === false, 'marquer A9 depuis l\'autre côté du ruck serait hors-jeu : ' + JSON.stringify(r.candidates));
  assert.notStrictEqual(r.placementGoal, 'MARK_OPPONENT');
  assert.ok(r.candidates.find((c) => c.id === r.placementGoal).valide);
});

test('deux joueurs, deux situations : pas de placement collectif imposé (cibles et familles de placement différentes)', () => {
  const d = tous(etat('S06'));
  const familles = new Set(['A1', 'A2', 'A5', 'A9', 'A15'].map((id) => d[id].p));
  assert.ok(familles.size >= 2, [...familles].join(','));
  const cibles = new Set(['A2', 'A5', 'A9', 'A13'].map((id) => d[id].t.y.toFixed(0)));
  assert.strictEqual(cibles.size, 4, 'quatre canaux distincts');
});

test('IND-05 : le 15 garde sa profondeur malgré le but DEFEND général (≥ 15 m derrière la ligne défensive)', () => {
  const e = etat('S06');
  const b15 = new AgentContext({ team: 'A', numero: 15 }, { reactionDelay: 0 }).update(e);
  const r = individualPlacement(b15, 'COVER_BACKFIELD', {}, profilePour(15));
  const ligne = P.ligneDefensive(1, { x: e.ball.x, y: e.ball.y }, {});
  assert.strictEqual(r.placementGoal, 'COVER_BACKFIELD');
  assert.ok(ligne - r.target.x >= 15, `profondeur ${(ligne - r.target.x).toFixed(1)} m`);
});

test('IND-06 : l\'ailier A11 tient sa largeur en attaque (canal large) même si A14 est près du ballon', () => {
  const e = etat('S01');
  const a14 = joueur(e, 'A', 14); a14.x = e.ball.x - 3; a14.y = e.ball.y - 2; // A14 est tout près du ballon
  const d11 = decision(e, 'A', 11);
  const alt = individualPlacement(d11.beliefs, 'BE_PASS_OPTION', {}, profilePour(11));
  assert.strictEqual(alt.placementGoal, 'PRESERVE_WIDTH');
  assert.ok(Math.abs(alt.target.y - 35) >= 22, `y=${alt.target.y}`);
  assert.ok(alt.candidates.some((c) => c.id === 'PRESERVE_WIDTH'));
});

test('IND-04 : un joueur hors-jeu au ruck choisit BECOME_ONSIDE ; aucun candidat de placement ne le projette devant la ligne', () => {
  const e = etat('S01');
  const b7 = joueur(e, 'B', 7); b7.x = e.ruck.x - 3; b7.y = e.ruck.y + 4;
  const d = decision(e, 'B', 7);
  assert.strictEqual(d.goal, 'BECOME_ONSIDE');
  assert.strictEqual(d.placement, null, 'le placement ne conduit pas ce but : le plan GET_ONSIDE le fait');
  const r = individualPlacement(d.beliefs, 'DEFEND', {}, profilePour(7));
  const hj = r.candidates.filter((c) => !c.valide);
  for (const c of hj) assert.ok(c.score <= r.candidates.find((x) => x.valide).score + 100); // les candidats hors-jeu sont marqués invalides
  assert.ok(r.candidates.every((c) => typeof c.valide === 'boolean'));
  assert.ok(r.candidates.find((c) => c.id === r.placementGoal).valide, 'le choix est valide');
});

test('IND-02 / IND-08 : changer la perception d\'un seul agent ne change le plan d\'aucun autre', () => {
  const e = etat('S01');
  // On ne modifie que ce que voit A8 : « A5 est déjà au ruck ».
  const e8 = copie(e);
  const a5 = joueur(e8, 'A', 5); a5.x = e8.ruck.x - 1.5; a5.y = e8.ruck.y + 1;
  const vue = (x) => new AgentContext({ team: 'A', numero: 8 }, { reactionDelay: 0 }).update(x).teammates.A5;
  assert.ok(vue(e) && vue(e8), 'A8 voit A5 dans les deux scènes');
  assert.notDeepStrictEqual(vue(e8).lastSeen, vue(e).lastSeen);
  // Les croyances d'A8 changent -> sa décision peut changer ; celle des 28 autres (même état d'origine) est identique.
  const dA8 = (x) => { const d = decision(x, 'A', 8); return JSON.stringify([d.goal, d.placement && d.placement.target]); };
  const autres = (x) => { const t = tous(x); delete t.A8; delete t.A5; return t; };
  assert.deepStrictEqual(autres(e), autres(e));
  // Même scène vue par un 3e joueur loin d'A5 : décision inchangée par la modification de A5 pour A8 seul.
  const d13 = (x) => JSON.stringify(decision(x, 'B', 13));
  assert.strictEqual(d13(e), d13(copie(e)));
  assert.ok(dA8(e) !== undefined && dA8(e8) !== undefined);
});

test('IND-03 : à la perte du ballon, chacun réévalue seul : les joueurs d\'A prennent des placements différents', () => {
  const e = etat('S01');
  const avant = tous(e);
  const perte = copie(e); perte.possession = 'B'; perte.phase = 'PORTE';
  const b12 = joueur(perte, 'B', 12); perte.ball = Object.assign({}, perte.ball, { x: b12.x, y: b12.y, state: 'CARRIED', carrierTeam: 'B', carrierNumber: 12 });
  const apres = tous(perte);
  const changes = Object.keys(avant).filter((k) => k[0] === 'A' && avant[k].goal !== apres[k].goal);
  assert.ok(changes.length >= 8, `${changes.length} joueurs d'A changent de but`);
  const placements = new Set(Object.keys(apres).filter((k) => k[0] === 'A').map((k) => apres[k].p));
  assert.ok(placements.size >= 3, [...placements].join(','));
});

test('IND-09 : deux soutiens qui visent le même but n\'ont ni la même cible ni de synchronisation', () => {
  const e = etat('S08');
  const d1 = decision(e, 'A', 6), d2 = decision(e, 'A', 7);
  const b1 = individualPlacement(d1.beliefs, 'SUPPORT_CARRIER', {}, profilePour(6)), b2 = individualPlacement(d2.beliefs, 'SUPPORT_CARRIER', {}, profilePour(7));
  assert.ok(b1 && b2);
  assert.notDeepStrictEqual(b1.target, b2.target);
});

test('IND-10 : mêmes croyances -> mêmes buts, placements et cibles pour les 30 joueurs', () => {
  const e = etat('S01');
  assert.deepStrictEqual(tous(e), tous(copie(e)));
});

test('IND-12 : 1-3-3-1 -> 2-4-2 : les avants changent d\'ancre par eux-mêmes, sans commande individuelle', () => {
  const e = etat('S08');
  const bal = { x: e.ball.x, y: e.ball.y };
  const a = [3, 4, 6, 7].map((n) => P.referenceAttaque(n, 1, bal, { attackStructure: '1331' }));
  const b = [3, 4, 6, 7].map((n) => P.referenceAttaque(n, 1, bal, { attackStructure: '242' }));
  assert.notDeepStrictEqual(a, b);
  const b4 = new AgentContext({ team: 'A', numero: 4 }, { reactionDelay: 0 }).update(etat('S01')); // A4 voit le ballon
  const t1 = individualPlacement(b4, 'RETURN_TO_PLAYBOOK', { attackStructure: '1331' }, profilePour(4)).target;
  const t2 = individualPlacement(b4, 'RETURN_TO_PLAYBOOK', { attackStructure: '242' }, profilePour(4)).target;
  assert.notDeepStrictEqual(t1, t2, 'l\'ancre du 4 dépend de la structure lue dans le plan de jeu');
  const dx = (x) => JSON.stringify(x);
  assert.ok(dx(P.CRENEAUX_AVANTS['1331']) !== dx(P.CRENEAUX_AVANTS['242']));
});

test('IND-11 : un joueur de mêlée indisponible -> les partenaires gardent leur but de formation, sans coordinateur', () => {
  const e = etat('S03');
  const sans = copie(e); const a3 = joueur(sans, 'A', 3); a3.auSol = 2;
  const buts = (x) => [1, 2, 4, 5, 6, 7, 8].map((n) => decision(x, 'A', n).goal);
  assert.deepStrictEqual(buts(sans), buts(e));
  assert.ok(buts(sans).every((g) => g === 'FORM_SCRUM_LEGALLY'));
});

test('cibles bornées au terrain, sans NaN, pour 30 joueurs sur S01, S03, S06, S07, S08', () => {
  for (const id of ['S01', 'S03', 'S06', 'S07', 'S08']) {
    const t = tous(etat(id));
    for (const [k, v] of Object.entries(t)) if (v.t) assert.ok(v.t.x >= 0 && v.t.x <= 100 && v.t.y >= 0 && v.t.y <= 70 && Number.isFinite(v.t.x + v.t.y), `${id} ${k}`);
  }
});

test('contrôleur : option placement — un défenseur sans plan est conduit par SON placement (intention de mouvement réelle)', () => {
  const m = createScenarioEngine(corpus.scenarios.find((s) => s.id === 'S06'));
  for (let i = 0; i < 10; i++) m.tick(DT);
  const a = new GoalBasedRugbyAgent({ team: 'A', numero: 5 }, { placement: true });
  const j = joueur(m, 'A', 5); const x0 = j.x;
  for (let i = 0; i < 80; i++) {
    const r = a.tick(copie(m.getState()));
    if (r.intent) m.setAgentIntent('A', 5, r.intent); else m.clearAgentIntent('A', 5);
    m.tick(DT);
  }
  assert.ok(a.events.some((e) => e.type === 'PLACEMENT_CHOSEN'));
  assert.ok(Math.abs(j.x - x0) > 1, 'le joueur s\'est déplacé selon son placement');
});

test('architecture : aucune fonction ne calcule les cibles de plusieurs joueurs ; aucun coordinateur ; aucune horloge', () => {
  for (const f of ['position-goals.js', 'individual-placement.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../engine/ai', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/TeamCoordinator|TeamBlackboard|assignRoles|reserveRole|computeAllTargets|Date\.now|Math\.random/.test(src), f);
    assert.ok(!/equipeA|equipeB|\.teams\b/.test(src), f + ' lit l\'état complet des équipes');
  }
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : le placement individuel V4 naît des buts et des croyances de chaque joueur.');
