// RM4-G53 — troisièmes lignes au regroupement : ce sont les CARACTÉRISTIQUES individuelles (grattage, arrivée au ruck, course
// de soutien) et ce que le joueur VOIT du ruck qui décident, jamais son numéro. Spécification : docs/SIMULATION_V4/17_TROISIEMES_LIGNES.md.
// Scénarios de la spécification couverts ici : 2 (ruck déjà sécurisé), 3 (possibilité légale de récupération), 13 (renoncer
// à une contestation trop risquée), et la garde « rien n'est scripté » (même aptitude = même choix, quel que soit le numéro).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { GoalSelector } = require('../engine/ai/goal-selector.js');
const { appliquerAptitudes, facteur } = require('../engine/ai/aptitudes.js');
const { profilePour } = require('../engine/ai/goals.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); }
}
const copie = (e) => JSON.parse(JSON.stringify(e));

// Un vrai ruck, tout juste formé (ballon pas encore jouable), tiré d'un match réel.
function etatRuck(seed = 1) {
  const m = new MatchEngine(seed, 4800, { personnalites: 'NEUTRE' });
  let n = 0;
  while (!(m.phase === 'RUCK' && m.timerPhase < 0.3) && n++ < 20000) m.tick(0.1);
  assert.strictEqual(m.phase, 'RUCK', 'un ruck est trouvé');
  return { m, e: copie(m.getAgentState()) };
}
// Place le joueur à 3 m du ruck, de son côté, et règle ce qu'il en voit.
function scene(e, team, numero, { car = {}, ruck = {} } = {}) {
  const s = copie(e);
  const eq = team === 'A' ? s.equipeA : s.equipeB;
  const j = eq.find((x) => x.numero === numero);
  const sens = team === 'A' ? 1 : -1;
  j.x = s.ruck.x - sens * 3; j.y = s.ruck.y + 1; j.auSol = 0; j.sinBin = 0; j.horsJeuKick = 0;
  Object.assign(j.car, car);
  Object.assign(s.ruck, ruck);
  return s;
}
function but(e, team, numero) {
  const b = new AgentContext({ team, numero }, { reactionDelay: 0, fovDeg: 360 }).update(e);
  const r = new GoalSelector({ team, numero }).select(b);
  return { goal: r.goal, prio: Object.fromEntries((r.ranked || r.candidates || []).map((c) => [c.id, c.priority])) };
}

test('aptitudes : 60 (ou absent) = préférences inchangées ; le grattage règle l\'envie de contester, l\'arrivée au ruck l\'engagement', () => {
  const p = profilePour(7);
  assert.strictEqual(appliquerAptitudes(p, { grattage: 60, arriveeRuck: 60, courseSoutien: 60 }), p, 'référence : même objet');
  assert.strictEqual(appliquerAptitudes(p, {}), p, 'absentes : même objet');
  assert.ok(appliquerAptitudes(p, { grattage: 90 }).contest > p.contest);
  assert.ok(appliquerAptitudes(p, { grattage: 20 }).contest < p.contest);
  assert.ok(appliquerAptitudes(p, { arriveeRuck: 90 }).ruck > p.ruck);
  assert.ok(appliquerAptitudes(p, { courseSoutien: 90 }).soutien > 1);
  for (const v of [0, 100, -50, 500]) { const f = facteur(v, 0.6); assert.ok(f >= 0.4 && f <= 1.6, 'borné : ' + f); }
});

test('moteur : les caractéristiques de jeu au sol existent pour tous ; un joueur réel peut avoir les siennes (explicite prioritaire)', () => {
  const m = new MatchEngine(1, 4800, { personnalites: 'NEUTRE', joueursA: { 1: { caracteristiques: { grattage: 88 } } } });
  for (const j of m.equipeA.concat(m.equipeB)) for (const k of ['grattage', 'arriveeRuck', 'courseSoutien']) assert.ok(typeof j.car[k] === 'number', `${j.team}${j.numero}.${k}`);
  assert.strictEqual(m.equipeA.find((j) => j.numero === 1).car.grattage, 88, 'pilier gratteur : sa valeur l\'emporte');
});

test('scénario 3 : un défenseur bon gratteur, au ballon encore disputable, choisit de contester ; mauvais gratteur au même endroit, non', () => {
  const { m, e } = etatRuck(1);
  const def = m.possession === 'A' ? 'B' : 'A';
  const fort = but(scene(e, def, 7, { car: { grattage: 92 }, ruck: { ballAvailable: false, attackersCommitted: 1, defendersCommitted: 0 } }), def, 7);
  const faible = but(scene(e, def, 7, { car: { grattage: 15 }, ruck: { ballAvailable: false, attackersCommitted: 1, defendersCommitted: 0 } }), def, 7);
  assert.strictEqual(fort.goal, 'CONTEST_BREAKDOWN', 'gratteur : ' + JSON.stringify(fort.prio));
  assert.notStrictEqual(faible.goal, 'CONTEST_BREAKDOWN', 'non-gratteur : ' + JSON.stringify(faible.prio));
});

