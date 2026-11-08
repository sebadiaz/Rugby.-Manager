// Tests du placement collectif d'avants et du corps arbitral mobile.
// Usage : node server/test-placement-arbitrage.js
'use strict';

const assert = require('assert');
const {
  MatchEngine, organiserAvantsRuck, LONGUEUR, LARGEUR, DEFAULT_CONFIG,
} = require('../engine/rugby-engine.js');

function executer(nom, fn) {
  fn();
  console.log('OK ' + nom);
}
const avants = [
  { numero: 1, x: 45, y: 12, channelY: 20, auSol: 0, sinBin: 0 },
  { numero: 2, x: 44, y: 22, channelY: 24, auSol: 0, sinBin: 0 },
  { numero: 3, x: 45, y: 24, channelY: 29, auSol: 0, sinBin: 0 },
  { numero: 4, x: 43, y: 28, channelY: 33, auSol: 0, sinBin: 0 },
  { numero: 5, x: 42, y: 44, channelY: 40, auSol: 0, sinBin: 0 },
  { numero: 6, x: 44, y: 47, channelY: 47, auSol: 0, sinBin: 0 },
  { numero: 7, x: 43, y: 55, channelY: 52, auSol: 0, sinBin: 0 },
  { numero: 8, x: 40, y: 63, channelY: 60, auSol: 0, sinBin: 0 },
];

executer('plan 1-3-3-1 des huit avants', () => {
  assert.strictEqual(DEFAULT_CONFIG.attaque.structureAvants, '1331');
  const cibles = organiserAvantsRuck(avants, { x: 50, y: 25 }, 1, '1331');
  assert.strictEqual(cibles.size, 8);
  const roles = Array.from(cibles.values()).reduce((a, c) => {
    a[c.role] = (a[c.role] || 0) + 1;
    return a;
  }, {});
  assert.deepStrictEqual(roles, { LARGE_G: 1, POD_G: 3, POD_D: 3, LARGE_D: 1 });
  assert.strictEqual(new Set(Array.from(cibles.values()).map(c => c.y)).size, 8);
});
executer('plan 2-4-2 alternatif', () => {
  const cibles = organiserAvantsRuck(avants, { x: 50, y: 25 }, -1, '242');
  const roles = Array.from(cibles.values()).reduce((a, c) => {
    a[c.role] = (a[c.role] || 0) + 1;
    return a;
  }, {});
  assert.deepStrictEqual(roles, { LARGE_G: 2, POD_C: 4, LARGE_D: 2 });
});
executer('pod incomplet : sans joueurs au sol ni exclu', () => {
  const groupe = avants.map(j => ({ ...j }));
  groupe[0].auSol = 1;
  groupe[1].sinBin = 60;
  const plan = organiserAvantsRuck(groupe, { x: 5, y: 68 }, 1, '1331');
  assert.strictEqual(plan.size, 6);
  assert.ok(!plan.has(groupe[0]) && !plan.has(groupe[1]));
  for (const cible of plan.values()) {
    assert.ok(cible.x >= 0 && cible.x <= LONGUEUR);
    assert.ok(cible.y >= 0 && cible.y <= LARGEUR);
  }
});
executer('affectations déterministes à positions identiques', () => {
  const plan1 = organiserAvantsRuck(avants, { x: 50, y: 25 }, 1);
  const plan2 = organiserAvantsRuck(avants, { x: 50, y: 25 }, 1);
  assert.deepStrictEqual(Array.from(plan1.values()), Array.from(plan2.values()));
});
executer('arbitre central et deux assistants dans une simulation', () => {
  const moteur = new MatchEngine(45, 90);
  let precedent = moteur.getState();
  assert.strictEqual(precedent.assistants.length, 2);
  let mouvement = 0;
  for (let i = 0; i < 600 && precedent.phase !== 'TERMINE'; i++) {
    moteur.tick(0.05);
    const etat = moteur.getState();
    assert.ok(Number.isFinite(etat.arbitre.x) && Number.isFinite(etat.arbitre.y));
    assert.ok(etat.arbitre.x >= 0 && etat.arbitre.x <= LONGUEUR);
    assert.ok(etat.arbitre.y >= 0 && etat.arbitre.y <= LARGEUR);
    assert.strictEqual(etat.assistants.length, 2);
    etat.assistants.forEach((a, k) => {
      assert.ok(a.x >= 0 && a.x <= LONGUEUR);
      assert.strictEqual(a.y, k === 0 ? 0 : LARGEUR);
      assert.ok(Math.abs(a.x - precedent.assistants[k].x) < 0.36);
      mouvement += Math.abs(a.x - precedent.assistants[k].x);
    });
    for (const j of [...etat.equipeA, ...etat.equipeB]) {
      assert.ok(Number.isFinite(j.orientation));
    }
    precedent = etat;
  }
  assert.ok(mouvement > 0.1, 'les assistants doivent réellement suivre le jeu');
  const capture = moteur.getState();
  capture.assistants[0].x = -100;
  assert.notStrictEqual(moteur.getState().assistants[0].x, -100,
    'la lecture du snapshot ne doit pas muter la simulation');
});
console.log('Tests placements et arbitrage OK');
