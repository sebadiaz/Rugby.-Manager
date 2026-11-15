'use strict';

const assert = require('node:assert/strict');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');

function scene(equipe) {
  const m = new MatchEngine(9, 4800, configGOAP());
  m.possession = equipe;
  m.phase = 'PORTE';
  m.ballonEnVol = false;
  const sens = equipe === 'A' ? 1 : -1;
  const attaque = m.attaquants(), defense = m.defenseurs();
  for (const j of attaque) Object.assign(j, { x: 50 - sens * 20, y: 51, auSol: 0 });
  for (const j of defense) Object.assign(j, { x: 50 + sens * 26, y: 52, auSol: 0 });
  const porteur = attaque.find(j => j.numero === 4);
  Object.assign(porteur, { x: 50, y: 35, vitesseCourante: 6, orientation: sens > 0 ? 0 : Math.PI });
  m.porteur = porteur;
  m.rng = () => 0.5;
  m.rngPasseEnAvant = () => 0.5;
  const plaqueur = defense.find(j => j.numero === 7);
  return { m, porteur, plaqueur, sens, attaque, defense };
}

for (const equipe of ['A', 'B']) {
  const adverse = equipe === 'A' ? 'B' : 'A';
  {
    const { m, porteur, plaqueur, sens } = scene(equipe);
    m.choisirActionPorteur = () => 'RUN';
    Object.assign(plaqueur, { x: 50 - sens * 3, y: 35, vitesseCourante: 3, orientation: porteur.orientation });
    m.tick(0.1);
    assert.equal(m.phase, 'PORTE');
    assert.equal(m.stats[adverse].tacklesAttempted, 0, 'l’écart grandit à la limite de portée');

    plaqueur.x = porteur.x - sens * 2.3;
    plaqueur.y = porteur.y;
    m.tick(0.1);
    assert.equal(m.stats[adverse].tacklesAttempted, 1, 'à portée immédiate le défenseur peut saisir le porteur');
  }
  {
    const { m, porteur, plaqueur, sens } = scene(equipe);
    m.choisirActionPorteur = () => 'RUN';
    Object.assign(plaqueur, { x: 50 + sens * 3, y: 35, vitesseCourante: 3, orientation: porteur.orientation + Math.PI });
    m.tick(0.1);
    assert.equal(m.stats[adverse].tacklesMade, 1, 'la montée de face reste possible');
    assert.equal(m.phase, 'RUCK');
  }
  {
    const { m, attaque, porteur, plaqueur, sens } = scene(equipe);
    const relais = attaque.find(j => j.numero === 10);
    Object.assign(relais, { x: 50 - sens * 3, y: 42 });
    Object.assign(plaqueur, { x: 50 - sens * 3, y: 35, vitesseCourante: 3, orientation: porteur.orientation });
    m.setAgentIntent(equipe, porteur.numero, { jeu: { action: 'PASS', vers: relais.numero } });
    m._tickPorte(0.1);
    assert.equal(m.porteur, relais, 'un défenseur à distance qui décroche ne bloque pas le geste');
    assert.equal(m.stats[equipe].passes, 1);
    assert.equal(m.stats[adverse].tacklesAttempted, 0);
  }
  for (const enRecuperation of [false, true]) {
    const { m, plaqueur, defense, sens } = scene(equipe);
    m.choisirActionPorteur = () => 'RUN';
    Object.assign(plaqueur, { x: 50 + sens, y: 35 });
    const assistant = defense.find(j => j.numero === 6);
    Object.assign(assistant, { x: 50 + sens * 0.5, y: 37, fixeCooldown: enRecuperation ? 2 : 0 });
    m.tick(0.1);
    assert.equal(m.stats[adverse].tacklesAttempted, enRecuperation ? 1 : 2);
  }
  {
    const { m, porteur, plaqueur, sens } = scene(equipe);
    m.choisirActionPorteur = () => 'RUN';
    porteur.x = sens > 0 ? 99.95 : 0.05;
    Object.assign(plaqueur, { x: porteur.x - sens * 0.8, y: 35, auSol: 2 });
    m.tick(0.1);
    assert.equal(m.score[equipe], 5, 'un défenseur au sol ne peut pas réaliser le sauvetage');
    assert.equal(m.stats[adverse].tacklesAttempted, 0);
  }
}
console.log('OK : portée, direction, passe et disponibilité des plaqueurs vérifiées dans les deux sens.');