test('scénario 13 : on renonce à contester quand c\'est trop risqué (attaquants sans partenaire pour les contrebalancer)', () => {
  const { m, e } = etatRuck(1);
  const def = m.possession === 'A' ? 'B' : 'A';
  const car = { grattage: 92 };
  const risque = but(scene(e, def, 7, { car, ruck: { ballAvailable: false, attackersCommitted: 4, defendersCommitted: 0 } }), def, 7);
  const forme = but(scene(e, def, 7, { car, ruck: { ballAvailable: true, attackersCommitted: 1, defendersCommitted: 0 } }), def, 7);
  assert.ok(!('CONTEST_BREAKDOWN' in risque.prio), 'trois attaquants de plus sur le ballon : contestation abandonnée');
  assert.ok('CONTEST_BREAKDOWN' in forme.prio, 'ballon disponible : le contre-ruck en poussant reste légal (loi 15), le moteur tranche');
  const moyen = but(scene(e, def, 7, { car, ruck: { ballAvailable: false, attackersCommitted: 2, defendersCommitted: 0 } }), def, 7);
  const libre = but(scene(e, def, 7, { car, ruck: { ballAvailable: false, attackersCommitted: 1, defendersCommitted: 0 } }), def, 7);
  assert.ok(moyen.prio.CONTEST_BREAKDOWN < libre.prio.CONTEST_BREAKDOWN, 'plus le risque monte, moins l\'envie de contester');
});

test('scénario 2 : un ruck que le joueur voit déjà tenu ne l\'attire plus (il reste disponible) ; un ruck menacé, si', () => {
  const { m, e } = etatRuck(1);
  const att = m.possession;
  for (const n of [6, 7, 8]) {
    const tenu = but(scene(e, att, n, { ruck: { ballAvailable: false, attackersCommitted: 4, defendersCommitted: 1 } }), att, n);
    const menace = but(scene(e, att, n, { ruck: { ballAvailable: false, attackersCommitted: 1, defendersCommitted: 2 } }), att, n);
    assert.ok((tenu.prio.SECURE_RUCK || 0) < 0.5 * menace.prio.SECURE_RUCK, `n°${n} : tenu ${tenu.prio.SECURE_RUCK} / menacé ${menace.prio.SECURE_RUCK}`);
    assert.notStrictEqual(tenu.goal, 'SECURE_RUCK', `n°${n} ne rejoint pas un ruck déjà tenu (${tenu.goal})`);
  }
});

