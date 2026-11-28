// DROP-GOAL décidé par le PORTEUR (loi 9.A ; spécification du demi d'ouverture, docs/SIMULATION_V4/18_DEMIS_ET_TALONNEUR.md).
// Le joueur envisage le drop selon SES caractéristiques (geste maîtrisé, précision et portée au pied) et ce qu'il PERÇOIT (distance,
// angle, défenseur le plus proche, tableau d'affichage) ; le moteur n'en tire plus au hasard en mode agents, il ne fait que trancher
// la réussite. Aucune ligne ne lit le numéro du maillot.
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { lireDrop } = require('../engine/ai/open-play.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');

let nb = 0, echecs = 0;
function test(nom, fn) {
  nb++;
  try { fn(); console.log('OK   ' + nom); } catch (e) { echecs++; console.error('FAIL ' + nom + '\n' + e.stack.split('\n').slice(0, 4).join('\n')); }
}
// Croyances minimales : un botteur de l'équipe A (attaque vers x = 100) à `distanceBut` m des poteaux.
function lecture({ numero = 10, drop = 2, precisionPied = 82, distancePied = 80, distanceBut = 25, y = 35, pression = 8, ecart = -2, t = 4500 } = {}) {
  const me = { x: 100 - distanceBut, y, gestes: { drop }, car: { precisionPied, distancePied } };
  const b = { agent: { team: 'A', numero }, score: { A: 10 + ecart, B: 10 }, t, dureeMatch: 4800 };
  return lireDrop(b, me, 1, distanceBut, pression);
}

test('un geste non maîtrisé n\'est jamais une option (drop 0), quel que soit le contexte', () => {
  assert.strictEqual(lecture({ drop: 0 }), null);
  assert.ok(lecture({ drop: 1 }), 'notions : envisagé');
});

test('rien n\'est scripté : même caractéristiques et même scène = même lecture, quel que soit le numéro', () => {
  const ref = JSON.stringify(lecture({ numero: 10 }));
  for (const n of [1, 4, 9, 12, 15]) assert.strictEqual(JSON.stringify(lecture({ numero: n })), ref, 'numéro ' + n);
});

test('portée, angle et temps : hors de portée, angle fermé ou défenseur sur lui = pas de drop', () => {
  assert.strictEqual(lecture({ distanceBut: 45, distancePied: 60 }), null, '45 m pour un pied de 60 (portée 37 m)');
  assert.ok(lecture({ distanceBut: 45, distancePied: 100 }), '45 m pour un pied de 100 (portée 47 m)');
  assert.strictEqual(lecture({ distanceBut: 10, y: 5 }), null, 'angle fermé près de la touche');
  assert.strictEqual(lecture({ pression: 2 }), null, 'défenseur à 2 m : pas le temps de lâcher le ballon');
  assert.strictEqual(lecture({ distanceBut: 5 }), null, 'collé aux poteaux : on marque l\'essai');
});

test('chance perçue : plus près, plus en face, meilleur pied et plus de temps = plus attirant', () => {
  const s = (o) => lecture(o).score;
  assert.ok(s({ distanceBut: 18 }) > s({ distanceBut: 32 }), 'distance');
  assert.ok(s({ y: 35 }) > s({ y: 18 }), 'angle');
  assert.ok(s({ precisionPied: 90 }) > s({ precisionPied: 70 }), 'précision');
  assert.ok(s({ pression: 8 }) > s({ pression: 3.5 }), 'temps devant le défenseur');
});

test('le tableau d\'affichage : trois points décisifs en fin de match valent bien plus qu\'en début ou avec dix points d\'écart', () => {
  const fin = lecture({ ecart: -2, t: 4500 }).score;
  assert.ok(fin > lecture({ ecart: -2, t: 1200 }).score + 5, 'fin de match serré > début de match');
  assert.ok(fin > lecture({ ecart: -10, t: 4500 }).score + 5, 'serré > dix points de retard');
  assert.ok(fin > lecture({ ecart: 12, t: 4500 }).score + 5, 'serré > douze points d\'avance');
  // La durée réelle du match est lue (un match court a aussi son dernier quart).
  const me = { x: 75, y: 35, gestes: { drop: 2 }, car: { precisionPied: 82, distancePied: 80 } };
  const court = lireDrop({ agent: { team: 'A', numero: 10 }, score: { A: 8, B: 10 }, t: 1100, dureeMatch: 1200 }, me, 1, 25, 8);
  assert.ok(Math.abs(court.score - fin) < 1e-9, 'match de 20 min, 18e minute = dernier quart');
});