test('rien n\'est scripté : l\'aptitude peut l\'emporter sur le maillot (un 4 gratteur plus qu\'un 7 maladroit) ; le module ne lit pas le numéro', () => {
  const { m, e } = etatRuck(1);
  const def = m.possession === 'A' ? 'B' : 'A';
  const ruck = { ballAvailable: false, attackersCommitted: 1, defendersCommitted: 0 };
  // Le poste garde une préférence PONDÉRÉE (permise, jamais exclusive) ; mais l'aptitude peut l'emporter sur le maillot :
  // un deuxième ligne excellent gratteur a plus envie de contester qu'un 7 qui ne sait pas gratter.
  const deuxiemeLigne = but(scene(e, def, 4, { car: { grattage: 95 }, ruck }), def, 4);
  const septiemeMaladroit = but(scene(e, def, 7, { car: { grattage: 15 }, ruck }), def, 7);
  assert.ok(deuxiemeLigne.prio.CONTEST_BREAKDOWN > septiemeMaladroit.prio.CONTEST_BREAKDOWN,
    `4 gratteur ${deuxiemeLigne.prio.CONTEST_BREAKDOWN} > 7 non gratteur ${septiemeMaladroit.prio.CONTEST_BREAKDOWN}`);
  // Même numéro, même aptitude, même scène : même choix (déterministe).
  assert.deepStrictEqual(but(scene(e, def, 6, { car: { grattage: 80 }, ruck }), def, 6), but(scene(e, def, 6, { car: { grattage: 80 }, ruck }), def, 6));
  // Garde statique : le module d'aptitudes ne lit jamais le numéro.
  const src = fs.readFileSync(path.join(__dirname, '../engine/ai/aptitudes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/numero|switch\s*\(/.test(src), 'aptitudes.js ne lit pas le numéro');
});

test('les valeurs de jeu au sol appartiennent au JOUEUR, pas au maillot : un deuxième ligne de club aligné en 7 garde les siennes', () => {
  const club = {};
  for (let n = 1; n <= 15; n++) club[n] = { vitesse: 60, plaquage: 70, puissance: 70, decision: 55, endurance: 70 };
  club[7] = { vitesse: 45, plaquage: 78, puissance: 88, decision: 50, endurance: 65 }; // profil de deuxième ligne
  const m = new MatchEngine(1, 4800, { personnalites: 'NEUTRE', joueursA: club });
  const g = new MatchEngine(1, 4800, { personnalites: 'NEUTRE' });
  const c7 = m.equipeA.find((j) => j.numero === 7).car, g7 = g.equipeA.find((j) => j.numero === 7).car;
  assert.ok(c7.arriveeRuck < g7.arriveeRuck - 15, `deuxième ligne en 7 : arrivée au ruck ${c7.arriveeRuck.toFixed(0)} (le 7 généré : ${g7.arriveeRuck})`);
  assert.notStrictEqual(c7.grattage, g7.grattage, 'son grattage vient de lui, pas du maillot');
  // Même joueur de club au 4 ou au 7 : mêmes valeurs.
  const club2 = Object.assign({}, club, { 4: club[7], 7: club[4] });
  const m2 = new MatchEngine(1, 4800, { personnalites: 'NEUTRE', joueursA: club2 });
  const c4 = m2.equipeA.find((j) => j.numero === 4).car;
  // Seule la petite forme du jour (±5 tirés sur la vitesse et le plaquage à la création) peut les écarter un peu.
  for (const k of ['grattage', 'arriveeRuck', 'courseSoutien']) assert.ok(Math.abs(c4[k] - c7[k]) <= 5.5, `${k} : ${c4[k].toFixed(1)} au 4, ${c7[k].toFixed(1)} au 7`);
});

test('moteur (tendance, GOAP) : des défenseurs bons gratteurs récupèrent plus de ballons au ruck que de mauvais gratteurs', () => {
  const { configGOAP } = require('../engine/ai/goap-mode.js');
  const gratte = (g) => {
    let to = 0;
    const cfg = {}; for (let n = 1; n <= 15; n++) cfg[n] = { caracteristiques: { grattage: g } };
    // 10 graines de 15 min (et non 6 de 10 min) : le grattage est rare (environ 1 par tranche de 10 min) ; à 6 x 10 min, les
    // deux camps étaient à égalité (5 contre 5) selon le seul déroulé.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const m = new MatchEngine(seed, 4800, configGOAP({ personnalites: 'NEUTRE', joueursB: cfg }));
      for (let t = 0; t < 900; t += 0.1) m.tick(0.1);
      to += m.stats.B.turnovers;
    }
    return to;
  };
  const forts = gratte(90), faibles = gratte(10);
  assert.ok(forts > faibles, `turnovers gagnés : gratteurs 90 -> ${forts}, gratteurs 10 -> ${faibles}`);
});


// --- G54 : défense autour du ruck (zones de garde lues par chacun) ---------------
const { individualPlacement: placer, candidatsGardeRuck } = require('../engine/ai/individual-placement.js');
const { deriveSituation } = require('../engine/ai/goals.js');
function sceneGarde(seed = 1) {
  const { m, e } = etatRuck(seed);
  const def = m.possession === 'A' ? 'B' : 'A', att = m.possession;
  const s = copie(e);
  const sens = def === 'A' ? 1 : -1, pt = s.ruck;
  // Défense : tout le monde loin, sauf ceux que le test place.
  for (const j of (def === 'A' ? s.equipeA : s.equipeB)) { j.x = pt.x - sens * 25; j.y = 35; j.auSol = 0; j.horsJeuKick = 0; }
  return { s, def, att, sens, pt };
}
const zonesDe = (s, team, numero) => {
  const b = new AgentContext({ team, numero }, { reactionDelay: 0, fovDeg: 360, occlusionBodies: 99 }).update(s);
  const si = deriveSituation(b);
  return { b, si, zones: Object.fromEntries(candidatsGardeRuck(b, si, si.pt ? si.pt.x - si.sens * 2 : 0, si.sens).map((c) => [c.id, c])) };
};
test('G54 / scénario 11 : une zone de garde déjà tenue par un partenaire que je vois ne m\'attire pas', () => {
  const { s, def, sens, pt } = sceneGarde(1);
  const eq = def === 'A' ? s.equipeA : s.equipeB, ferme = pt.y <= 35 ? -1 : 1;
  const moi = eq.find((j) => j.numero === 7), lui = eq.find((j) => j.numero === 4);
  moi.x = pt.x - sens * 4; moi.y = pt.y - ferme * 3;
  const libre = zonesDe(s, def, 7).zones;
  assert.ok('GUARD_PILLAR_OPEN' in libre, 'pilier ouvert libre : candidat');
  lui.x = pt.x - sens * 2; lui.y = pt.y - ferme * 1.5; // le 4 est déjà au pilier ouvert
  const tenu = zonesDe(s, def, 7).zones;
  assert.ok(!('GUARD_PILLAR_OPEN' in tenu), 'pilier ouvert tenu par le 4 : le 7 ne s\'y met pas');
  assert.ok('GUARD_SECOND_OPEN' in tenu, 'il garde d\'autres zones à prendre');
});
test('G54 / scénario 4 : des attaquants vus au petit côté rendent cette zone prioritaire, pour quiconque est le mieux placé', () => {
  const { s, def, att, sens, pt } = sceneGarde(2);
  const ferme = pt.y <= 35 ? -1 : 1, dT = ferme < 0 ? pt.y : 70 - pt.y;
  if (dT <= 6) return; // ruck contre la touche : pas de petit côté
  const eq = def === 'A' ? s.equipeA : s.equipeB, adv = att === 'A' ? s.equipeA : s.equipeB;
  for (const n of [6, 12]) { const j = eq.find((x) => x.numero === n); j.x = pt.x - sens * 4; j.y = pt.y + ferme * 3; }
  for (const o of adv) { o.x = pt.x - 25 * (att === 'A' ? 1 : -1); o.y = 35; }
  const calme = zonesDe(s, def, 6).zones.GUARD_BLINDSIDE;
  adv.slice(0, 3).forEach((o, i) => { o.x = pt.x + sens * 3; o.y = pt.y + ferme * (3 + i * 1.5); });
  const menace = zonesDe(s, def, 6).zones.GUARD_BLINDSIDE;
  assert.ok(calme && menace && menace.priority > calme.priority + 15, `petit côté : ${calme && calme.priority} sans menace, ${menace && menace.priority} avec trois attaquants`);
  // Le même raisonnement vaut pour le 12 au même endroit : aucune zone n'appartient à un numéro.
  assert.strictEqual(zonesDe(s, def, 12).zones.GUARD_BLINDSIDE.priority, menace.priority);
});
test('G54 / scénario 15 : toutes les zones de garde sont derrière la ligne de hors-jeu du ruck', () => {
  for (const seed of [1, 2, 3]) {
    const { s, def, sens, pt } = sceneGarde(seed);
    const eq = def === 'A' ? s.equipeA : s.equipeB;
    const j = eq.find((x) => x.numero === 6); j.x = pt.x - sens * 4; j.y = pt.y;
    const b = new AgentContext({ team: def, numero: 6 }, { reactionDelay: 0, fovDeg: 360, occlusionBodies: 99 }).update(s);
    const p = placer(b, 'DEFEND', null, profilePour(6));
    for (const c of p.candidates.filter((c) => c.id.startsWith('GUARD'))) assert.ok(c.valide, c.id + ' valide');
    // Profondeur : piliers juste derrière le pied arrière (2,5 m derrière le ballon), garde et petit côté sur la ligne.
    const si = deriveSituation(b), ligneX = 0;
    const z = Object.fromEntries(candidatsGardeRuck(b, si, pt.x - sens * 6, sens).map((c) => [c.id, c]));
    for (const id of ['GUARD_PILLAR_BLIND', 'GUARD_PILLAR_OPEN']) if (z[id]) assert.ok(Math.abs((pt.x - z[id].target.x) * sens - 2.5) < 0.01, `${id} à 2,5 m derrière le ballon (${((pt.x - z[id].target.x) * sens).toFixed(2)})`);
    if (z.GUARD_SECOND_OPEN) assert.ok(Math.abs((pt.x - z.GUARD_SECOND_OPEN.target.x) * sens - 6) < 0.01, 'deuxième garde sur la ligne de défense');
    if (p.placementGoal.startsWith('GUARD')) assert.ok((p.target.x - pt.x) * sens <= 0.3, `cible ${p.placementGoal} derrière le ballon`);
  }
});

console.log(`\n${nb} test(s) exécuté(s).`);
if (echecs) { console.error(`ECHEC : ${echecs} test(s) en échec.`); process.exit(1); }
console.log('OK : au regroupement, les troisièmes lignes décident selon leurs aptitudes et ce qu\'ils voient.');