test('moteur : le geste drop se déduit de la précision au pied (explicite prioritaire)', () => {
  const m = new MatchEngine(1, 4800, { personnalites: 'NEUTRE', joueursA: { 3: { gestes: { drop: 2 } } } });
  for (const j of m.equipeA.concat(m.equipeB)) assert.ok(Number.isInteger(j.gestes.drop) && j.gestes.drop >= 0 && j.gestes.drop <= 3);
  assert.strictEqual(m.equipeA.find((j) => j.numero === 3).gestes.drop, 2, 'explicite');
  const ordre = m.equipeA.slice().sort((p, q) => p.car.precisionPied - q.car.precisionPied);
  assert.ok(ordre[0].gestes.drop <= ordre[ordre.length - 1].gestes.drop, 'monotone en précision');
});

// Trouve un porteur en jeu courant à portée de drop dans un vrai match en mode agents, puis lui fait demander le drop.
function porteurAPortee(seed) {
  const m = new MatchEngine(seed, 4800, configGOAP({}));
  for (let n = 0; n < 60000; n++) {
    m.tick(0.1);
    const p = m.porteur;
    if (m.phase === 'PORTE' && p && !m.combinaison && !m.passeVisuelle && p.auSol <= 0) {
      const d = p.sensAttaque > 0 ? 100 - p.x : p.x;
      const proche = (p.team === 'A' ? m.equipeB : m.equipeA).reduce((x, q) => Math.min(x, Math.hypot(q.x - p.x, q.y - p.y)), Infinity);
      if (d >= 12 && d <= 30 && proche >= 4) return m;
    }
  }
  return null;
}

test('moteur : un DROP demandé par le porteur est exécuté et sa réussite tranchée par le moteur (+3 ou renvoi)', () => {
  let tentes = 0, reussis = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = porteurAPortee(seed);
    if (!m) continue;
    const p = m.porteur, avant = m.score[p.team], eq = p.team;
    const tentesAvant = m.stats[eq].dropsTentes;
    // L'agent du porteur publie ses intentions à chaque tick : on remplace SA demande de geste par le drop (ses autres choix restent).
    const publier = m.setAgentIntent.bind(m);
    m.setAgentIntent = (e, n, it) => publier(e, n, e === p.team && n === p.numero ? Object.assign({}, it, { jeu: { action: 'KICK', type: 'DROP' } }) : it);
    const effacer = m.clearAgentIntent.bind(m);
    m.clearAgentIntent = (e, n) => (e === p.team && n === p.numero ? m.setAgentIntent(e, n, {}) : effacer(e, n));
    assert.ok(m.setAgentIntent(p.team, p.numero, {}), 'demande acceptée');
    let k = 0;
    for (; k < 5 && m.stats[eq].dropsTentes === tentesAvant && m.porteur === p && m.phase === 'PORTE'; k++) m.tick(0.1);
    if (m.stats[eq].dropsTentes === tentesAvant) { console.log(`     graine ${seed} : pas de drop (ballon perdu ou geste impossible) (${m.phase}, tick ${k})`); continue; }
    assert.strictEqual(m.stats[eq].dropsTentes, tentesAvant + 1, 'graine ' + seed + ' : un seul drop');
    tentes++;
    if (m.score[eq] === avant + 3) reussis++;
    else assert.strictEqual(m.score[eq], avant, 'raté : pas de points');
  }
  assert.ok(tentes >= 5, 'au moins trois scènes trouvées : ' + tentes);
  console.log(`     ${reussis}/${tentes} drops réussis (12-30 m, résultat du moteur)`);
});

test('loi 8.29 : après un coup franc, pas de drop tant que le ballon n\'est pas mort ou joué par l\'adversaire', () => {
  const m = porteurAPortee(1);
  const p = m.porteur;
  m._dropInterditCF = p.team;
  assert.strictEqual(m.setAgentIntent(p.team, p.numero, { jeu: { action: 'KICK', type: 'DROP' } }), false, 'demande refusée');
  m._dropInterditCF = p.team === 'A' ? 'B' : 'A';
  m._leverInterdictionDrop();
  assert.strictEqual(m._dropInterditCF, null, 'levée : l\'adversaire n\'a pas le ballon');
  assert.ok(m.setAgentIntent(p.team, p.numero, { jeu: { action: 'KICK', type: 'DROP' } }), 'de nouveau permis');
  m._dropInterditCF = p.team; m.phase = 'MELEE'; m._leverInterdictionDrop();
  assert.strictEqual(m._dropInterditCF, null, 'levée : ballon mort');
});

test('LEGACY garde son tirage : les intentions d\'agent sont ignorées hors mode agents', () => {
  const m = new MatchEngine(1, 4800, {});
  assert.strictEqual(m.setAgentIntent('A', 10, { jeu: { action: 'KICK', type: 'DROP' } }), false);
});

console.log(`\n${nb - echecs}/${nb} tests OK`);
if (echecs) process.exit(1);
